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


const { auditAuthoritativeGallerySource } = require('./audit-authoritative-gallery-source');

function makeGalleryFixture(root, schemaFields, record) {
  fs.mkdirSync(path.join(root, 'admin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content', 'gallery'), { recursive: true });
  fs.mkdirSync(path.join(root, 'img', 'gallery'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'admin', 'config.yml'),
    'collections:\n  - name: gallery\n    fields:\n' +
      schemaFields.map(field => '      - name: ' + field + '\n').join(''),
    'utf8'
  );
  fs.writeFileSync(path.join(root, 'img', 'gallery', 'fixture.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(root, 'content', 'gallery', record.id + '.json'), JSON.stringify(record, null, 2));
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
      src: 'img/gallery/fixture.jpg',
      alt: 'Carved sandstone facade inside the historic Jaisalmer Fort',
      crop: 'landscape',
    },
  };
  makeGalleryFixture(currentRoot, ['id', 'category', 'status', 'order', 'review_status', 'src', 'alt', 'crop'], unreviewedRecord);
  const unreviewed = auditAuthoritativeGallerySource({
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

  const completeSchema = [
    'id', 'category', 'status', 'order', 'review_status', 'src', 'alt', 'crop',
    'sourceEvidence', 'creator', 'sourceUrl', 'licenseName', 'evidenceReference',
    'verifiedBy', 'verifiedAt', 'visualReview', 'reviewer', 'reviewedAt', 'technicalValidation',
  ];
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
  makeGalleryFixture(currentRoot, completeSchema, reviewedRecord);
  const complete = auditAuthoritativeGallerySource({
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

  const unsafeRecord = {
    ...unreviewedRecord,
    image: { ...unreviewedRecord.image, src: 'img/../../outside.jpg' },
  };
  makeGalleryFixture(currentRoot, ['id', 'category', 'status', 'order', 'review_status'], unsafeRecord);
  const unsafe = auditAuthoritativeGallerySource({
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
