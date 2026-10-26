#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  applyPack, inspectPack, readZip, sha256, crc32
} = require('./import-content-pack');
const { validateRepository } = require('./validate-content');
const { buildContentPages } = require('./build-content-pages');

const ROOT = path.resolve(__dirname, '..');
const TEMP_PREFIX = path.join(os.tmpdir(), 'garh-content-pack-import-');
function copyFixture() {
  const root = fs.mkdtempSync(TEMP_PREFIX);
  fs.cpSync(path.join(ROOT, 'content'), path.join(root, 'content'), { recursive: true });
  for (const relative of ['sitemap.xml', 'favicon.svg', 'assets/site.css', 'assets/site.js', 'assets/css/content-pages.css']) {
    const from = path.join(ROOT, relative);
    const to = path.join(root, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  fs.mkdirSync(path.join(root, 'tours'), { recursive: true });
  fs.mkdirSync(path.join(root, 'blogs'), { recursive: true });
  return root;
}
function blogRecord(slug) {
  return {
    schemaVersion: 1, slug, title: 'Pack Safety Guide for Jaisalmer',
    seo: {
      title: 'Pack Safety Guide for Jaisalmer',
      description: 'A practical, source-backed draft guide to help travellers plan a Jaisalmer visit and identify details that should be confirmed before travel.'
    },
    status: 'draft',
    lede: 'This draft explains what to verify when planning a Jaisalmer visit and how to check information before making travel arrangements.',
    sections: [
      { id: 'overview', heading: 'Start with reliable information', body: ['Check current source material and confirm details that can change.'] },
      { id: 'next-steps', heading: 'Confirm before travel', body: ['Contact the relevant operator to confirm current details for your date.'] }
    ],
    sources: [{ label: 'Example source for pack testing', url: 'https://example.org/travel' }],
    lastReviewed: null, publishedAt: null, relatedTours: [], relatedBlogs: []
  };
}
function packFor(type, slug, mode, record, filePath, priorSha = null, extra = []) {
  const recordBytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  const all = [{ path: filePath, role: 'record', data: recordBytes, prior_sha256: priorSha }, ...extra];
  const fileList = all.map(item => ({
    path: item.path, role: item.role, bytes: item.data.length,
    sha256: sha256(item.data), prior_sha256: item.prior_sha256
  }));
  const files = new Map([
    ['pack.json', Buffer.from(JSON.stringify({
      version: 1, pack_id: 'gj-static-pack-test-2026-10-26-v1', created: '2026-10-26',
      entries: [{ type, slug, mode, status: 'draft', files: fileList }]
    }, null, 2) + '\n')],
    ...all.map(item => [item.path, item.data])
  ]);
  return { files, recordBytes };
}
function makeZip(entries) {
  const localParts = [], centralParts = [];
  let offset = 0;
  const dosDate = (46 << 9) | (1 << 5) | 1;
  for (const [name, input] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(input);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x031e, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const localBuffer = Buffer.concat(localParts), centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralParts.length / 2, 8); eocd.writeUInt16LE(centralParts.length / 2, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12); eocd.writeUInt32LE(localBuffer.length, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuffer, centralBuffer, eocd]);
}
function expectFinding(result, pattern) {
  assert.equal(result.ok, false, 'pack should be rejected');
  assert.ok(result.findings.some(f => pattern.test(f.message)), 'expected ' + pattern + ', got: ' + result.findings.map(f => f.message).join(' | '));
}
function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }

const root = copyFixture();
try {
  const sitemapBefore = fs.readFileSync(path.join(root, 'sitemap.xml'));
  const slug = 'pack-import-safety-guide';
  const recPath = 'content/blogs/' + slug + '.json';
  const clean = packFor('blog', slug, 'new', blogRecord(slug), recPath);
  const preview = applyPack(clean.files, { root, dryRun: true });
  assert.equal(preview.ok, true, preview.findings.map(f => f.message).join('\n'));
  assert.equal(preview.dryRun, true);
  assert.equal(preview.operations.length, 1);
  assert.equal(preview.operations[0].op, 'create');
  assert.equal(fs.existsSync(path.join(root, recPath)), false, 'dry run must not write');

  const applied = applyPack(clean.files, { root, dryRun: false });
  assert.equal(applied.ok, true, applied.findings.map(f => f.message).join('\n'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, recPath), 'utf8')).status, 'draft');
  assert.deepEqual(fs.readFileSync(path.join(root, 'sitemap.xml')), sitemapBefore, 'import must not touch sitemap');
  assert.equal(validateRepository(root).ok, true, 'draft must pass the repository content validator');
  assert.equal(buildContentPages(root, { write: false }).outputFiles.length, 0, 'draft import must not create public pages');

  expectFinding(inspectPack(packFor('blog', slug, 'new', blogRecord(slug), recPath).files, { root }), /already exists/);

  const changed = { ...blogRecord(slug), lede: 'This revised text must not overwrite the current draft when the old base hash no longer matches.' };
  expectFinding(inspectPack(packFor('blog', slug, 'update', changed, recPath, '0'.repeat(64)).files, { root }), /Stale base hash/);
  const prior = sha256(fs.readFileSync(path.join(root, recPath)));
  const goodUpdate = applyPack(packFor('blog', slug, 'update', changed, recPath, prior).files, { root, dryRun: false });
  assert.equal(goodUpdate.ok, true, goodUpdate.findings.map(f => f.message).join('\n'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, recPath), 'utf8')).lede, changed.lede);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, recPath), 'utf8')).status, 'draft');

  const tampered = packFor('blog', 'different-pack-guide', 'new', blogRecord('different-pack-guide'), 'content/blogs/different-pack-guide.json');
  tampered.files.set('content/blogs/different-pack-guide.json', Buffer.from('{"status":"live"}\n'));
  expectFinding(inspectPack(tampered.files, { root }), /Size\/SHA-256 mismatch/);

  const unsafe = packFor('blog', 'unsafe-pack-guide', 'new', blogRecord('unsafe-pack-guide'), 'content/blogs/unsafe-pack-guide.json');
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'));
  unsafe.files.set('sitemap.xml', sitemap);
  const badManifest = JSON.parse(unsafe.files.get('pack.json').toString('utf8'));
  badManifest.entries[0].files.push({ path: 'sitemap.xml', role: 'record', bytes: sitemap.length, sha256: sha256(sitemap), prior_sha256: null });
  unsafe.files.set('pack.json', Buffer.from(JSON.stringify(badManifest, null, 2)));
  expectFinding(inspectPack(unsafe.files, { root }), /Pack path is not allowed/);

  const liveRecord = { ...blogRecord('must-remain-draft'), status: 'live' };
  const livePack = packFor('blog', 'must-remain-draft', 'new', liveRecord, 'content/blogs/must-remain-draft.json');
  const liveManifest = JSON.parse(livePack.files.get('pack.json').toString('utf8'));
  liveManifest.entries[0].status = 'live';
  livePack.files.set('pack.json', Buffer.from(JSON.stringify(liveManifest, null, 2)));
  expectFinding(inspectPack(livePack.files, { root }), /must both remain draft/);

  const missingImageRecord = blogRecord('missing-image-guide');
  missingImageRecord.sections[0].image = 'assets/images/blogs/missing-image-guide/missing-image-guide-detail-01.webp';
  expectFinding(inspectPack(packFor('blog', missingImageRecord.slug, 'new', missingImageRecord, 'content/blogs/' + missingImageRecord.slug + '.json').files, { root }), /Image referenced by record is missing/);

  const badImageRecord = blogRecord('bad-image-guide');
  badImageRecord.sections[0].image = 'assets/images/blogs/bad-image-guide/bad-image-guide-detail-01.webp';
  const badImagePack = packFor('blog', badImageRecord.slug, 'new', badImageRecord, 'content/blogs/' + badImageRecord.slug + '.json', null, [{
    path: 'assets/images/blogs/bad-image-guide/bad-image-guide-detail-01.webp',
    role: 'detail', data: Buffer.from('not an image'), prior_sha256: null
  }]);
  expectFinding(inspectPack(badImagePack.files, { root }), /File contents do not match image extension/);

  const duplicate = packFor('blog', 'duplicate-pack-guide', 'new', blogRecord('duplicate-pack-guide'), 'content/blogs/duplicate-pack-guide.json');
  const duplicateManifest = JSON.parse(duplicate.files.get('pack.json').toString('utf8'));
  duplicateManifest.entries.push(duplicateManifest.entries[0]);
  duplicate.files.set('pack.json', Buffer.from(JSON.stringify(duplicateManifest, null, 2)));
  expectFinding(inspectPack(duplicate.files, { root }), /Duplicate content entry/);

  const zipPack = packFor('blog', 'zip-pack-guide', 'new', blogRecord('zip-pack-guide'), 'content/blogs/zip-pack-guide.json');
  const zipPath = path.join(root, 'valid-pack.zip');
  fs.writeFileSync(zipPath, makeZip([...zipPack.files.entries()]));
  const parsedZip = readZip(fs.readFileSync(zipPath));
  assert.equal(parsedZip.has('pack.json'), true);
  const zipDryRun = applyPack(zipPath, { root, dryRun: true });
  assert.equal(zipDryRun.ok, true, zipDryRun.findings.map(f => f.message).join('\n'));
  assert.equal(fs.existsSync(path.join(root, 'content/blogs/zip-pack-guide.json')), false);

  const hostileZip = path.join(root, 'hostile-pack.zip');
  fs.writeFileSync(hostileZip, makeZip([['../outside.json', Buffer.from('{}')]]));
  expectFinding(inspectPack(hostileZip, { root }), /Unsafe path in ZIP/);

  const corruptZip = Buffer.from(fs.readFileSync(zipPath));
  const firstPath = [...zipPack.files.keys()].sort()[0];
  corruptZip[30 + Buffer.byteLength(firstPath) + 3] ^= 0xff;
  assert.throws(() => readZip(corruptZip), /integrity check failed/i);

  console.log('PASS: content-pack import — dry run, draft-only policy, schema/hash/path gates, stale-update protection, ZIP integrity, safe allowlisted apply, and sitemap/public-output preservation.');
} finally {
  cleanup(root);
}
