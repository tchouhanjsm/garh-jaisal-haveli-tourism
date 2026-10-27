#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditPublicImages } = require('./test-public-image-uniqueness');

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function withFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-image-identity-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withFixture((root) => {
  const sameBytes = Buffer.from('fixture image bytes');
  write(root, 'assets/images/first.jpg', sameBytes);
  write(root, 'assets/images/duplicate.jpg', sameBytes);
  write(root, 'index.html', '<img src="assets/images/first.jpg" alt="First"><img src="/assets/images/duplicate.jpg" alt="Duplicate">');
  write(root, 'tours/walk.html', '<picture><source srcset="../assets/images/duplicate.jpg 1x"><img src="../assets/images/first.jpg" alt="Walk"></picture>');

  const result = auditPublicImages(root);
  assert.equal(result.errors.length, 0);
  assert.equal(result.duplicateGroups.length, 1, 'same bytes under distinct referenced paths must be detected');
  assert.deepEqual(result.duplicateGroups[0].paths.map((item) => item.path), [
    'assets/images/duplicate.jpg',
    'assets/images/first.jpg',
  ]);
  assert.deepEqual(result.duplicateGroups[0].paths[0].pages, ['index.html', 'tours/walk.html']);
});

withFixture((root) => {
  write(root, 'assets/images/shared.jpg', Buffer.from('one shared image'));
  write(root, 'index.html', '<img src="assets/images/shared.jpg" alt="Home">');
  write(root, 'rooms.html', '<img src="/assets/images/shared.jpg" alt="Room">');
  write(root, 'experiences.html', '<img src="https://images.example.test/remote.jpg" alt="Remote">');

  const result = auditPublicImages(root);
  assert.equal(result.errors.length, 0);
  assert.equal(result.duplicateGroups.length, 0, 'reuse of the same canonical path must not be reported as a duplicate file');
  assert.equal(result.uniquePathCount, 1);
});

withFixture((root) => {
  write(root, 'index.html', '<img src="../outside.jpg" alt="Escape"><img src="missing.jpg" alt="Missing">');
  const result = auditPublicImages(root);
  assert.equal(result.errors.length, 2, 'path traversal and missing local images must fail closed');
  assert.ok(result.errors.some((item) => item.includes('escapes repository root')));
  assert.ok(result.errors.some((item) => item.includes('missing local image')));
});

console.log('PASS: public image identity contract detects byte-identical copies, permits reuse of one path, ignores external URLs, and rejects missing/escaping local paths.');
