#!/usr/bin/env node
'use strict';

/**
 * Detect exact-byte duplicate local image files used by public static HTML.
 * This complements the per-page repeated-src check in test-content-ux.js.
 * It deliberately does not claim perceptual/visual duplicate detection.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function decodeEntities(value) {
  return value.replace(/&amp;/gi, '&').replace(/&#x2f;/gi, '/').replace(/&#47;/gi, '/');
}

function attributes(tag) {
  const result = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function imageReferences(html) {
  const references = [];
  const tags = [
    ...html.matchAll(/<img\b[^>]*>/gi),
    ...html.matchAll(/<source\b[^>]*>/gi),
  ];
  for (const match of tags) {
    const tag = match[0];
    const attr = attributes(tag);
    if (/^<img\b/i.test(tag) && attr.src) references.push(attr.src);
    if (attr.srcset) {
      for (const candidate of attr.srcset.split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) references.push(url);
      }
    }
  }
  return references;
}

function auditPublicImages(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const pageDirectories = [root, path.join(root, 'tours'), path.join(root, 'blogs')];
  const pages = [];
  const errors = [];
  const hashIndex = new Map();
  let referenceCount = 0;

  for (const directory of pageDirectories) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) continue;
    for (const name of fs.readdirSync(directory).filter((item) => item.toLowerCase().endsWith('.html')).sort()) {
      const fullPath = path.join(directory, name);
      if (!fs.statSync(fullPath).isFile()) continue;
      pages.push(fullPath);
    }
  }

  for (const pagePath of pages) {
    const pageLabel = path.relative(root, pagePath).split(path.sep).join('/');
    const html = fs.readFileSync(pagePath, 'utf8');
    for (const rawReference of imageReferences(html)) {
      const reference = decodeEntities(rawReference.trim());
      if (!reference || /^(?:https?:|\/\/|data:|blob:|javascript:|mailto:|tel:)/i.test(reference)) continue;
      const withoutSuffix = reference.split(/[?#]/, 1)[0];
      if (!withoutSuffix) continue;

      let decoded = withoutSuffix;
      try {
        decoded = decodeURIComponent(withoutSuffix);
      } catch {
        errors.push(pageLabel + ': malformed percent-encoding in image path: ' + reference);
        continue;
      }

      const targetPath = decoded.startsWith('/')
        ? path.resolve(root, decoded.slice(1))
        : path.resolve(path.dirname(pagePath), decoded);
      if (!isWithinRoot(root, targetPath)) {
        errors.push(pageLabel + ': image path escapes repository root: ' + reference);
        continue;
      }
      if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        errors.push(pageLabel + ': missing local image: ' + reference);
        continue;
      }

      referenceCount += 1;
      const relativePath = path.relative(root, targetPath).split(path.sep).join('/');
      const digest = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');
      if (!hashIndex.has(digest)) hashIndex.set(digest, new Map());
      const pathsForHash = hashIndex.get(digest);
      if (!pathsForHash.has(relativePath)) pathsForHash.set(relativePath, new Set());
      pathsForHash.get(relativePath).add(pageLabel);
    }
  }

  const duplicateGroups = [];
  for (const [sha256, pathsForHash] of hashIndex) {
    if (pathsForHash.size < 2) continue;
    duplicateGroups.push({
      sha256,
      paths: [...pathsForHash.entries()].map(([imagePath, usedBy]) => ({
        path: imagePath,
        pages: [...usedBy].sort(),
      })).sort((left, right) => left.path.localeCompare(right.path)),
    });
  }

  return {
    pageCount: pages.length,
    referenceCount,
    uniquePathCount: [...hashIndex.values()].reduce((total, pathsForHash) => total + pathsForHash.size, 0),
    duplicateGroups,
    errors,
  };
}

function main() {
  const result = auditPublicImages(path.resolve(__dirname, '..'));
  const failures = [...result.errors];
  for (const group of result.duplicateGroups) {
    const locations = group.paths.map((item) => item.path + ' [' + item.pages.join(', ') + ']').join('; ');
    failures.push('identical image bytes are referenced from distinct public paths (SHA-256 ' + group.sha256 + '): ' + locations);
  }

  if (failures.length) {
    console.error('FAIL: public image identity audit found ' + failures.length + ' issue(s)');
    for (const failure of failures) console.error(' - ' + failure);
    process.exitCode = 1;
    return;
  }

  console.log('PASS: no exact-byte duplicate local image files across ' + result.uniquePathCount
    + ' referenced image paths, ' + result.referenceCount + ' image references and ' + result.pageCount
    + ' public HTML pages. Exact-byte check only; visually similar images require human review.');
}

if (require.main === module) main();

module.exports = { auditPublicImages };
