#!/usr/bin/env node
'use strict';

/**
 * Build an offline, read-only owner-review bundle for the 33 fixed page-media slots.
 * This bundle records evidence supplied by a human; it never signs, approves,
 * imports, or publishes a page image.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseStrictJsonBytes } = require('./validate-editorial-media-decisions');
const { PAGE_MEDIA_SLOT_DEFINITIONS } = require('./audit-authoritative-gallery-source');

const SOURCE_REPOSITORY = 'https://github.com/tchouhanjsm/garh-jaisal-website';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_BLOB = /^[a-f0-9]{40}$/i;
const APPROVAL_FIELDS = [
  'status', 'source_credit', 'rights_basis', 'visual_match_review',
  'alt_text_review', 'technical_validation', 'asset_sha256',
  'approved_by', 'approved_at', 'signature',
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha(bytes) {
  return crypto.createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + '\0', 'utf8'))
    .update(bytes)
    .digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + stableStringify(value[key])
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) &&
    relative !== '..' && !path.isAbsolute(relative));
}

function realDirectory(value, label) {
  const absolute = path.resolve(value);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(label + ' must be an existing non-symlink directory.');
  }
  return fs.realpathSync(absolute);
}

function regularFile(root, relative, label, maxBytes) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)) {
    throw new Error(label + ' must be a safe repository-relative path.');
  }
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(label + ' contains an unsafe path component.');
  }
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(label + ' must not traverse a symlink.');
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(label + ' contains a non-directory parent.');
    }
    if (index === parts.length - 1 && !stat.isFile()) {
      throw new Error(label + ' must be a regular file.');
    }
  }
  const stat = fs.statSync(current);
  const resolved = fs.realpathSync(current);
  if (!within(root, resolved) || stat.size < 1 || stat.size > maxBytes) {
    throw new Error(label + ' is outside its root or exceeds its byte limit.');
  }
  return resolved;
}

function runGit(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Could not verify exact source Git state: ' +
      String(result.stderr || (result.error && result.error.message) || 'git command failed').trim());
  }
  return String(result.stdout || '').trim();
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function csvCell(value) {
  let text = String(value === null || value === undefined ? '' : value);
  if (/^[\uFEFF\s]*[=+@-]/u.test(text) || /^[\u0000-\u001f\u007f]/.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object.');
  }
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(label + ' has an unsupported or missing field.');
  }
}

function buildPageMediaReviewBundle(options) {
  const sourceRoot = realDirectory(options && options.sourceRoot, 'Authoritative source checkout');
  const sourceCommit = String(options && options.sourceCommit || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
    throw new Error('Source commit must be an exact 40-character Git SHA.');
  }
  if (runGit(sourceRoot, ['rev-parse', 'HEAD']).toLowerCase() !== sourceCommit) {
    throw new Error('Authoritative source checkout does not match the requested exact commit.');
  }
  if (runGit(sourceRoot, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Authoritative source working tree is not clean.');
  }

  const auditPath = path.resolve(options && options.auditPath || '');
  const auditStat = fs.lstatSync(auditPath);
  if (auditStat.isSymbolicLink() || !auditStat.isFile() ||
      auditStat.size < 1 || auditStat.size > 10 * 1024 * 1024) {
    throw new Error('Authoritative source audit must be a bounded regular JSON file.');
  }
  if (within(sourceRoot, auditPath)) throw new Error('Audit output/input must remain outside the source checkout.');
  const auditBytes = fs.readFileSync(auditPath);
  const audit = parseStrictJsonBytes(auditBytes, 'Authoritative source audit');
  const page = audit && audit.pageMediaGovernance;
  const areas = Object.keys(PAGE_MEDIA_SLOT_DEFINITIONS);
  const expectedCount = areas.reduce((sum, area) => sum + PAGE_MEDIA_SLOT_DEFINITIONS[area].length, 0);

  if (!audit || audit.auditType !== 'read-only-authoritative-gallery-source-drift' ||
      audit.sourceRepository !== SOURCE_REPOSITORY || audit.sourceBranch !== 'main' ||
      String(audit.currentSourceCommit || '').toLowerCase() !== sourceCommit ||
      audit.status === 'INVALID' || !Array.isArray(audit.structuralErrors) ||
      audit.structuralErrors.length !== 0 || !page || page.status !== 'PENDING_OWNER_REVIEW' ||
      page.schemaAvailable !== true || !Array.isArray(page.schemaViolations) ||
      page.schemaViolations.length !== 0 || !Array.isArray(page.structuralErrors) ||
      page.structuralErrors.length !== 0 || !page.signatureVerification ||
      page.signatureVerification.performed !== false || !page.controls ||
      page.controls.readOnly !== true || page.controls.tourismImportAuthorized !== false ||
      !page.summary || page.summary.slotCount !== expectedCount ||
      page.summary.expectedSlotCount !== expectedCount ||
      page.summary.pendingCount !== expectedCount ||
      page.summary.approvedStatusCount !== 0 ||
      page.summary.imageDecodeVerifiedCount !== expectedCount ||
      page.summary.approvalEligibleCount !== 0 ||
      page.summary.tourismImportEligibleCount !== 0 ||
      !Array.isArray(page.records) || page.records.length !== expectedCount) {
    throw new Error('Authoritative page-media audit is invalid, incomplete, non-pending, or not bound to exact source main.');
  }

  const auditById = new Map();
  for (const item of page.records) {
    if (!item || typeof item.id !== 'string' || auditById.has(item.id)) {
      throw new Error('Page-media audit contains an invalid or duplicate slot ID.');
    }
    auditById.set(item.id, item);
  }

  const areaFiles = new Map();
  const prepared = [];
  const uniqueImages = new Map();
  for (const area of areas) {
    const sourceFilePath = 'content/page-media/' + area + '.json';
    const sourceFile = regularFile(sourceRoot, sourceFilePath, 'Page-media source file ' + area, 2 * 1024 * 1024);
    const sourceFileBytes = fs.readFileSync(sourceFile);
    const sourceFileSha256 = sha256(sourceFileBytes);
    const sourceFileGitBlobSha = gitBlobSha(sourceFileBytes);
    const sourceRecords = parseStrictJsonBytes(sourceFileBytes, 'Page-media source file ' + area);
    if (!sourceRecords || typeof sourceRecords !== 'object' || Array.isArray(sourceRecords)) {
      throw new Error('Page-media source file ' + area + ' must contain a JSON object.');
    }
    areaFiles.set(area, { sourceFilePath, sourceFileSha256, sourceFileGitBlobSha, sourceRecords });

    for (const slotId of PAGE_MEDIA_SLOT_DEFINITIONS[area]) {
      const audited = auditById.get(slotId);
      const record = sourceRecords[slotId];
      if (!audited || audited.area !== area || audited.id !== slotId ||
          audited.approvalStatus !== 'pending' || audited.imageDecodeComplete !== true ||
          !Number.isSafeInteger(audited.assetBytes) || audited.assetBytes < 1 ||
          !SHA256.test(audited.assetSha256 || '') || !GIT_BLOB.test(audited.imageGitBlobSha || '') ||
          !Number.isInteger(audited.imageWidth) || audited.imageWidth < 1 ||
          !Number.isInteger(audited.imageHeight) || audited.imageHeight < 1) {
        throw new Error('Page-media audit evidence is incomplete for ' + area + '/' + slotId + '.');
      }
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('Page-media source record is missing: ' + area + '/' + slotId + '.');
      }
      const sourceRecordKeys = Object.keys(record).sort();
      const allowedRecordKeys = [
        ['alt', 'approval', 'src'],
        ['alt', 'approval', 'caption', 'src'],
      ];
      if (!allowedRecordKeys.some(keys => keys.length === sourceRecordKeys.length &&
          keys.every((key, index) => key === sourceRecordKeys[index]))) {
        throw new Error('Page-media source record ' + slotId + ' has unsupported or missing fields.');
      }
      const approval = record.approval;
      exactKeys(approval, APPROVAL_FIELDS, 'Page-media approval record ' + slotId);
      if (record.src !== audited.source || approval.status !== 'pending' ||
          APPROVAL_FIELDS.filter(name => name !== 'status').some(name => approval[name] !== '') ||
          typeof record.alt !== 'string' || record.alt.trim().length < 15 ||
          record.alt.length > 300 || typeof (record.caption === undefined ? '' : record.caption) !== 'string' ||
          String(record.caption || '').length > 180) {
        throw new Error('Page-media source record is not a clean pending review candidate: ' + slotId + '.');
      }

      const imagePath = record.src;
      if (typeof imagePath !== 'string' || !imagePath.startsWith('img/') ||
          imagePath.includes('\\') || path.isAbsolute(imagePath) ||
          imagePath.split('/').some(part => !part || part === '.' || part === '..') ||
          !IMAGE_EXTENSIONS.has(path.extname(imagePath).toLowerCase())) {
        throw new Error('Page-media image path is unsafe: ' + slotId + '.');
      }
      const imageFile = regularFile(sourceRoot, imagePath, 'Page-media image ' + slotId, 25 * 1024 * 1024);
      const imageBytes = fs.readFileSync(imageFile);
      const imageSha256 = sha256(imageBytes);
      const imageGitBlobSha = gitBlobSha(imageBytes);
      if (imageBytes.length !== audited.assetBytes ||
          imageSha256 !== audited.assetSha256.toLowerCase() ||
          imageGitBlobSha !== audited.imageGitBlobSha.toLowerCase()) {
        throw new Error('Page-media image bytes changed after the authoritative audit: ' + slotId + '.');
      }

      const previewImagePath = 'images/' + imageSha256 + path.extname(imagePath).toLowerCase();
      if (!uniqueImages.has(imageSha256)) uniqueImages.set(imageSha256, { path: previewImagePath, bytes: imageBytes });
      prepared.push({
        slotId,
        area,
        sourceFilePath,
        sourceFileSha256,
        sourceFileGitBlobSha,
        sourceRecordSha256: sha256(Buffer.from(stableStringify(record), 'utf8')),
        sourceImagePath: imagePath,
        imageBytes: imageBytes.length,
        imageSha256,
        imageGitBlobSha,
        imageDecodeComplete: true,
        imageWidth: audited.imageWidth,
        imageHeight: audited.imageHeight,
        currentAltText: record.alt,
        caption: record.caption || '',
        approvalStatus: approval.status,
        previewImagePath,
      });
    }
  }

  if (prepared.length !== expectedCount || auditById.size !== expectedCount) {
    throw new Error('Page-media audit and source records must cover exactly ' + expectedCount + ' fixed slots.');
  }

  const generatedAt = options && options.generatedAt ? String(options.generatedAt) : new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt)) || !/^\d{4}-\d{2}-\d{2}T/.test(generatedAt)) {
    throw new Error('Bundle generation timestamp must be an ISO-8601 timestamp.');
  }
  const sourceAuditSha256 = sha256(auditBytes);
  const summary = {
    slotCount: prepared.length,
    uniqueImageCount: uniqueImages.size,
    pendingCount: prepared.length,
    recommendationCount: 0,
    evidenceCompleteRecommendationCount: 0,
    approvalEligibleCount: 0,
  };
  const manifest = {
    schemaVersion: 1,
    artifactType: 'fixed-page-media-owner-review-manifest',
    sourceRepository: SOURCE_REPOSITORY,
    sourceBranch: 'main',
    sourceCommit,
    sourceAuditSha256,
    generatedAt,
    summary,
    policy: {
      reviewOnly: true,
      sourceRecordsChanged: false,
      approvedMediaChanged: false,
      rightsInferred: false,
      visualRelevanceInferred: false,
      signatureCreated: false,
      approvalAuthorized: false,
      publicationAuthorized: false,
      tourismImportAuthorized: false,
    },
    records: prepared,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const manifestSha256 = sha256(manifestBytes);
  const worksheet = {
    schemaVersion: 1,
    artifactType: 'fixed-page-media-owner-review-worksheet',
    sourceRepository: SOURCE_REPOSITORY,
    sourceBranch: 'main',
    sourceCommit,
    sourceAuditSha256,
    manifestSha256,
    reviewOnly: true,
    approvalStatus: 'not-approved',
    publicationEligible: false,
    policy: {
      autoApplied: false,
      sourceRecordsChanged: false,
      approvedMediaChanged: false,
      rightsInferred: false,
      visualRelevanceInferred: false,
      signatureCreated: false,
      approvalAuthorized: false,
      publicationAuthorized: false,
    },
    decisions: prepared.map(record => ({
      slotId: record.slotId,
      area: record.area,
      sourceFileSha256: record.sourceFileSha256,
      sourceRecordSha256: record.sourceRecordSha256,
      imageSha256: record.imageSha256,
      reviewDecision: 'pending',
      sourceCredit: '',
      rightsBasis: '',
      visualMatchStatus: 'not-assessed',
      visualMatchEvidence: '',
      altText: record.currentAltText,
      altTextReviewStatus: 'pending',
      altTextReviewEvidence: '',
      caption: record.caption,
      notes: '',
    })),
  };

  const outputDirectory = path.resolve(options && options.outputDirectory || '');
  if (!outputDirectory || within(sourceRoot, outputDirectory) || fs.existsSync(outputDirectory)) {
    throw new Error('Review bundle output must be a new directory outside the authoritative source checkout.');
  }
  fs.mkdirSync(outputDirectory, { recursive: false });
  fs.mkdirSync(path.join(outputDirectory, 'images'));
  for (const image of uniqueImages.values()) {
    fs.writeFileSync(path.join(outputDirectory, image.path), image.bytes, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), manifestBytes, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDirectory, 'page-media-decisions.template.json'),
    JSON.stringify(worksheet, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(outputDirectory, 'review.csv'), [
    ['slot_id', 'area', 'source_image', 'current_alt_text', 'caption', 'approval_status', 'image_sha256'].join(','),
    ...prepared.map(record => [
      record.slotId, record.area, record.sourceImagePath, record.currentAltText,
      record.caption, record.approvalStatus, record.imageSha256,
    ].map(csvCell).join(',')),
  ].join('\n') + '\n', { flag: 'wx' });

  const cards = prepared.map(record => [
    '<article class="record">',
    '<div class="image"><img src="' + escapeHtml(record.previewImagePath) +
      '" alt="' + escapeHtml(record.currentAltText) + '" loading="lazy" decoding="async"></div>',
    '<div class="body"><p class="eyebrow">' + escapeHtml(record.area) + ' · ' + escapeHtml(record.slotId) + '</p>',
    '<h2>' + escapeHtml(record.slotId) + '</h2>',
    '<p class="alt"><strong>Existing alt text (unreviewed):</strong> ' + escapeHtml(record.currentAltText) + '</p>',
    '<p class="caption">' + escapeHtml(record.caption || 'No caption recorded') + '</p>',
    '<p class="technical">Decoded image · ' + record.imageWidth + ' × ' + record.imageHeight +
      ' · ' + record.imageBytes + ' bytes · SHA-256 ' + escapeHtml(record.imageSha256) + '</p>',
    '<p class="source">Source: ' + escapeHtml(record.sourceImagePath) + ' · Approval status: pending</p>',
    '</div></article>',
  ].join('')).join('\n');
  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'; object-src \'none\'; connect-src \'none\'; media-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    '<meta name="referrer" content="no-referrer"><title>Fixed page media — local owner review</title>',
    '<style>',
    ':root{color-scheme:light;--ink:#2b211b;--muted:#6d625a;--sand:#eee5d8;--paper:#fbf8f3;--line:#ded2c4}',
    '*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif}',
    'header{padding:32px max(20px,calc((100vw - 1200px)/2));background:#342820;color:#fff}',
    'header p{max-width:920px;color:#e8ddd1}main{max-width:1200px;margin:28px auto;padding:0 20px}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px}',
    '.record{overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#fff}',
    '.image{aspect-ratio:16/10;background:var(--sand)}.image img{width:100%;height:100%;object-fit:contain}',
    '.body{padding:16px}.eyebrow,.technical,.source{color:var(--muted);font-size:12px;overflow-wrap:anywhere}',
    '.eyebrow{text-transform:uppercase;letter-spacing:.08em}h2{margin:4px 0 8px;font-size:18px}',
    '.alt{overflow-wrap:anywhere}.caption{color:var(--muted)}footer{padding:24px 20px;text-align:center;color:var(--muted)}',
    '</style></head><body>',
    '<header><h1>Fixed page media — owner review</h1>',
    '<p>Local, read-only copies of the exact 33 fixed page-media slots from source main at ' +
      escapeHtml(sourceCommit) + '. Inspect each image and record only evidence supplied or verified by the owner/editor. Existing alt text, captions, filenames, successful decoding and CMS presence do not establish rights or visual relevance.</p>',
    '<p>Slots: ' + summary.slotCount + ' · Unique images: ' + summary.uniqueImageCount +
      ' · Pending decisions: ' + summary.pendingCount + ' · Approval eligible: 0</p></header>',
    '<main><section class="grid">', cards, '</section></main>',
    '<footer>Review-only bundle · No CMS records changed · No media approved · No signature or publication performed</footer>',
    '</body></html>',
  ].join('\n');
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), html, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDirectory, 'README.md'), [
    '# Fixed page-media owner-review bundle',
    '',
    'This is an offline review copy of the exact source-main fixed page-media records and image bytes.',
    '',
    '- Source commit: ' + sourceCommit,
    '- Slots: ' + summary.slotCount,
    '- Unique images: ' + summary.uniqueImageCount,
    '- Decision template: page-media-decisions.template.json',
    '- CSV inventory: review.csv',
    '',
    'Inspect each exact image. Record creator/source attribution, the documented rights basis, the visual match, and the alt-text review only from owner/editor evidence. The existing text is a candidate for review, not an approved description.',
    '',
    'A recommendation in the worksheet is not an approval. Do not upload the worksheet to the CMS or change publication state. The source repository CLI signer, configured owner allowlist, private HMAC key, and a separately reviewed pull request remain required.',
    '',
    'Policy: source records unchanged; approved media unchanged; no rights or visual relevance inferred; no signature; no import; no publication.',
  ].join('\n') + '\n', { flag: 'wx' });

  return { outputDirectory, manifest, worksheet, summary };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || index + 1 >= argv.length) throw new Error('Invalid command-line arguments.');
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  for (const key of ['source-root', 'source-commit', 'audit', 'output']) {
    if (!values[key]) throw new Error('Missing required argument --' + key + '.');
  }
  return values;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv);
    const result = buildPageMediaReviewBundle({
      sourceRoot: args['source-root'],
      sourceCommit: args['source-commit'],
      auditPath: args.audit,
      outputDirectory: args.output,
    });
    console.log('PASS: local-only fixed page-media owner-review bundle created.');
    console.log('Source: ' + result.manifest.sourceCommit + ' | slots: ' +
      result.summary.slotCount + ' | unique images: ' + result.summary.uniqueImageCount);
    console.log('Pending: ' + result.summary.pendingCount +
      ' | approval eligible: 0 | source records changed: no.');
  } catch (error) {
    console.error('FAIL: fixed page-media owner-review bundle stopped safely: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildPageMediaReviewBundle, csvCell };
