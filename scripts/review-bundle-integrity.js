'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseStrictJsonBytes } = require('./validate-editorial-media-decisions');
const MAX_FILES = 256;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object.');
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(label + ' has unsupported or missing fields.');
}
function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') &&
    !path.isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..');
}
function normalizeExcludedPaths(values) {
  if (!Array.isArray(values)) throw new Error('Excluded bundle paths must be an array.');
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (!safeRelative(value) || value === 'bundle-integrity.json' || seen.has(value)) throw new Error('Excluded bundle paths contain an unsafe or duplicate path.');
    seen.add(value);
    result.push(value);
  }
  return result.sort();
}
function walkBundleFiles(directory, excludedPaths) {
  const root = fs.realpathSync(directory);
  const excluded = new Set(excludedPaths);
  const files = [];
  function visit(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error('Bundle contains a symbolic link: ' + absolute);
      if (stat.isDirectory()) { visit(absolute); continue; }
      if (!stat.isFile()) throw new Error('Bundle contains a non-regular filesystem entry: ' + absolute);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (relative === 'bundle-integrity.json' || excluded.has(relative)) continue;
      if (!safeRelative(relative) || stat.size < 1 || stat.size > MAX_FILE_BYTES) throw new Error('Bundle file has an unsafe path or exceeds its byte limit: ' + relative);
      const bytes = fs.readFileSync(absolute);
      if (bytes.length !== stat.size) throw new Error('Bundle file changed while being read: ' + relative);
      files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
      if (files.length > MAX_FILES) throw new Error('Bundle contains too many files.');
    }
  }
  visit(root);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) throw new Error('Bundle exceeds its total byte limit.');
  return { files, totalBytes };
}
function writeBundleIntegrityManifest(directory, excludedPaths) {
  const root = fs.realpathSync(directory);
  const excluded = normalizeExcludedPaths(excludedPaths);
  const inventory = walkBundleFiles(root, excluded);
  if (!inventory.files.length) throw new Error('Bundle integrity inventory cannot be empty.');
  const manifest = { schemaVersion: 1, algorithm: 'sha256', fileCount: inventory.files.length,
    totalBytes: inventory.totalBytes, excludedPaths: excluded, files: inventory.files };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  if (bytes.length > MAX_MANIFEST_BYTES) throw new Error('Bundle integrity manifest exceeds its byte limit.');
  fs.writeFileSync(path.join(root, 'bundle-integrity.json'), bytes, { flag: 'wx' });
  return { sha256: sha256(bytes), fileCount: inventory.files.length, totalBytes: inventory.totalBytes };
}
function verifyBundleIntegrityManifest(directory, expectedExcludedPaths) {
  const root = fs.realpathSync(directory);
  const excluded = normalizeExcludedPaths(expectedExcludedPaths);
  const manifestPath = path.join(root, 'bundle-integrity.json');
  const stat = fs.lstatSync(manifestPath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > MAX_MANIFEST_BYTES) throw new Error('Bundle integrity manifest must be a bounded regular non-symlink file.');
  const bytes = fs.readFileSync(manifestPath);
  const manifest = parseStrictJsonBytes(bytes, 'Bundle integrity manifest');
  exactKeys(manifest, ['schemaVersion', 'algorithm', 'fileCount', 'totalBytes', 'excludedPaths', 'files'], 'Bundle integrity manifest');
  if (manifest.schemaVersion !== 1 || manifest.algorithm !== 'sha256' ||
      !Array.isArray(manifest.excludedPaths) || JSON.stringify(manifest.excludedPaths) !== JSON.stringify(excluded) ||
      !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > MAX_FILES ||
      manifest.fileCount !== manifest.files.length || !Number.isSafeInteger(manifest.totalBytes) ||
      manifest.totalBytes < 1 || manifest.totalBytes > MAX_TOTAL_BYTES) throw new Error('Bundle integrity manifest schema, exclusions or limits are invalid.');
  let previousPath = '';
  let declaredTotal = 0;
  for (const file of manifest.files) {
    exactKeys(file, ['path', 'bytes', 'sha256'], 'Bundle integrity file entry');
    if (!safeRelative(file.path) || file.path === 'bundle-integrity.json' || excluded.includes(file.path) ||
        (previousPath && file.path <= previousPath) || !Number.isSafeInteger(file.bytes) ||
        file.bytes < 1 || file.bytes > MAX_FILE_BYTES || !SHA256.test(file.sha256 || '')) throw new Error('Bundle integrity file inventory contains an unsafe, duplicate or invalid entry.');
    previousPath = file.path;
    declaredTotal += file.bytes;
  }
  if (declaredTotal !== manifest.totalBytes || !Number.isSafeInteger(declaredTotal)) throw new Error('Bundle integrity total byte count does not match its entries.');
  const actual = walkBundleFiles(root, excluded);
  if (actual.files.length !== manifest.files.length) throw new Error('Bundle file inventory has missing or unexpected files.');
  for (let index = 0; index < actual.files.length; index += 1) {
    const expected = manifest.files[index];
    const observed = actual.files[index];
    if (observed.path !== expected.path || observed.bytes !== expected.bytes || observed.sha256 !== expected.sha256) throw new Error('Bundle file integrity mismatch: ' + expected.path);
  }
  return { sha256: sha256(bytes), fileCount: actual.files.length, totalBytes: actual.totalBytes };
}
module.exports = { writeBundleIntegrityManifest, verifyBundleIntegrityManifest };
