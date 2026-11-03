'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseStrictJsonBytes } = require('./validate-editorial-media-decisions');

const MAX_FILES = 256;
const MAX_ENTRIES = 2048;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PATH_BYTES = 240;
const MAX_SEGMENT_BYTES = 100;
const MAX_PATH_DEPTH = 8;
const SHA256 = /^[a-f0-9]{64}$/;
const PORTABLE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object.');
  }
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length ||
      actual.some((key, index) => key !== wanted[index])) {
    throw new Error(label + ' has unsupported or missing fields.');
  }
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') ||
      path.isAbsolute(value) || /^[a-z]:/i.test(value) ||
      Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES) return false;
  const parts = value.split('/');
  return parts.length <= MAX_PATH_DEPTH && parts.every(part =>
    part.length > 0 &&
    part !== '.' &&
    part !== '..' &&
    Buffer.byteLength(part, 'utf8') <= MAX_SEGMENT_BYTES &&
    PORTABLE_SEGMENT.test(part) &&
    !part.endsWith('.') &&
    !WINDOWS_RESERVED_NAME.test(part)
  );
}

function assertPortablePathSet(entries, label) {
  const nodes = new Map();
  const filePaths = new Set();
  for (const entry of entries) {
    const relative = typeof entry === 'string' ? entry : entry && entry.path;
    const kind = typeof entry === 'string' ? 'file' : entry && entry.kind;
    if (!safeRelative(relative) || !['file', 'directory'].includes(kind)) {
      throw new Error(label + ' contains an unsafe or non-portable path: ' + String(relative));
    }
    const parts = relative.split('/');
    let prefix = '';
    for (let index = 0; index < parts.length; index += 1) {
      prefix = prefix ? prefix + '/' + parts[index] : parts[index];
      const nodeKind = index === parts.length - 1 ? kind : 'directory';
      const key = prefix.toLowerCase();
      const previous = nodes.get(key);
      if (previous && previous.path !== prefix) {
        throw new Error(label + ' contains a case-insensitive path collision: ' +
          previous.path + ' and ' + prefix);
      }
      if (previous && previous.kind !== nodeKind) {
        throw new Error(label + ' contains a file/directory path conflict: ' + prefix);
      }
      if (!previous) nodes.set(key, { path: prefix, kind: nodeKind });
    }
    if (kind === 'file') {
      const key = relative.toLowerCase();
      if (filePaths.has(key)) throw new Error(label + ' contains a duplicate file path: ' + relative);
      filePaths.add(key);
    }
  }
}

function normalizeExcludedPaths(values) {
  if (!Array.isArray(values)) throw new Error('Excluded bundle paths must be an array.');
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (!safeRelative(value) || value.toLowerCase() === 'bundle-integrity.json' ||
        seen.has(value)) {
      throw new Error('Excluded bundle paths contain an unsafe or duplicate path.');
    }
    seen.add(value);
    result.push(value);
  }
  assertPortablePathSet(result.map(value => ({ path: value, kind: 'file' })),
    'Excluded bundle paths');
  return result.sort();
}

function realDirectory(directory) {
  const absolute = path.resolve(directory);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Bundle root must be an existing non-symlink directory.');
  }
  return fs.realpathSync(absolute);
}

function sameFileSnapshot(left, right) {
  const sameDevice = !(left.dev && right.dev) || left.dev === right.dev;
  const sameInode = !(left.ino && right.ino) || left.ino === right.ino;
  return left.isFile() && right.isFile() && sameDevice && sameInode &&
    left.size === right.size && left.nlink === 1 && right.nlink === 1 &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function readRegularFile(filePath, expectedStat, label, maximumBytes) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(filePath, flags);
  try {
    const opened = fs.fstatSync(descriptor);
    if (!sameFileSnapshot(expectedStat, opened)) {
      throw new Error(label + ' changed identity, is hard-linked, or is not a regular file.');
    }
    if (opened.size < 1 || opened.size > maximumBytes) {
      throw new Error(label + ' is empty or exceeds its byte limit.');
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (!sameFileSnapshot(opened, after) || bytes.length !== after.size) {
      throw new Error(label + ' changed while being read.');
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function walkBundleFiles(directory, excludedPaths, requireExcludedFiles = false) {
  const root = realDirectory(directory);
  const excluded = new Set(excludedPaths);
  const files = [];
  const portableEntries = [];
  const excludedFound = new Set();

  function visit(current, depth) {
    if (depth > MAX_PATH_DEPTH) {
      throw new Error('Bundle directory nesting exceeds its limit.');
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error('Bundle contains a symbolic link: ' + absolute);
      }
      const isDirectory = stat.isDirectory();
      const isFile = stat.isFile();
      if (!isDirectory && !isFile) {
        throw new Error('Bundle contains a non-regular filesystem entry: ' + absolute);
      }
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!safeRelative(relative)) {
        throw new Error('Bundle contains an unsafe or non-portable path: ' + relative);
      }
      portableEntries.push({ path: relative, kind: isDirectory ? 'directory' : 'file' });
      if (portableEntries.length > MAX_ENTRIES) {
        throw new Error('Bundle contains too many filesystem entries.');
      }
      if (isDirectory) {
        visit(absolute, depth + 1);
        continue;
      }
      if (stat.nlink !== 1) {
        throw new Error('Bundle contains a hard-linked file: ' + relative);
      }
      if (stat.size < 1 || stat.size > MAX_FILE_BYTES) {
        throw new Error('Bundle file is empty or exceeds its byte limit: ' + relative);
      }
      if (relative === 'bundle-integrity.json') continue;
      if (excluded.has(relative)) {
        excludedFound.add(relative);
        continue;
      }
      const bytes = readRegularFile(absolute, stat, 'Bundle file ' + relative, MAX_FILE_BYTES);
      files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
      if (files.length > MAX_FILES) throw new Error('Bundle contains too many files.');
    }
  }

  visit(root, 0);
  assertPortablePathSet(portableEntries, 'Bundle filesystem');
  if (requireExcludedFiles) {
    for (const relative of excluded) {
      if (!excludedFound.has(relative)) {
        throw new Error('Bundle excluded worksheet file is missing: ' + relative);
      }
    }
  }
  files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) {
    throw new Error('Bundle exceeds its total byte limit.');
  }
  return { files, totalBytes };
}

function writeBundleIntegrityManifest(directory, excludedPaths) {
  const root = realDirectory(directory);
  const excluded = normalizeExcludedPaths(excludedPaths);
  const inventory = walkBundleFiles(root, excluded, false);
  if (!inventory.files.length) throw new Error('Bundle integrity inventory cannot be empty.');
  const manifest = {
    schemaVersion: 1,
    algorithm: 'sha256',
    fileCount: inventory.files.length,
    totalBytes: inventory.totalBytes,
    excludedPaths: excluded,
    files: inventory.files,
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  if (bytes.length > MAX_MANIFEST_BYTES) {
    throw new Error('Bundle integrity manifest exceeds its byte limit.');
  }
  fs.writeFileSync(path.join(root, 'bundle-integrity.json'), bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    sha256: sha256(bytes),
    fileCount: inventory.files.length,
    totalBytes: inventory.totalBytes,
  };
}

function verifyBundleIntegrityManifest(directory, expectedExcludedPaths) {
  const root = realDirectory(directory);
  const excluded = normalizeExcludedPaths(expectedExcludedPaths);
  const manifestPath = path.join(root, 'bundle-integrity.json');
  const stat = fs.lstatSync(manifestPath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 ||
      stat.size < 1 || stat.size > MAX_MANIFEST_BYTES) {
    throw new Error('Bundle integrity manifest must be a bounded regular non-symlink file.');
  }
  const bytes = readRegularFile(manifestPath, stat, 'Bundle integrity manifest', MAX_MANIFEST_BYTES);
  const manifest = parseStrictJsonBytes(bytes, 'Bundle integrity manifest');
  exactKeys(manifest, [
    'schemaVersion', 'algorithm', 'fileCount', 'totalBytes', 'excludedPaths', 'files',
  ], 'Bundle integrity manifest');
  if (manifest.schemaVersion !== 1 || manifest.algorithm !== 'sha256' ||
      !Array.isArray(manifest.excludedPaths) ||
      JSON.stringify(manifest.excludedPaths) !== JSON.stringify(excluded) ||
      !Array.isArray(manifest.files) || manifest.files.length < 1 ||
      manifest.files.length > MAX_FILES || manifest.fileCount !== manifest.files.length ||
      !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 1 ||
      manifest.totalBytes > MAX_TOTAL_BYTES) {
    throw new Error('Bundle integrity manifest schema, exclusions or limits are invalid.');
  }

  assertPortablePathSet(manifest.files.map(file => ({
    path: file && file.path,
    kind: 'file',
  })), 'Bundle integrity manifest');

  let previousPath = '';
  let declaredTotal = 0;
  for (const file of manifest.files) {
    exactKeys(file, ['path', 'bytes', 'sha256'], 'Bundle integrity file entry');
    if (!safeRelative(file.path) || file.path.toLowerCase() === 'bundle-integrity.json' ||
        excluded.includes(file.path) || (previousPath && file.path <= previousPath) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 1 ||
        file.bytes > MAX_FILE_BYTES || !SHA256.test(file.sha256 || '')) {
      throw new Error('Bundle integrity file inventory contains an unsafe, duplicate or invalid entry.');
    }
    previousPath = file.path;
    declaredTotal += file.bytes;
  }
  if (declaredTotal !== manifest.totalBytes || !Number.isSafeInteger(declaredTotal)) {
    throw new Error('Bundle integrity total byte count does not match its entries.');
  }

  const actual = walkBundleFiles(root, excluded, true);
  if (actual.files.length !== manifest.files.length) {
    throw new Error('Bundle file inventory has missing or unexpected files.');
  }
  for (let index = 0; index < actual.files.length; index += 1) {
    const expected = manifest.files[index];
    const observed = actual.files[index];
    if (observed.path !== expected.path || observed.bytes !== expected.bytes ||
        observed.sha256 !== expected.sha256) {
      throw new Error('Bundle file integrity mismatch: ' + expected.path);
    }
  }
  return {
    sha256: sha256(bytes),
    fileCount: actual.files.length,
    totalBytes: actual.totalBytes,
  };
}

module.exports = { writeBundleIntegrityManifest, verifyBundleIntegrityManifest };
