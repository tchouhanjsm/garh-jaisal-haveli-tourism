#!/usr/bin/env node
'use strict';

// Local-only validator for the static site's content registry and draft records.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = Object.freeze({
  tour: { schema: 'tour.schema.json' },
  blog: { schema: 'blog.schema.json' },
  gallery: { schema: 'gallery.schema.json' },
});

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value)) return false;
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function matchesType(type, value) {
  if (Array.isArray(type)) return type.some(candidate => matchesType(candidate, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'string') return typeof value === 'string';
  return true;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

// Supports the subset of JSON Schema used by the checked-in tour/blog/gallery schemas.
function validateAgainstSchema(schema, value, location = '$') {
  const findings = [];
  const add = (message, at = location) => findings.push({ path: at, message });
  if (schema.type && !matchesType(schema.type, value)) {
    add('expected type ' + (Array.isArray(schema.type) ? schema.type.join('|') : schema.type));
    return findings;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) add('must equal ' + JSON.stringify(schema.const));
  if (schema.enum && !schema.enum.includes(value)) add('must be one of: ' + schema.enum.join(', '));
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) add('must have at least ' + schema.minLength + ' characters');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) add('must have at most ' + schema.maxLength + ' characters');
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) add('does not match required pattern');
    if (schema.format === 'date' && !isValidDate(value)) add('must be a real YYYY-MM-DD date');
    if (schema.format === 'uri' && !isValidHttpUrl(value)) add('must be an absolute HTTP(S) URL');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) add('must be at least ' + schema.minimum);
    if (schema.maximum !== undefined && value > schema.maximum) add('must be at most ' + schema.maximum);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) add('must contain at least ' + schema.minItems + ' items');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) add('must contain at most ' + schema.maxItems + ' items');
    if (schema.items) value.forEach((entry, index) => findings.push(...validateAgainstSchema(schema.items, entry, location + '[' + index + ']')));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of (schema.required || [])) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) add('missing required property: ' + required);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties || !Object.prototype.hasOwnProperty.call(schema.properties, key)) add('unexpected property: ' + key, location + '.' + key);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) findings.push(...validateAgainstSchema(childSchema, value[key], location + '.' + key));
    }
  }
  return findings;
}

function readJson(filePath, findings, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    findings.push({ path: label || filePath, message: 'cannot read valid JSON: ' + error.message });
    return null;
  }
}

function isInsideRoot(root, relative) {
  if (!safeRelativePath(relative)) return false;
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relative);
  const rel = path.relative(absoluteRoot, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map(entry => entry.name)
    .sort();
}

function visitAssetPaths(value, location, root, findings) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitAssetPaths(item, location + '[' + index + ']', root, findings));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = location + '.' + key;
    if (['image', 'src', 'heroImage', 'ogImage'].includes(key) && typeof child === 'string' && child.startsWith('assets/')) {
      if (!safeRelativePath(child) || !isInsideRoot(root, child)) {
        findings.push({ path: childLocation, message: 'unsafe asset path' });
        continue;
      }
      const absolute = path.resolve(root, child);
      let stat;
      try { stat = fs.lstatSync(absolute); } catch (_) { stat = null; }
      if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        findings.push({ path: childLocation, message: 'referenced local asset is missing, not a regular file, or is a symlink: ' + child });
      }
    } else {
      visitAssetPaths(child, childLocation, root, findings);
    }
  }
}


function validMediaReviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}


function isValidHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch (_) {
    return false;
  }
}

function mediaSourceEvidenceIssues(candidate) {
  const issues = [];
  const evidence = candidate && candidate.sourceEvidence;
  const add = message => issues.push(message);
  const nonEmpty = (value, minimum = 2) => typeof value === 'string' && value.trim().length >= minimum;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return ['candidate requires a structured sourceEvidence record'];
  if (!['unverified', 'owner-created', 'licensed', 'commissioned'].includes(evidence.status)) {
    return ['sourceEvidence.status must explicitly identify unverified, owner-created, licensed, or commissioned'];
  }
  if (evidence.sourceUrl !== null && evidence.sourceUrl !== undefined && !isValidHttpsUrl(evidence.sourceUrl)) {
    add('sourceEvidence.sourceUrl must be a valid HTTPS URL');
  }
  if (evidence.status === 'unverified') {
    if (evidence.verifiedBy !== null || evidence.verifiedAt !== null) add('unverified source evidence cannot claim a verifier or verification date');
    if (!['unverified', 'rejected'].includes(candidate.rightsStatus)) add('resolved rights status requires verified source evidence');
  } else {
    if (!nonEmpty(evidence.creator)) add('verified source evidence requires a named creator');
    if (!nonEmpty(evidence.evidenceReference, 8)) add('verified source evidence requires a stable evidence reference');
    if (!nonEmpty(evidence.verifiedBy)) add('verified source evidence requires a named verifier');
    if (!validMediaReviewDate(evidence.verifiedAt)) add('verified source evidence requires a valid verification date');
    if (evidence.status === 'licensed') {
      if (!isValidHttpsUrl(evidence.sourceUrl) || !nonEmpty(evidence.licenseName)) add('licensed source evidence requires an HTTPS source URL and named license');
      if (!['licensed', 'rejected'].includes(candidate.rightsStatus)) add('licensed source evidence must align with rightsStatus=licensed');
    } else if (!['owner-confirmed', 'rejected'].includes(candidate.rightsStatus)) {
      add('owner-created or commissioned source evidence must align with rightsStatus=owner-confirmed');
    }
  }
  if (candidate.rightsStatus === 'owner-confirmed' && !['owner-created', 'commissioned'].includes(evidence.status)) add('owner-confirmed rights requires owner-created or commissioned source evidence');
  if (candidate.rightsStatus === 'licensed' && evidence.status !== 'licensed') add('licensed rights requires licensed source evidence');
  if (candidate.rightsStatus === 'unverified' && evidence.status !== 'unverified') add('unverified rights cannot claim a verified source evidence status');
  if (candidate.rightsStatus === 'rejected' && candidate.reviewStatus !== 'rejected') add('rejected rights must also set reviewStatus=rejected');
  return [...new Set(issues)];
}

function blogMediaPolicyFindings(record, root, sourcePath) {
  const findings = [];
  const media = record.media || {};
  const review = record.editorialReview || {};
  const rawCandidates = Array.isArray(media.candidates) ? media.candidates : [];
  const rawApproved = Array.isArray(media.approvedAssets) ? media.approvedAssets : [];
  if (!Array.isArray(media.candidates)) findings.push({path: sourcePath + '.media.candidates', message: 'must be an array'});
  if (!Array.isArray(media.approvedAssets)) findings.push({path: sourcePath + '.media.approvedAssets', message: 'must be an array'});
  const candidates = rawCandidates.filter(candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  const approved = rawApproved.filter(asset => asset && typeof asset === 'object' && !Array.isArray(asset));
  if (candidates.length !== rawCandidates.length) findings.push({path: sourcePath + '.media.candidates', message: 'contains a malformed candidate record'});
  if (approved.length !== rawApproved.length) findings.push({path: sourcePath + '.media.approvedAssets', message: 'contains a malformed approved asset record'});
  const candidateKeys = new Set();
  const approvedRoles = new Set();
  const inside = relative => {
    if (!safeRelativePath(relative) || !relative.startsWith('assets/images/')) return false;
    const base = path.resolve(root), target = path.resolve(base, relative);
    const rel = path.relative(base, target);
    if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return false;
    let current = base;
    for (const segment of relative.split('/')) {
      current = path.join(current, segment);
      try {
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) return false;
        if (current !== target && !stat.isDirectory()) return false;
        if (current === target && !stat.isFile()) return false;
      } catch (_) { return false; }
    }
    return true;
  };
  for (const candidate of candidates) {
    const key = String(candidate.path) + ':' + String(candidate.role);
    if (candidateKeys.has(key)) findings.push({path: sourcePath + '.media.candidates', message: 'duplicate candidate path/role: ' + key});
    candidateKeys.add(key);
    if (!inside(candidate.path)) findings.push({path: sourcePath + '.media.candidates', message: 'candidate must resolve to a permitted regular local asset: ' + candidate.path});
    const sourceIssues = mediaSourceEvidenceIssues(candidate);
    for (const issue of sourceIssues) findings.push({path: sourcePath + '.media.candidates', message: issue + ': ' + candidate.path});
    const visual = candidate.visualReview || {};
    if (visual.status === 'not_assessed') {
      if (candidate.fit !== 'not-assessed') findings.push({path: sourcePath + '.media.candidates', message: 'unassessed visual subject must use fit=not-assessed: ' + candidate.path});
      if (visual.reviewer !== null || visual.reviewedAt !== null) findings.push({path: sourcePath + '.media.candidates', message: 'unassessed visual subject cannot claim a reviewer or review date: ' + candidate.path});
    } else if (visual.status === 'matched') {
      if (!['strong-contextual-match', 'possible-contextual-match'].includes(candidate.fit)) findings.push({path: sourcePath + '.media.candidates', message: 'visually matched subject requires an assessed contextual fit: ' + candidate.path});
      if (typeof visual.evidence !== 'string' || visual.evidence.trim().length < 10 || typeof visual.reviewer !== 'string' || visual.reviewer.trim().length < 2 || !validMediaReviewDate(visual.reviewedAt)) {
        findings.push({path: sourcePath + '.media.candidates', message: 'visual match requires evidence, reviewer and valid review date: ' + candidate.path});
      }
    } else if (visual.status === 'mismatch') {
      if (candidate.fit !== 'not-a-match' || candidate.reviewStatus !== 'rejected') findings.push({path: sourcePath + '.media.candidates', message: 'visual mismatch must be marked not-a-match and rejected: ' + candidate.path});
      if (typeof visual.evidence !== 'string' || visual.evidence.trim().length < 10 || typeof visual.reviewer !== 'string' || visual.reviewer.trim().length < 2 || !validMediaReviewDate(visual.reviewedAt)) {
        findings.push({path: sourcePath + '.media.candidates', message: 'visual mismatch requires evidence, reviewer and valid review date: ' + candidate.path});
      }
    } else {
      findings.push({path: sourcePath + '.media.candidates', message: 'candidate requires an explicit visual review state: ' + candidate.path});
    }
    if (candidate.reviewStatus === 'approved' && visual.status !== 'matched') {
      findings.push({path: sourcePath + '.media.candidates', message: 'candidate cannot be approved before a documented visual subject match: ' + candidate.path});
    }
    if (candidate.reviewStatus === 'approved' && !['owner-confirmed', 'licensed'].includes(candidate.rightsStatus)) {
      findings.push({path: sourcePath + '.media.candidates', message: 'candidate approval requires owner-confirmed or licensed rights evidence: ' + candidate.path});
    }
    if (candidate.reviewStatus === 'approved' && sourceIssues.length) {
      findings.push({path: sourcePath + '.media.candidates', message: 'candidate approval requires complete structured source evidence: ' + candidate.path});
    }
    if (candidate.reviewStatus === 'approved' && !inside(candidate.path)) {
      findings.push({path: sourcePath + '.media.candidates', message: 'approved candidate path must resolve locally: ' + candidate.path});
    }
  }
  let sharedImagePolicy = null;
  for (const asset of approved) {
    if (approvedRoles.has(asset.role)) findings.push({path: sourcePath + '.media.approvedAssets', message: 'more than one approved asset for role ' + asset.role});
    approvedRoles.add(asset.role);
    const candidate = candidates.find(item => item.path === asset.path && item.role === asset.role
      && item.reviewStatus === 'approved' && item.visualReview && item.visualReview.status === 'matched'
      && ['owner-confirmed', 'licensed'].includes(item.rightsStatus)
      && mediaSourceEvidenceIssues(item).length === 0);
    if (!candidate) findings.push({path: sourcePath + '.media.approvedAssets', message: 'approved asset must reference a reviewed candidate with resolved rights: ' + asset.path});
    else if (asset.rightsEvidence !== candidate.sourceEvidence.evidenceReference) {
      findings.push({path: sourcePath + '.media.approvedAssets', message: 'approved asset rightsEvidence must exactly reference the candidate source-evidence record: ' + asset.path});
    }
    if (!inside(asset.path)) findings.push({path: sourcePath + '.media.approvedAssets', message: 'approved asset must resolve to a permitted local file: ' + asset.path});
    else {
      try {
        // Loaded lazily to avoid module-initialization cycles: this path runs only
        // during validation, after validate-content exports are established.
        const mediaAudit = require('./audit-editorial-media-readiness');
        sharedImagePolicy = sharedImagePolicy || mediaAudit.imagePolicy(root);
        const image = mediaAudit.imageInfo(root, asset.path, sharedImagePolicy);
        const decoded = mediaAudit.verifyImageDecode(root, [image]).get(asset.path);
        const technical = mediaAudit.validateForRole({ ...image, decodeStatus: decoded && decoded.status }, asset.role, sharedImagePolicy);
        if (!technical.valid) findings.push({path: sourcePath + '.media.approvedAssets', message: 'approved asset fails publication media checks: ' + asset.path + ' (' + technical.errors.join('; ') + ')'});
      } catch (error) {
        findings.push({path: sourcePath + '.media.approvedAssets', message: 'could not validate approved image safely: ' + asset.path + ' (' + error.message + ')'});
      }
    }
    if (/^(image|photo|picture|image of|photo of|jaisalmer)$/i.test(String(asset.alt || '').trim())) {
      findings.push({path: sourcePath + '.media.approvedAssets', message: 'approved asset alt text is too generic: ' + asset.path});
    }
    if (!String(asset.rightsEvidence || '').trim()) findings.push({path: sourcePath + '.media.approvedAssets', message: 'approved asset requires rights evidence: ' + asset.path});
  }
  if (review.mediaStatus === 'approved') {
    for (const role of ['hero', 'socialPreview']) {
      const asset = approved.find(item => item.role === role);
      const pathValue = role === 'hero' ? record.heroImage : record.seo && record.seo.ogImage;
      const altValue = role === 'hero' ? record.heroAlt : record.seo && record.seo.ogAlt;
      if (!asset) findings.push({path: sourcePath + '.media.approvedAssets', message: 'mediaStatus approved requires an approved ' + role + ' asset'});
      else {
        if (asset.path !== pathValue) findings.push({path: sourcePath, message: 'approved ' + role + ' asset must match the rendered image path'});
        if (asset.alt !== altValue) findings.push({path: sourcePath, message: 'approved ' + role + ' alt text must match the rendered alt text'});
      }
    }
  }
  if (review.mediaStatus === 'missing' && (record.heroImage || (record.seo && record.seo.ogImage))) {
    findings.push({path: sourcePath + '.editorialReview.mediaStatus', message: 'mediaStatus missing cannot coexist with assigned hero/OG image paths'});
  }
  if ((record.status === 'approved_for_release' || record.status === 'live') && review.mediaStatus !== 'approved') {
    findings.push({path: sourcePath + '.editorialReview.mediaStatus', message: 'approved/live blog requires fully approved media'});
  }
  if ((record.status === 'approved_for_release' || record.status === 'live') && approvedRoles.size !== 2) {
    findings.push({path: sourcePath + '.media.approvedAssets', message: 'approved/live blog requires exactly one approved hero and socialPreview asset'});
  }
  return findings;
}

function validateRecordPolicy(type, record, root, registry, siteConfig, findings, sourcePath) {
  const status = record.status;
  const slug = type === 'gallery' ? record.category : record.slug;
  if (type !== 'gallery' && (!slug || path.basename(sourcePath) !== slug + '.json')) {
    findings.push({ path: sourcePath, message: 'filename must match the record slug' });
  }
  if (type === 'gallery' && path.basename(sourcePath) !== record.category + '.json') {
    findings.push({ path: sourcePath, message: 'gallery manifest filename must match its category' });
  }
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    findings.push({ path: sourcePath, message: 'record slug/category must be lowercase kebab-case before deriving paths' });
    return;
  }
  if ((type === 'tour' || type === 'blog') && record.seo && record.seo.ogImage
      && (typeof record.seo.ogAlt !== 'string' || record.seo.ogAlt.trim().length < 5)) {
    findings.push({
      path: sourcePath + '.seo.ogAlt',
      message: 'seo.ogImage requires meaningful seo.ogAlt text',
    });
  }
  if (type === 'tour' && status === 'live') {
    if (record.factsConfirmed !== true) findings.push({ path: sourcePath, message: 'live tour requires factsConfirmed: true' });
    if (!record.lastVerified || !isValidDate(record.lastVerified)) findings.push({ path: sourcePath, message: 'live tour requires a valid lastVerified date' });
  }
  if (type === 'blog') {
    findings.push(...blogMediaPolicyFindings(record, root, sourcePath));
    const review = record.editorialReview;
    if (!review || typeof review !== 'object' || Array.isArray(review)) {
      findings.push({ path: sourcePath + '.editorialReview', message: 'blog requires explicit editorial review state' });
    } else {
      const hasHero = typeof record.heroImage === 'string' && record.heroImage.length > 0;
      const hasHeroAlt = typeof record.heroAlt === 'string' && record.heroAlt.trim().length >= 5;
      const hasOg = Boolean(record.seo && typeof record.seo.ogImage === 'string' && record.seo.ogImage.length > 0);
      const hasOgAlt = Boolean(record.seo && typeof record.seo.ogAlt === 'string' && record.seo.ogAlt.trim().length >= 5);
      if (review.ownerFactApproved === true && review.factStatus !== 'approved') {
        findings.push({ path: sourcePath + '.editorialReview', message: 'owner fact approval requires factStatus: approved' });
      }
      if (review.mediaStatus === 'missing' && (hasHero || hasOg)) {
        findings.push({ path: sourcePath + '.editorialReview.mediaStatus', message: 'mediaStatus cannot be missing when hero/OG media paths are assigned' });
      }
      if (review.mediaStatus === 'approved' && !(hasHero && hasHeroAlt && hasOg && hasOgAlt)) {
        findings.push({ path: sourcePath + '.editorialReview.mediaStatus', message: 'approved media requires existing hero and OG image paths with meaningful alt text' });
      }
      if (status === 'approved_for_release' || status === 'live') {
        for (const field of ['editorialStatus', 'sourceStatus', 'factStatus', 'mediaStatus']) {
          if (review[field] !== 'approved') {
            findings.push({ path: sourcePath + '.editorialReview.' + field, message: 'approved/live blog requires ' + field + ': approved' });
          }
        }
        if (review.ownerFactApproved !== true) {
          findings.push({ path: sourcePath + '.editorialReview.ownerFactApproved', message: 'approved/live blog requires explicit owner fact approval' });
        }
        if (!review.reviewedAt || !isValidDate(review.reviewedAt)) {
          findings.push({ path: sourcePath + '.editorialReview.reviewedAt', message: 'approved/live blog requires a valid review date' });
        }
        if (typeof review.reviewer !== 'string' || review.reviewer.trim().length < 2) {
          findings.push({ path: sourcePath + '.editorialReview.reviewer', message: 'approved/live blog requires a named reviewer' });
        }
        if (!(hasHero && hasHeroAlt && hasOg && hasOgAlt)) {
          findings.push({ path: sourcePath, message: 'approved/live blog requires a hero image, OG image, and meaningful alt text for both' });
        }
        if (typeof record.heroCaption !== 'string'
            || record.heroCaption.trim().length < 20
            || record.heroCaption.trim().length > 180) {
          findings.push({
            path: sourcePath + '.heroCaption',
            message: 'approved/live blog requires a reviewed hero caption between 20 and 180 characters',
          });
        }
      }
      if (status === 'approved_for_release' && record.publishedAt != null) {
        findings.push({ path: sourcePath + '.publishedAt', message: 'approved_for_release blog must not claim a publication date before going live' });
      }
    }
  }
  if (type === 'blog' && status === 'live' && (!record.lastReviewed || !isValidDate(record.lastReviewed))) {
    findings.push({ path: sourcePath, message: 'live article requires a valid lastReviewed date' });
  }
  if (type === 'gallery') {
    if (status === 'live') {
      for (const [index, image] of (record.images || []).entries()) {
        if (image.approved !== true) findings.push({ path: sourcePath + '.images[' + index + ']', message: 'live gallery images must be owner-approved' });
      }
    }
    visitAssetPaths(record, '$', root, findings);
    return;
  }

  const typeConfig = registry.contentTypes[type];
  if (!typeConfig) {
    findings.push({ path: 'content/paths.json', message: 'missing registry config for content type: ' + type });
    return;
  }
  if (!safeRelativePath(typeConfig.outputDirectory) || typeConfig.outputExtension !== '.html') {
    findings.push({ path: 'content/paths.json', message: type + ' output route configuration is unsafe or unsupported' });
    return;
  }
  const publicPath = path.posix.join(typeConfig.outputDirectory, slug + typeConfig.outputExtension);
  if (status !== 'live' && fs.existsSync(path.resolve(root, publicPath))) {
    findings.push({ path: publicPath, message: 'draft/hidden record has a public output file' });
  }
  if (status === 'live') {
    const site = siteConfig.site || {};
    if (site.canonicalHostApproved !== true) findings.push({ path: 'content/site-config.json', message: 'live content requires owner approval of the canonical host' });
    if (!fs.existsSync(path.resolve(root, publicPath))) findings.push({ path: publicPath, message: 'live record has no generated public page' });
    const sitemapPath = path.resolve(root, 'sitemap.xml');
    const canonicalHost = String(site.newStaticSiteCanonicalHost || '').replace(/\/+$/, '');
    if (!fs.existsSync(sitemapPath) || !fs.readFileSync(sitemapPath, 'utf8').includes(canonicalHost + '/' + publicPath)) {
      findings.push({ path: 'sitemap.xml', message: 'live content URL is missing from sitemap.xml' });
    }
  }
  visitAssetPaths(record, '$', root, findings);
}

function validateRepository(root = ROOT) {
  const findings = [];
  const registry = readJson(path.resolve(root, 'content/paths.json'), findings, 'content/paths.json');
  const siteConfig = readJson(path.resolve(root, 'content/site-config.json'), findings, 'content/site-config.json');
  if (!registry || !siteConfig) return { ok: false, findings, records: 0, schemas: 0 };
  if (registry.schemaVersion !== 1) findings.push({ path: 'content/paths.json', message: 'unsupported schemaVersion' });
  if (!registry.site || registry.site.engine !== 'static-html') findings.push({ path: 'content/paths.json', message: 'site.engine must be static-html' });
  if (!siteConfig.verificationStatus) findings.push({ path: 'content/site-config.json', message: 'verificationStatus must be explicit' });

  for (const assetPath of [registry.site && registry.site.sharedStylesheet, registry.site && registry.site.sharedScript]) {
    if (!safeRelativePath(assetPath) || !isInsideRoot(root, assetPath) || !fs.existsSync(path.resolve(root, assetPath))) {
      findings.push({ path: 'content/paths.json', message: 'shared asset path is invalid or missing: ' + assetPath });
    }
  }

  let schemaCount = 0;
  let recordCount = 0;
  for (const [type, info] of Object.entries(TYPES)) {
    const typeConfig = registry.contentTypes && registry.contentTypes[type];
    if (!typeConfig) {
      findings.push({ path: 'content/paths.json', message: 'missing content type: ' + type });
      continue;
    }
    let safePaths = true;
    for (const field of ['recordDirectory', 'assetDirectory']) {
      if (!safeRelativePath(typeConfig[field])) {
        findings.push({ path: 'content/paths.json', message: type + '.' + field + ' is not a safe repository-relative path' });
        safePaths = false;
      }
    }
    if (type !== 'gallery' && (!safeRelativePath(typeConfig.outputDirectory) || typeConfig.outputExtension !== '.html')) {
      findings.push({ path: 'content/paths.json', message: type + ' output route configuration is unsafe or unsupported' });
      safePaths = false;
    }
    if (!safePaths) continue;

    const recordDirectory = path.resolve(root, typeConfig.recordDirectory);
    if (!fs.existsSync(recordDirectory) || !fs.statSync(recordDirectory).isDirectory()) {
      findings.push({ path: typeConfig.recordDirectory, message: 'record directory is missing' });
      continue;
    }
    const schemaRelative = path.posix.join('content/schemas', info.schema);
    const schema = readJson(path.resolve(root, schemaRelative), findings, schemaRelative);
    if (schema) schemaCount += 1;
    for (const name of listJsonFiles(recordDirectory)) {
      const relative = path.posix.join(typeConfig.recordDirectory, name);
      const record = readJson(path.resolve(root, relative), findings, relative);
      if (!record || !schema) continue;
      recordCount += 1;
      findings.push(...validateAgainstSchema(schema, record, relative));
      validateRecordPolicy(type, record, root, registry, siteConfig, findings, relative);
    }
  }
  for (const type of Object.keys(registry.contentTypes || {})) {
    if (!Object.prototype.hasOwnProperty.call(TYPES, type)) findings.push({ path: 'content/paths.json', message: 'unsupported content type: ' + type });
  }
  return { ok: findings.length === 0, findings, records: recordCount, schemas: schemaCount };
}

module.exports = { safeRelativePath, validateAgainstSchema, validateRepository, validateRecordPolicy, blogMediaPolicyFindings, mediaSourceEvidenceIssues };

if (require.main === module) {
  const result = validateRepository();
  for (const finding of result.findings) console.error('FAIL ' + finding.path + ': ' + finding.message);
  if (!result.ok) {
    console.error('Content contract failed: ' + result.findings.length + ' finding(s).');
    process.exitCode = 1;
  } else {
    console.log('PASS: content contract; ' + result.schemas + ' schema(s), ' + result.records + ' record(s).');
    if (result.records === 0) console.log('NOTE: no tour/blog/gallery records exist yet; validation covered the registry and schema files only.');
  }
}

