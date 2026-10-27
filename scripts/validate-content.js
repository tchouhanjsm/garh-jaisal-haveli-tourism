#!/usr/bin/env node
'use strict';

// Local-only validator for the static site's content registry and draft records.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = Object.freeze({
  tour: { schema: 'tour.schema.json' },
  blog: { schema: 'blog.schema.json' },
  gallery: { schema: 'gallery.schema.json' },
});

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value)) return false;
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function matchesType(type, value) {
  if (Array.isArray(type)) return type.some(candidate => matchesType(candidate, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'string') return typeof value === 'string';
  return true;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

// Supports the subset of JSON Schema used by the checked-in tour/blog/gallery schemas.
function validateAgainstSchema(schema, value, location = '$') {
  const findings = [];
  const add = (message, at = location) => findings.push({ path: at, message });
  if (schema.type && !matchesType(schema.type, value)) {
    add('expected type ' + (Array.isArray(schema.type) ? schema.type.join('|') : schema.type));
    return findings;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) add('must equal ' + JSON.stringify(schema.const));
  if (schema.enum && !schema.enum.includes(value)) add('must be one of: ' + schema.enum.join(', '));
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) add('must have at least ' + schema.minLength + ' characters');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) add('must have at most ' + schema.maxLength + ' characters');
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) add('does not match required pattern');
    if (schema.format === 'date' && !isValidDate(value)) add('must be a real YYYY-MM-DD date');
    if (schema.format === 'uri' && !isValidHttpUrl(value)) add('must be an absolute HTTP(S) URL');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) add('must be at least ' + schema.minimum);
    if (schema.maximum !== undefined && value > schema.maximum) add('must be at most ' + schema.maximum);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) add('must contain at least ' + schema.minItems + ' items');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) add('must contain at most ' + schema.maxItems + ' items');
    if (schema.items) value.forEach((entry, index) => findings.push(...validateAgainstSchema(schema.items, entry, location + '[' + index + ']')));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of (schema.required || [])) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) add('missing required property: ' + required);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties || !Object.prototype.hasOwnProperty.call(schema.properties, key)) add('unexpected property: ' + key, location + '.' + key);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) findings.push(...validateAgainstSchema(childSchema, value[key], location + '.' + key));
    }
  }
  return findings;
}

function readJson(filePath, findings, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    findings.push({ path: label || filePath, message: 'cannot read valid JSON: ' + error.message });
    return null;
  }
}

function isInsideRoot(root, relative) {
  if (!safeRelativePath(relative)) return false;
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relative);
  const rel = path.relative(absoluteRoot, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map(entry => entry.name)
    .sort();
}

function visitAssetPaths(value, location, root, findings) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitAssetPaths(item, location + '[' + index + ']', root, findings));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = location + '.' + key;
    if (['image', 'src', 'heroImage', 'ogImage'].includes(key) && typeof child === 'string' && child.startsWith('assets/')) {
      if (!safeRelativePath(child) || !isInsideRoot(root, child)) {
        findings.push({ path: childLocation, message: 'unsafe asset path' });
        continue;
      }
      const absolute = path.resolve(root, child);
      let stat;
      try { stat = fs.lstatSync(absolute); } catch (_) { stat = null; }
      if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        findings.push({ path: childLocation, message: 'referenced local asset is missing, not a regular file, or is a symlink: ' + child });
      }
    } else {
      visitAssetPaths(child, childLocation, root, findings);
    }
  }
}

function validateRecordPolicy(type, record, root, registry, siteConfig, findings, sourcePath) {
  const status = record.status;
  const slug = type === 'gallery' ? record.category : record.slug;
  if (type !== 'gallery' && (!slug || path.basename(sourcePath) !== slug + '.json')) {
    findings.push({ path: sourcePath, message: 'filename must match the record slug' });
  }
  if (type === 'gallery' && path.basename(sourcePath) !== record.category + '.json') {
    findings.push({ path: sourcePath, message: 'gallery manifest filename must match its category' });
  }
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    findings.push({ path: sourcePath, message: 'record slug/category must be lowercase kebab-case before deriving paths' });
    return;
  }
  if ((type === 'tour' || type === 'blog') && record.seo && record.seo.ogImage
      && (typeof record.seo.ogAlt !== 'string' || record.seo.ogAlt.trim().length < 5)) {
    findings.push({
      path: sourcePath + '.seo.ogAlt',
      message: 'seo.ogImage requires meaningful seo.ogAlt text',
    });
  }
  if (type === 'tour' && status === 'live') {
    if (record.factsConfirmed !== true) findings.push({ path: sourcePath, message: 'live tour requires factsConfirmed: true' });
    if (!record.lastVerified || !isValidDate(record.lastVerified)) findings.push({ path: sourcePath, message: 'live tour requires a valid lastVerified date' });
  }
  if (type === 'blog' && status === 'live' && (!record.lastReviewed || !isValidDate(record.lastReviewed))) {
    findings.push({ path: sourcePath, message: 'live article requires a valid lastReviewed date' });
  }
  if (type === 'gallery') {
    if (status === 'live') {
      for (const [index, image] of (record.images || []).entries()) {
        if (image.approved !== true) findings.push({ path: sourcePath + '.images[' + index + ']', message: 'live gallery images must be owner-approved' });
      }
    }
    visitAssetPaths(record, '$', root, findings);
    return;
  }

  const typeConfig = registry.contentTypes[type];
  if (!typeConfig) {
    findings.push({ path: 'content/paths.json', message: 'missing registry config for content type: ' + type });
    return;
  }
  if (!safeRelativePath(typeConfig.outputDirectory) || typeConfig.outputExtension !== '.html') {
    findings.push({ path: 'content/paths.json', message: type + ' output route configuration is unsafe or unsupported' });
    return;
  }
  const publicPath = path.posix.join(typeConfig.outputDirectory, slug + typeConfig.outputExtension);
  if (status !== 'live' && fs.existsSync(path.resolve(root, publicPath))) {
    findings.push({ path: publicPath, message: 'draft/hidden record has a public output file' });
  }
  if (status === 'live') {
    const site = siteConfig.site || {};
    if (site.canonicalHostApproved !== true) findings.push({ path: 'content/site-config.json', message: 'live content requires owner approval of the canonical host' });
    if (!fs.existsSync(path.resolve(root, publicPath))) findings.push({ path: publicPath, message: 'live record has no generated public page' });
    const sitemapPath = path.resolve(root, 'sitemap.xml');
    const canonicalHost = String(site.newStaticSiteCanonicalHost || '').replace(/\/+$/, '');
    if (!fs.existsSync(sitemapPath) || !fs.readFileSync(sitemapPath, 'utf8').includes(canonicalHost + '/' + publicPath)) {
      findings.push({ path: 'sitemap.xml', message: 'live content URL is missing from sitemap.xml' });
    }
  }
  visitAssetPaths(record, '$', root, findings);
}

function validateRepository(root = ROOT) {
  const findings = [];
  const registry = readJson(path.resolve(root, 'content/paths.json'), findings, 'content/paths.json');
  const siteConfig = readJson(path.resolve(root, 'content/site-config.json'), findings, 'content/site-config.json');
  if (!registry || !siteConfig) return { ok: false, findings, records: 0, schemas: 0 };
  if (registry.schemaVersion !== 1) findings.push({ path: 'content/paths.json', message: 'unsupported schemaVersion' });
  if (!registry.site || registry.site.engine !== 'static-html') findings.push({ path: 'content/paths.json', message: 'site.engine must be static-html' });
  if (!siteConfig.verificationStatus) findings.push({ path: 'content/site-config.json', message: 'verificationStatus must be explicit' });

  for (const assetPath of [registry.site && registry.site.sharedStylesheet, registry.site && registry.site.sharedScript]) {
    if (!safeRelativePath(assetPath) || !isInsideRoot(root, assetPath) || !fs.existsSync(path.resolve(root, assetPath))) {
      findings.push({ path: 'content/paths.json', message: 'shared asset path is invalid or missing: ' + assetPath });
    }
  }

  let schemaCount = 0;
  let recordCount = 0;
  for (const [type, info] of Object.entries(TYPES)) {
    const typeConfig = registry.contentTypes && registry.contentTypes[type];
    if (!typeConfig) {
      findings.push({ path: 'content/paths.json', message: 'missing content type: ' + type });
      continue;
    }
    let safePaths = true;
    for (const field of ['recordDirectory', 'assetDirectory']) {
      if (!safeRelativePath(typeConfig[field])) {
        findings.push({ path: 'content/paths.json', message: type + '.' + field + ' is not a safe repository-relative path' });
        safePaths = false;
      }
    }
    if (type !== 'gallery' && (!safeRelativePath(typeConfig.outputDirectory) || typeConfig.outputExtension !== '.html')) {
      findings.push({ path: 'content/paths.json', message: type + ' output route configuration is unsafe or unsupported' });
      safePaths = false;
    }
    if (!safePaths) continue;

    const recordDirectory = path.resolve(root, typeConfig.recordDirectory);
    if (!fs.existsSync(recordDirectory) || !fs.statSync(recordDirectory).isDirectory()) {
      findings.push({ path: typeConfig.recordDirectory, message: 'record directory is missing' });
      continue;
    }
    const schemaRelative = path.posix.join('content/schemas', info.schema);
    const schema = readJson(path.resolve(root, schemaRelative), findings, schemaRelative);
    if (schema) schemaCount += 1;
    for (const name of listJsonFiles(recordDirectory)) {
      const relative = path.posix.join(typeConfig.recordDirectory, name);
      const record = readJson(path.resolve(root, relative), findings, relative);
      if (!record || !schema) continue;
      recordCount += 1;
      findings.push(...validateAgainstSchema(schema, record, relative));
      validateRecordPolicy(type, record, root, registry, siteConfig, findings, relative);
    }
  }
  for (const type of Object.keys(registry.contentTypes || {})) {
    if (!Object.prototype.hasOwnProperty.call(TYPES, type)) findings.push({ path: 'content/paths.json', message: 'unsupported content type: ' + type });
  }
  return { ok: findings.length === 0, findings, records: recordCount, schemas: schemaCount };
}

if (require.main === module) {
  const result = validateRepository();
  for (const finding of result.findings) console.error('FAIL ' + finding.path + ': ' + finding.message);
  if (!result.ok) {
    console.error('Content contract failed: ' + result.findings.length + ' finding(s).');
    process.exitCode = 1;
  } else {
    console.log('PASS: content contract; ' + result.schemas + ' schema(s), ' + result.records + ' record(s).');
    if (result.records === 0) console.log('NOTE: no tour/blog/gallery records exist yet; validation covered the registry and schema files only.');
  }
}

module.exports = { safeRelativePath, validateAgainstSchema, validateRepository, validateRecordPolicy };
