#!/usr/bin/env node
'use strict';

/**
 * Build a local-only owner review bundle for the authoritative Gallery.
 * Source images and records are copied for inspection; this tool never edits
 * the source checkout, changes CMS state, approves media, or imports content.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseStrictJsonBytes } = require('./validate-editorial-media-decisions');
const { writeBundleIntegrityManifest } = require('./review-bundle-integrity');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_REPOSITORY = 'https://github.com/tchouhanjsm/garh-jaisal-website';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const GIT_BLOB_PATTERN = /^[a-f0-9]{40}$/i;

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

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) &&
    relative !== '..' && !path.isAbsolute(relative));
}

function realDirectory(directory, label) {
  const absolute = path.resolve(directory);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(label + ' must be an existing non-symlink directory.');
  }
  return fs.realpathSync(absolute);
}

function regularFile(root, relative, label) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)) {
    throw new Error(label + ' must be a safe repository-relative path.');
  }
  const segments = relative.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(label + ' contains an unsafe path segment.');
  }
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(label + ' must not traverse a symlink.');
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(label + ' contains a non-directory parent.');
    }
    if (index === segments.length - 1 && !stat.isFile()) {
      throw new Error(label + ' must be a regular file.');
    }
  }
  const resolved = fs.realpathSync(current);
  if (!isWithin(root, resolved)) throw new Error(label + ' resolves outside the authoritative source checkout.');
  return resolved;
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function csvCell(value) {
  let text = String(value === null || value === undefined ? '' : value);
  // CSV quoting alone does not stop spreadsheet formula execution. Preserve
  // the source value but force risky cells to be interpreted as literal text.
  const formulaPrefix = /^[\uFEFF\s]*[=+@-]/u.test(text);
  const controlPrefix = /^[\u0000-\u001f\u007f]/.test(text);
  if (formulaPrefix || controlPrefix) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function runGit(sourceRoot, args) {
  const result = spawnSync('git', args, {
    cwd: sourceRoot,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Could not verify authoritative source Git state: ' +
      String(result.stderr || (result.error && result.error.message) || 'git command failed').trim());
  }
  return String(result.stdout || '').trim();
}

function buildGalleryReviewBundle(options) {
  const sourceRoot = realDirectory(options && options.sourceRoot, 'Authoritative source checkout');
  const sourceCommit = String(options && options.sourceCommit || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
    throw new Error('Source commit must be an exact 40-character Git SHA.');
  }
  if (runGit(sourceRoot, ['rev-parse', 'HEAD']).toLowerCase() !== sourceCommit) {
    throw new Error('Authoritative source checkout does not match the requested exact commit.');
  }
  if (runGit(sourceRoot, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Authoritative source working tree is not clean; rebuild the source audit before creating a review bundle.');
  }

  const auditPath = path.resolve(options && options.auditPath || '');
  const auditStat = fs.lstatSync(auditPath);
  if (auditStat.isSymbolicLink() || !auditStat.isFile() ||
      auditStat.size < 1 || auditStat.size > 10 * 1024 * 1024) {
    throw new Error('Authoritative Gallery audit must be a bounded regular JSON file.');
  }
  const auditBytes = fs.readFileSync(auditPath);
  const audit = parseStrictJsonBytes(auditBytes, 'Authoritative Gallery audit');
  if (!audit || audit.auditType !== 'read-only-authoritative-gallery-source-drift' ||
      audit.sourceRepository !== SOURCE_REPOSITORY || audit.sourceBranch !== 'main' ||
      String(audit.currentSourceCommit || '').toLowerCase() !== sourceCommit ||
      !Array.isArray(audit.records) || audit.status === 'INVALID' ||
      !Array.isArray(audit.structuralErrors) || audit.structuralErrors.length > 0) {
    throw new Error('Authoritative Gallery audit is incomplete, invalid, or bound to a different source commit.');
  }

  const seenIds = new Set();
  const prepared = [];
  const uniqueImages = new Map();
  for (const sourceRecord of audit.records) {
    if (!sourceRecord || typeof sourceRecord.id !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceRecord.id) || seenIds.has(sourceRecord.id)) {
      throw new Error('Gallery audit contains an invalid or duplicate stable record ID.');
    }
    seenIds.add(sourceRecord.id);
    if (!Array.isArray(sourceRecord.blockers) ||
        !SHA256_PATTERN.test(sourceRecord.imageSha256 || '') ||
        !GIT_BLOB_PATTERN.test(sourceRecord.imageGitBlobSha || '') ||
        !Number.isSafeInteger(sourceRecord.imageBytes) || sourceRecord.imageBytes < 1 ||
        sourceRecord.imageDecodeComplete !== true ||
        !Number.isInteger(sourceRecord.imageWidth) || sourceRecord.imageWidth < 1 ||
        !Number.isInteger(sourceRecord.imageHeight) || sourceRecord.imageHeight < 1) {
      throw new Error('Gallery record ' + sourceRecord.id + ' lacks verified image identity/decode evidence.');
    }

    const sourceImage = regularFile(sourceRoot, sourceRecord.imagePath, 'Gallery image ' + sourceRecord.id);
    if (sourceRecord.imagePath.split('/')[0] !== 'img' ||
        !IMAGE_EXTENSIONS.has(path.extname(sourceImage).toLowerCase())) {
      throw new Error('Gallery image ' + sourceRecord.id + ' is outside the allowed img/ asset taxonomy.');
    }
    const imageBytes = fs.readFileSync(sourceImage);
    if (imageBytes.length !== sourceRecord.imageBytes ||
        sha256(imageBytes) !== sourceRecord.imageSha256.toLowerCase() ||
        gitBlobSha(imageBytes) !== sourceRecord.imageGitBlobSha.toLowerCase()) {
      throw new Error('Gallery image byte/SHA identity changed after the read-only audit: ' + sourceRecord.id);
    }

    const recordPath = 'content/gallery/' + sourceRecord.id + '.json';
    const sourceRecordPath = regularFile(sourceRoot, recordPath, 'Gallery source record ' + sourceRecord.id);
    const sourceRecordBytes = fs.readFileSync(sourceRecordPath);
    const galleryRecord = parseStrictJsonBytes(sourceRecordBytes, 'Gallery source record ' + sourceRecord.id);
    const expectedRecordSignature = sha256(Buffer.from(
      stableStringify(galleryRecord) + '\0' + sourceRecord.imageSha256.toLowerCase(),
      'utf8'
    ));
    if (!galleryRecord || galleryRecord.id !== sourceRecord.id ||
        galleryRecord.category !== sourceRecord.category ||
        galleryRecord.status !== sourceRecord.publicationStatus ||
        (galleryRecord.review_status || 'missing') !== sourceRecord.reviewStatus ||
        !galleryRecord.image || galleryRecord.image.src !== sourceRecord.imagePath ||
        expectedRecordSignature !== String(sourceRecord.signature || '').toLowerCase()) {
      throw new Error('Gallery source record identity/signature changed after the read-only audit: ' + sourceRecord.id);
    }

    const extension = path.extname(sourceImage).toLowerCase();
    const previewImagePath = 'images/' + sourceRecord.imageSha256.toLowerCase() + extension;
    const imageKey = sourceRecord.imageSha256.toLowerCase() + extension;
    if (!uniqueImages.has(imageKey)) {
      uniqueImages.set(imageKey, { path: previewImagePath, bytes: imageBytes });
    }

    const sourceEvidence = galleryRecord.sourceEvidence && typeof galleryRecord.sourceEvidence === 'object'
      ? galleryRecord.sourceEvidence : {};
    const visualReview = galleryRecord.visualReview && typeof galleryRecord.visualReview === 'object'
      ? galleryRecord.visualReview : {};
    const technicalValidation = galleryRecord.technicalValidation &&
      typeof galleryRecord.technicalValidation === 'object' ? galleryRecord.technicalValidation : {};

    prepared.push({
      id: sourceRecord.id,
      category: sourceRecord.category,
      publicationStatus: sourceRecord.publicationStatus,
      reviewStatus: sourceRecord.reviewStatus,
      sourceRecordPath: recordPath,
      sourceRecordSha256: sha256(sourceRecordBytes),
      sourceRecordGitBlobSha: gitBlobSha(sourceRecordBytes),
      sourceImagePath: sourceRecord.imagePath,
      previewImagePath,
      imageBytes: imageBytes.length,
      imageSha256: sourceRecord.imageSha256.toLowerCase(),
      imageGitBlobSha: sourceRecord.imageGitBlobSha.toLowerCase(),
      imageWidth: sourceRecord.imageWidth,
      imageHeight: sourceRecord.imageHeight,
      currentAltText: typeof galleryRecord.image.alt === 'string' ? galleryRecord.image.alt : '',
      meaningfulAltText: sourceRecord.meaningfulAltText === true,
      rightsEvidenceComplete: sourceRecord.rightsEvidenceComplete === true,
      visualReviewComplete: sourceRecord.visualReviewComplete === true,
      technicalValidationComplete: sourceRecord.technicalValidationComplete === true,
      blockers: sourceRecord.blockers.slice().sort(),
      existingEvidence: {
        sourceEvidenceStatus: sourceEvidence.status || 'unverified',
        visualReviewStatus: visualReview.status || 'not_assessed',
        technicalValidationStatus: technicalValidation.status || 'pending',
      },
    });
  }

  const outputDirectory = path.resolve(options.outputDirectory);
  const outputParent = fs.realpathSync(path.dirname(outputDirectory));
  const resolvedOutput = path.join(outputParent, path.basename(outputDirectory));
  const repositoryRoot = fs.realpathSync(ROOT);
  if (isWithin(repositoryRoot, resolvedOutput) || isWithin(sourceRoot, resolvedOutput)) {
    throw new Error('Gallery review bundle output must remain outside both repositories.');
  }
  if (fs.existsSync(outputDirectory)) {
    const existing = fs.lstatSync(outputDirectory);
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error('Gallery review bundle output must not replace a symlink or non-directory.');
    }
    throw new Error('Gallery review bundle output directory already exists.');
  }

  const generatedAt = options.generatedAt || new Date().toISOString();
  if (typeof generatedAt !== 'string' || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Gallery review bundle generation timestamp is invalid.');
  }
  const summary = {
    recordCount: prepared.length,
    uniqueImageCount: uniqueImages.size,
    missingRightsEvidenceCount: prepared.filter(record => !record.rightsEvidenceComplete).length,
    missingVisualReviewCount: prepared.filter(record => !record.visualReviewComplete).length,
    missingTechnicalValidationCount: prepared.filter(record => !record.technicalValidationComplete).length,
    missingDescriptiveAltCount: prepared.filter(record => !record.meaningfulAltText).length,
    approvalEligibleCount: 0,
  };
  const manifest = {
    schemaVersion: 1,
    artifactType: 'authoritative-gallery-owner-review-bundle',
    generatedAt,
    sourceRepository: SOURCE_REPOSITORY,
    sourceBranch: 'main',
    sourceCommit,
    sourceAuditSha256: sha256(auditBytes),
    reviewOnly: true,
    approvalStatus: 'not-approved',
    publicationEligible: false,
    summary,
    policy: {
      sourceRecordsChanged: false,
      mediaApproved: false,
      rightsInferred: false,
      visualRelevanceInferred: false,
      automaticImportPerformed: false,
      approvalAuthorized: false,
      publicationAuthorized: false,
      signatureCreated: false,
    },
    records: prepared,
  };
  const decisions = {
    schemaVersion: 1,
    artifactType: 'authoritative-gallery-owner-review-worksheet',
    sourceRepository: SOURCE_REPOSITORY,
    sourceBranch: 'main',
    sourceCommit,
    sourceAuditSha256: manifest.sourceAuditSha256,
    reviewOnly: true,
    approvalStatus: 'not-approved',
    publicationEligible: false,
    policy: {
      autoApplied: false,
      sourceRecordsChanged: false,
      rightsInferred: false,
      visualRelevanceInferred: false,
      approvalAuthorized: false,
      publicationAuthorized: false,
    },
    decisions: prepared.map(record => ({
      galleryId: record.id,
      sourceRecordSha256: record.sourceRecordSha256,
      imageSha256: record.imageSha256,
      ownerDecision: 'pending',
      sourceEvidence: {
        status: 'unverified',
        creator: '',
        sourceUrl: '',
        licenseName: '',
        evidenceReference: '',
        verifiedBy: '',
        verifiedAt: '',
      },
      visualReview: { status: 'not_assessed', evidence: '', reviewer: '', reviewedAt: '' },
      technicalValidation: { status: 'pending', evidenceReference: '' },
      altText: record.currentAltText,
      altTextReview: { status: 'pending', reviewer: '', reviewedAt: '' },
      notes: '',
    })),
  };

  fs.mkdirSync(outputDirectory, { recursive: false });
  const imageDirectory = path.join(outputDirectory, 'images');
  fs.mkdirSync(imageDirectory);
  for (const item of uniqueImages.values()) {
    fs.writeFileSync(path.join(outputDirectory, item.path), item.bytes, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDirectory, 'review.csv'), [
    ['gallery_id', 'category', 'publication_status', 'review_status', 'source_image', 'current_alt_text', 'blockers'].join(','),
    ...prepared.map(record => [
      record.id, record.category, record.publicationStatus, record.reviewStatus,
      record.sourceImagePath, record.currentAltText, record.blockers.join('; '),
    ].map(csvCell).join(',')),
  ].join('\n') + '\n');

  const cards = prepared.map(record => [
    '<article class="record">',
    '<div class="image"><img src="' + escapeHtml(record.previewImagePath) + '" alt="' + escapeHtml(record.currentAltText) + '" loading="lazy"></div>',
    '<div class="body"><p class="eyebrow">' + escapeHtml(record.category) + ' · ' + escapeHtml(record.id) + '</p>',
    '<h2>' + escapeHtml(record.id) + '</h2>',
    '<p class="alt">' + escapeHtml(record.currentAltText || 'No descriptive alt text recorded') + '</p>',
    '<p class="states">Rights: ' + escapeHtml(record.existingEvidence.sourceEvidenceStatus) +
      ' · Visual: ' + escapeHtml(record.existingEvidence.visualReviewStatus) +
      ' · Technical: ' + escapeHtml(record.existingEvidence.technicalValidationStatus) + '</p>',
    '<p class="blockers">' + escapeHtml(record.blockers.join(' · ')) + '</p>',
    '</div></article>',
  ].join('')).join('\n');
  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`,
    '<meta name="referrer" content="no-referrer"><title>Authoritative Gallery — Local Owner Review</title>',
    '<style>',
    ':root{color-scheme:light;--ink:#2b211b;--muted:#6d625a;--sand:#eee5d8;--paper:#fbf8f3;--line:#ded2c4}',
    '*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif}',
    'header{padding:32px max(20px,calc((100vw - 1200px)/2));background:#342820;color:#fff}',
    'header p{max-width:900px;color:#e8ddd1}main{max-width:1200px;margin:28px auto;padding:0 20px}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}',
    '.record{overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#fff}',
    '.image{aspect-ratio:16/10;background:var(--sand)}.image img{width:100%;height:100%;object-fit:contain}',
    '.body{padding:16px}.eyebrow,.states{color:var(--muted);font-size:13px}.eyebrow{text-transform:uppercase;letter-spacing:.08em}',
    'h2{margin:4px 0 8px;font-size:20px}.alt{min-height:48px}.blockers{font-size:12px;color:#794d31;overflow-wrap:anywhere}',
    'footer{padding:24px 20px;text-align:center;color:var(--muted)}',
    '</style></head><body>',
    '<header><h1>Gallery media — owner review</h1>',
    '<p>This is a local, read-only review copy from source main at ' + escapeHtml(sourceCommit) + '. Inspect each exact image and complete the decision template only with evidence supplied by the owner/editor. A source record marked live, an existing file, or a technical image match is not rights approval.</p>',
    '<p>Records: ' + summary.recordCount + ' · Unique images: ' + summary.uniqueImageCount +
      ' · Missing rights: ' + summary.missingRightsEvidenceCount +
      ' · Missing visual review: ' + summary.missingVisualReviewCount +
      ' · Approval eligible: 0</p></header>',
    '<main><section class="grid">', cards, '</section></main>',
    '<footer>Review-only bundle · No CMS records changed · No media approved · No publication or import performed</footer>',
    '</body></html>',
  ].join('\n');
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), html);
  fs.writeFileSync(path.join(outputDirectory, 'README.md'), [
    '# Authoritative Gallery owner-review bundle',
    '',
    'This bundle is a local review copy of the exact source-main Gallery records and image bytes.',
    '',
    '- Source commit: ' + sourceCommit,
    '- Records: ' + summary.recordCount,
    '- Unique images: ' + summary.uniqueImageCount,
    '- Review template: gallery-decisions.template.json',
    '- CSV inventory: review.csv',
    '- Bundle integrity: bundle-integrity.json (SHA-256 inventory; worksheet binds to its digest)',
    '',
    'Inspect the images and records, then collect creator, source, rights basis, visual-match, alt-text, and technical evidence from the owner/editor. Do not infer permission from the filename, a live CMS flag, a migration manifest, or successful image decoding.',
    '',
    'The template is not an approval certificate. Do not upload it directly to the CMS or change publication state from this bundle. An independent authorized review and the source PHP signed-approval workflow remain required.',
    '',
    'Policy: source records unchanged; media not approved; rights not inferred; no import; no publication.',
  ].join('\n') + '\n');

  const integrity = writeBundleIntegrityManifest(outputDirectory, ['gallery-decisions.template.json']);
  decisions.bundleIntegritySha256 = integrity.sha256;
  fs.writeFileSync(path.join(outputDirectory, 'gallery-decisions.template.json'),
    JSON.stringify(decisions, null, 2) + '\n', { flag: 'wx' });

  return { outputDirectory, manifest, decisions, summary };
}

function parseArguments(argv) {
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
    const args = parseArguments(process.argv);
    const report = buildGalleryReviewBundle({
      sourceRoot: args['source-root'],
      sourceCommit: args['source-commit'],
      auditPath: args.audit,
      outputDirectory: args.output,
    });
    console.log('PASS: local-only Gallery owner-review bundle created.');
    console.log('Source: ' + report.manifest.sourceCommit + ' | records: ' +
      report.summary.recordCount + ' | images: ' + report.summary.uniqueImageCount);
    console.log('Rights missing: ' + report.summary.missingRightsEvidenceCount +
      ' | visual review missing: ' + report.summary.missingVisualReviewCount +
      ' | approval eligible: 0 | source records changed: no.');
  } catch (error) {
    console.error('FAIL: Gallery owner-review bundle generation stopped safely: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildGalleryReviewBundle, csvCell };
