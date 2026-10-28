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
const { spawnSync } = require('node:child_process');
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
const INSPECTABLE_SOURCE_FORMATS = new Set(['.webp', '.avif', '.jpg', '.jpeg', '.png']);
const MAX_SCAN_BYTES = 25 * 1024 * 1024;
const decodeCache = new Map();

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
  if (!safeRelativePath(relative) || !relative.startsWith('assets/images/') || !INSPECTABLE_SOURCE_FORMATS.has(path.extname(relative).toLowerCase())) return null;
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
  if (!INSPECTABLE_SOURCE_FORMATS.has(extension)) result.errors.push('unsupported image extension');
  else if (!policy.formats.has(extension)) result.warnings.push('source format is not permitted for publication; convert to WebP or AVIF after editorial approval');
  if (!stat.size) result.errors.push('empty file');
  if (stat.size > MAX_SCAN_BYTES) result.errors.push('asset exceeds audit safety read limit');
  if (stat.size > MAX_SCAN_BYTES || !stat.size) return result;
  const data = fs.readFileSync(absolute);
  result.sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const dimensions = inspectImage(data, extension);
  result.width = dimensions.width; result.height = dimensions.height;
  result.errors.push(...dimensions.errors);
  result.warnings = [...result.warnings, ...(dimensions.warnings || [])];
  if (result.width && result.height) {
    const rolePolicy = policy.hero && /-hero-\d+\./.test(relative) ? policy.hero : policy.supporting;
    if (result.width < rolePolicy.minWidth) result.errors.push('width below ' + rolePolicy.minWidth + 'px requirement');
    if (result.width > rolePolicy.maxWidth) result.errors.push('width above ' + rolePolicy.maxWidth + 'px policy');
    if (stat.size > rolePolicy.maxBytes) result.errors.push('file exceeds ' + rolePolicy.maxBytes + '-byte policy');
  }
  result.valid = result.errors.length === 0;
  return result;
}
function validateForRole(info, role, policy) {
  if (!info || !info.exists || !info.safe) return { valid: false, errors: (info && info.errors) || ['asset is not a permitted local file'] };
  const errors = [...(info.errors || [])].filter(error => !/width below |width above |file exceeds /.test(error));
  if (info.decodeStatus !== 'verified') errors.push(info.decodeStatus === 'failed' ? 'full pixel decode failed' : 'full pixel decode has not been verified');
  if (!policy.formats.has('.' + String(info.format || '').toLowerCase())) errors.push('publication image must use WebP or AVIF');
  const limit = role === 'hero' ? policy.hero : policy.supporting;
  if (info.width == null || info.height == null) errors.push('image dimensions could not be verified');
  else {
    if (info.width < limit.minWidth) errors.push('width below ' + limit.minWidth + 'px requirement');
    if (info.width > limit.maxWidth) errors.push('width above ' + limit.maxWidth + 'px policy');
  }
  if (info.bytes > limit.maxBytes) errors.push('file exceeds ' + limit.maxBytes + '-byte policy');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
function verifyImageDecode(root, images) {
  const results = new Map();
  const pending = [];
  for (const info of images) {
    if (!info || !info.path) continue;
    const key = [info.sha256, info.format, info.width, info.height].join(':');
    if (decodeCache.has(key)) results.set(info.path, decodeCache.get(key));
    else if (!info.exists || !info.safe || !info.width || !info.height || !info.sha256) {
      results.set(info.path, { status: 'failed', error: 'safe file and positive header dimensions are required for pixel decode' });
    } else {
      pending.push({ info, key });
    }
  }
  if (!pending.length) return results;
  const script = path.join(__dirname, 'decode-media-assets.py');
  const run = spawnSync('python3', [script, path.resolve(root)], {
    input: JSON.stringify(pending.map(({ info }) => ({
      path: info.path, width: info.width, height: info.height, bytes: info.bytes,
    }))),
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
  });
  let payload = null;
  if (!run.error && run.status === 0) {
    try { payload = JSON.parse(run.stdout); } catch (_) { payload = null; }
  }
  const decoded = new Map((payload && payload.results || []).map(item => [item.path, item]));
  for (const { info, key } of pending) {
    let result;
    if (run.error || !payload || payload.ok !== true) {
      result = { status: 'unavailable', error: (run.error && run.error.message) || (payload && payload.error) || 'browser decoder did not return a valid report' };
    } else {
      const found = decoded.get(info.path);
      result = found && ['verified', 'failed'].includes(found.status)
        ? { status: found.status, width: found.width || null, height: found.height || null, error: found.error || null }
        : { status: 'unavailable', error: 'browser decoder omitted this image result' };
    }
    if (result.status !== 'unavailable') decodeCache.set(key, result);
    results.set(info.path, result);
  }
  return results;
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
  // Parse chunk boundaries and CRCs before attempting decompression.
  try { validatePngChunks(data); } catch (_) { return {width,height,errors:['corrupt PNG chunk structure or CRC']}; }
  if (data.length < 45 || data.lastIndexOf(Buffer.from('IEND')) < 0) return {width,height,errors:['truncated PNG payload']};
  try { zlib.inflateSync(Buffer.concat(readPngIdat(data)), { maxOutputLength: 64 * 1024 * 1024 }); }
  catch (_) { return {width,height,errors:['PNG pixel stream failed integrity/decode check']}; }
  return {width,height,errors:[]};
}
function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function validatePngChunks(data) {
  let offset = 8, seenHeader = false, seenEnd = false, idatSeen = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    if (length > data.length - offset - 12) throw new Error('chunk overflow');
    const type = data.toString('ascii', offset + 4, offset + 8);
    const content = data.subarray(offset + 4, offset + 8 + length);
    const crc = data.readUInt32BE(offset + 8 + length);
    if (pngCrc32(content) !== crc) throw new Error('CRC mismatch');
    if (!seenHeader && type !== 'IHDR') throw new Error('IHDR must be first');
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) throw new Error('duplicate or invalid IHDR');
      seenHeader = true;
    }
    if (type === 'IDAT') idatSeen = true;
    if (type === 'IEND') {
      if (length !== 0 || !idatSeen) throw new Error('invalid IEND or missing IDAT');
      seenEnd = true;
      offset += 12 + length;
      break;
    }
    offset += 12 + length;
  }
  if (!seenHeader || !seenEnd || offset !== data.length) throw new Error('incomplete PNG');
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
      return width&&height ? {width,height,errors:[],warnings:['JPEG structure and dimensions checked; full pixel decode is not available in the dependency-free audit']} : {width:null,height:null,errors:['invalid JPEG dimensions']};
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
  return {width,height,errors:[],warnings:['WebP container and dimensions checked; full pixel decode is not available in the dependency-free audit']};
}
function inspectAvif(data) {
  if (data.length<32 || data.toString('ascii',4,8)!=='ftyp' || !/^(avif|avis)$/.test(data.toString('ascii',8,12))) return {width:null,height:null,errors:['corrupt or invalid AVIF container']};
  let offset=data.indexOf(Buffer.from('ispe')); if(offset<0 || offset+16>data.length) return {width:null,height:null,errors:['AVIF image dimensions unavailable']};
  const width=data.readUInt32BE(offset+8),height=data.readUInt32BE(offset+12);
  if(!width||!height) return {width:null,height:null,errors:['invalid AVIF dimensions']};
  const declared=data.readUInt32BE(0);
  if(declared>data.length) return {width,height,errors:['truncated AVIF ftyp box']};
  return {width,height,errors:[],warnings:['AVIF container header and ispe dimensions verified; pixel decode unavailable in dependency-free runtime']};
}
function isValidReviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
      if(!INSPECTABLE_SOURCE_FORMATS.has(path.extname(entry.name).toLowerCase())) { assets.push({path:relative,eligible:false,errors:['unsupported file type']}); continue; }
      assets.push(imageInfo(root,relative,policy));
    }
  }
  scan('assets/images');
  // Decode every inspectable local image in one isolated Chromium process. A
  // header-only match never qualifies as technically ready for publication.
  const decodes = verifyImageDecode(root, assets.filter(asset =>
    asset.exists && asset.safe && asset.width > 0 && asset.height > 0 && asset.bytes <= MAX_SCAN_BYTES));
  for (const asset of assets) {
    const decoded = decodes.get(asset.path);
    asset.decodeStatus = decoded ? decoded.status : 'not-run';
    asset.decodeError = decoded && decoded.error || null;
    if (asset.decodeStatus === 'verified') {
      asset.warnings = (asset.warnings || []).filter(warning => !/full pixel decode/.test(warning));
    } else if (asset.decodeStatus === 'unavailable') {
      asset.warnings = [...(asset.warnings || []), 'full pixel decode could not run: ' + asset.decodeError];
    } else if (asset.decodeStatus === 'failed') {
      asset.errors = [...(asset.errors || []), 'full pixel decode failed: ' + asset.decodeError];
      asset.valid = false;
    }
  }
  for(const item of catalogue) {
    const findings=validateAgainstSchema(schema,item.record,item.relative);
    if(item.name!==item.record.slug+'.json') errors.push(item.relative+': filename must match slug');
    for(const f of findings) errors.push(item.relative+': schema '+f.path+' '+f.message);
    const rawCandidates=item.record.media&&item.record.media.candidates;
    const rawApproved=item.record.media&&item.record.media.approvedAssets;
    const candidates=Array.isArray(rawCandidates)?rawCandidates.filter(candidate=>candidate&&typeof candidate==='object'&&!Array.isArray(candidate)):[];
    const approved=Array.isArray(rawApproved)?rawApproved.filter(asset=>asset&&typeof asset==='object'&&!Array.isArray(asset)):[];
    if (!Array.isArray(rawCandidates) || !Array.isArray(rawApproved)) errors.push(item.relative+': media candidates and approvedAssets must be arrays');
    if (Array.isArray(rawCandidates)&&candidates.length!==rawCandidates.length) errors.push(item.relative+': malformed media candidate record');
    if (Array.isArray(rawApproved)&&approved.length!==rawApproved.length) errors.push(item.relative+': malformed approved asset record');
    if (item.record.editorialReview.mediaStatus === 'missing' && candidates.length > 0) errors.push(item.relative+': mediaStatus missing conflicts with declared candidates; use pending review');
    if (item.record.editorialReview.mediaStatus === 'pending' && candidates.length === 0) errors.push(item.relative+': mediaStatus pending requires at least one candidate');
    if (item.record.editorialReview.mediaStatus === 'rejected' && !candidates.some(candidate => candidate.reviewStatus === 'rejected')) errors.push(item.relative+': mediaStatus rejected requires a rejected candidate decision');
    const candidatePaths=new Set();
    for(const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) { errors.push(item.relative+': malformed media candidate record'); continue; }
      const absolute=safeImagePath(root,candidate.path);
      if(!absolute) errors.push(item.relative+': candidate path missing or unsafe: '+candidate.path);
      if(candidatePaths.has(candidate.path)) errors.push(item.relative+': duplicate candidate path '+candidate.path);
      candidatePaths.add(candidate.path);
      const inventory=assets.find(a=>a.path===candidate.path);
      if(!inventory) errors.push(item.relative+': candidate is not present in inventory: '+candidate.path);
      const candidateTechnical = validateForRole(inventory, candidate.role, policy);
      const visual = candidate.visualReview || {};
      if(visual.status==='not_assessed') {
        if(candidate.fit!=='not-assessed') errors.push(item.relative+': unassessed visual subject must use fit=not-assessed: '+candidate.path);
        if(visual.reviewer!==null || visual.reviewedAt!==null) errors.push(item.relative+': unassessed visual subject cannot have reviewer/date evidence: '+candidate.path);
      } else if(visual.status==='matched') {
        if(!['strong-contextual-match','possible-contextual-match'].includes(candidate.fit)) errors.push(item.relative+': visually matched candidate requires an assessed contextual fit: '+candidate.path);
        if(typeof visual.evidence!=='string'||visual.evidence.trim().length<10||typeof visual.reviewer!=='string'||visual.reviewer.trim().length<2||!isValidReviewDate(visual.reviewedAt)) errors.push(item.relative+': visual match requires evidence, reviewer and valid date: '+candidate.path);
      } else if(visual.status==='mismatch') {
        if(candidate.fit!=='not-a-match'||candidate.reviewStatus!=='rejected') errors.push(item.relative+': visual mismatch must be marked not-a-match and rejected: '+candidate.path);
        if(typeof visual.evidence!=='string'||visual.evidence.trim().length<10||typeof visual.reviewer!=='string'||visual.reviewer.trim().length<2||!isValidReviewDate(visual.reviewedAt)) errors.push(item.relative+': visual mismatch requires evidence, reviewer and valid date: '+candidate.path);
      } else errors.push(item.relative+': candidate visual review state is missing or invalid: '+candidate.path);
      if(candidate.reviewStatus==='approved' && visual.status!=='matched') errors.push(item.relative+': candidate cannot be approved before documented visual subject match: '+candidate.path);
      if(candidate.reviewStatus==='approved') {
        if(!['owner-confirmed','licensed'].includes(candidate.rightsStatus)) errors.push(item.relative+': candidate cannot be approved without owner-confirmed or licensed rights: '+candidate.path);
        if(!candidateTechnical.valid) errors.push(item.relative+': candidate cannot be approved while technical checks fail: '+candidate.path+' ('+candidateTechnical.errors.join('; ')+')');
      }
      if(candidate.rightsStatus==='rejected' && candidate.reviewStatus==='approved') errors.push(item.relative+': rejected-rights candidate cannot be approved: '+candidate.path);
    }
    const approvedRoles=new Set();
    for(const approvedAsset of approved) {
      if (!approvedAsset || typeof approvedAsset !== 'object' || Array.isArray(approvedAsset)) { errors.push(item.relative+': malformed approved media record'); continue; }
      if(approvedRoles.has(approvedAsset.role)) errors.push(item.relative+': multiple approved assets for role '+approvedAsset.role);
      approvedRoles.add(approvedAsset.role);
      const candidate=candidates.find(c=>c.path===approvedAsset.path&&c.role===approvedAsset.role&&c.reviewStatus==='approved'&&c.visualReview&&c.visualReview.status==='matched'&&['owner-confirmed','licensed'].includes(c.rightsStatus));
      if(!candidate) errors.push(item.relative+': approved asset must reference a reviewed, rights-resolved candidate: '+approvedAsset.path);
      if(!safeImagePath(root,approvedAsset.path)) errors.push(item.relative+': approved asset path missing or unsafe: '+approvedAsset.path);
      const info=assets.find(a=>a.path===approvedAsset.path);
      const approvedTechnical = validateForRole(info, approvedAsset.role, policy);
      if(!approvedTechnical.valid) errors.push(item.relative+': approved asset failed technical checks: '+approvedAsset.path+' ('+approvedTechnical.errors.join('; ')+')');
      if(/^(image|photo|picture|image of|photo of|jaisalmer)$/i.test(String(approvedAsset.alt || '').trim())) errors.push(item.relative+': generic alt text is not allowed for '+approvedAsset.path);
    }
    for(const role of ['hero','socialPreview']) {
      if(!approved.some(a=>a && a.role===role) && item.record.editorialReview.mediaStatus==='approved') errors.push(item.relative+': '+role+' media approval missing while mediaStatus is approved');
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
    if((item.record.status==='approved_for_release'||item.record.status==='live') && (item.record.editorialReview.mediaStatus!=='approved'||approvedRoles.size!==2)) errors.push(item.relative+': approved/live record requires approved hero and socialPreview assets');
    for(const ref of flattenRefs(item.record)) {
      const prior=seenRefs.get(ref.path)||[];
      prior.push(item.record.slug+':'+ref.location); seenRefs.set(ref.path,prior); allRefs.push(ref);
      if(!safeImagePath(root,ref.path)) errors.push(item.relative+': referenced image path missing/unsafe '+ref.path);
    }
  }
  const candidateOwners=new Map();
  for(const item of catalogue) for(const candidate of (item.record.media&&Array.isArray(item.record.media.candidates)?item.record.media.candidates:[]).filter(candidate=>candidate&&typeof candidate==='object'&&!Array.isArray(candidate))) {
    const owners=candidateOwners.get(candidate.path)||[]; owners.push(item.record.slug+':'+candidate.role); candidateOwners.set(candidate.path,owners);
  }
  const duplicateFilesMap=new Map();
  for(const asset of assets) if(asset.sha256) {
    const files=duplicateFilesMap.get(asset.sha256)||[];
    files.push(asset.path); duplicateFilesMap.set(asset.sha256,files);
  }
  const duplicateFiles=[...duplicateFilesMap.entries()].filter(([,files])=>files.length>1).map(([sha256,files])=>({sha256,files:files.sort()}));
  const articleReports=catalogue.map(item=>articleReport(root,item,assets,seenRefs,policy));
  const duplicateCandidates=[...candidateOwners.entries()].filter(([,owners])=>new Set(owners.map(owner=>owner.split(':')[0])).size>1).map(([asset,owners])=>({path:asset,owners}));
  const duplicates=[...seenRefs.entries()].filter(([,owners])=>new Set(owners.map(owner=>owner.split(':')[0])).size>1).map(([asset,owners])=>({path:asset,owners}));
  return {schemaVersion:1,state:errors.length?'ERROR':articleReports.length>0&&articleReports.every(article=>article.mediaStatus==='approved'&&article.blockers.length===0)?'READY':'BLOCKED',
    summary:{articleCount:catalogue.length,assetCount:assets.length,technicallyValidAssetCount:assets.filter(a=>a.valid).length,publicationEligibleAssetCount:assets.filter(asset=>validateForRole(asset, /-hero-\\d+\\./.test(asset.path)?'hero':'supporting',policy).valid).length,verifiedPixelDecodeAssetCount:assets.filter(asset=>asset.decodeStatus==='verified').length,failedPixelDecodeAssetCount:assets.filter(asset=>asset.decodeStatus==='failed').length,referenceCount:allRefs.length,duplicateUsageCount:duplicates.length,duplicateCandidateCount:duplicateCandidates.length,duplicateFileCount:duplicateFiles.length,approvedArticleCount:articleReports.filter(article=>article.mediaStatus==='approved'&&article.blockers.length===0).length,declaredApprovedArticleCount:catalogue.filter(i=>i.record.editorialReview.mediaStatus==='approved').length,blockedArticleCount:articleReports.filter(article=>article.blockers.length>0).length},
    policy:{readOnly:true,formats:[...policy.formats].map(f=>f.slice(1)).sort(),roleLimits:{hero:policy.hero,socialPreview:policy.socialPreview,supporting:policy.supporting},approvalRequiresCandidateReviewRightsEvidenceAndTechnicalValidity:true},
    inventory:assets.sort((a,b)=>a.path.localeCompare(b.path)),
    duplicates,duplicateCandidates,duplicateFiles,errors,articles:articleReports
  };
}
function flattenRefs(record) {
  const refs=[]; for (const role of ['heroImage']) if(record[role]) refs.push({path:record[role],location:role});
  if(record.seo&&record.seo.ogImage) refs.push({path:record.seo.ogImage,location:'seo.ogImage'});
  for(const [i,s] of (record.sections||[]).entries()) if(s.image) refs.push({path:s.image,location:'sections['+i+'].image'});
  return refs;
}
function articleReport(root,item,assets,seenRefs,policy) {
  const r=item.record, media=r.media||{}, review=r.editorialReview||{};
  const roles=['hero','socialPreview'];
  const candidateRecords=(Array.isArray(media.candidates)?media.candidates:[]).filter(candidate=>candidate&&typeof candidate==='object'&&!Array.isArray(candidate));
  const approvedRecords=(Array.isArray(media.approvedAssets)?media.approvedAssets:[]).filter(asset=>asset&&typeof asset==='object'&&!Array.isArray(asset));
  const integrityBlockers=[];
  if(review.mediaStatus==='approved') {
    if(approvedRecords.length!==2) integrityBlockers.push('approved-media-record-count-invalid');
    for(const role of roles) {
      const asset=approvedRecords.find(item=>item.role===role);
      if(!asset) { integrityBlockers.push(role+'-approval-missing'); continue; }
      const info=assets.find(item=>item.path===asset.path);
      const check=validateForRole(info,role,policy);
      if(!check.valid) integrityBlockers.push(role+'-technical-invalid:'+check.errors.join('; '));
      const candidate=candidateRecords.find(item=>item.path===asset.path&&item.role===role&&item.reviewStatus==='approved'&&['owner-confirmed','licensed'].includes(item.rightsStatus));
      if(!candidate) integrityBlockers.push(role+'-candidate-or-rights-evidence-invalid');
      const actualPath=role==='hero'?r.heroImage:(r.seo&&r.seo.ogImage);
      const actualAlt=role==='hero'?r.heroAlt:(r.seo&&r.seo.ogAlt);
      if(asset.path!==actualPath) integrityBlockers.push(role+'-rendered-path-mismatch');
      if(asset.alt!==actualAlt) integrityBlockers.push(role+'-alt-text-mismatch');
    }
  }
  const candidateWarnings=candidateRecords.flatMap(candidate=>{
    const info=assets.find(a=>a.path===candidate.path);
    const check=validateForRole(info,candidate.role,policy);
    return [
      ...(candidate.reviewStatus==='unreviewed'?['candidate-unreviewed:'+candidate.path]:[]),
      ...(candidate.visualReview && candidate.visualReview.status==='not_assessed'?['candidate-visual-review-not-assessed:'+candidate.path]:[]),
      ...(candidate.visualReview && candidate.visualReview.status==='mismatch'?['candidate-visual-subject-mismatch:'+candidate.path]:[]),
      ...(candidate.rightsStatus==='unverified'?['candidate-rights-unverified:'+candidate.path]:[]),
      ...(!check.valid?['candidate-needs-technical-review:'+candidate.path+': '+check.errors.join('; ')]:[]),
    ];
  });
  return {slug:r.slug,title:r.title,primaryQuery:r.seo&&r.seo.primaryQuery,status:r.status,
    mediaStatus:review.mediaStatus||'missing',
    requirements:media.requirements||null,
    heroImage:r.heroImage||null,socialPreviewImage:r.seo&&r.seo.ogImage||null,
    candidateWarnings,
    candidates:candidateRecords.map(candidate=>{const info=assets.find(a=>a.path===candidate.path);const check=validateForRole(info,candidate.role,policy);return {...candidate,technical:check.valid,technicalErrors:check.errors};}),approvedAssets:approvedRecords,
    missingRoles:roles.filter(role=>!approvedRecords.some(a=>a.role===role)),
    duplicateAssetUsage:[...seenRefs.entries()].filter(([,owners])=>owners.some(owner=>owner.startsWith(r.slug+':'))&&owners.length>1).map(([asset,owners])=>({asset,owners})),
    blockers:[...(review.mediaStatus==='approved'?[]:['media-review-'+review.mediaStatus]),
      ...roles.filter(role=>!approvedRecords.some(a=>a.role===role)).map(role=>role+'-approval-missing'),
      ...integrityBlockers
    ]
  };
}
function reportText(report) {
  const lines=['EDITORIAL MEDIA READINESS: '+report.state,
    'Articles: '+report.summary.articleCount+' | inventoried assets: '+report.summary.assetCount+' | source checks passed: '+report.summary.technicallyValidAssetCount+' | publication-eligible assets: '+report.summary.publicationEligibleAssetCount+' | valid media approvals: '+report.summary.approvedArticleCount+' | blocked: '+report.summary.blockedArticleCount,
    'Duplicate usage: '+report.summary.duplicateUsageCount+' | shared candidates: '+report.summary.duplicateCandidateCount+' | duplicate files: '+report.summary.duplicateFileCount+' | pixel decode verified: '+report.summary.verifiedPixelDecodeAssetCount+' | read-only: yes'];
  for(const article of report.articles) {
    lines.push((article.blockers.length?'BLOCK ':'READY ')+article.slug+' ['+article.mediaStatus+']');
    if(article.requirements) {
      lines.push('  Hero requirement: '+article.requirements.hero.subject);
      lines.push('  Social requirement: '+article.requirements.socialPreview.subject);
    }
    if(!article.candidates.length) lines.push('  Candidate gap: no context-supported local asset identified; source/proper asset needed.');
    for(const candidate of article.candidates) {
      lines.push('  Candidate '+candidate.role+': '+candidate.path+' | fit='+candidate.fit+' | visual-review='+(candidate.visualReview&&candidate.visualReview.status||'missing')+' | review='+candidate.reviewStatus+' | rights='+candidate.rightsStatus+' | role-check='+(candidate.technical?'PASS':'BLOCKED'));
      lines.push('    '+candidate.rationale);
      if(candidate.technicalErrors.length) lines.push('    Technical findings: '+candidate.technicalErrors.join('; '));
    }
    if(article.blockers.length) lines.push('  Blockers: '+article.blockers.join(', '));
    if(article.candidateWarnings.length) lines.push('  Candidate warnings: '+[...new Set(article.candidateWarnings)].join(' | '));
  }
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
module.exports={auditMedia,imageInfo,inspectImage,safeImagePath,imagePolicy,validateForRole,verifyImageDecode};
