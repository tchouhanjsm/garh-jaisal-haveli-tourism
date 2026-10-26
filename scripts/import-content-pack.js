#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { safeRelativePath, validateAgainstSchema, validateRepository } = require('./validate-content');
const { buildContentPages } = require('./build-content-pages');

const ROOT = path.resolve(__dirname, '..');
const META_FILES = new Set(['pack.json', 'README-PACK.txt']);
const TYPES = Object.freeze({ tour: 'tour.schema.json', blog: 'blog.schema.json', gallery: 'gallery.schema.json' });
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 250;
const MAX_ENTRIES = 50;
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function fail(message) { throw new Error(message); }
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function safePath(value) {
  return typeof value === 'string' && safeRelativePath(value) &&
    !value.includes('\0') && !/^[a-zA-Z]:/.test(value) && !value.includes('//');
}
function resolveInside(root, relative) {
  if (!safePath(relative)) fail('Unsafe repository-relative path: ' + relative);
  const base = path.resolve(root);
  const absolute = path.resolve(base, relative);
  const rel = path.relative(base, absolute);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) fail('Path escapes repository root: ' + relative);
  return absolute;
}
function locate(root, relative) {
  const absolute = resolveInside(root, relative);
  const parts = relative.split('/');
  let current = path.resolve(root);
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT') return { exists: false, absolute };
      throw error;
    }
    if (stat.isSymbolicLink()) fail('Symlink destination is not permitted: ' + relative);
    if (i < parts.length - 1 && !stat.isDirectory()) fail('Path parent is not a directory: ' + relative);
    if (i === parts.length - 1 && !stat.isFile()) fail('Destination is not a regular file: ' + relative);
  }
  return { exists: true, absolute, data: fs.readFileSync(absolute) };
}
function readJson(root, relative) {
  const found = locate(root, relative);
  if (!found.exists) fail('Missing file: ' + relative);
  try { return JSON.parse(found.data.toString('utf8')); }
  catch (error) { fail('Invalid JSON in ' + relative + ': ' + error.message); }
}
function ensureParentDirectories(root, relative) {
  const base = path.resolve(root);
  const rootStat = fs.lstatSync(base);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('Repository root must be a real directory');
  let current = base;
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail('Unsafe parent directory for ' + relative);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(current);
    }
  }
}
function atomicWrite(root, relative, data) {
  ensureParentDirectories(root, relative);
  const absolute = resolveInside(root, relative);
  locate(root, relative);
  const temp = absolute + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
  try {
    fs.writeFileSync(temp, data, { flag: 'wx' });
    fs.renameSync(temp, absolute);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch (_) {}
    throw error;
  }
}

function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_ARCHIVE_BYTES) fail('ZIP size is invalid or exceeds the archive limit');
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) fail('Not a ZIP archive: end record not found');
  const disk = buffer.readUInt16LE(eocd + 4);
  const cdDisk = buffer.readUInt16LE(eocd + 6);
  const onDiskCount = buffer.readUInt16LE(eocd + 8);
  const count = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLength !== buffer.length) fail('ZIP has trailing data or a malformed comment');
  if (disk || cdDisk || onDiskCount !== count || count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) fail('Multi-disk and ZIP64 archives are not supported');
  if (count > MAX_FILES || cdOffset + cdSize > eocd) fail('ZIP central directory bounds are invalid');
  const output = new Map();
  let position = cdOffset;
  let totalBytes = 0;
  for (let index = 0; index < count; index += 1) {
    if (position + 46 > cdOffset + cdSize || buffer.readUInt32LE(position) !== 0x02014b50) fail('Corrupt ZIP central directory');
    const flags = buffer.readUInt16LE(position + 8);
    const method = buffer.readUInt16LE(position + 10);
    const crc = buffer.readUInt32LE(position + 16);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLen = buffer.readUInt16LE(position + 32);
    const diskStart = buffer.readUInt16LE(position + 34);
    const externalAttrs = buffer.readUInt32LE(position + 38);
    const localOffset = buffer.readUInt32LE(position + 42);
    const next = position + 46 + nameLength + extraLength + commentLen;
    if (next > cdOffset + cdSize || diskStart !== 0 || localOffset >= cdOffset) fail('Invalid ZIP entry bounds');
    if ((flags & 1) !== 0) fail('Encrypted ZIP entries are not permitted');
    if (method !== 0 && method !== 8) fail('Unsupported ZIP compression method');
    if (uncompressedSize > MAX_FILE_BYTES || compressedSize > MAX_ARCHIVE_BYTES) fail('ZIP entry exceeds size limits');
    const name = buffer.toString('utf8', position + 46, position + 46 + nameLength);
    if (!name || name.includes('\ufffd')) fail('ZIP entry filename is not valid UTF-8');
    const isDir = name.endsWith('/');
    const cleanName = isDir ? name.slice(0, -1) : name;
    if (!safePath(cleanName)) fail('Unsafe path in ZIP: ' + name);
    const unixMode = (externalAttrs >>> 16) & 0xffff;
    const kind = unixMode & 0o170000;
    if (kind === 0o120000 || (kind !== 0 && kind !== 0o100000 && kind !== 0o040000)) fail('Symlink or special file in ZIP: ' + name);
    if (isDir || kind === 0o040000) { position = next; continue; }
    if (output.has(cleanName)) fail('Duplicate path in ZIP: ' + cleanName);
    if (totalBytes + uncompressedSize > MAX_TOTAL_BYTES) fail('ZIP exceeds total uncompressed size limit');
    if (compressedSize === 0 && uncompressedSize > 0) fail('Invalid ZIP compression sizes');
    if (compressedSize > 0 && uncompressedSize / compressedSize > 1000) fail('Suspicious ZIP compression ratio');
    if (localOffset + 30 > cdOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) fail('Corrupt ZIP local header: ' + name);
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localCrc = buffer.readUInt32LE(localOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localOffset + 18);
    const localSize = buffer.readUInt32LE(localOffset + 22);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localName = buffer.toString('utf8', localOffset + 30, localOffset + 30 + localNameLength);
    if (localName !== name || localMethod !== method || localFlags !== flags) fail('ZIP local/central header mismatch: ' + name);
    if ((flags & 0x8) === 0 && (localCrc !== crc || localCompressedSize !== compressedSize || localSize !== uncompressedSize)) fail('ZIP local sizes/CRC mismatch: ' + name);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > cdOffset || dataEnd < dataStart) fail('ZIP entry data is out of bounds: ' + name);
    const compressed = buffer.subarray(dataStart, dataEnd);
    let data;
    try { data = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_FILE_BYTES }); }
    catch (error) { fail('Cannot decompress ZIP entry ' + name + ': ' + error.message); }
    if (data.length !== uncompressedSize || crc32(data) !== crc) fail('ZIP entry integrity check failed: ' + name);
    output.set(cleanName, data);
    totalBytes += data.length;
    position = next;
  }
  if (position !== cdOffset + cdSize) fail('ZIP central-directory size does not match its entries');
  return output;
}
function readPackDirectory(directory) {
  const abs = path.resolve(directory);
  const rootStat = fs.lstatSync(abs);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('Pack directory must be a real directory');
  const result = new Map();
  let total = 0;
  function walk(current, relative) {
    for (const name of fs.readdirSync(current)) {
      const child = path.join(current, name);
      const rel = relative ? relative + '/' + name : name;
      if (!safePath(rel)) fail('Unsafe path in pack directory: ' + rel);
      const stat = fs.lstatSync(child);
      if (stat.isSymbolicLink()) fail('Symlink in pack directory: ' + rel);
      if (stat.isDirectory()) { walk(child, rel); continue; }
      if (!stat.isFile()) fail('Special file in pack directory: ' + rel);
      if (result.size >= MAX_FILES) fail('Pack contains too many files');
      if (stat.size > MAX_FILE_BYTES) fail('Pack file is too large: ' + rel);
      total += stat.size;
      if (total > MAX_TOTAL_BYTES) fail('Pack exceeds total size limit');
      result.set(rel, fs.readFileSync(child));
    }
  }
  walk(abs, '');
  return result;
}
function loadPack(input) {
  const stat = fs.lstatSync(input);
  if (stat.isSymbolicLink()) fail('Pack input must not be a symlink');
  if (stat.isDirectory()) return readPackDirectory(input);
  if (!stat.isFile()) fail('Pack input must be a ZIP file or directory');
  if (path.extname(input).toLowerCase() !== '.zip') fail('Pack file must use the .zip extension');
  return readZip(fs.readFileSync(input));
}
function imageMagic(data, extension) {
  if (extension === 'webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (extension === 'avif') return data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(data.toString('ascii', 8, 12));
  return false;
}
function imageWidth(data, extension) {
  if (extension === 'webp' && data.length >= 30) {
    const format = data.toString('ascii', 12, 16);
    if (format === 'VP8X') return 1 + (data[24] | (data[25] << 8) | (data[26] << 16));
    if (format === 'VP8 ') return data.readUInt16LE(26) & 0x3fff;
    if (format === 'VP8L') return 1 + (((data[22] << 8) | data[21]) & 0x3fff);
  }
  if (extension === 'avif') {
    let offset = data.indexOf(Buffer.from('ispe'));
    while (offset >= 0 && offset + 16 <= data.length) {
      const width = data.readUInt32BE(offset + 8);
      if (width > 0) return width;
      offset = data.indexOf(Buffer.from('ispe'), offset + 4);
    }
  }
  return null;
}
function assetPathFor(typeConfig, slug) {
  return typeConfig.assetDirectory.replace('{slug}', slug).replace('{category}', slug).replace(/\/+$/, '');
}
function recordPathFor(typeConfig, slug) { return typeConfig.recordDirectory.replace(/\/+$/, '') + '/' + slug + '.json'; }
function schemaPathFor(type) { return 'content/schemas/' + TYPES[type]; }
function collectAssetReferences(value, output, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectAssetReferences(entry, output, location + '[' + index + ']'));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const at = location + '.' + key;
    if (['image', 'src', 'heroImage', 'ogImage'].includes(key) && typeof child === 'string') {
      if (!child.startsWith('assets/')) fail('Image field must use a local assets/ path at ' + at);
      if (!safePath(child)) fail('Unsafe image path at ' + at + ': ' + child);
      output.set(child, at);
    } else {
      collectAssetReferences(child, output, at);
    }
  }
}
function expectedRoleFromPath(slug, relativePath) {
  const base = path.posix.basename(relativePath);
  const match = new RegExp('^' + slug + '-(hero|step|gallery|detail|og)-([0-9]{2})\\.(webp|avif)$').exec(base);
  return match ? match[1] : null;
}
function checkAssetFile(type, slug, relativePath, role, data, registry) {
  const imageRoot = assetPathFor(registry.contentTypes[type], slug) + '/';
  if (!relativePath.startsWith(imageRoot)) fail('Asset path is outside the registry-approved folder: ' + relativePath);
  const expected = expectedRoleFromPath(slug, relativePath);
  if (!expected) fail('Image filename must be ' + slug + '-<role>-<nn>.webp|avif: ' + relativePath);
  if (role !== expected) fail('Manifest image role does not match filename role for ' + relativePath);
  const extension = path.posix.extname(relativePath).slice(1);
  if (!(registry.imageFormats || []).includes(extension)) fail('Unsupported image format for ' + relativePath);
  if (!imageMagic(data, extension)) fail('File contents do not match image extension: ' + relativePath);
  const limits = registry.imageLimits || {};
  const roleLimits = expected === 'hero' ? limits.hero : limits.supporting;
  if (!roleLimits) fail('Missing image size policy in content/paths.json');
  if (data.length > roleLimits.maxBytes) fail(relativePath + ' exceeds the ' + roleLimits.maxBytes + '-byte limit');
  const width = imageWidth(data, extension);
  if (width === null) fail('Cannot verify image width from the file header: ' + relativePath);
  if (width > roleLimits.maxWidth) fail(relativePath + ' is ' + width + ' px wide; limit is ' + roleLimits.maxWidth + ' px');
}

function inspectPack(input, options = {}) {
  const root = path.resolve(options.root || ROOT);
  const findings = [];
  const add = message => findings.push({ message });
  let files;
  let registry;
  try {
    files = typeof input === 'string' ? loadPack(input) : input;
    if (!(files instanceof Map)) fail('Pack must be a ZIP path, directory path or Map of file buffers');
    registry = readJson(root, 'content/paths.json');
  } catch (error) { return { ok: false, dryRun: true, findings: [{ message: error.message }], operations: [] }; }
  if (!files.has('pack.json')) return { ok: false, dryRun: true, findings: [{ message: 'pack.json must be at the pack root (not nested)' }], operations: [] };
  let manifest;
  try { manifest = JSON.parse(files.get('pack.json').toString('utf8')); }
  catch (_) { return { ok: false, dryRun: true, findings: [{ message: 'pack.json is not valid JSON' }], operations: [] }; }
  if (!manifest || manifest.version !== 1 || !/^[A-Za-z0-9_.-]{6,80}$/.test(String(manifest.pack_id || '')) ||
      !validDate(manifest.created) || !Array.isArray(manifest.entries) || manifest.entries.length < 1 || manifest.entries.length > MAX_ENTRIES) {
    return { ok: false, dryRun: true, findings: [{ message: 'Manifest requires version 1, a safe pack_id, created date and 1–50 entries' }], operations: [] };
  }
  for (const name of files.keys()) {
    if (META_FILES.has(name)) continue;
    if (!safePath(name)) add('Unsafe path in pack: ' + name);
    if (files.get(name).length > MAX_FILE_BYTES) add('File exceeds maximum size: ' + name);
  }
  const declared = new Map();
  const entryIds = new Set();
  for (const entry of manifest.entries) {
    if (!entry || !Object.prototype.hasOwnProperty.call(TYPES, entry.type) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(entry.slug || '')) ||
        !['new', 'update', 'sync'].includes(entry.mode) || !Array.isArray(entry.files) || entry.files.length < 1) {
      add('Each entry requires a known type, kebab-case slug, mode new/update/sync and a files array');
      continue;
    }
    const id = entry.type + ':' + entry.slug;
    if (entryIds.has(id)) { add('Duplicate content entry: ' + id); continue; }
    entryIds.add(id);
    const typeConfig = registry.contentTypes[entry.type];
    if (!typeConfig) { add('Content registry is missing type: ' + entry.type); continue; }
    if (entry.type === 'gallery' && !(typeConfig.categories || []).includes(entry.slug)) {
      add('Gallery category is not allowlisted by content/paths.json: ' + entry.slug);
      continue;
    }
    const recPath = recordPathFor(typeConfig, entry.slug);
    const imageRoot = assetPathFor(typeConfig, entry.slug) + '/';
    let recordFileCount = 0;
    const entryFiles = [];
    for (const file of entry.files) {
      if (!file || !safePath(file.path) || !Number.isInteger(file.bytes) || file.bytes < 1 ||
          !/^[a-f0-9]{64}$/.test(String(file.sha256 || '')) ||
          !Object.prototype.hasOwnProperty.call(file, 'prior_sha256') ||
          (file.prior_sha256 !== null && !/^[a-f0-9]{64}$/.test(String(file.prior_sha256)))) {
        add('Invalid file manifest entry in ' + id);
        continue;
      }
      if (declared.has(file.path)) { add('Duplicate path declared by pack: ' + file.path); continue; }
      declared.set(file.path, { file, entry, recPath, imageRoot });
      const data = files.get(file.path);
      if (!data) { add('Manifest-listed file is missing: ' + file.path); continue; }
      if (data.length !== file.bytes || sha256(data) !== file.sha256) { add('Size/SHA-256 mismatch: ' + file.path); continue; }
      if (file.path === recPath) {
        recordFileCount += 1;
        if (file.role !== 'record') add('Record file must use role record: ' + file.path);
      } else if (file.path.startsWith(imageRoot)) {
        const imageRole = expectedRoleFromPath(entry.slug, file.path);
        if (!imageRole || file.role !== imageRole) add('Asset path or role is not allowed for ' + id + ': ' + file.path);
        else {
          try { checkAssetFile(entry.type, entry.slug, file.path, file.role, data, registry); }
          catch (error) { add(error.message); }
        }
      } else {
        add('Pack path is not allowed for ' + id + ': ' + file.path);
      }
      entryFiles.push({ path: file.path, role: file.role, bytes: file.bytes, sha256: file.sha256, prior_sha256: file.prior_sha256, data });
    }
    if (recordFileCount !== 1) add('Entry must declare exactly one record file at ' + recPath);
    const pagePath = entry.type !== 'gallery' && typeConfig.outputDirectory ? typeConfig.outputDirectory + '/' + entry.slug + (typeConfig.outputExtension || '.html') : null;
    const recordCurrent = locate(root, recPath);
    if (entry.mode === 'new' && recordCurrent.exists) add('New record already exists: ' + recPath);
    if (entry.mode !== 'new' && !recordCurrent.exists) add('Update/sync requires an existing draft record: ' + recPath);
    if (entry.mode === 'new' && pagePath && locate(root, pagePath).exists) add('A public page already exists for this slug: ' + pagePath);
    if (recordCurrent.exists) {
      let currentRecord;
      try { currentRecord = JSON.parse(recordCurrent.data.toString('utf8')); } catch (_) { currentRecord = null; }
      if (!currentRecord || currentRecord.status !== 'draft') add('Only existing draft records may be updated: ' + recPath);
    }
    for (const item of entryFiles) {
      const current = locate(root, item.path);
      if (entry.mode === 'new' && current.exists) add('New pack cannot overwrite an existing file: ' + item.path);
      else if (current.exists && item.prior_sha256 !== sha256(current.data)) add('Stale base hash for existing file: ' + item.path);
      else if (!current.exists && item.prior_sha256 !== null) add('prior_sha256 must be null for a new destination: ' + item.path);
      if (entry.mode !== 'new' && current.exists && !/^[a-f0-9]{64}$/.test(String(item.prior_sha256 || ''))) add('Update file needs an exact prior_sha256: ' + item.path);
    }
    const recordBytes = files.get(recPath);
    if (recordBytes) {
      let record;
      try { record = JSON.parse(recordBytes.toString('utf8')); }
      catch (_) { record = null; add('Content record is invalid JSON: ' + recPath); }
      if (record) {
        const actualKey = entry.type === 'gallery' ? record.category : record.slug;
        if (actualKey !== entry.slug) add('Record identity does not match the manifest entry: ' + recPath);
        if (record.status !== 'draft' || entry.status !== 'draft') add('Imported records and manifest entries must both remain draft: ' + recPath);
        let schema;
        try { schema = readJson(root, schemaPathFor(entry.type)); }
        catch (error) { add(error.message); }
        if (schema) for (const issue of validateAgainstSchema(schema, record, recPath)) add('Schema ' + issue.path + ': ' + issue.message);
        const refs = new Map();
        try { collectAssetReferences(record, refs, recPath); }
        catch (error) { add(error.message); }
        const imagePaths = new Set(entryFiles.filter(item => item.path.startsWith(imageRoot)).map(item => item.path));
        for (const asset of refs.keys()) {
          if (!asset.startsWith(imageRoot)) add('Image reference is outside its registry-approved folder: ' + asset);
          const packed = files.has(asset) && imagePaths.has(asset);
          const existing = locate(root, asset);
          if (!packed && !existing.exists) add('Image referenced by record is missing from pack and repository: ' + asset);
        }
        for (const asset of imagePaths) if (!refs.has(asset)) add('Pack includes an unreferenced image: ' + asset);
      }
    }
  }
  for (const name of files.keys()) {
    if (META_FILES.has(name)) continue;
    if (!declared.has(name)) add('Unlisted file is not permitted in pack: ' + name);
  }
  const operations = [];
  for (const [relative, info] of declared) {
    const current = locate(root, relative);
    operations.push({
      op: !current.exists ? 'create' : (sha256(current.data) === info.file.sha256 ? 'unchanged' : 'update'),
      path: relative, bytes: info.file.bytes, sha256: info.file.sha256, prior_sha256: info.file.prior_sha256,
      _data: files.get(relative)
    });
  }
  return {
    ok: findings.length === 0, dryRun: true, packId: manifest.pack_id, findings, operations,
    root,
    sitemapSha256: (() => { const s = locate(root, 'sitemap.xml'); return s.exists ? sha256(s.data) : null; })()
  };
}
function applyPack(input, options = {}) {
  const root = path.resolve(options.root || ROOT);
  const dryRun = options.dryRun !== false;
  const checked = inspectPack(input, { root });
  if (!checked.ok || dryRun) return { ...checked, dryRun, operations: checked.operations.map(({ _data, ...op }) => op) };
  const backups = [];
  try {
    for (const operation of checked.operations) {
      if (operation.op === 'unchanged') continue;
      const before = locate(root, operation.path);
      backups.push({ path: operation.path, data: before.exists ? before.data : null });
      atomicWrite(root, operation.path, operation._data);
    }
    const validation = validateRepository(root);
    if (!validation.ok) fail('Post-apply content validation failed: ' + validation.findings.map(f => f.path + ': ' + f.message).join('; '));
    buildContentPages(root, { write: false });
    const sitemap = locate(root, 'sitemap.xml');
    if (checked.sitemapSha256 !== null && (!sitemap.exists || sha256(sitemap.data) !== checked.sitemapSha256)) fail('Pack apply unexpectedly changed sitemap.xml; transaction rolled back');
  } catch (error) {
    for (const backup of backups.reverse()) {
      try {
        if (backup.data === null) {
          const target = resolveInside(root, backup.path);
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } else atomicWrite(root, backup.path, backup.data);
      } catch (_) {}
    }
    return { ok: false, dryRun: false, packId: checked.packId, findings: [{ message: 'Apply failed and file changes were rolled back: ' + error.message }], operations: checked.operations.map(({ _data, ...op }) => op) };
  }
  return { ok: true, dryRun: false, packId: checked.packId, findings: [], operations: checked.operations.map(({ _data, ...op }) => op) };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const input = args.find(arg => !arg.startsWith('--'));
  const jsonOutput = args.includes('--json');
  const doApply = args.includes('--apply');
  const unknown = args.filter(arg => arg.startsWith('--') && !['--apply', '--json'].includes(arg));
  let result;
  if (!input || unknown.length) result = { ok: false, dryRun: !doApply, findings: [{ message: 'Usage: node scripts/import-content-pack.js <pack.zip|directory> [--apply] [--json]' }], operations: [] };
  else {
    try { result = applyPack(input, { dryRun: !doApply }); }
    catch (error) { result = { ok: false, dryRun: !doApply, findings: [{ message: error.message }], operations: [] }; }
  }
  if (jsonOutput) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.ok ? (result.dryRun ? 'PACK OK (dry run). No files were written:' : 'PACK APPLIED. Draft-only files written:') : 'PACK REJECTED:');
    for (const finding of result.findings || []) console.log('  - ' + finding.message);
    for (const operation of result.operations || []) console.log('  ' + operation.op.padEnd(9) + operation.path + ' (' + operation.bytes + ' bytes)');
  }
  process.exitCode = result.ok ? 0 : 1;
}
module.exports = { applyPack, inspectPack, readZip, sha256, crc32, MAX_FILE_BYTES, MAX_TOTAL_BYTES };
