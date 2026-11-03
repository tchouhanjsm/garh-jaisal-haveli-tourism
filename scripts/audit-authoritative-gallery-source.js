#!/usr/bin/env node
'use strict';

/**
 * Read-only audit of the authoritative website's managed gallery.
 *
 * A CMS record marked "live" is a publication flag, not proof of image
 * ownership, licensing, visual match, or technical approval. This audit
 * compares the pinned and current source snapshots and reports which records
 * remain ineligible for tourism-site media use. It never imports or approves.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SOURCE_REPOSITORY = 'https://github.com/tchouhanjsm/garh-jaisal-website';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const CATEGORIES = new Set(['hotel', 'rooms', 'desert', 'restaurant']);
const PUBLICATION_STATES = new Set(['draft', 'live', 'hidden']);
const CROPS = new Set(['standard', 'arch', 'landscape', 'portrait']);
const REQUIRED_EVIDENCE_SCHEMA_PATHS = [
  'status',
  'review_status',
  'sourceEvidence',
  'sourceEvidence.status',
  'sourceEvidence.creator',
  'sourceEvidence.sourceUrl',
  'sourceEvidence.licenseName',
  'sourceEvidence.evidenceReference',
  'sourceEvidence.verifiedBy',
  'sourceEvidence.verifiedAt',
  'visualReview',
  'visualReview.status',
  'visualReview.evidence',
  'visualReview.reviewer',
  'visualReview.reviewedAt',
  'technicalValidation',
  'technicalValidation.status',
  'technicalValidation.evidenceReference',
];

const PAGE_MEDIA_SLOT_DEFINITIONS = Object.freeze({
  home: [
    'home-hero-mobile', 'home-hero-desktop', 'home-heritage-intro',
    'home-rooftop-feature', 'home-desert-safari-feature', 'home-swiss-tent-feature',
    'home-sleep-under-stars-feature', 'home-city-discovery-feature',
    'home-gallery-city', 'home-gallery-courtyard', 'home-gallery-reception',
    'home-gallery-rooftop', 'home-gallery-entrance',
  ],
  rooms: [
    'rooms-hero', 'room-sweet-purple-room-primary', 'room-rising-sun-room-primary',
    'room-scarlet-room-primary', 'room-opium-room-primary', 'room-red-maharani-room-primary',
    'room-green-room-primary', 'room-bluesky-room-primary',
  ],
  dining: ['dining-hero'],
  experiences: [
    'experience-desert-safari-hero', 'experience-guided-jaisalmer-tour-hero',
    'experience-sunset-camel-safari-hero', 'experience-sleep-under-the-stars-hero',
    'experience-swiss-tent-safari-hero', 'experience-cultural-safari-hero',
    'experience-explore-the-desert-hero', 'experience-half-day-jaisalmer-tour-hero',
    'experience-full-day-jaisalmer-tour-hero', 'experience-longewala-tour-hero',
    'experience-rajasthan-tours-hero',
  ],
});
const PAGE_MEDIA_APPROVAL_FIELDS = [
  'status', 'source_credit', 'rights_basis', 'visual_match_review',
  'alt_text_review', 'technical_validation', 'asset_sha256',
  'approved_by', 'approved_at', 'signature',
];
const PAGE_MEDIA_APPROVAL_STATES = ['pending', 'approved', 'rejected', 'revoked'];

function nonEmpty(value, minimum = 2) {
  return typeof value === 'string' && value.trim().length >= minimum;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function realDirectory(directory, label) {
  const absolute = path.resolve(directory);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(label + ' must be an existing non-symlink directory: ' + directory);
  }
  return fs.realpathSync(absolute);
}

function safeImageBytes(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.startsWith('/')) {
    throw new Error('Gallery image path must be a safe repository-relative path: ' + String(relative));
  }
  const segments = relative.split('/');
  if (segments[0] !== 'img' || segments.some(part => !part || part === '.' || part === '..')) {
    throw new Error('Gallery image path must stay inside the authoritative img/ tree: ' + relative);
  }
  if (!IMAGE_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
    throw new Error('Gallery image uses an unsupported extension: ' + relative);
  }

  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Gallery image path contains a symlink: ' + relative);
  }
  const stat = fs.statSync(current);
  const real = fs.realpathSync(current);
  if (!stat.isFile() || !isWithin(root, real) || stat.size < 1 || stat.size > 50 * 1024 * 1024) {
    throw new Error('Gallery image must be a bounded, regular file inside the source repository: ' + relative);
  }
  const bytes = fs.readFileSync(real);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const gitBlobSha = crypto.createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + '\0', 'utf8'))
    .update(bytes)
    .digest('hex');
  return { bytes: bytes.length, sha256, gitBlobSha };
}

function decodeGalleryImages(root, records) {
  const imagePaths = [...new Set(records.map(record => record.imagePath).filter(Boolean))].sort();
  if (!imagePaths.length) return new Map();

  const helperPath = path.join(__dirname, 'decode-media-assets.py');
  const result = spawnSync(process.env.PYTHON || 'python3', [helperPath, root], {
    input: JSON.stringify(imagePaths.map(imagePath => ({ path: imagePath }))),
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error) throw new Error('Gallery image decoder could not start: ' + result.error.message);
  if (result.status !== 0) {
    throw new Error('Gallery image decoder failed: ' + String(result.stderr || result.stdout || 'unknown error').trim());
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('Gallery image decoder returned invalid JSON: ' + error.message);
  }
  if (!report || report.ok !== true || !Array.isArray(report.results)) {
    throw new Error('Gallery image decoder did not return a valid result set.');
  }

  const expected = new Set(imagePaths);
  const decoded = new Map();
  for (const item of report.results) {
    if (!item || typeof item.path !== 'string' || !expected.has(item.path) || decoded.has(item.path)) {
      throw new Error('Gallery image decoder returned an unexpected or duplicate image path.');
    }
    if (item.status === 'verified') {
      if (!Number.isInteger(item.width) || item.width < 1 ||
          !Number.isInteger(item.height) || item.height < 1 ||
          !/^[a-f0-9]{64}$/i.test(item.sha256 || '')) {
        throw new Error('Gallery image decoder returned incomplete verification for ' + item.path + '.');
      }
    } else if (item.status !== 'failed') {
      throw new Error('Gallery image decoder returned an unknown status for ' + item.path + '.');
    }
    decoded.set(item.path, item);
  }
  for (const imagePath of expected) {
    if (!decoded.has(imagePath)) throw new Error('Gallery image decoder omitted ' + imagePath + '.');
  }
  return decoded;
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + stableStringify(value[key])
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseStrictCmsYaml(source) {
  const helperPath = path.join(__dirname, 'parse-strict-cms-yaml.py');
  const result = spawnSync(process.env.PYTHON || 'python3', [helperPath], {
    input: source,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error) throw new Error('Strict CMS YAML parser could not start: ' + result.error.message);

  let report;
  try {
    report = JSON.parse(result.stdout || '');
  } catch (error) {
    throw new Error('Strict CMS YAML parser returned invalid JSON: ' +
      String(result.stderr || result.stdout || error.message).trim());
  }
  if (result.status !== 0 || !report || report.ok !== true) {
    const error = new Error(report && report.error
      ? report.error
      : String(result.stderr || 'CMS YAML validation failed.').trim());
    error.duplicatePaths = report && Array.isArray(report.duplicatePaths)
      ? report.duplicatePaths
      : [];
    throw error;
  }
  return report.data;
}

function parseSchemaFieldList(items, parentPath, schemaViolations, duplicateFieldPaths) {
  const fields = new Map();
  if (!Array.isArray(items)) {
    schemaViolations.push(parentPath + ' must be a YAML sequence of field mappings.');
    return fields;
  }

  items.forEach((raw, index) => {
    if (!isRecord(raw)) {
      schemaViolations.push(parentPath + '[' + index + '] must be a field mapping.');
      return;
    }
    if (typeof raw.name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw.name)) {
      schemaViolations.push(parentPath + '[' + index + '].name must be a supported field identifier.');
      return;
    }

    const fieldPath = parentPath + '.' + raw.name;
    if (fields.has(raw.name)) {
      duplicateFieldPaths.push(fieldPath.startsWith('gallery.')
        ? fieldPath.slice('gallery.'.length)
        : fieldPath);
      return;
    }

    const children = new Map();
    if (raw.widget === 'object') {
      if (!Array.isArray(raw.fields)) {
        schemaViolations.push(fieldPath + '.fields must be a YAML sequence.');
      } else {
        for (const [name, child] of parseSchemaFieldList(
          raw.fields, fieldPath, schemaViolations, duplicateFieldPaths
        )) {
          children.set(name, child);
        }
      }
    } else if (Object.prototype.hasOwnProperty.call(raw, 'fields')) {
      schemaViolations.push(fieldPath + '.fields is only valid for object widgets.');
    }

    const options = [];
    const optionValues = new Set();
    const optionLabels = new Set();
    if (raw.options !== undefined) {
      if (!Array.isArray(raw.options)) {
        schemaViolations.push(fieldPath + '.options must be a YAML sequence.');
      } else {
        raw.options.forEach((option, optionIndex) => {
          if (!isRecord(option) ||
              typeof option.label !== 'string' || !option.label.trim() ||
              typeof option.value !== 'string' || !option.value.trim()) {
            schemaViolations.push(
              fieldPath + '.options[' + optionIndex + '] must contain non-empty string label and value.'
            );
            return;
          }
          if (optionValues.has(option.value)) {
            schemaViolations.push(fieldPath + '.options contains duplicate value: ' + option.value + '.');
          } else {
            optionValues.add(option.value);
          }
          if (optionLabels.has(option.label)) {
            schemaViolations.push(fieldPath + '.options contains duplicate label: ' + option.label + '.');
          } else {
            optionLabels.add(option.label);
          }
          options.push(option.value);
        });
      }
    }

    const patterns = [];
    if (raw.pattern !== undefined) {
      if (!Array.isArray(raw.pattern)) {
        schemaViolations.push(fieldPath + '.pattern must be a YAML sequence.');
      } else {
        raw.pattern.forEach((pattern, patternIndex) => {
          if (typeof pattern !== 'string') {
            schemaViolations.push(fieldPath + '.pattern[' + patternIndex + '] must be a string.');
          } else {
            patterns.push(pattern);
          }
        });
      }
    }

    fields.set(raw.name, {
      widget: typeof raw.widget === 'string' ? raw.widget : null,
      required: typeof raw.required === 'string'
        ? raw.required
        : (typeof raw.required === 'boolean' ? String(raw.required) : null),
      defaultValue: typeof raw.default === 'string' ? raw.default : null,
      options,
      patterns,
      children,
    });
  });

  return fields;
}

function gallerySchemaFields(root, errors) {
  const configPath = path.join(root, 'admin', 'config.yml');
  const unavailable = (reason, details = {}) => ({
    available: false,
    fields: [],
    missing: REQUIRED_EVIDENCE_SCHEMA_PATHS.slice(),
    safeDefaults: false,
    defaultViolations: [],
    schemaViolations: [reason],
    collectionValid: false,
    collectionContractViolations: [reason],
    duplicateFieldPaths: Array.isArray(details.duplicateFieldPaths)
      ? details.duplicateFieldPaths
      : [],
    duplicatePropertyPaths: Array.isArray(details.duplicatePropertyPaths)
      ? details.duplicatePropertyPaths
      : [],
    supportsRequiredEvidence: false,
  });

  if (!fs.existsSync(configPath)) return unavailable('admin/config.yml is missing');
  const stat = fs.lstatSync(configPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    errors.push('admin/config.yml must be a regular file before CMS schema can be audited.');
    return unavailable('admin/config.yml is not a regular file');
  }
  if (stat.size < 1 || stat.size > 2 * 1024 * 1024) {
    return unavailable('admin/config.yml must be a non-empty file no larger than 2 MiB');
  }

  // Preserve the original bytes so the strict parser can reject invalid UTF-8.
  const config = fs.readFileSync(configPath);
  let parsedConfig;
  try {
    parsedConfig = parseStrictCmsYaml(config);
  } catch (error) {
    return unavailable(
      'admin/config.yml YAML validation failed: ' + error.message,
      { duplicatePropertyPaths: error.duplicatePaths }
    );
  }
  if (!isRecord(parsedConfig)) return unavailable('admin/config.yml root must be a mapping');
  if (!Array.isArray(parsedConfig.collections)) {
    return unavailable('admin/config.yml collections must be a root-level YAML sequence');
  }

  const collectionNames = new Set();
  const duplicateCollectionNames = new Set();
  for (let index = 0; index < parsedConfig.collections.length; index += 1) {
    const collection = parsedConfig.collections[index];
    if (!isRecord(collection) || typeof collection.name !== 'string' || !collection.name) {
      return unavailable('every CMS collection must be a named mapping');
    }
    if (collectionNames.has(collection.name)) duplicateCollectionNames.add(collection.name);
    collectionNames.add(collection.name);
  }

  const galleryMatches = parsedConfig.collections
    .map((collection, index) => ({ collection, index }))
    .filter(item => item.collection.name === 'gallery');
  if (galleryMatches.length !== 1) {
    return unavailable('admin/config.yml must contain exactly one named Gallery collection');
  }

  const gallery = galleryMatches[0].collection;
  const galleryIndex = galleryMatches[0].index;
  const collectionContractViolations = [];
  const duplicatePropertyPaths = [];
  if (duplicateCollectionNames.size) {
    collectionContractViolations.push(
      'CMS collection names must be unique: ' + [...duplicateCollectionNames].sort().join(', ') + '.'
    );
  }

  const expectedCollectionProperties = [
    ['folder', '/content/gallery'],
    ['format', 'json'],
    ['create', 'true'],
    ['delete', 'false'],
    ['identifier_field', 'id'],
  ];
  for (const [property, expected] of expectedCollectionProperties) {
    if (gallery[property] !== expected) {
      collectionContractViolations.push(
        'Gallery collection ' + property + ' must be ' + expected + '.'
      );
    }
  }
  if (!Array.isArray(gallery.fields)) {
    collectionContractViolations.push('Gallery collection fields must be a YAML sequence.');
  }

  const schemaViolations = [];
  const duplicateFieldPaths = [];
  const topLevel = parseSchemaFieldList(
    Array.isArray(gallery.fields) ? gallery.fields : [],
    'gallery',
    schemaViolations,
    duplicateFieldPaths
  );

  for (const fieldPath of duplicateFieldPaths) {
    schemaViolations.push('Gallery schema field is declared more than once: ' + fieldPath + '.');
  }

  const fields = new Set();
  const collectFields = fieldMap => {
    for (const [name, field] of fieldMap) {
      fields.add(name);
      collectFields(field.children);
    }
  };
  collectFields(topLevel);

  const missing = [];
  for (const pathName of REQUIRED_EVIDENCE_SCHEMA_PATHS) {
    const parts = pathName.split('.');
    let fieldMap = topLevel;
    let found = true;
    for (const part of parts) {
      const field = fieldMap.get(part);
      if (!field) {
        found = false;
        break;
      }
      fieldMap = field.children;
    }
    if (!found) missing.push(pathName);
  }

  const defaultViolations = [];
  function requireChoice(pathName, field, expected) {
    if (!field) {
      defaultViolations.push(pathName + ' must be present as a required select field.');
      return;
    }
    if (field.widget !== 'select') defaultViolations.push(pathName + ' must use the select widget.');
    if (field.required !== 'true') defaultViolations.push(pathName + ' must be required.');
    if (field.defaultValue !== expected.defaultValue) {
      defaultViolations.push(pathName + ' must default to ' + expected.defaultValue + '.');
    }
    for (const option of expected.options) {
      if (!field.options.includes(option)) {
        defaultViolations.push(pathName + ' must include the ' + option + ' option.');
      }
    }
    const unexpectedOptions = field.options.filter(option => !expected.options.includes(option));
    if (unexpectedOptions.length) {
      defaultViolations.push(pathName + ' options must match the exact allowed values.');
    }
  }

  function requireObject(pathName, field) {
    if (!field) {
      defaultViolations.push(pathName + ' must be present as a required object field.');
      return;
    }
    if (field.widget !== 'object') defaultViolations.push(pathName + ' must use the object widget.');
    if (field.required !== 'true') defaultViolations.push(pathName + ' must be required.');
  }

  function requireWidget(pathName, field, widget) {
    if (!field) return;
    if (field.widget !== widget) defaultViolations.push(pathName + ' must use the ' + widget + ' widget.');
  }

  const publicationStatus = topLevel.get('status');
  const editorialStatus = topLevel.get('review_status');
  requireChoice('status', publicationStatus, {
    defaultValue: 'draft',
    options: ['draft', 'live', 'hidden'],
  });
  requireChoice('review_status', editorialStatus, {
    defaultValue: 'draft',
    options: ['draft', 'review_required', 'approved', 'rejected'],
  });

  const sourceEvidence = topLevel.get('sourceEvidence');
  const visualReview = topLevel.get('visualReview');
  const technicalValidation = topLevel.get('technicalValidation');
  requireObject('sourceEvidence', sourceEvidence);
  requireObject('visualReview', visualReview);
  requireObject('technicalValidation', technicalValidation);

  requireChoice('sourceEvidence.status', sourceEvidence && sourceEvidence.children.get('status'), {
    defaultValue: 'unverified',
    options: ['unverified', 'owner-confirmed', 'licensed'],
  });
  requireChoice('visualReview.status', visualReview && visualReview.children.get('status'), {
    defaultValue: 'not_assessed',
    options: ['not_assessed', 'matched', 'mismatch'],
  });
  requireChoice('technicalValidation.status', technicalValidation && technicalValidation.children.get('status'), {
    defaultValue: 'pending',
    options: ['pending', 'verified', 'failed'],
  });

  const sourceChildren = sourceEvidence && sourceEvidence.children;
  const visualChildren = visualReview && visualReview.children;
  const technicalChildren = technicalValidation && technicalValidation.children;
  for (const [name, widget] of [
    ['creator', 'string'],
    ['sourceUrl', 'string'],
    ['licenseName', 'string'],
    ['evidenceReference', 'string'],
    ['verifiedBy', 'string'],
    ['verifiedAt', 'string'],
  ]) requireWidget('sourceEvidence.' + name, sourceChildren && sourceChildren.get(name), widget);
  requireWidget('visualReview.evidence', visualChildren && visualChildren.get('evidence'), 'text');
  requireWidget('visualReview.reviewer', visualChildren && visualChildren.get('reviewer'), 'string');
  requireWidget('visualReview.reviewedAt', visualChildren && visualChildren.get('reviewedAt'), 'string');
  requireWidget('technicalValidation.evidenceReference',
    technicalChildren && technicalChildren.get('evidenceReference'), 'string');

  const sourceUrlField = sourceChildren && sourceChildren.get('sourceUrl');
  if (sourceUrlField && !sourceUrlField.patterns.includes('^https://')) {
    defaultViolations.push('sourceEvidence.sourceUrl must constrain values to HTTPS.');
  }

  schemaViolations.push(...collectionContractViolations);
  const uniqueMissing = [...new Set(missing)].sort();
  const uniqueViolations = [...new Set(defaultViolations)].sort();
  const uniqueSchemaViolations = [...new Set(schemaViolations)].sort();
  const uniqueCollectionContractViolations = [...new Set(collectionContractViolations)].sort();
  const uniqueDuplicateFieldPaths = [...new Set(duplicateFieldPaths)].sort();
  const uniqueDuplicatePropertyPaths = [...new Set(duplicatePropertyPaths)].sort();
  const collectionPrefix = '$.collections[' + galleryIndex + '].';
  const duplicateCollectionProperties = uniqueDuplicatePropertyPaths.some(pathName => {
    if (!pathName.startsWith(collectionPrefix)) return false;
    const property = pathName.slice(collectionPrefix.length);
    return !property.includes('.') && !property.includes('[');
  });
  const collectionValid = uniqueCollectionContractViolations.length === 0 &&
    !duplicateCollectionProperties;
  const safeDefaults = uniqueViolations.length === 0 && uniqueSchemaViolations.length === 0;
  const uniqueFields = [...fields].sort();

  return {
    available: true,
    fields: uniqueFields,
    missing: uniqueMissing,
    safeDefaults,
    defaultViolations: uniqueViolations,
    schemaViolations: uniqueSchemaViolations,
    collectionValid,
    collectionContractViolations: uniqueCollectionContractViolations,
    duplicateFieldPaths: uniqueDuplicateFieldPaths,
    duplicatePropertyPaths: uniqueDuplicatePropertyPaths,
    supportsRequiredEvidence: uniqueMissing.length === 0 && safeDefaults && collectionValid,
  };
}
function readGovernanceSource(root, relativePath, errors) {
  const absolute = path.join(root, ...relativePath.split('/'));
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 512 * 1024) {
      errors.push(relativePath + ' must be a bounded, regular non-symlink file.');
      return '';
    }
    return fs.readFileSync(absolute, 'utf8');
  } catch (error) {
    errors.push(relativePath + ' is unavailable: ' + error.message);
    return '';
  }
}

function pageMediaGovernanceAudit(directory, suppliedDecodedImages) {
  const root = realDirectory(directory, 'current source main');
  const errors = [];
  const schemaViolations = [];
  const records = [];
  const areas = Object.keys(PAGE_MEDIA_SLOT_DEFINITIONS);
  const expectedSlotCount = areas.reduce((total, area) => total + PAGE_MEDIA_SLOT_DEFINITIONS[area].length, 0);
  const configPath = path.join(root, 'admin', 'config.yml');
  let parsedConfig = null;

  try {
    const stat = fs.lstatSync(configPath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > 2 * 1024 * 1024) {
      throw new Error('admin/config.yml must be a bounded, regular non-symlink file.');
    }
    parsedConfig = parseStrictCmsYaml(fs.readFileSync(configPath));
  } catch (error) {
    errors.push('Page-media CMS configuration is unavailable: ' + error.message);
  }

  let pageMediaCollection = null;
  if (parsedConfig) {
    if (!isRecord(parsedConfig) || !Array.isArray(parsedConfig.collections)) {
      errors.push('CMS root collections must be a YAML sequence before page-media governance can be audited.');
    } else {
      const matches = parsedConfig.collections.filter(item =>
        isRecord(item) && item.name === 'page_media_slots'
      );
      if (matches.length !== 1) {
        errors.push('CMS must contain exactly one page_media_slots collection.');
      } else {
        pageMediaCollection = matches[0];
      }
    }
  }

  if (pageMediaCollection) {
    if (!Array.isArray(pageMediaCollection.files)) {
      schemaViolations.push('page_media_slots.files must be a YAML sequence.');
    } else {
      const fileEntries = pageMediaCollection.files;
      const entryNames = fileEntries.map(entry => isRecord(entry) ? entry.name : null);
      if (entryNames.length !== areas.length || areas.some((area, index) => entryNames[index] !== area)) {
        schemaViolations.push('page_media_slots.files must contain the four fixed areas in canonical order: ' + areas.join(', ') + '.');
      }

      const seenFiles = new Set();
      for (const area of areas) {
        const matches = fileEntries.filter(entry => isRecord(entry) && entry.name === area);
        if (matches.length !== 1) {
          schemaViolations.push('page_media_slots must define exactly one ' + area + ' file entry.');
          continue;
        }
        const entry = matches[0];
        const expectedFile = 'content/page-media/' + area + '.json';
        if (entry.file !== expectedFile) {
          schemaViolations.push('page_media_slots.' + area + '.file must be ' + expectedFile + '.');
        }
        if (seenFiles.has(entry.file)) schemaViolations.push('Page-media CMS file paths must be unique: ' + String(entry.file) + '.');
        seenFiles.add(entry.file);

        const duplicateFields = [];
        const fields = parseSchemaFieldList(
          entry.fields,
          'page_media_slots.' + area,
          schemaViolations,
          duplicateFields
        );
        for (const duplicate of duplicateFields) {
          schemaViolations.push('Page-media field is declared more than once: ' + duplicate + '.');
        }

        const expectedIds = PAGE_MEDIA_SLOT_DEFINITIONS[area];
        const actualIds = [...fields.keys()];
        if (actualIds.length !== expectedIds.length ||
            actualIds.some((id, index) => id !== expectedIds[index])) {
          schemaViolations.push(
            'page_media_slots.' + area + ' must declare exactly these fixed slots in order: ' +
            expectedIds.join(', ') + '.'
          );
        }

        const requireField = (fieldMap, name, widget, required, defaultValue, fieldPath) => {
          const field = fieldMap && fieldMap.get(name);
          if (!field) {
            schemaViolations.push(fieldPath + ' is missing.');
            return null;
          }
          if (field.widget !== widget) schemaViolations.push(fieldPath + ' must use the ' + widget + ' widget.');
          if (required !== null && field.required !== required) {
            schemaViolations.push(fieldPath + ' required must be ' + required + '.');
          }
          if (defaultValue !== undefined && field.defaultValue !== defaultValue) {
            schemaViolations.push(fieldPath + ' default must be ' + JSON.stringify(defaultValue) + '.');
          }
          return field;
        };

        for (const slotId of expectedIds) {
          const slotPath = 'page_media_slots.' + area + '.' + slotId;
          const slot = requireField(fields, slotId, 'object', null, undefined, slotPath);
          if (!slot) continue;
          const children = slot.children;
          requireField(children, 'src', 'image', 'true', undefined, slotPath + '.src');
          requireField(children, 'alt', 'string', 'true', undefined, slotPath + '.alt');
          requireField(children, 'caption', 'string', 'false', '', slotPath + '.caption');
          const approval = requireField(children, 'approval', 'object', null, undefined, slotPath + '.approval');
          if (!approval) continue;

          const approvalChildren = approval.children;
          const status = requireField(
            approvalChildren, 'status', 'select', 'true', 'pending', slotPath + '.approval.status'
          );
          if (status && (status.options.length !== PAGE_MEDIA_APPROVAL_STATES.length ||
              status.options.some((value, index) => value !== PAGE_MEDIA_APPROVAL_STATES[index]))) {
            schemaViolations.push(
              slotPath + '.approval.status options must match exactly: ' +
              PAGE_MEDIA_APPROVAL_STATES.join(', ') + '.'
            );
          }
          for (const [name, widget] of [
            ['source_credit', 'string'],
            ['rights_basis', 'string'],
            ['visual_match_review', 'text'],
            ['alt_text_review', 'text'],
          ]) {
            requireField(
              approvalChildren, name, widget, 'false', '', slotPath + '.approval.' + name
            );
          }
          for (const name of ['technical_validation', 'asset_sha256', 'approved_by', 'approved_at', 'signature']) {
            requireField(
              approvalChildren, name, 'hidden', null, '', slotPath + '.approval.' + name
            );
          }

          const expectedApprovalNames = PAGE_MEDIA_APPROVAL_FIELDS;
          const actualApprovalNames = [...approvalChildren.keys()];
          if (actualApprovalNames.length !== expectedApprovalNames.length ||
              actualApprovalNames.some((name, index) => name !== expectedApprovalNames[index])) {
            schemaViolations.push(
              slotPath + '.approval.fields must contain the exact signed-evidence field contract.'
            );
          }
          const expectedSlotFields = ['src', 'alt', 'caption', 'approval'];
          const actualSlotFields = [...children.keys()];
          if (actualSlotFields.length !== expectedSlotFields.length ||
              actualSlotFields.some((name, index) => name !== expectedSlotFields[index])) {
            schemaViolations.push(slotPath + '.fields must contain only src, alt, caption and approval in order.');
          }
        }
      }
    }
  }

  const loader = readGovernanceSource(root, 'include/site-media-slots.php', errors);
  const approvalHelper = readGovernanceSource(root, 'include/page-media-approval.php', errors);
  const signer = readGovernanceSource(root, 'scripts/sign-page-media-approval.php', errors);
  const siteConfig = readGovernanceSource(root, 'include/site-config.php', errors);

  for (const area of areas) {
    for (const slotId of PAGE_MEDIA_SLOT_DEFINITIONS[area]) {
      const occurrences = loader.match(new RegExp("'" + slotId + "'\\s*=>", 'g')) || [];
      if (occurrences.length !== 1) {
        errors.push('PHP fixed-slot loader must define ' + slotId + ' exactly once.');
      }
    }
  }
  for (const marker of [
    'function gj_load_site_media_slots',
    'function gj_site_media_slot',
    "['approved'] !== true",
    'return is_array($fallback) ? $fallback : [];',
    'gj_page_media_approval_is_valid',
  ]) {
    if (!loader.includes(marker)) errors.push('PHP fixed-slot loader is missing its fail-closed contract: ' + marker);
  }
  for (const marker of [
    "hash_hmac('sha256'",
    "hash_file('sha256'",
    'hash_equals',
    'technical_validation',
    'asset_sha256',
    'approved_by',
    'approved_at',
    'signature',
  ]) {
    if (!approvalHelper.includes(marker)) errors.push('Signed page-media approval helper is missing: ' + marker);
  }
  for (const marker of [
    "PHP_SAPI !== 'cli'",
    'media_approval_hmac_key',
    'media_approvers',
    'gj_page_media_approval_is_valid',
    'tempnam',
    'rename',
  ]) {
    if (!signer.includes(marker)) errors.push('Page-media signer is missing its CLI/atomic-write contract: ' + marker);
  }
  for (const marker of [
    "'media_approvers' => []",
    "'media_approval_hmac_key' => ''",
    "getenv('GJ_MEDIA_APPROVAL_HMAC_KEY')",
    'site-config.local.php',
  ]) {
    if (!siteConfig.includes(marker)) errors.push('Public site configuration must keep page-media secrets external: ' + marker);
  }

  const mediaRoot = path.join(root, 'content', 'page-media');
  let mediaRootReady = false;
  try {
    const stat = fs.lstatSync(mediaRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('content/page-media must be a regular non-symlink directory.');
    mediaRootReady = true;
    const expectedFiles = areas.map(area => area + '.json').sort();
    const actualFiles = fs.readdirSync(mediaRoot).filter(name => name.endsWith('.json')).sort();
    if (actualFiles.length !== expectedFiles.length ||
        actualFiles.some((name, index) => name !== expectedFiles[index])) {
      errors.push('content/page-media must contain exactly the four fixed JSON files.');
    }
  } catch (error) {
    errors.push('Page-media content directory is unavailable: ' + error.message);
  }

  const imageRecords = [];
  const recordById = new Map();
  if (mediaRootReady) {
    for (const area of areas) {
      const filePath = path.join(mediaRoot, area + '.json');
      let fileRecords = null;
      try {
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > 2 * 1024 * 1024) {
          throw new Error('file must be a bounded, regular non-symlink JSON file');
        }
        fileRecords = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!isRecord(fileRecords)) throw new Error('file root must be a JSON object');
      } catch (error) {
        errors.push('content/page-media/' + area + '.json: ' + error.message);
        continue;
      }

      const expectedIds = PAGE_MEDIA_SLOT_DEFINITIONS[area];
      const actualIds = Object.keys(fileRecords);
      if (actualIds.length !== expectedIds.length ||
          expectedIds.some(id => !Object.prototype.hasOwnProperty.call(fileRecords, id))) {
        errors.push('content/page-media/' + area + '.json must contain exactly its ' + expectedIds.length + ' fixed slot records.');
      }

      for (const slotId of expectedIds) {
        const record = fileRecords[slotId];
        const recordPath = area + '/' + slotId;
        if (!isRecord(record)) {
          errors.push('Page-media record ' + recordPath + ' must be a JSON object.');
          continue;
        }
        const unexpectedRecordFields = Object.keys(record).filter(name =>
          !['src', 'alt', 'caption', 'approval'].includes(name)
        );
        if (unexpectedRecordFields.length) {
          errors.push('Page-media record ' + recordPath + ' contains unsupported fields: ' + unexpectedRecordFields.join(', ') + '.');
        }

        const source = record.src;
        const alt = record.alt;
        const caption = record.caption === undefined ? '' : record.caption;
        if (typeof alt !== 'string' || alt.trim().length < 15 || alt.length > 300) {
          errors.push('Page-media record ' + recordPath + ' requires a descriptive 15–300 character alt string.');
        }
        if (typeof caption !== 'string' || caption.length > 180) {
          errors.push('Page-media record ' + recordPath + ' caption must be a string no longer than 180 characters.');
        }

        let asset = null;
        try {
          asset = safeImageBytes(root, source);
          imageRecords.push({ id: slotId, imagePath: source, assetSha256: asset.sha256 });
        } catch (error) {
          errors.push('Page-media record ' + recordPath + ' image is unsafe or unavailable: ' + error.message);
        }

        const approval = record.approval;
        if (!isRecord(approval)) {
          errors.push('Page-media record ' + recordPath + ' must contain an approval object.');
          continue;
        }
        const approvalKeys = Object.keys(approval).sort();
        const expectedApprovalKeys = PAGE_MEDIA_APPROVAL_FIELDS.slice().sort();
        if (approvalKeys.length !== expectedApprovalKeys.length ||
            approvalKeys.some((key, index) => key !== expectedApprovalKeys[index])) {
          errors.push('Page-media record ' + recordPath + ' approval object must contain the exact signed-evidence fields.');
        }
        for (const name of PAGE_MEDIA_APPROVAL_FIELDS) {
          if (typeof approval[name] !== 'string') {
            errors.push('Page-media record ' + recordPath + ' approval.' + name + ' must be a string.');
          }
        }
        if (!PAGE_MEDIA_APPROVAL_STATES.includes(approval.status)) {
          errors.push('Page-media record ' + recordPath + ' has an unsupported approval status.');
          continue;
        }

        const signingMetadata = [
          'technical_validation', 'asset_sha256', 'approved_by', 'approved_at', 'signature',
        ];
        if (approval.status === 'pending' && signingMetadata.some(name => approval[name] !== '')) {
          errors.push('Pending page-media record ' + recordPath + ' must not carry signing metadata.');
        }

        const item = {
          id: slotId,
          area,
          source,
          altLength: typeof alt === 'string' ? alt.trim().length : 0,
          approvalStatus: approval.status,
          assetBytes: asset ? asset.bytes : null,
          assetSha256: asset ? asset.sha256 : null,
          imageDecodeComplete: false,
          imageGitBlobSha: asset ? asset.gitBlobSha : null,
          imageWidth: null,
          imageHeight: null,
          approvalEvidenceComplete: false,
          signatureVerified: false,
          eligibleForTourismImport: false,
        };
        if (approval.status === 'approved') {
          const approvedAt = typeof approval.approved_at === 'string' ? Date.parse(approval.approved_at) : NaN;
          const timestampValid = typeof approval.approved_at === 'string' &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(approval.approved_at) &&
            Number.isFinite(approvedAt) && approvedAt <= Date.now() + 300000;
          item.approvalEvidenceComplete = Boolean(
            nonEmpty(approval.source_credit, 5) &&
            nonEmpty(approval.rights_basis, 15) &&
            nonEmpty(approval.visual_match_review, 15) &&
            nonEmpty(approval.alt_text_review, 15) &&
            approval.technical_validation === 'passed' &&
            asset && typeof approval.asset_sha256 === 'string' &&
            /^[a-f0-9]{64}$/i.test(approval.asset_sha256) &&
            approval.asset_sha256.toLowerCase() === asset.sha256 &&
            nonEmpty(approval.approved_by) &&
            timestampValid &&
            typeof approval.signature === 'string' &&
            /^[a-f0-9]{64}$/i.test(approval.signature)
          );
        }
        records.push(item);
        recordById.set(slotId, { item, asset, approval });
      }
    }
  }

  let decodedImages = suppliedDecodedImages instanceof Map ? suppliedDecodedImages : null;
  if (!decodedImages) {
    try {
      decodedImages = decodeGalleryImages(root, imageRecords);
    } catch (error) {
      errors.push('Page-media image decoder failed: ' + error.message);
      decodedImages = new Map();
    }
  }

  let imageDecodeVerifiedCount = 0;
  for (const { item, asset } of recordById.values()) {
    const decoded = decodedImages.get(item.source);
    const verified = Boolean(
      asset && decoded && decoded.status === 'verified' &&
      decoded.sha256 === asset.sha256 &&
      Number.isInteger(decoded.width) && decoded.width > 0 &&
      Number.isInteger(decoded.height) && decoded.height > 0
    );
    item.imageDecodeComplete = verified;
    if (verified) {
      item.imageWidth = decoded.width;
      item.imageHeight = decoded.height;
      imageDecodeVerifiedCount += 1;
    }
    else errors.push('Page-media image decode/hash verification failed for ' + item.area + '/' + item.id + '.');
  }

  const approvalStatusCounts = countBy(records, item => item.approvalStatus);
  const summary = {
    expectedSlotCount,
    slotCount: records.length,
    pendingCount: approvalStatusCounts.pending || 0,
    approvedStatusCount: approvalStatusCounts.approved || 0,
    rejectedCount: approvalStatusCounts.rejected || 0,
    revokedCount: approvalStatusCounts.revoked || 0,
    invalidCount: errors.length,
    imageDecodeVerifiedCount,
    uniqueAssetCount: new Set(records.map(item => item.source)).size,
    approvedEvidenceCompleteCount: records.filter(item => item.approvalEvidenceComplete).length,
    signatureVerificationPerformed: false,
    approvalEligibleCount: 0,
    tourismImportEligibleCount: 0,
  };
  const status = errors.length || schemaViolations.length
    ? 'INVALID'
    : (summary.approvedStatusCount ? 'REVIEW_REQUIRED_UNVERIFIED_SIGNATURES' : 'PENDING_OWNER_REVIEW');

  return {
    auditType: 'read-only-fixed-page-media-governance',
    sourceRepository: SOURCE_REPOSITORY,
    sourceBranch: 'main',
    schemaAvailable: Boolean(pageMediaCollection),
    schemaViolations: [...new Set(schemaViolations)].sort(),
    summary,
    records: records.sort((left, right) => left.id.localeCompare(right.id)),
    structuralErrors: [...new Set(errors)].sort(),
    signatureVerification: {
      performed: false,
      reason: 'The read-only audit never loads or receives the private HMAC key; PHP runtime validation remains authoritative.',
    },
    controls: {
      readOnly: true,
      sourceRepositoryMutated: false,
      approvalAuthorized: false,
      publicationAuthorized: false,
      tourismImportAuthorized: false,
    },
    status,
  };
}

function readGallerySnapshot(directory, label) {
  const root = realDirectory(directory, label);
  const errors = [];
  const galleryDirectory = path.join(root, 'content', 'gallery');
  const records = new Map();
  const schema = gallerySchemaFields(root, errors);

  if (!fs.existsSync(galleryDirectory)) {
    return { root, records, errors, schema };
  }
  const galleryStat = fs.lstatSync(galleryDirectory);
  if (galleryStat.isSymbolicLink() || !galleryStat.isDirectory()) {
    throw new Error(label + ' content/gallery must be a regular directory.');
  }

  const filenames = fs.readdirSync(galleryDirectory).filter(name => name.endsWith('.json')).sort();
  for (const filename of filenames) {
    const filePath = path.join(galleryDirectory, filename);
    try {
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('record must be a regular file');
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('record must be a JSON object');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id || '') || filename !== record.id + '.json') {
        throw new Error('record id must match its stable filename');
      }
      if (!CATEGORIES.has(record.category)) throw new Error('record has an unsupported gallery category');
      if (!PUBLICATION_STATES.has(record.status)) throw new Error('record has an unsupported publication status');
      if (!Number.isInteger(record.order) || record.order < 1) throw new Error('record order must be a positive integer');
      if (!record.image || typeof record.image !== 'object' || Array.isArray(record.image)) {
        throw new Error('record image object is missing');
      }
      if (!CROPS.has(record.image.crop)) throw new Error('record image crop is unsupported');

      const asset = safeImageBytes(root, record.image.src);
      const altText = typeof record.image.alt === 'string' ? record.image.alt.trim() : '';
      const meaningfulAlt = altText.length >= 25 && !/^(image|photo|picture|gallery photo|view)$/i.test(altText);
      const sourceEvidence = record.sourceEvidence;
      const rightsStatus = sourceEvidence && sourceEvidence.status;
      const rightsEvidenceComplete = Boolean(
        sourceEvidence &&
        ['owner-confirmed', 'licensed'].includes(rightsStatus) &&
        nonEmpty(sourceEvidence.creator) &&
        nonEmpty(sourceEvidence.evidenceReference, 5) &&
        nonEmpty(sourceEvidence.verifiedBy) &&
        validDate(sourceEvidence.verifiedAt) &&
        (rightsStatus !== 'licensed' ||
          (/^https:\/\//i.test(sourceEvidence.sourceUrl || '') && nonEmpty(sourceEvidence.licenseName)))
      );
      const visualReview = record.visualReview;
      const visualReviewComplete = Boolean(
        visualReview &&
        visualReview.status === 'matched' &&
        nonEmpty(visualReview.evidence, 5) &&
        nonEmpty(visualReview.reviewer) &&
        validDate(visualReview.reviewedAt)
      );
      const technicalValidation = record.technicalValidation;
      const technicalValidationMetadataComplete = Boolean(
        technicalValidation &&
        technicalValidation.status === 'verified' &&
        nonEmpty(technicalValidation.evidenceReference, 5)
      );
      const technicalValidationComplete = technicalValidationMetadataComplete;
      const blockers = [];
      if (record.status !== 'live') blockers.push('source-record-not-live');
      if (record.review_status !== 'approved') blockers.push('owner-editor-review-not-approved');
      if (!schema.available || schema.missing.length) blockers.push('cms-schema-does-not-capture-required-evidence');
      if (!schema.collectionValid) blockers.push('cms-gallery-collection-contract-invalid');
      if (schema.duplicateFieldPaths.length) blockers.push('cms-schema-contains-duplicate-fields');
      if (schema.duplicatePropertyPaths.length) blockers.push('cms-schema-contains-duplicate-properties');
      if (!schema.safeDefaults) blockers.push('cms-schema-does-not-enforce-fail-closed-defaults');
      if (!rightsEvidenceComplete) blockers.push('creator-source-rights-evidence-incomplete');
      if (!visualReviewComplete) blockers.push('documented-visual-match-missing');
      if (!meaningfulAlt) blockers.push('descriptive-alt-text-incomplete');
      if (!technicalValidationMetadataComplete) blockers.push('technical-validation-evidence-missing');

      const signature = crypto.createHash('sha256')
        .update(stableStringify(record) + '\0' + asset.sha256)
        .digest('hex');
      records.set(record.id, {
        id: record.id,
        category: record.category,
        publicationStatus: record.status,
        reviewStatus: record.review_status || 'missing',
        imagePath: record.image.src,
        imageBytes: asset.bytes,
        imageSha256: asset.sha256,
        imageGitBlobSha: asset.gitBlobSha,
        meaningfulAltText: meaningfulAlt,
        rightsEvidenceComplete,
        visualReviewComplete,
        technicalValidationComplete,
        technicalValidationMetadataComplete,
        imageDecodeComplete: false,
        imageDecodeStatus: 'pending',
        imageWidth: null,
        imageHeight: null,
        imageDecodeError: null,
        manifestMatchCandidate: false,
        approvalEligible: blockers.length === 0,
        blockers,
        signature,
      });
    } catch (error) {
      errors.push(label + ' ' + filename + ': ' + error.message);
    }
  }

  return { root, records, errors, schema };
}

function applyImageDecodeResults(snapshot, decodedImages) {
  for (const record of snapshot.records.values()) {
    const decodedImage = decodedImages.get(record.imagePath);
    const imageDecodeComplete = Boolean(
      decodedImage &&
      decodedImage.status === 'verified' &&
      decodedImage.sha256 === record.imageSha256 &&
      Number.isInteger(decodedImage.width) && decodedImage.width > 0 &&
      Number.isInteger(decodedImage.height) && decodedImage.height > 0
    );
    record.imageDecodeComplete = imageDecodeComplete;
    record.imageDecodeStatus = decodedImage ? decodedImage.status : 'missing';
    record.imageWidth = imageDecodeComplete ? decodedImage.width : null;
    record.imageHeight = imageDecodeComplete ? decodedImage.height : null;
    record.imageDecodeError = decodedImage && decodedImage.status === 'failed' ? decodedImage.error : null;
    record.technicalValidationComplete = record.technicalValidationMetadataComplete && imageDecodeComplete;
    if (!imageDecodeComplete && !record.blockers.includes('gallery-image-decode-validation-failed')) {
      record.blockers.push('gallery-image-decode-validation-failed');
    }
    record.approvalEligible = record.blockers.length === 0;
  }
}

function countBy(records, selector) {
  const counts = {};
  for (const record of records) {
    const key = selector(record);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function compareSnapshots(pinned, current) {
  const added = [];
  const changed = [];
  const removed = [];
  let unchangedCount = 0;
  for (const [id, record] of current.records) {
    const previous = pinned.records.get(id);
    if (!previous) added.push(id);
    else if (previous.signature !== record.signature) changed.push(id);
    else unchangedCount += 1;
  }
  for (const id of pinned.records.keys()) {
    if (!current.records.has(id)) removed.push(id);
  }
  return {
    addedCount: added.length,
    changedCount: changed.length,
    removedCount: removed.length,
    unchangedCount,
    addedIds: added.sort(),
    changedIds: changed.sort(),
    removedIds: removed.sort(),
  };
}

function auditAuthoritativeGallerySource(options) {
  const pinnedCommit = String(options.pinnedSourceCommit || '').toLowerCase();
  const currentCommit = String(options.currentSourceCommit || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(pinnedCommit) || !/^[0-9a-f]{40}$/.test(currentCommit)) {
    throw new Error('Pinned and current source commits must be exact 40-character Git SHAs.');
  }

  const manifestPath = path.resolve(options.manifestPath);
  const manifestStat = fs.lstatSync(manifestPath);
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) throw new Error('Media migration manifest must be a regular file.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.sourceRepository !== SOURCE_REPOSITORY || manifest.sourceBranch !== 'main' ||
      String(manifest.sourceCommit || '').toLowerCase() !== pinnedCommit) {
    throw new Error('Pinned source checkout does not match the authoritative repository/main commit in the migration manifest.');
  }
  const manifestPaths = new Set((manifest.entries || []).map(entry => entry && entry.sourcePath).filter(Boolean));

  const pinned = readGallerySnapshot(options.pinnedSourceRoot, 'pinned source');
  const current = readGallerySnapshot(options.currentSourceRoot, 'current source main');
  const decodedImages = options.decodedImages instanceof Map
    ? options.decodedImages
    : decodeGalleryImages(options.currentSourceRoot, [...current.records.values()]);
  applyImageDecodeResults(current, decodedImages);
  const pageMediaGovernance = pageMediaGovernanceAudit(
    options.currentSourceRoot,
    options.decodedPageMediaImages
  );
  const errors = [...pinned.errors, ...current.errors, ...pageMediaGovernance.structuralErrors, ...pageMediaGovernance.schemaViolations];
  const diff = compareSnapshots(pinned, current);
  const records = [...current.records.values()].sort((left, right) => left.id.localeCompare(right.id));
  for (const record of records) {
    record.manifestMatchCandidate = manifestPaths.has(record.imagePath);
    if (record.manifestMatchCandidate) {
      // A byte/provenance migration manifest is not a rights or visual-review approval.
      record.blockers.push('migration-manifest-match-is-not-editorial-or-rights-approval');
      record.approvalEligible = false;
    }
  }

  const statusCounts = countBy(records, record => record.publicationStatus);
  const categoryCounts = countBy(records, record => record.category);
  const summary = {
    recordCount: records.length,
    publicationStatusCounts: statusCounts,
    categoryCounts,
    liveRecords: statusCounts.live || 0,
    missingReviewStatusCount: records.filter(record => record.reviewStatus === 'missing').length,
    missingRightsEvidenceCount: records.filter(record => !record.rightsEvidenceComplete).length,
    missingVisualReviewCount: records.filter(record => !record.visualReviewComplete).length,
    missingTechnicalValidationCount: records.filter(record => !record.technicalValidationComplete).length,
    missingDescriptiveAltCount: records.filter(record => !record.meaningfulAltText).length,
    manifestMatchCandidateCount: records.filter(record => record.manifestMatchCandidate).length,
    approvalEligibleCount: records.filter(record => record.approvalEligible).length,
    reviewRequiredCount: records.filter(record => !record.approvalEligible).length,
  };
  return {
    schemaVersion: 1,
    auditType: 'read-only-authoritative-gallery-source-drift',
    sourceRepository: SOURCE_REPOSITORY,
    sourceBranch: 'main',
    pinnedSourceCommit: pinnedCommit,
    currentSourceCommit: currentCommit,
    sourcePinDrift: pinnedCommit !== currentCommit,
    sourceDiff: diff,
    pageMediaGovernance,
    cmsSchema: {
      available: current.schema.available,
      fields: current.schema.fields,
      missingEvidenceFields: current.schema.missing,
      safeDefaults: current.schema.safeDefaults,
      defaultViolations: current.schema.defaultViolations,
      schemaViolations: current.schema.schemaViolations,
      collectionValid: current.schema.collectionValid,
      collectionContractViolations: current.schema.collectionContractViolations,
      duplicateFieldPaths: current.schema.duplicateFieldPaths,
      duplicatePropertyPaths: current.schema.duplicatePropertyPaths,
      supportsRequiredEvidence: current.schema.supportsRequiredEvidence,
    },
    summary,
    records,
    structuralErrors: errors,
    controls: {
      readOnly: true,
      sourceRepositoryMutated: false,
      automaticImportPerformed: false,
      imageDecodePerformed: true,
      approvalAuthorized: false,
      publicationAuthorized: false,
      pageMediaApprovalAuthorized: false,
      pageMediaSignatureVerificationPerformed: pageMediaGovernance.signatureVerification.performed,
      pageMediaTourismImportAuthorized: false,
    },
    status: errors.length ? 'INVALID' : (summary.approvalEligibleCount ? 'EVIDENCE_COMPLETE_AWAITING_HUMAN_REVIEW' : 'REVIEW_REQUIRED'),
  };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || index + 1 >= argv.length) throw new Error('Invalid command-line arguments.');
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  for (const required of ['pinned-source-root', 'pinned-source-commit', 'current-source-root', 'current-source-commit', 'manifest']) {
    if (!values[required]) throw new Error('Missing required argument --' + required);
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv);
  const report = auditAuthoritativeGallerySource({
    pinnedSourceRoot: args['pinned-source-root'],
    pinnedSourceCommit: args['pinned-source-commit'],
    currentSourceRoot: args['current-source-root'],
    currentSourceCommit: args['current-source-commit'],
    manifestPath: args.manifest,
  });
  if (args.output) {
    const outputPath = path.resolve(args.output);
    if (isWithin(realDirectory(args['pinned-source-root'], 'pinned source'), outputPath) ||
        isWithin(realDirectory(args['current-source-root'], 'current source main'), outputPath)) {
      throw new Error('Audit output must remain outside both authoritative source checkouts.');
    }
    if (fs.existsSync(outputPath) && fs.lstatSync(outputPath).isSymbolicLink()) {
      throw new Error('Audit output must not replace a symlink.');
    }
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  }
  console.log('Authoritative gallery drift: ' + report.sourceDiff.addedCount + ' added, ' +
    report.sourceDiff.changedCount + ' changed, ' + report.sourceDiff.removedCount + ' removed, ' +
    report.sourceDiff.unchangedCount + ' unchanged.');
  console.log('Gallery records: ' + report.summary.recordCount + '; live: ' + report.summary.liveRecords +
    '; missing rights evidence: ' + report.summary.missingRightsEvidenceCount +
    '; missing visual review: ' + report.summary.missingVisualReviewCount +
    '; approval eligible: ' + report.summary.approvalEligibleCount + '.');
  console.log('CMS evidence schema: ' + (report.cmsSchema.supportsRequiredEvidence
    ? 'complete with fail-closed defaults'
    : 'blocked; missing fields: ' + report.cmsSchema.missingEvidenceFields.join(', ') +
      '; default violations: ' + report.cmsSchema.defaultViolations.join(', ')) + '.');
  console.log('Page-media governance: ' + report.pageMediaGovernance.summary.slotCount + '/' +
    report.pageMediaGovernance.summary.expectedSlotCount + ' fixed slots; pending: ' +
    report.pageMediaGovernance.summary.pendingCount + '; approved status: ' +
    report.pageMediaGovernance.summary.approvedStatusCount + '; decoded assets: ' +
    report.pageMediaGovernance.summary.imageDecodeVerifiedCount + '; tourism-import eligible: 0; HMAC verified: no. Status: ' +
    report.pageMediaGovernance.status + '.');
  console.log('PASS: read-only source drift and media-evidence audit; no records imported or approved. Status: ' + report.status + '.');
  if (report.status === 'INVALID') {
    console.error(report.structuralErrors.join('\n'));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { auditAuthoritativeGallerySource, decodeGalleryImages, pageMediaGovernanceAudit, PAGE_MEDIA_SLOT_DEFINITIONS };
