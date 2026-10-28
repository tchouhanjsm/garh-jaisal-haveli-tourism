#!/usr/bin/env node
'use strict';

/**
 * Deterministic, read-only audit for article media. Candidate assets are never
 * promoted to approved assets by the audit; it writes only to stdout.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { safeRelativePath, validateAgainstSchema } = require('./validate-content');

const ROOT = path.resolve(__dirname, '..');
function imagePolicy(root) {
  const registry = readJson(root, 'content/paths.json');
  if (!registry.imageFormats || !registry.imageLimits || !registry.imageLimits.hero || !registry.imageLimits.supporting) {
    throw new Error('content/paths.json is missing the shared image format/size policy');
  }
  return {
    hero: { minWidth: 1200, maxWidth: registry.imageLimits.hero.maxWidth, maxBytes: registry.imageLimits.hero.maxBytes },
    socialPreview: { minWidth: 600, maxWidth: registry.imageLimits.supporting.maxWidth, maxBytes: registry.imageLimits.supporting.maxBytes },
    supporting: { minWidth: 600, maxWidth: registry.imageLimits.supporting.maxWidth, maxBytes: registry.imageLimits.supporting.maxBytes },
    formats: new Set(registry.imageFormats.map(format => '.' + format)),
  };
}
const SUPPORTED = new Set(['.webp', '.avif', '.jpg', '.jpeg', '.png']);
const MAX_SCAN_BYTES = 25 * 1024 * 1024;

function readJson(root, relative) {
  const absolute = path.resolve(root, relative);
  try {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(relative + ' is missing or invalid: ' + error.message);
  }
}
function listBlogRecords(root) {
  const directory = path.resolve(root, 'content/blogs');
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('content/blogs must be a regular directory');
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name).sort().map(name => ({ name, relative: 'content/blogs/' + name,
      record: readJson(root, 'content/blogs/' + name) }));
}
function safeImagePath(root, relative) {
  if (!safeRelativePath(relative) || !relative.startsWith('assets/images/')) return null;
  const absolute = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), absolute);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  let current = path.resolve(root);
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return null;
      if (current !== absolute && !stat.isDirectory()) return null;
      if (current === absolute && !stat.isFile()) return null;
    } catch (_) { return null; }
  }
  return absolute;
}
function imageInfo(root, relative, policy = imagePolicy(root)) {
  const absolute = safeImagePath(root, relative);
  if (!absolute) return { path: relative, exists: false, safe: false, errors: ['missing, unsafe or non-regular file'] };
  const stat = fs.statSync(absolute);
  const extension = path.extname(relative).toLowerCase();
  const result = { path: relative, exists: true, safe: true, bytes: stat.size, format: extension.slice(1), width: null, height: null, sha256: null, valid: false, errors: [], warnings: [] };
  if (!SUPPORTED.has(extension) || !policy.formats.has(extension)) result.errors.push('unsupported extension or format not permitted by content/paths.json');
  if (!stat.size) result.errors.push('empty file');
  if (stat.size > MAX_SCAN_BYTES) result.errors.push('asset exceeds audit safety read limit');
  if (stat.size > MAX_SCAN_BYTES || !stat.size) return result;
  const data = fs.readFileSync(absolute);
  result.sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const dimensions = inspectImage(data, extension);
  result.width = dimensions.width; result.height = dimensions.height;
  result.errors.push(...dimensions.errors);
  result.warnings = dimensions.warnings || [];
  if (result.width && result.height) {
    const rolePolicy = policy.hero && relative.includes('-hero-') ? policy.hero : policy.supporting;
    if (result.width < rolePolicy.minWidth) result.errors.push('width below ' + policy.minWidth + 'px requirement');
    if (result.width > rolePolicy.maxWidth) result.errors.push('width above ' + rolePolicy.maxWidth + 'px policy');
    if (stat.size > rolePolicy.maxBytes) result.errors.push('file exceeds ' + rolePolicy.maxBytes + '-byte policy');
  }
  result.valid = result.errors.length === 0;
  return result;
}
function inspectImage(data, extension) {
  if (extension === '.png') return inspectPng(data);
  if (extension === '.jpg' || extension === '.jpeg') return inspectJpeg(data);
  if (extension === '.webp') return inspectWebp(data);
  if (extension === '.avif') return inspectAvif(data);
  return { width: null, height: null, errors: ['unsupported image format'] };
}
function inspectPng(data) {
  if (data.length < 24 || data.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || data.toString('ascii',12,16) !== 'IHDR') return {width:null,height:null,errors:['corrupt or invalid PNG header']};
  const width=data.readUInt32BE(16), height=data.readUInt32BE(20);
  if (!width || !height) return {width:null,height:null,errors:['invalid PNG dimensions']};
  // Verify that the image reaches a complete IEND chunk; full decoding is done where runtime libraries exist.
  if (data.length < 45 || data.lastIndexOf(Buffer.from('IEND')) < 0) return {width,height,errors:['truncated PNG payload']};
  try { zlib.inflateSync(Buffer.concat(readPngIdat(data)), { maxOutputLength: 64 * 1024 * 1024 }); }
  catch (_) { return {width,height,errors:['PNG pixel stream failed integrity/decode check']}; }
  return {width,height,errors:[]};
}
function readPngIdat(data) {
  const chunks=[]; let offset=8;
  while (offset+12<=data.length) {
    const length=data.readUInt32BE(offset); if (length>data.length-offset-12) throw new Error('chunk overflow');
    const type=data.toString('ascii',offset+4,offset+8);
    if (type==='IDAT') chunks.push(data.subarray(offset+8,offset+8+length));
    offset += 12+length;
    if (type==='IEND') break;
  }
  return chunks;
}
function inspectJpeg(data) {
  if (data.length < 4 || data[0]!==0xff || data[1]!==0xd8 || data[data.length-2]!==0xff || data[data.length-1]!==0xd9) return {width:null,height:null,errors:['corrupt or truncated JPEG markers']};
  let offset=2;
  while (offset+4<data.length) {
    if (data[offset]!==0xff) { offset++; continue; }
    const marker=data[offset+1]; offset+=2;
    if ([0xd8,0xd9,0x01].includes(marker) || (marker>=0xd0&&marker<=0xd7)) continue;
    if (offset+2>data.length) break;
    const length=data.readUInt16BE(offset);
    if (length<2 || offset+length>data.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length<7) break;
      const height=data.readUInt16BE(offset+3), width=data.readUInt16BE(offset+5);
      return width&&height ? {width,height,errors:[]} : {width:null,height:null,errors:['invalid JPEG dimensions']};
    }
    offset+=length;
  }
  return {width:null,height:null,errors:['JPEG dimensions not found or corrupt segments']};
}
function inspectWebp(data) {
  if (data.length<30 || data.toString('ascii',0,4)!=='RIFF' || data.toString('ascii',8,12)!=='WEBP') return {width:null,height:null,errors:['corrupt or invalid WebP container']};
  const kind=data.toString('ascii',12,16);
  let width=null,height=null;
  if(kind==='VP8X' && data.length>=30) { width=1+data[24]+(data[25]<<8)+(data[26]<<16); height=1+data[27]+(data[28]<<8)+(data[29]<<16); }
  else if(kind==='VP8 ' && data.length>=30 && data[23]===0x9d&&data[24]===0x01&&data[25]===0x2a) { width=data.readUInt16LE(26)&0x3fff;height=data.readUInt16LE(28)&0x3fff; }
  else if(kind==='VP8L' && data.length>=25 && data[20]===0x2f) { width=1+(((data[22]&0x3f)<<8)|data[21]);height=1+(((data[24]&0x0f)<<10)|(data[23]<<2)|((data[22]&0xc0)>>6)); }
  if(!width||!height) return {width:null,height:null,errors:['WebP dimensions unavailable or invalid; extended decode required']};
  const declared=data.readUInt32LE(4)+8;
  if(declared>data.length) return {width,height,errors:['truncated WebP RIFF size']};
  return {width,height,errors:[]};
}
function inspectAvif(data) {
  if (data.length<32 || data.toString('ascii',4,8)!=='ftyp' || !/^(avif|avis)$/.test(data.toString('ascii',8,12))) return {width:null,height:null,errors:['corrupt or invalid AVIF container']};
  let offset=data.indexOf(Buffer.from('ispe')); if(offset<0 || offset+16>data.length) return {width:null,height:null,errors:['AVIF image dimensions unavailable']};
  const width=data.readUInt32BE(offset+8),height=data.readUInt32BE(offset+12);
  if(!width||!height) return {width:null,height:null,errors:['invalid AVIF dimensions']};
  const declared=data.readUInt32BE(0);
  if(declared>data.length) return {width,height,errors:['truncated AVIF ftyp box']};
  return {width,height,errors:[],warnings:['AVIF header and dimensions verified; full pixel decode is unavailable in the dependency-free audit']};
}
function flattenAssetReferences(value, location, output) {
  if (Array.isArray(value)) { value.forEach((entry,index)=>flattenAssetReferences(entry,location+'['+index+']',output)); return; }
  if (!value || typeof value!=='object') return;
  for (const [key,child] of Object.entries(value)) {
    const at=location+'.'+key;
    if (['image','src','heroImage','ogImage'].includes(key) && typeof child==='string' && child.startsWith('assets/')) output.push({path:child,location:at});
    else flattenAssetReferences(child,at,output);
  }
}
function auditMedia(root=ROOT) {
  const schema=readJson(root,'content/schemas/blog.schema.json');
  const policy=imagePolicy(root);
  const catalogue=listBlogRecords(root);
  const errors=[], allRefs=[], seenRefs=new Map();
  const assets=[];
  function scan(directory) {
    const absolute=path.resolve(root,directory);
    if(!fs.existsSync(absolute)) return;
    const stat=fs.lstatSync(absolute);
    if(!stat.isDirectory()||stat.isSymbolicLink()) { errors.push(directory+': inventory directory is unsafe'); return; }
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const relative=path.posix.join(directory,entry.name);
      if(entry.isSymbolicLink()) { errors.push(relative+': symlink is not permitted'); continue; }
      if(entry.isDirectory()) { scan(relative); continue; }
      if(!entry.isFile() || entry.name.startsWith('.')) continue;
      if(!SUPPORTED.has(path.extname(entry.name).toLowerCase())) { assets.push({path:relative,eligible:false,errors:['unsupported file type']}); continue; }
      assets.push(imageInfo(root,relative,policy));
    }
  }
  scan('assets/images');
  for(const item of catalogue) {
    const findings=validateAgainstSchema(schema,item.record,item.relative);
    if(item.name!==item.record.slug+'.json') errors.push(item.relative+': filename must match slug');
    for(const f of findings) errors.push(item.relative+': schema '+f.path+' '+f.message);
    const candidates=(item.record.media&&item.record.media.candidates)||[];
    const approved=(item.record.media&&item.record.media.approvedAssets)||[];
    const candidatePaths=new Set();
    for(const candidate of candidates) {
      const absolute=safeImagePath(root,candidate.path);
      if(!absolute) errors.push(item.relative+': candidate path missing or unsafe: '+candidate.path);
      if(candidatePaths.has(candidate.path)) errors.push(item.relative+': duplicate candidate path '+candidate.path);
      candidatePaths.add(candidate.path);
      const inventory=assets.find(a=>a.path===candidate.path);
      if(!inventory) errors.push(item.relative+': candidate is not present in inventory: '+candidate.path);
      if(candidate.reviewStatus==='approved') {
        if(!['owner-confirmed','licensed'].includes(candidate.rightsStatus)) errors.push(item.relative+': candidate cannot be approved without owner-confirmed or licensed rights: '+candidate.path);
        if(!inventory||!inventory.valid) errors.push(item.relative+': candidate cannot be approved while technical checks fail: '+candidate.path);
      }
      if(candidate.rightsStatus==='rejected' && candidate.reviewStatus==='approved') errors.push(item.relative+': rejected-rights candidate cannot be approved: '+candidate.path);
    }
    const approvedRoles=new Set();
    for(const approvedAsset of approved) {
      if(approvedRoles.has(approvedAsset.role)) errors.push(item.relative+': multiple approved assets for role '+approvedAsset.role);
      approvedRoles.add(approvedAsset.role);
      const candidate=candidates.find(c=>c.path===approvedAsset.path&&c.role===approvedAsset.role&&c.reviewStatus==='approved'&&['owner-confirmed','licensed'].includes(c.rightsStatus));
      if(!candidate) errors.push(item.relative+': approved asset must reference a reviewed, rights-resolved candidate: '+approvedAsset.path);
      if(!safeImagePath(root,approvedAsset.path)) errors.push(item.relative+': approved asset path missing or unsafe: '+approvedAsset.path);
      const info=assets.find(a=>a.path===approvedAsset.path);
      if(!info||!info.valid) errors.push(item.relative+': approved asset failed technical checks: '+approvedAsset.path);
      if(/^(image|photo|picture|image of|photo of|jaisalmer)$/i.test(approvedAsset.alt.trim())) errors.push(item.relative+': generic alt text is not allowed for '+approvedAsset.path);
    }
    for(const role of ['hero','socialPreview']) {
      if(!approved.some(a=>a.role===role) && item.record.editorialReview.mediaStatus==='approved') errors.push(item.relative+': '+role+' media approval missing while mediaStatus is approved');
    }
    if(item.record.editorialReview.mediaStatus==='approved') {
      for(const role of ['hero','socialPreview']) {
        const approvedAsset=approved.find(a=>a.role===role);
        const recordPath=role==='hero'?item.record.heroImage:(item.record.seo&&item.record.seo.ogImage);
        if(!approvedAsset||approvedAsset.path!==recordPath) errors.push(item.relative+': approved '+role+' asset must match the rendered '+(role==='hero'?'heroImage':'seo.ogImage')+' path');
        const recordAlt=role==='hero'?item.record.heroAlt:(item.record.seo&&item.record.seo.ogAlt);
        if(!approvedAsset||approvedAsset.alt!==recordAlt) errors.push(item.relative+': approved '+role+' alt text must match the rendered record alt text');
      }
    }
    if(item.record.editorialReview.mediaStatus==='approved' && approvedRoles.size!==2) errors.push(item.relative+': mediaStatus approved without both approved roles');
    for(const ref of flattenRefs(item.record)) {
      const prior=seenRefs.get(ref.path)||[];
      prior.push(item.record.slug+':'+ref.location); seenRefs.set(ref.path,prior); allRefs.push(ref);
      if(!safeImagePath(root,ref.path)) errors.push(item.relative+': referenced image path missing/unsafe '+ref.path);
    }
  }
  const candidateOwners=new Map();
  for(const item of catalogue) for(const candidate of (item.record.media&&item.record.media.candidates)||[]) {
    const owners=candidateOwners.get(candidate.path)||[]; owners.push(item.record.slug+':'+candidate.role); candidateOwners.set(candidate.path,owners);
  }
  const duplicateCandidates=[...candidateOwners.entries()].filter(([,owners])=>new Set(owners.map(owner=>owner.split(':')[0])).size>1).map(([asset,owners])=>({path:asset,owners}));
  const duplicates=[...seenRefs.entries()].filter(([,owners])=>new Set(owners.map(owner=>owner.split(':')[0])).size>1).map(([asset,owners])=>({path:asset,owners}));
  return {schemaVersion:1,state:errors.length?'ERROR':catalogue.length>0&&catalogue.every(i=>i.record.editorialReview.mediaStatus==='approved'&&(i.record.media.approvedAssets||[]).length===2)?'READY':'BLOCKED',
    summary:{articleCount:catalogue.length,assetCount:assets.length,technicallyValidAssetCount:assets.filter(a=>a.valid).length,referenceCount:allRefs.length,duplicateUsageCount:duplicates.length,duplicateCandidateCount:duplicateCandidates.length,approvedArticleCount:catalogue.filter(i=>i.record.editorialReview.mediaStatus==='approved').length,blockedArticleCount:catalogue.filter(i=>i.record.editorialReview.mediaStatus!=='approved').length},
    policy:{readOnly:true,formats:[...policy.formats].map(f=>f.slice(1)).sort(),roleLimits:{hero:policy.hero,socialPreview:policy.socialPreview,supporting:policy.supporting},approvalRequiresCandidateReviewRightsEvidenceAndTechnicalValidity:true},
    inventory:assets.sort((a,b)=>a.path.localeCompare(b.path)),
    duplicates,duplicateCandidates,errors,articles:catalogue.map(item=>articleReport(root,item,assets,seenRefs))
  };
}
function flattenRefs(record) {
  const refs=[]; for (const role of ['heroImage']) if(record[role]) refs.push({path:record[role],location:role});
  if(record.seo&&record.seo.ogImage) refs.push({path:record.seo.ogImage,location:'seo.ogImage'});
  for(const [i,s] of (record.sections||[]).entries()) if(s.image) refs.push({path:s.image,location:'sections['+i+'].image'});
  return refs;
}
function articleReport(root,item,assets,seenRefs) {
  const r=item.record, media=r.media||{}, review=r.editorialReview||{};
  const roles=['hero','socialPreview'];
  return {slug:r.slug,title:r.title,primaryQuery:r.seo&&r.seo.primaryQuery,status:r.status,
    mediaStatus:review.mediaStatus||'missing',
    requirements:media.requirements||null,
    heroImage:r.heroImage||null,socialPreviewImage:r.seo&&r.seo.ogImage||null,
    candidates:(media.candidates||[]).map(candidate=>({...candidate,technical:(assets.find(a=>a.path===candidate.path)||{}).valid===true,technicalErrors:(assets.find(a=>a.path===candidate.path)||{}).errors||['not in local inventory']})),approvedAssets:media.approvedAssets||[],
    missingRoles:roles.filter(role=>!(media.approvedAssets||[]).some(a=>a.role===role)),
    duplicateAssetUsage:[...seenRefs.entries()].filter(([,owners])=>owners.some(owner=>owner.startsWith(r.slug+':'))&&owners.length>1).map(([asset,owners])=>({asset,owners})),
    blockers:[...(review.mediaStatus==='approved'?[]:['media-review-'+review.mediaStatus]),
      ...roles.filter(role=>!(media.approvedAssets||[]).some(a=>a.role===role)).map(role=>role+'-approval-missing'),
      ...(media.candidates||[]).filter(candidate=>candidate.reviewStatus==='unreviewed').map(candidate=>'candidate-unreviewed:'+candidate.path),
      ...(media.candidates||[]).filter(candidate=>candidate.rightsStatus==='unverified').map(candidate=>'candidate-rights-unverified:'+candidate.path),
      ...(media.candidates||[]).filter(candidate=>!(assets.find(a=>a.path===candidate.path)||{}).valid).map(candidate=>'candidate-technical-review-required:'+candidate.path)]
  };
}
function scoreCandidates(root, article, inventory) {
  // No free-form semantic guessing: the audit suggests only from the explicitly reviewed
  // candidate list in each article record, never from filenames alone.
  return (article.media&&article.media.candidates||[]).filter(c=>c.reviewStatus==='unreviewed'&&safeImagePath(root,c.path))
    .map(c=>({...c,technical:(inventory.find(a=>a.path===c.path)||{}).valid===true}));
}
function reportText(report) {
  const lines=['EDITORIAL MEDIA READINESS: '+report.state,
    'Articles: '+report.summary.articleCount+' | inventoried assets: '+report.summary.assetCount+' | technical pass: '+report.summary.technicallyValidAssetCount+' | approved articles: '+report.summary.approvedArticleCount+' | blocked: '+report.summary.blockedArticleCount,
    'Duplicate usage: '+report.summary.duplicateUsageCount+' | shared candidates: '+report.summary.duplicateCandidateCount+' | read-only: yes'];
  for(const article of report.articles) lines.push((article.blockers.length?'BLOCK ':'READY ')+article.slug+' — '+article.blockers.join(', '));
  if(report.errors.length) lines.push('Integrity errors:',...report.errors.map(e=>' - '+e));
  return lines.join('\n');
}
if(require.main===module) {
  const args=process.argv.slice(2), json=args.includes('--json'), strict=args.includes('--strict-release');
  const unknown=args.filter(a=>!['--json','--strict-release','--check'].includes(a));
  if(unknown.length){console.error('Unknown argument: '+unknown.join(', '));process.exitCode=1;}
  else {
    try {const report=auditMedia(ROOT);console.log(json?JSON.stringify(report,null,2):reportText(report));
      if(report.errors.length)process.exitCode=1;else if(strict&&report.state!=='READY')process.exitCode=2;
    }catch(error){console.error('FAIL: media audit could not complete safely: '+error.message);process.exitCode=1;}
  }
}
module.exports={auditMedia,imageInfo,inspectImage,safeImagePath,imagePolicy};
