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
  const isNamedRoom = /Room gallery — named room image/i.test(entry.intendedRole);
  const budget = isNamedRoom ? 900 * 1024 : MAX_BYTES;
  assert.ok(buffer.length > 0 && buffer.length <= budget,
    'Asset exceeds ' + Math.round(budget / 1024) + ' KiB budget: ' + entry.targetPath);
  assert.deepEqual(getDimensions(buffer, entry.targetPath), entry.dimensions, 'Dimensions differ from manifest: ' + entry.targetPath);
  const localBlobSha = crypto.createHash('sha1')
    .update(Buffer.from('blob ' + buffer.length + '\0'))
    .update(buffer)
    .digest('hex');
  assert.equal(localBlobSha, entry.targetBlobSha, 'Local file Git blob SHA differs from manifest: ' + entry.targetPath);
  const page = pageContent(entry.verificationPage);
  assert.ok(page.includes('src="' + entry.targetPath + '"'), entry.verificationPage + ' missing asset: ' + entry.targetPath);
  assert.ok(page.includes('alt="' + entry.altText + '"'), entry.verificationPage + ' alt text differs from manifest: ' + entry.targetPath);

  if (entry.targetPath.includes('/hotel/')) assert.match(entry.visualSubject, /fort|rooftop/i, 'Fort/rooftop subject-role mismatch');
  else if (entry.targetPath.includes('/desert/')) assert.match(entry.visualSubject, /desert camp/i, 'Desert subject-role mismatch');
  else if (isNamedRoom) assert.match(entry.visualSubject, /room/i, 'Named-room gallery subject mismatch');
  else if (/Homepage hero — rooftop terrace/i.test(entry.intendedRole)) assert.match(entry.visualSubject, /rooftop|terrace/i, 'Homepage hero subject-role mismatch');
  else if (/Dining page — candlelit-table/i.test(entry.intendedRole)) assert.match(entry.visualSubject, /candlelit|table/i, 'Dining image subject-role mismatch');
  else assert.fail('Media target is outside the curated image taxonomy: ' + entry.targetPath);
}

console.log('PASS: curated media manifest, source/target Git blob SHA and byte integrity, dimensions, size budgets, named-room/dining/fort/desert roles and page-specific alt text.');
