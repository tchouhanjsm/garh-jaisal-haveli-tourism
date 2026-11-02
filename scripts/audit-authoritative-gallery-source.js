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

const SOURCE_REPOSITORY = 'https://github.com/tchouhanjsm/garh-jaisal-website';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const CATEGORIES = new Set(['hotel', 'rooms', 'desert', 'restaurant']);
const PUBLICATION_STATES = new Set(['draft', 'live', 'hidden']);
const CROPS = new Set(['standard', 'arch', 'landscape', 'portrait']);
const REQUIRED_EVIDENCE_SCHEMA_FIELDS = [
  'status',
  'review_status',
  'sourceEvidence',
  'creator',
  'sourceUrl',
  'licenseName',
  'evidenceReference',
  'verifiedBy',
  'verifiedAt',
  'visualReview',
  'evidence',
  'reviewer',
  'reviewedAt',
  'technicalValidation',
];
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

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + stableStringify(value[key])
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

function parseNamedFieldBlocks(source, indentation) {
  const lines = source.split(/\r?\n/);
  const marker = new RegExp('^ {' + indentation + '}- name: ([A-Za-z0-9_-]+)\\s*$');
  const blocks = [];
  let active = null;
  for (const line of lines) {
    const match = line.match(marker);
    if (match) {
      if (active) blocks.push(active);
      active = { name: match[1], lines: [line] };
    } else if (active) {
      active.lines.push(line);
    }
  }
  if (active) blocks.push(active);
  return new Map(blocks.map(block => [block.name, block.lines.join('\n')]));
}

function fieldProperty(block, indentation, property) {
  const pattern = new RegExp('^ {' + (indentation + 2) + '}' + property + ':\\s*([^\\s#]+)\\s*$', 'm');
  const match = block.match(pattern);
  return match ? match[1] : null;
}

function parseSchemaField(block, indentation) {
  const children = parseNamedFieldBlocks(block, indentation + 4);
  return {
    block,
    widget: fieldProperty(block, indentation, 'widget'),
    required: fieldProperty(block, indentation, 'required'),
    defaultValue: fieldProperty(block, indentation, 'default'),
    options: [...block.matchAll(/^\s+value:\s*([A-Za-z0-9_-]+)\s*$/gm)].map(match => match[1]),
    children: new Map([...children].map(([name, childBlock]) => [
      name,
      parseSchemaField(childBlock, indentation + 4),
    ])),
  };
}

function gallerySchemaFields(root, errors) {
  const configPath = path.join(root, 'admin', 'config.yml');
  const unavailable = reason => ({
    available: false,
    fields: [],
    missing: REQUIRED_EVIDENCE_SCHEMA_PATHS.slice(),
    safeDefaults: false,
    defaultViolations: [reason],
  });
  if (!fs.existsSync(configPath)) return unavailable('admin/config.yml is missing');
  const stat = fs.lstatSync(configPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    errors.push('admin/config.yml must be a regular file before CMS schema can be audited.');
    return unavailable('admin/config.yml is not a regular file');
  }

  const config = fs.readFileSync(configPath, 'utf8');
  const start = config.indexOf('  - name: gallery');
  if (start < 0) return unavailable('Gallery collection is missing');
  const tail = config.slice(start);
  const nextCollection = tail.indexOf('\n  - name:', 1);
  const collectionBlock = nextCollection < 0 ? tail : tail.slice(0, nextCollection);
  const topLevelBlocks = parseNamedFieldBlocks(collectionBlock, 6);
  const topLevel = new Map([...topLevelBlocks].map(([name, block]) => [
    name,
    parseSchemaField(block, 6),
  ]));

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
  if (sourceUrlField && !sourceUrlField.block.includes("'^https://'")) {
    defaultViolations.push('sourceEvidence.sourceUrl must constrain values to HTTPS.');
  }

  const uniqueMissing = [...new Set(missing)].sort();
  const uniqueViolations = [...new Set(defaultViolations)].sort();
  const uniqueFields = [...fields].sort();
  const safeDefaults = uniqueViolations.length === 0;
  return {
    available: true,
    fields: uniqueFields,
    missing: uniqueMissing,
    safeDefaults,
    defaultViolations: uniqueViolations,
    supportsRequiredEvidence: uniqueMissing.length === 0 && safeDefaults,
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
      const technicalValidationComplete = Boolean(
        technicalValidation &&
        technicalValidation.status === 'verified' &&
        nonEmpty(technicalValidation.evidenceReference, 5)
      );
      const blockers = [];
      if (record.status !== 'live') blockers.push('source-record-not-live');
      if (record.review_status !== 'approved') blockers.push('owner-editor-review-not-approved');
      if (!schema.available || schema.missing.length) blockers.push('cms-schema-does-not-capture-required-evidence');
      if (!schema.safeDefaults) blockers.push('cms-schema-does-not-enforce-fail-closed-defaults');
      if (!rightsEvidenceComplete) blockers.push('creator-source-rights-evidence-incomplete');
      if (!visualReviewComplete) blockers.push('documented-visual-match-missing');
      if (!meaningfulAlt) blockers.push('descriptive-alt-text-incomplete');
      if (!technicalValidationComplete) blockers.push('technical-validation-evidence-missing');

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
  const errors = [...pinned.errors, ...current.errors];
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
    cmsSchema: {
      available: current.schema.available,
      fields: current.schema.fields,
      missingEvidenceFields: current.schema.missing,
      safeDefaults: current.schema.safeDefaults,
      defaultViolations: current.schema.defaultViolations,
      supportsRequiredEvidence: current.schema.supportsRequiredEvidence,
    },
    summary,
    records,
    structuralErrors: errors,
    controls: {
      readOnly: true,
      sourceRepositoryMutated: false,
      automaticImportPerformed: false,
      approvalAuthorized: false,
      publicationAuthorized: false,
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

module.exports = { auditAuthoritativeGallerySource };
