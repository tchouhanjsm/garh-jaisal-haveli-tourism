#!/usr/bin/env node
'use strict';

/** Verify the curated legacy-media manifest and the local bytes used by gallery.html. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'MEDIA-MIGRATION-MANIFEST.json'), 'utf8'));
const pageCache = new Map();
function pageContent(name) {
  assert.match(name, /^(index|rooms|experiences|dining|about|directions|gallery)\.html$/, 'Unapproved verification page: ' + name);
  if (!pageCache.has(name)) pageCache.set(name, fs.readFileSync(path.join(ROOT, name), 'utf8'));
  return pageCache.get(name);
}
const sources = new Set();
const targets = new Set();
const MAX_BYTES = 600 * 1024;

function safePath(relative) {
  const full = path.resolve(ROOT, relative);
  assert.ok(full.startsWith(ROOT + path.sep), 'Manifest path escapes repo root: ' + relative);
  return full;
}
function getDimensions(buffer, filePath) {
  if (buffer.length >= 30 && buffer.toString('ascii', 8, 12) === 'WEBP'
      && buffer.toString('ascii', 12, 16) === 'VP8X') {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const size = buffer.readUInt16BE(offset);
      if (size < 2 || offset + size > buffer.length) break;
      if (sof.has(marker)) return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
      offset += size;
    }
  }
  throw new Error('Unsupported image format or unreadable geometry: ' + filePath);
}

assert.equal(manifest.schemaVersion, 1, 'Unsupported media-manifest schema');
assert.equal(manifest.sourceRepository, 'https://github.com/tchouhanjsm/garh-jaisal-website');
assert.ok(Array.isArray(manifest.entries) && manifest.entries.length >= 3, 'At least three inspected source assets are required');

for (const entry of manifest.entries) {
  assert.ok(entry.sourcePath && entry.sourceBlobSha && entry.targetPath && entry.targetBlobSha, 'Manifest entries require source and target blob provenance');
  assert.equal(entry.targetBlobSha, entry.sourceBlobSha, 'Curated image must match its source blob SHA: ' + entry.targetPath);
  assert.ok(entry.verificationPage, 'Each asset needs a page-specific image/alt verification target: ' + entry.targetPath);
  assert.ok(entry.visualSubject && entry.intendedRole, 'Manifest entries require a reviewed subject and intended role');
  assert.ok(entry.altText && entry.altText.length >= 25, 'Alt text is too short: ' + entry.targetPath);
  assert.ok(['migrated-source-backed-asset', 'source-verified-existing-asset'].includes(entry.approvalStatus),
    'Only migrated or byte-verified source assets may be listed: ' + entry.targetPath);
  assert.ok(/does not promise/i.test(entry.publicationCaveat || ''), 'Each asset must preserve the no-availability-promise caveat');
  assert.ok(!sources.has(entry.sourcePath), 'Duplicate source path: ' + entry.sourcePath);
  assert.ok(!targets.has(entry.targetPath), 'Duplicate target path: ' + entry.targetPath);
  sources.add(entry.sourcePath);
  targets.add(entry.targetPath);

  const filePath = safePath(entry.targetPath);
  assert.ok(fs.existsSync(filePath) && fs.statSync(filePath).isFile(), 'Missing local asset: ' + entry.targetPath);
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.length, entry.bytes, 'Byte count differs from manifest: ' + entry.targetPath);
  const budgetRules = [
    [/Homepage hero — rooftop terrace/i, 150 * 1024],
    [/Room gallery — named room image/i, 550 * 1024],
    [/Room gallery — WebP alternate/i, 300 * 1024],
    [/Room hero — optimized sitting-room WebP/i, 320 * 1024],
    [/Room hero — JPEG fallback/i, 550 * 1024],
    [/Dining page — candlelit-table/i, 100 * 1024],
    [/Gallery: fort\/rooftop orientation — JPEG fallback/i, 750 * 1024],
    [/Gallery: fort\/rooftop orientation/i, 400 * 1024],
  ];
  const matchedBudget = budgetRules.find(([role]) => role.test(entry.intendedRole));
  const budget = matchedBudget ? matchedBudget[1] : MAX_BYTES;
  const isNamedRoom = /Room gallery — named room image/i.test(entry.intendedRole);
  assert.ok(buffer.length > 0 && buffer.length <= budget,
    'Asset exceeds ' + Math.round(budget / 1024) + ' KiB budget: ' + entry.targetPath);
  assert.deepEqual(getDimensions(buffer, entry.targetPath), entry.dimensions, 'Dimensions differ from manifest: ' + entry.targetPath);
  const localBlobSha = crypto.createHash('sha1')
    .update(Buffer.from('blob ' + buffer.length + '\0'))
    .update(buffer)
    .digest('hex');
  assert.equal(localBlobSha, entry.targetBlobSha, 'Local file Git blob SHA differs from manifest: ' + entry.targetPath);
  const pageNames = [...new Set([entry.verificationPage, ...(entry.additionalVerificationPages || [])])];
  for (const pageName of pageNames) {
    const page = pageContent(pageName);
    assert.ok(page.includes('src="' + entry.targetPath + '"') || page.includes('srcset="' + entry.targetPath + '"'),
      pageName + ' missing asset reference: ' + entry.targetPath);
    assert.ok(page.includes('alt="' + entry.altText + '"'),
      pageName + ' alt text differs from manifest: ' + entry.targetPath);
  }

  if (entry.targetPath.includes('/hotel/')) assert.match(entry.visualSubject, /fort|rooftop/i, 'Fort/rooftop subject-role mismatch');
  else if (entry.targetPath.includes('/desert/')) assert.match(entry.visualSubject, /desert camp/i, 'Desert subject-role mismatch');
  else if (entry.targetPath.includes('/experiences/')) assert.match(entry.visualSubject, /tent|desert|camel|heritage/i, 'Experience media subject-role mismatch');
  else if (/Room hero/i.test(entry.intendedRole)) {
    assert.match(entry.visualSubject, /sitting (room|area)|interior/i, 'Room-hero interior subject-role mismatch');
  } else if (/room/i.test(entry.intendedRole)) {
    assert.match(entry.visualSubject, /room/i, 'Room media subject-role mismatch');
  }
  else if (/Homepage hero — rooftop terrace/i.test(entry.intendedRole)) assert.match(entry.visualSubject, /rooftop|terrace/i, 'Homepage hero subject-role mismatch');
  else if (/Dining page — candlelit-table/i.test(entry.intendedRole)) assert.match(entry.visualSubject, /candlelit|table/i, 'Dining image subject-role mismatch');
  else assert.fail('Media target is outside the curated image taxonomy: ' + entry.targetPath);
}


const { auditAuthoritativeGallerySource, decodeGalleryImages } = require('./audit-authoritative-gallery-source');

function galleryField(name, spec, indentation = 6) {
  const spaces = ' '.repeat(indentation);
  const lines = [
    spaces + '- name: ' + name,
    spaces + '  widget: ' + spec.widget,
    spaces + '  required: ' + (spec.required ? 'true' : 'false'),
  ];
  if (spec.defaultValue !== undefined) lines.push(spaces + '  default: ' + spec.defaultValue);
  if (spec.options && spec.options.length) {
    lines.push(spaces + '  options:');
    for (const option of spec.options) {
      lines.push(spaces + '    - label: ' + option, spaces + '      value: ' + option);
    }
  }
  if (spec.patterns && spec.patterns.length) {
    lines.push(spaces + '  pattern:');
    for (const pattern of spec.patterns) lines.push(spaces + '    - ' + pattern);
  }
  if (spec.children && spec.children.length) {
    lines.push(spaces + '  fields:');
    for (const child of spec.children) lines.push(galleryField(child.name, child.spec, indentation + 4));
  }
  return lines.join('\n');
}

function makeGalleryFixture(root, options, record) {
  const schemaOptions = options || {};
  const safeDefaults = schemaOptions.safeDefaults !== false;
  const fields = [
    {
      name: 'status',
      spec: {
        widget: 'select',
        required: true,
        defaultValue: safeDefaults ? 'draft' : 'live',
        options: ['draft', 'live', 'hidden'],
      },
    },
    {
      name: 'review_status',
      spec: {
        widget: 'select',
        required: true,
        defaultValue: safeDefaults ? 'draft' : 'approved',
        options: ['draft', 'review_required', 'approved', 'rejected'],
      },
    },
  ];

  if (schemaOptions.includeEvidence !== false) {
    fields.push(
      {
        name: 'sourceEvidence',
        spec: {
          widget: 'object',
          required: true,
          children: [
            {
              name: 'status',
              spec: {
                widget: 'select',
                required: true,
                defaultValue: safeDefaults ? 'unverified' : 'owner-confirmed',
                options: ['unverified', 'owner-confirmed', 'licensed'],
              },
            },
            { name: 'creator', spec: { widget: 'string', required: false } },
            {
              name: 'sourceUrl',
              spec: { widget: 'string', required: false, patterns: ["'^https://'"] },
            },
            { name: 'licenseName', spec: { widget: 'string', required: false } },
            { name: 'evidenceReference', spec: { widget: 'string', required: false } },
            { name: 'verifiedBy', spec: { widget: 'string', required: false } },
            { name: 'verifiedAt', spec: { widget: 'string', required: false } },
          ],
        },
      },
      {
        name: 'visualReview',
        spec: {
          widget: 'object',
          required: true,
          children: [
            {
              name: 'status',
              spec: {
                widget: 'select',
                required: true,
                defaultValue: safeDefaults ? 'not_assessed' : 'matched',
                options: ['not_assessed', 'matched', 'mismatch'],
              },
            },
            { name: 'evidence', spec: { widget: 'text', required: false } },
            { name: 'reviewer', spec: { widget: 'string', required: false } },
            { name: 'reviewedAt', spec: { widget: 'string', required: false } },
          ],
        },
      },
      {
        name: 'technicalValidation',
        spec: {
          widget: 'object',
          required: true,
          children: [
            {
              name: 'status',
              spec: {
                widget: 'select',
                required: true,
                defaultValue: safeDefaults ? 'pending' : 'verified',
                options: ['pending', 'verified', 'failed'],
              },
            },
            { name: 'evidenceReference', spec: { widget: 'string', required: false } },
          ],
        },
      }
    );
  }

  const configFields = fields.slice();
  if (schemaOptions.duplicateReviewStatus) {
    const index = configFields.findIndex(field => field.name === 'review_status');
    const duplicate = JSON.parse(JSON.stringify(configFields[index]));
    duplicate.spec.defaultValue = 'approved';
    configFields.splice(index, 0, duplicate);
  }
  if (schemaOptions.duplicateEvidenceStatus) {
    const evidence = configFields.find(field => field.name === 'sourceEvidence');
    const index = evidence.spec.children.findIndex(field => field.name === 'status');
    const duplicate = JSON.parse(JSON.stringify(evidence.spec.children[index]));
    duplicate.spec.defaultValue = 'owner-confirmed';
    evidence.spec.children.splice(index, 0, duplicate);
  }

  fs.mkdirSync(path.join(root, 'admin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content', 'gallery'), { recursive: true });
  fs.mkdirSync(path.join(root, 'img', 'gallery'), { recursive: true });
  const config = [
    'collections:',
    '  - name: gallery',
    '    folder: ' + (schemaOptions.collectionFolder || '/content/gallery'),
    '    format: ' + (schemaOptions.collectionFormat || 'json'),
    '    create: true',
    '    delete: false',
    '    identifier_field: id',
    '    fields:',
    ...configFields.map(field => galleryField(field.name, field.spec)),
    '  - name: page_media_slots',
    '    fields:',
    '      - name: id',
    '        widget: string',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(root, 'admin', 'config.yml'), config, 'utf8');
  fs.writeFileSync(
    path.join(root, 'img', 'gallery', 'fixture.png'),
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  );
  fs.writeFileSync(path.join(root, 'content', 'gallery', record.id + '.json'), JSON.stringify(record, null, 2));
}


function injectDuplicateYamlProperty(root, blockMarker, existingLine, duplicateLine) {
  const configPath = path.join(root, 'admin', 'config.yml');
  const config = fs.readFileSync(configPath, 'utf8');
  const blockIndex = config.indexOf(blockMarker);
  assert.notEqual(blockIndex, -1, 'Expected YAML block marker: ' + blockMarker);
  const propertyIndex = config.indexOf(existingLine, blockIndex);
  assert.notEqual(propertyIndex, -1, 'Expected YAML property line: ' + existingLine);
  const nextCollection = config.indexOf('\n  - name:', blockIndex + blockMarker.length);
  assert.ok(nextCollection === -1 || propertyIndex < nextCollection,
    'Expected property to belong to the selected YAML block');
  const insertionPoint = propertyIndex + existingLine.length;
  const updated = config.slice(0, insertionPoint) + '\n' + duplicateLine + config.slice(insertionPoint);
  fs.writeFileSync(configPath, updated, 'utf8');
}
function moveGalleryCollectionOutsideRootCollections(root, rootKey = 'extension:') {
  const configPath = path.join(root, 'admin', 'config.yml');
  const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
  const galleryIndex = lines.indexOf('  - name: gallery');
  const nextCollectionIndex = lines.findIndex((line, index) =>
    index > galleryIndex && line === '  - name: page_media_slots'
  );
  assert.notEqual(galleryIndex, -1, 'Expected the real Gallery collection');
  assert.notEqual(nextCollectionIndex, -1, 'Expected the following page-media collection');

  const decoyGallery = lines.slice(galleryIndex, nextCollectionIndex);
  const unrelatedCollection = [
    '  - name: unrelated',
    '    folder: /content/unrelated',
    '    format: json',
    '    create: true',
    '    delete: false',
    '    identifier_field: id',
    '    fields:',
    '      - name: id',
    '        widget: string',
  ];
  lines.splice(galleryIndex, nextCollectionIndex - galleryIndex, ...unrelatedCollection);
  // This is valid YAML but is not a child of the root "collections" key.
  lines.push(rootKey, ...decoyGallery);
  fs.writeFileSync(configPath, lines.join('\n'), 'utf8');
}


function appendRootCollectionsDeclaration(root, declaration) {
  const configPath = path.join(root, 'admin', 'config.yml');
  fs.appendFileSync(configPath, '\n' + declaration + '\n', 'utf8');
}

const sourceAuditDirectory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'garh-source-gallery-audit-'));
try {
  const pinnedRoot = path.join(sourceAuditDirectory, 'pinned');
  const currentRoot = path.join(sourceAuditDirectory, 'current');
  const manifestPath = path.join(sourceAuditDirectory, 'manifest.json');
  fs.mkdirSync(pinnedRoot, { recursive: true });
  const pinnedCommit = 'a'.repeat(40);
  const currentCommit = 'b'.repeat(40);
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    sourceRepository: 'https://github.com/tchouhanjsm/garh-jaisal-website',
    sourceBranch: 'main',
    sourceCommit: pinnedCommit,
    entries: [],
  }));

  const unreviewedRecord = {
    id: 'hotel-01-facade',
    category: 'hotel',
    status: 'live',
    order: 1,
    image: {
      src: 'img/gallery/fixture.png',
      alt: 'Carved sandstone facade inside the historic Jaisalmer Fort',
      crop: 'landscape',
    },
  };
  makeGalleryFixture(currentRoot, { includeEvidence: false }, unreviewedRecord);
  const decodedFixtureImages = decodeGalleryImages(currentRoot, [{ imagePath: unreviewedRecord.image.src }]);
  assert.equal(decodedFixtureImages.get(unreviewedRecord.image.src).status, 'verified');
  assert.equal(decodedFixtureImages.get(unreviewedRecord.image.src).width, 1);
  assert.equal(decodedFixtureImages.get(unreviewedRecord.image.src).height, 1);
  function auditFixture(options) {
    return auditAuthoritativeGallerySource({ ...options, decodedImages: decodedFixtureImages });
  }
  const unreviewed = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unreviewed.status, 'REVIEW_REQUIRED');
  assert.equal(unreviewed.sourcePinDrift, true);
  assert.equal(unreviewed.sourceDiff.addedCount, 1);
  assert.equal(unreviewed.summary.liveRecords, 1);
  assert.equal(unreviewed.summary.missingReviewStatusCount, 1);
  assert.equal(unreviewed.summary.missingRightsEvidenceCount, 1);
  assert.equal(unreviewed.summary.approvalEligibleCount, 0);
  assert.equal(unreviewed.controls.automaticImportPerformed, false);
  assert.equal(unreviewed.controls.approvalAuthorized, false);

  const reviewedRecord = {
    ...unreviewedRecord,
    review_status: 'approved',
    sourceEvidence: {
      status: 'owner-confirmed',
      creator: 'Garh Jaisal Haveli owner',
      evidenceReference: 'owner-rights-record-2026-11-02',
      verifiedBy: 'Hotel owner',
      verifiedAt: '2026-11-02',
    },
    visualReview: {
      status: 'matched',
      evidence: 'Reviewed against the original source image and intended gallery subject',
      reviewer: 'Editorial reviewer',
      reviewedAt: '2026-11-02',
    },
    technicalValidation: {
      status: 'verified',
      evidenceReference: 'image-integrity-report-2026-11-02',
    },
  };
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const complete = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(complete.status, 'EVIDENCE_COMPLETE_AWAITING_HUMAN_REVIEW');
  assert.equal(complete.summary.approvalEligibleCount, 1);
  assert.equal(complete.controls.approvalAuthorized, false);
  assert.equal(complete.controls.automaticImportPerformed, false);
  assert.equal(complete.cmsSchema.safeDefaults, true);
  assert.equal(complete.cmsSchema.supportsRequiredEvidence, true);
  assert.deepEqual(complete.cmsSchema.defaultViolations, []);
  assert.equal(complete.records[0].imageDecodeComplete, true);
  assert.equal(complete.records[0].imageWidth, 1);
  assert.equal(complete.records[0].imageHeight, 1);

  // A Gallery-shaped list under another root key must not satisfy the CMS contract.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  moveGalleryCollectionOutsideRootCollections(currentRoot);
  const outOfScopeGallery = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(outOfScopeGallery.status, 'REVIEW_REQUIRED');
  assert.equal(outOfScopeGallery.cmsSchema.available, false);
  assert.equal(outOfScopeGallery.cmsSchema.collectionValid, false);
  assert.equal(outOfScopeGallery.cmsSchema.supportsRequiredEvidence, false);
  assert.equal(outOfScopeGallery.summary.approvalEligibleCount, 0);
  assert.ok(outOfScopeGallery.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // Root-level YAML keys can contain spaces before the colon or be quoted.
  // None may allow a Gallery-shaped extension block to masquerade as a collection.
  for (const rootKey of ['extension :', "'extension':", '"extension":']) {
    makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
    moveGalleryCollectionOutsideRootCollections(currentRoot, rootKey);
    const rootKeyGallery = auditFixture({
      pinnedSourceRoot: pinnedRoot,
      pinnedSourceCommit: pinnedCommit,
      currentSourceRoot: currentRoot,
      currentSourceCommit: currentCommit,
      manifestPath,
    });
    assert.equal(rootKeyGallery.status, 'REVIEW_REQUIRED');
    assert.equal(rootKeyGallery.cmsSchema.available, false);
    assert.equal(rootKeyGallery.cmsSchema.collectionValid, false);
    assert.equal(rootKeyGallery.summary.approvalEligibleCount, 0);
    assert.ok(rootKeyGallery.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));
  }

  // Quoted YAML keys are equivalent to the unquoted collections key.
  // A later quoted duplicate must be counted before trusting the first section.
  for (const declaration of ["'collections': []", '"collections": []']) {
    makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
    appendRootCollectionsDeclaration(currentRoot, declaration);
    const duplicateQuotedCollections = auditFixture({
      pinnedSourceRoot: pinnedRoot,
      pinnedSourceCommit: pinnedCommit,
      currentSourceRoot: currentRoot,
      currentSourceCommit: currentCommit,
      manifestPath,
    });
    assert.equal(duplicateQuotedCollections.status, 'REVIEW_REQUIRED');
    assert.equal(duplicateQuotedCollections.cmsSchema.available, false);
    assert.equal(duplicateQuotedCollections.cmsSchema.collectionValid, false);
    assert.equal(duplicateQuotedCollections.summary.approvalEligibleCount, 0);
    assert.ok(duplicateQuotedCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));
  }

  // A later root-level collections key can shadow the valid collection in YAML.
  // The audit must count declarations rather than silently trusting the first.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'collections: []');
  const duplicateRootCollections = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateRootCollections.status, 'REVIEW_REQUIRED');
  assert.equal(duplicateRootCollections.cmsSchema.available, false);
  assert.equal(duplicateRootCollections.cmsSchema.collectionValid, false);
  assert.equal(duplicateRootCollections.summary.approvalEligibleCount, 0);
  assert.ok(duplicateRootCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // Inline comments do not make a duplicate root-level declaration invisible.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'collections: # duplicate declaration');
  const duplicateCommentedRootCollections = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateCommentedRootCollections.status, 'REVIEW_REQUIRED');
  assert.equal(duplicateCommentedRootCollections.cmsSchema.available, false);
  assert.equal(duplicateCommentedRootCollections.summary.approvalEligibleCount, 0);
  assert.ok(duplicateCommentedRootCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // YAML treats whitespace before the mapping colon as the same root key.
  // A spaced duplicate must not bypass the duplicate-declaration guard.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'collections : []');
  const duplicateSpacedRootCollections = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateSpacedRootCollections.status, 'REVIEW_REQUIRED');
  assert.equal(duplicateSpacedRootCollections.cmsSchema.available, false);
  assert.equal(duplicateSpacedRootCollections.summary.approvalEligibleCount, 0);
  assert.ok(duplicateSpacedRootCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // Quoted escape sequences are normalized by YAML before duplicate-key checks.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, '"\\u0063ollections": []');
  const escapedDuplicateCollectionKey = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(escapedDuplicateCollectionKey.status, 'REVIEW_REQUIRED');
  assert.equal(escapedDuplicateCollectionKey.cmsSchema.available, false);
  assert.ok(escapedDuplicateCollectionKey.cmsSchema.duplicatePropertyPaths.some(
    pathName => pathName.endsWith('.collections')
  ));
  assert.equal(escapedDuplicateCollectionKey.summary.approvalEligibleCount, 0);

  // Explicit YAML mapping keys are valid YAML but unsupported by the CMS contract;
  // the audit must not reinterpret them as an ordinary root section.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, '? extension\n: []');
  const explicitMappingKey = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(explicitMappingKey.status, 'REVIEW_REQUIRED');
  assert.equal(explicitMappingKey.cmsSchema.available, false);
  assert.ok(explicitMappingKey.cmsSchema.schemaViolations.some(
    item => item.includes('explicit YAML mapping keys are unsupported')
  ));
  assert.equal(explicitMappingKey.summary.approvalEligibleCount, 0);

  // Anchors and aliases can make a text-local field appear different from the
  // effective CMS configuration. They are rejected rather than expanded.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot,
    'extension: &shared\n  enabled: true\nother_extension: *shared');
  const yamlAlias = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(yamlAlias.status, 'REVIEW_REQUIRED');
  assert.equal(yamlAlias.cmsSchema.available, false);
  assert.ok(yamlAlias.cmsSchema.schemaViolations.some(
    item => item.includes('YAML anchors are unsupported') || item.includes('YAML aliases are unsupported')
  ));
  assert.equal(yamlAlias.summary.approvalEligibleCount, 0);

  // YAML merge keys are not expanded by the audit parser and must fail closed.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'extension:\n  <<: { enabled: true }');
  const yamlMergeKey = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(yamlMergeKey.status, 'REVIEW_REQUIRED');
  assert.equal(yamlMergeKey.cmsSchema.available, false);
  assert.ok(yamlMergeKey.cmsSchema.schemaViolations.some(
    item => item.includes('YAML merge keys are unsupported')
  ));
  assert.equal(yamlMergeKey.summary.approvalEligibleCount, 0);

  // Duplicate keys are compared after YAML escape decoding, not as raw source text.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  injectDuplicateYamlProperty(
    currentRoot,
    '      - name: review_status',
    '        default: draft',
    '        "\\u0064efault": approved'
  );
  const escapedDuplicateProperty = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(escapedDuplicateProperty.status, 'REVIEW_REQUIRED');
  assert.equal(escapedDuplicateProperty.cmsSchema.available, false);
  assert.ok(escapedDuplicateProperty.cmsSchema.duplicatePropertyPaths.some(
    pathName => pathName.endsWith('.default')
  ));
  assert.ok(escapedDuplicateProperty.records[0].blockers.includes('cms-schema-contains-duplicate-properties'));
  assert.equal(escapedDuplicateProperty.summary.approvalEligibleCount, 0);

  // A mapping where the CMS contract requires a sequence must not be treated as
  // a valid collection field list.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const collectionConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  const originalCollectionConfig = fs.readFileSync(collectionConfigPath, 'utf8');
  const malformedCollectionFieldsConfig = originalCollectionConfig.replace(
    '    fields:\n      - name: status',
    '    fields:\n      status: { widget: select }'
  );
  assert.notEqual(malformedCollectionFieldsConfig, originalCollectionConfig);
  fs.writeFileSync(collectionConfigPath, malformedCollectionFieldsConfig, 'utf8');
  const malformedCollectionFields = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(malformedCollectionFields.status, 'REVIEW_REQUIRED');
  assert.equal(malformedCollectionFields.cmsSchema.collectionValid, false);
  assert.equal(malformedCollectionFields.summary.approvalEligibleCount, 0);
  assert.ok(malformedCollectionFields.records[0].blockers.includes('cms-gallery-collection-contract-invalid'));

  // Nested object fields also have to be sequences of named field mappings.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const nestedConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  const originalNestedConfig = fs.readFileSync(nestedConfigPath, 'utf8');
  const malformedNestedFieldsConfig = originalNestedConfig.replace(
    '        fields:\n          - name: status',
    '        fields:\n          status: { widget: select }'
  );
  assert.notEqual(malformedNestedFieldsConfig, originalNestedConfig);
  fs.writeFileSync(nestedConfigPath, malformedNestedFieldsConfig, 'utf8');
  const malformedNestedFields = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(malformedNestedFields.status, 'REVIEW_REQUIRED');
  assert.equal(malformedNestedFields.cmsSchema.available, true);
  assert.equal(malformedNestedFields.cmsSchema.collectionValid, true);
  assert.equal(malformedNestedFields.cmsSchema.safeDefaults, false);
  assert.ok(malformedNestedFields.cmsSchema.schemaViolations.some(
    item => item.includes('gallery.sourceEvidence.fields must be a YAML sequence')
  ));
  assert.equal(malformedNestedFields.summary.approvalEligibleCount, 0);

  const mismatchedImageHash = auditAuthoritativeGallerySource({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
    decodedImages: new Map([[unreviewedRecord.image.src, {
      path: unreviewedRecord.image.src,
      status: 'verified',
      width: 1,
      height: 1,
      sha256: 'f'.repeat(64),
    }]]),
  });
  assert.equal(mismatchedImageHash.status, 'REVIEW_REQUIRED');
  assert.equal(mismatchedImageHash.summary.approvalEligibleCount, 0);
  assert.equal(mismatchedImageHash.records[0].imageDecodeComplete, false);
  assert.ok(mismatchedImageHash.records[0].blockers.includes('gallery-image-decode-validation-failed'));

  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: false }, reviewedRecord);
  const unsafeSchema = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unsafeSchema.status, 'REVIEW_REQUIRED');
  assert.equal(unsafeSchema.cmsSchema.safeDefaults, false);
  assert.equal(unsafeSchema.summary.approvalEligibleCount, 0);
  assert.ok(unsafeSchema.cmsSchema.defaultViolations.some(item => item.includes('review_status must default to draft')));
  assert.ok(unsafeSchema.records[0].blockers.includes('cms-schema-does-not-enforce-fail-closed-defaults'));

  // Duplicate field declarations must fail closed even when the last declaration is safe.
  makeGalleryFixture(currentRoot, {
    includeEvidence: true,
    safeDefaults: true,
    duplicateReviewStatus: true,
    duplicateEvidenceStatus: true,
  }, reviewedRecord);
  const duplicateSchema = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateSchema.status, 'REVIEW_REQUIRED');
  assert.equal(duplicateSchema.cmsSchema.collectionValid, true);
  assert.equal(duplicateSchema.cmsSchema.safeDefaults, false);
  assert.ok(duplicateSchema.cmsSchema.duplicateFieldPaths.includes('review_status'));
  assert.ok(duplicateSchema.cmsSchema.duplicateFieldPaths.includes('sourceEvidence.status'));
  assert.equal(duplicateSchema.summary.approvalEligibleCount, 0);
  assert.ok(duplicateSchema.records[0].blockers.includes('cms-schema-contains-duplicate-fields'));

  // The audit must bind evidence fields to the real JSON gallery collection, not a lookalike.
  makeGalleryFixture(currentRoot, {
    includeEvidence: true,
    safeDefaults: true,
    collectionFolder: '/content/unrelated',
    collectionFormat: 'yaml',
  }, reviewedRecord);
  const wrongCollection = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(wrongCollection.status, 'REVIEW_REQUIRED');
  assert.equal(wrongCollection.cmsSchema.collectionValid, false);
  assert.equal(wrongCollection.cmsSchema.safeDefaults, false);
  assert.ok(wrongCollection.cmsSchema.collectionContractViolations.some(item => item.includes('folder')));
  assert.ok(wrongCollection.cmsSchema.collectionContractViolations.some(item => item.includes('format')));
  assert.equal(wrongCollection.summary.approvalEligibleCount, 0);
  assert.ok(wrongCollection.records[0].blockers.includes('cms-gallery-collection-contract-invalid'));


  // Duplicate scalar YAML properties must fail closed; the CMS parser may use the later value.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  injectDuplicateYamlProperty(
    currentRoot,
    '      - name: review_status',
    '        default: draft',
    '        default: approved'
  );
  const duplicateFieldProperty = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateFieldProperty.status, 'REVIEW_REQUIRED');
  assert.equal(duplicateFieldProperty.cmsSchema.safeDefaults, false);
  assert.ok(duplicateFieldProperty.cmsSchema.duplicatePropertyPaths.includes('review_status.default'));
  assert.ok(duplicateFieldProperty.records[0].blockers.includes('cms-schema-contains-duplicate-properties'));
  assert.equal(duplicateFieldProperty.summary.approvalEligibleCount, 0);

  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  injectDuplicateYamlProperty(
    currentRoot,
    '  - name: gallery',
    '    folder: /content/gallery',
    '    folder: /content/unrelated'
  );
  const duplicateCollectionProperty = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateCollectionProperty.status, 'REVIEW_REQUIRED');
  assert.equal(duplicateCollectionProperty.cmsSchema.collectionValid, false);
  assert.equal(duplicateCollectionProperty.cmsSchema.safeDefaults, false);
  assert.ok(duplicateCollectionProperty.cmsSchema.duplicatePropertyPaths.includes('gallery.folder'));
  assert.equal(duplicateCollectionProperty.summary.approvalEligibleCount, 0);
  assert.ok(duplicateCollectionProperty.records[0].blockers.includes('cms-gallery-collection-contract-invalid'));

  const unsafeRecord = {
    ...unreviewedRecord,
    image: { ...unreviewedRecord.image, src: 'img/../../outside.jpg' },
  };
  makeGalleryFixture(currentRoot, { includeEvidence: false, safeDefaults: true }, unsafeRecord);
  const unsafe = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unsafe.status, 'INVALID');
  assert.equal(unsafe.summary.recordCount, 0);
} finally {
  fs.rmSync(sourceAuditDirectory, { recursive: true, force: true });
}

console.log('PASS: curated media manifest, exact Git blob SHA/bytes, dimensions, role-based image budgets, picture/JPEG references, and page-specific image/alt contracts.');
