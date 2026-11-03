#!/usr/bin/env node
'use strict';

/** Verify the curated legacy-media manifest and the local bytes used by gallery.html. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { auditEditorialReviewAuthority } = require('./audit-editorial-review-authority');
const { parseStrictJsonBytes } = require('./validate-editorial-media-decisions');
const { buildGalleryReviewBundle, csvCell } = require('./build-gallery-review-bundle');


const validDecisionJson = parseStrictJsonBytes(
  Buffer.from('{"ownerDecision":"reject","visualReview":{"status":"mismatch"}}', 'utf8'),
  'valid decision worksheet fixture'
);
assert.equal(validDecisionJson.ownerDecision, 'reject');
assert.equal(validDecisionJson.visualReview.status, 'mismatch');

assert.equal(csvCell('ordinary text'), '"ordinary text"');
assert.equal(csvCell('quoted "text"'), '"quoted ""text"""');
for (const formulaValue of [
  '=1+1',
  '+SUM(1,1)',
  '-1+2',
  '@SUM(1,1)',
  '\t=1+1',
  '\r=1+1',
  '\n=1+1',
  ' \t=1+1',
]) {
  const expectedCell = '"' + ("'" + formulaValue).replace(/"/g, '""') + '"';
  assert.equal(csvCell(formulaValue), expectedCell, 'CSV formula/control prefix must be neutralized.');
}

assert.throws(
  () => parseStrictJsonBytes(
    Buffer.from('{"ownerDecision":"reject","ownerDecision":"approve"}', 'utf8'),
    'duplicate decision fixture'
  ),
  /duplicate object key: ownerDecision/
);
assert.throws(
  () => parseStrictJsonBytes(
    Buffer.from('{"visualReview":{"status":"matched","status":"mismatch"}}', 'utf8'),
    'duplicate nested evidence fixture'
  ),
  /duplicate object key: status/
);
assert.throws(
  () => parseStrictJsonBytes(
    Buffer.from(String.raw`{"ownerDecision":"reject","owner\u0044ecision":"approve"}`, 'utf8'),
    'escaped duplicate decision fixture'
  ),
  /duplicate object key: ownerDecision/
);
assert.throws(
  () => parseStrictJsonBytes(
    Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
    'invalid UTF-8 worksheet fixture'
  ),
  /valid UTF-8/
);
const maximumDepthJson = '['.repeat(64) + '0' + ']'.repeat(64);
assert.equal(
  parseStrictJsonBytes(Buffer.from(maximumDepthJson, 'utf8'), 'maximum depth JSON fixture').length,
  1
);
const excessiveDepthJson = '['.repeat(65) + '0' + ']'.repeat(65);
assert.throws(
  () => parseStrictJsonBytes(Buffer.from(excessiveDepthJson, 'utf8'), 'over-depth JSON fixture'),
  /nesting exceeds the 64-level safety limit/
);

const ROOT = path.resolve(__dirname, '..');
const STRICT_YAML_PARSER = path.join(ROOT, 'scripts', 'parse-strict-cms-yaml.py');

const QUALITY_WORKFLOW = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'site-quality-gates.yml'), 'utf8');
const phpSetupStep = QUALITY_WORKFLOW.indexOf('Set up PHP for authoritative page-media runtime contract');
const phpContractStep = QUALITY_WORKFLOW.indexOf('Run authoritative page-media PHP runtime contract on exact source-main SHA');
const phpGovernanceStep = QUALITY_WORKFLOW.indexOf('Run authoritative CMS, owner-auth and SEO runtime contracts on exact source-main SHA');
const phpMediaLibraryStep = QUALITY_WORKFLOW.indexOf('Run authoritative media-library and Gallery curation runtime contracts on exact source-main SHA');
const sourceMainFetchStep = QUALITY_WORKFLOW.indexOf('Fetch current authoritative source main for read-only drift audit');
const galleryAuditStep = QUALITY_WORKFLOW.indexOf('Audit authoritative gallery drift and rights readiness');
assert.ok(phpSetupStep >= 0 && phpContractStep > phpSetupStep && phpGovernanceStep > phpContractStep,
  'Quality workflow must install PHP, run the page-media contract, then run the CMS governance contracts');
assert.ok(sourceMainFetchStep >= 0 && sourceMainFetchStep < phpSetupStep && phpGovernanceStep < galleryAuditStep,
  'All PHP runtime contracts must execute against the fetched authoritative source main before its read-only audit');
assert.ok(phpMediaLibraryStep > phpGovernanceStep && phpMediaLibraryStep < galleryAuditStep,
  'Media-library and Gallery curation runtime contracts must execute after CMS governance and before the read-only audit');
const mediaLibraryStepBlock = QUALITY_WORKFLOW.slice(phpMediaLibraryStep, galleryAuditStep);
assert.ok(mediaLibraryStepBlock.includes('SOURCE_MAIN_SHA: ${{ steps.media-source-main.outputs.source_commit }}')
  && mediaLibraryStepBlock.includes('test "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" = "$SOURCE_MAIN_SHA"')
  && mediaLibraryStepBlock.indexOf('php tests/php/media-library-audit.php') >= 0
  && mediaLibraryStepBlock.indexOf('php tests/php/gallery-curation.php') > mediaLibraryStepBlock.indexOf('php tests/php/media-library-audit.php'),
  'Both read-only media runtime contracts must run in order against the verified source-main checkout');
const galleryReviewBuildStep = QUALITY_WORKFLOW.indexOf('Build local-only authoritative Gallery owner-review bundle');
const galleryDecisionStep = QUALITY_WORKFLOW.indexOf('Validate local-only editorial decision worksheet integrity');
assert.ok(galleryAuditStep >= 0 && galleryReviewBuildStep > galleryAuditStep && galleryReviewBuildStep < galleryDecisionStep,
  'Local Gallery owner-review bundle must build only after the exact-source read-only audit and before decision validation');
const galleryBuildBlock = QUALITY_WORKFLOW.slice(galleryReviewBuildStep, galleryDecisionStep);
assert.ok(galleryBuildBlock.includes('SOURCE_MAIN_SHA: ${{ steps.media-source-main.outputs.source_commit }}')
  && galleryBuildBlock.includes('garh-jaisal-authoritative-gallery-audit.json')
  && galleryBuildBlock.includes('garh-jaisal-gallery-review')
  && galleryBuildBlock.includes('build-gallery-review-bundle.js'),
  'Gallery review bundle must consume the exact-source audit and write only to the runner temporary directory');
const galleryUploadStep = QUALITY_WORKFLOW.indexOf('Upload local-only authoritative Gallery owner-review bundle');
assert.ok(galleryUploadStep > galleryReviewBuildStep && QUALITY_WORKFLOW.slice(galleryUploadStep).includes('garh-jaisal-gallery-review/'),
  'Local-only Gallery owner-review bundle must be uploaded as a short-retention CI artifact');
const phpEditorialStep = QUALITY_WORKFLOW.indexOf('Run authoritative editorial SEO and image metadata runtime contracts on exact source-main SHA');
assert.ok(phpEditorialStep > phpMediaLibraryStep && phpEditorialStep < galleryAuditStep,
  'Editorial SEO, discovery and image metadata contracts must run after media governance and before the read-only audit');
const editorialStepBlock = QUALITY_WORKFLOW.slice(phpEditorialStep, galleryAuditStep);
const editorialContracts = [
  'editorial-discovery-graph.php',
  'editorial-release-readiness.php',
  'image-metadata-contract.php',
  'social-image-alt-contract.php',
];
assert.ok(editorialStepBlock.includes('SOURCE_MAIN_SHA: ${{ steps.media-source-main.outputs.source_commit }}')
  && editorialStepBlock.includes('test "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" = "$SOURCE_MAIN_SHA"')
  && editorialContracts.every(contract => editorialStepBlock.includes('php tests/php/' + contract)),
  'Editorial SEO and image metadata contracts must execute on the verified source-main checkout');
assert.ok(QUALITY_WORKFLOW.includes('shivammathur/setup-php@eb7c497e18156a6bbabfef1d3a82760b9eda3962'),
  'PHP setup action must remain pinned to the reviewed immutable commit');
for (const contract of [
  'site-media-slots-contract.php',
  'runtime-config-validation.php',
  'sveltia-cms-config-contract.php',
  'admin-auth-contract.php',
  'staging-noindex.php',
  'media-library-audit.php',
  'gallery-curation.php',
  'editorial-discovery-graph.php',
  'editorial-release-readiness.php',
  'image-metadata-contract.php',
  'social-image-alt-contract.php',
]) {
  assert.ok(QUALITY_WORKFLOW.includes('php tests/php/' + contract),
    'Quality workflow must execute the authoritative PHP contract: ' + contract);
}

function runStrictYamlParserFixture(source) {
  const result = spawnSync(process.env.PYTHON || 'python3', [STRICT_YAML_PARSER], {
    input: Buffer.from(source, 'utf8'),
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  let report;
  try {
    report = JSON.parse(result.stdout || '');
  } catch (error) {
    throw new Error('Strict YAML parser fixture returned invalid JSON: ' +
      String(result.stderr || result.stdout || error.message).trim());
  }
  return { status: result.status, report };
}

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
  const budgetRules = [
    [/Homepage hero — rooftop terrace/i, 150 * 1024],
    [/Room gallery — named room image/i, 550 * 1024],
    [/Room gallery — WebP alternate/i, 300 * 1024],
    [/Room hero — optimized sitting-room WebP/i, 320 * 1024],
    [/Room hero — JPEG fallback/i, 550 * 1024],
    [/Dining page — candlelit-table/i, 100 * 1024],
    [/Gallery: fort\/rooftop orientation — JPEG fallback/i, 750 * 1024],
    [/Gallery: fort\/rooftop orientation/i, 400 * 1024],
  ];
  const matchedBudget = budgetRules.find(([role]) => role.test(entry.intendedRole));
  const budget = matchedBudget ? matchedBudget[1] : MAX_BYTES;
  const isNamedRoom = /Room gallery — named room image/i.test(entry.intendedRole);
  assert.ok(buffer.length > 0 && buffer.length <= budget,
    'Asset exceeds ' + Math.round(budget / 1024) + ' KiB budget: ' + entry.targetPath);
  assert.deepEqual(getDimensions(buffer, entry.targetPath), entry.dimensions, 'Dimensions differ from manifest: ' + entry.targetPath);
  const localBlobSha = crypto.createHash('sha1')
    .update(Buffer.from('blob ' + buffer.length + '\0'))
    .update(buffer)
    .digest('hex');
  assert.equal(localBlobSha, entry.targetBlobSha, 'Local file Git blob SHA differs from manifest: ' + entry.targetPath);
  const pageNames = [...new Set([entry.verificationPage, ...(entry.additionalVerificationPages || [])])];
  for (const pageName of pageNames) {
    const page = pageContent(pageName);
    assert.ok(page.includes('src="' + entry.targetPath + '"') || page.includes('srcset="' + entry.targetPath + '"'),
      pageName + ' missing asset reference: ' + entry.targetPath);
    assert.ok(page.includes('alt="' + entry.altText + '"'),
      pageName + ' alt text differs from manifest: ' + entry.targetPath);
  }

  if (entry.targetPath.includes('/hotel/')) assert.match(entry.visualSubject, /fort|rooftop/i, 'Fort/rooftop subject-role mismatch');
  else if (entry.targetPath.includes('/desert/')) assert.match(entry.visualSubject, /desert camp/i, 'Desert subject-role mismatch');
  else if (entry.targetPath.includes('/experiences/')) assert.match(entry.visualSubject, /tent|desert|camel|heritage/i, 'Experience media subject-role mismatch');
  else if (/Room hero/i.test(entry.intendedRole)) {
    assert.match(entry.visualSubject, /sitting (room|area)|interior/i, 'Room-hero interior subject-role mismatch');
  } else if (/room/i.test(entry.intendedRole)) {
    assert.match(entry.visualSubject, /room/i, 'Room media subject-role mismatch');
  }
  else if (/Homepage hero — rooftop terrace/i.test(entry.intendedRole)) assert.match(entry.visualSubject, /rooftop|terrace/i, 'Homepage hero subject-role mismatch');
  else if (/Dining page — candlelit-table/i.test(entry.intendedRole)) assert.match(entry.visualSubject, /candlelit|table/i, 'Dining image subject-role mismatch');
  else assert.fail('Media target is outside the curated image taxonomy: ' + entry.targetPath);
}


const { auditAuthoritativeGallerySource, decodeGalleryImages, PAGE_MEDIA_SLOT_DEFINITIONS } = require('./audit-authoritative-gallery-source');

function galleryField(name, spec, indentation = 6) {
  const spaces = ' '.repeat(indentation);
  const lines = [
    spaces + '- name: ' + name,
    spaces + '  widget: ' + spec.widget,
    spaces + '  required: ' + (spec.required ? 'true' : 'false'),
  ];
  if (spec.defaultValue !== undefined) lines.push(spaces + '  default: ' + spec.defaultValue);
  if (spec.options && spec.options.length) {
    lines.push(spaces + '  options:');
    for (const option of spec.options) {
      lines.push(spaces + '    - label: ' + option, spaces + '      value: ' + option);
    }
  }
  if (spec.patterns && spec.patterns.length) {
    lines.push(spaces + '  pattern:');
    for (const pattern of spec.patterns) lines.push(spaces + '    - ' + pattern);
  }
  if (spec.children && spec.children.length) {
    lines.push(spaces + '  fields:');
    for (const child of spec.children) lines.push(galleryField(child.name, child.spec, indentation + 4));
  }
  return lines.join('\n');
}

function pageMediaApprovalFieldSpecs() {
  return [
    { name: 'src', spec: { widget: 'image', required: true } },
    { name: 'alt', spec: { widget: 'string', required: true } },
    { name: 'caption', spec: { widget: 'string', required: false, defaultValue: '' } },
    {
      name: 'approval',
      spec: {
        widget: 'object',
        required: false,
        children: [
          {
            name: 'status',
            spec: {
              widget: 'select',
              required: true,
              defaultValue: 'pending',
              options: ['pending', 'approved', 'rejected', 'revoked'],
            },
          },
          { name: 'source_credit', spec: { widget: 'string', required: false, defaultValue: '' } },
          { name: 'rights_basis', spec: { widget: 'string', required: false, defaultValue: '' } },
          { name: 'visual_match_review', spec: { widget: 'text', required: false, defaultValue: '' } },
          { name: 'alt_text_review', spec: { widget: 'text', required: false, defaultValue: '' } },
          { name: 'technical_validation', spec: { widget: 'hidden', required: false, defaultValue: '' } },
          { name: 'asset_sha256', spec: { widget: 'hidden', required: false, defaultValue: '' } },
          { name: 'approved_by', spec: { widget: 'hidden', required: false, defaultValue: '' } },
          { name: 'approved_at', spec: { widget: 'hidden', required: false, defaultValue: '' } },
          { name: 'signature', spec: { widget: 'hidden', required: false, defaultValue: '' } },
        ],
      },
    },
  ];
}

function makeGalleryFixture(root, options, record) {
  const schemaOptions = options || {};
  const safeDefaults = schemaOptions.safeDefaults !== false;
  const fields = [
    {
      name: 'status',
      spec: {
        widget: 'select',
        required: true,
        defaultValue: safeDefaults ? 'draft' : 'live',
        options: ['draft', 'live', 'hidden'],
      },
    },
    {
      name: 'review_status',
      spec: {
        widget: 'select',
        required: true,
        defaultValue: safeDefaults ? 'draft' : 'approved',
        options: ['draft', 'review_required', 'approved', 'rejected'],
      },
    },
  ];

  if (schemaOptions.includeEvidence !== false) {
    fields.push(
      {
        name: 'sourceEvidence',
        spec: {
          widget: 'object',
          required: true,
          children: [
            {
              name: 'status',
              spec: {
                widget: 'select',
                required: true,
                defaultValue: safeDefaults ? 'unverified' : 'owner-confirmed',
                options: ['unverified', 'owner-confirmed', 'licensed'],
              },
            },
            { name: 'creator', spec: { widget: 'string', required: false } },
            {
              name: 'sourceUrl',
              spec: { widget: 'string', required: false, patterns: ["'^https://'"] },
            },
            { name: 'licenseName', spec: { widget: 'string', required: false } },
            { name: 'evidenceReference', spec: { widget: 'string', required: false } },
            { name: 'verifiedBy', spec: { widget: 'string', required: false } },
            { name: 'verifiedAt', spec: { widget: 'string', required: false } },
          ],
        },
      },
      {
        name: 'visualReview',
        spec: {
          widget: 'object',
          required: true,
          children: [
            {
              name: 'status',
              spec: {
                widget: 'select',
                required: true,
                defaultValue: safeDefaults ? 'not_assessed' : 'matched',
                options: ['not_assessed', 'matched', 'mismatch'],
              },
            },
            { name: 'evidence', spec: { widget: 'text', required: false } },
            { name: 'reviewer', spec: { widget: 'string', required: false } },
            { name: 'reviewedAt', spec: { widget: 'string', required: false } },
          ],
        },
      },
      {
        name: 'technicalValidation',
        spec: {
          widget: 'object',
          required: true,
          children: [
            {
              name: 'status',
              spec: {
                widget: 'select',
                required: true,
                defaultValue: safeDefaults ? 'pending' : 'verified',
                options: ['pending', 'verified', 'failed'],
              },
            },
            { name: 'evidenceReference', spec: { widget: 'string', required: false } },
          ],
        },
      }
    );
  }

  const configFields = fields.slice();
  if (schemaOptions.duplicateReviewStatus) {
    const index = configFields.findIndex(field => field.name === 'review_status');
    const duplicate = JSON.parse(JSON.stringify(configFields[index]));
    duplicate.spec.defaultValue = 'approved';
    configFields.splice(index, 0, duplicate);
  }
  if (schemaOptions.duplicateEvidenceStatus) {
    const evidence = configFields.find(field => field.name === 'sourceEvidence');
    const index = evidence.spec.children.findIndex(field => field.name === 'status');
    const duplicate = JSON.parse(JSON.stringify(evidence.spec.children[index]));
    duplicate.spec.defaultValue = 'owner-confirmed';
    evidence.spec.children.splice(index, 0, duplicate);
  }

  fs.mkdirSync(path.join(root, 'admin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content', 'gallery'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content', 'page-media'), { recursive: true });
  fs.mkdirSync(path.join(root, 'include'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'img', 'gallery'), { recursive: true });
  const configLines = [
    'collections:',
    '  - name: gallery',
    '    folder: ' + (schemaOptions.collectionFolder || '/content/gallery'),
    '    format: ' + (schemaOptions.collectionFormat || 'json'),
    '    create: true',
    '    delete: false',
    '    identifier_field: id',
    '    fields:',
    ...configFields.map(field => galleryField(field.name, field.spec)),
    '  - name: page_media_slots',
    '    files:',
  ];
  for (const [area, slotIds] of Object.entries(PAGE_MEDIA_SLOT_DEFINITIONS)) {
    configLines.push(
      '    - name: ' + area,
      '      file: content/page-media/' + area + '.json',
      '      fields:'
    );
    for (const slotId of slotIds) {
      configLines.push(galleryField(slotId, {
        widget: 'object',
        required: false,
        children: pageMediaApprovalFieldSpecs(),
      }, 8));
    }
  }
  const config = configLines.join('\n') + '\n';
  fs.writeFileSync(path.join(root, 'admin', 'config.yml'), config, 'utf8');
  fs.writeFileSync(
    path.join(root, 'img', 'gallery', 'fixture.png'),
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  );

  const pendingApproval = {
    status: 'pending',
    source_credit: '',
    rights_basis: '',
    visual_match_review: '',
    alt_text_review: '',
    technical_validation: '',
    asset_sha256: '',
    approved_by: '',
    approved_at: '',
    signature: '',
  };
  for (const [area, slotIds] of Object.entries(PAGE_MEDIA_SLOT_DEFINITIONS)) {
    const pageRecords = {};
    for (const slotId of slotIds) {
      pageRecords[slotId] = {
        src: 'img/gallery/fixture.png',
        alt: 'Descriptive fixture image for ' + slotId + ' used only in governance tests',
        caption: '',
        approval: { ...pendingApproval },
      };
    }
    fs.writeFileSync(
      path.join(root, 'content', 'page-media', area + '.json'),
      JSON.stringify(pageRecords, null, 2)
    );
  }

  const loaderIds = Object.values(PAGE_MEDIA_SLOT_DEFINITIONS).flat();
  fs.writeFileSync(path.join(root, 'include', 'site-media-slots.php'), [
    'function gj_load_site_media_slots() {',
    ...loaderIds.map(id => "  '" + id + "' => '" + id + "',"),
    '}',
    'function gj_site_media_slot($slots, $slotId, $fallback) {',
    "  if (!isset($slots[$slotId]['approved']) || $slots[$slotId]['approved'] !== true) {",
    '    return is_array($fallback) ? $fallback : [];',
    '  }',
    '}',
    'gj_page_media_approval_is_valid($id, $source, $alt, $caption, $approval, $imagePath, $key, $approvers);',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'include', 'page-media-approval.php'), [
    "hash_hmac('sha256', $payload, $key);",
    "hash_file('sha256', $imagePath);",
    'hash_equals($expectedSignature, $signature);',
    "'status' => 'approved', 'technical_validation', 'asset_sha256',",
    "'approved_by', 'approved_at', 'signature',",
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'scripts', 'sign-page-media-approval.php'), [
    "if (PHP_SAPI !== 'cli') { exit(1); }",
    "media_approval_hmac_key; media_approvers;",
    'gj_page_media_approval_is_valid($slotId, $source, $alt, $caption, $approval, $imagePath, $key, $approvers);',
    'tempnam($directory, $prefix); rename($tempFile, $file);',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'include', 'site-config.php'), [
    "'media_approvers' => [],",
    "'media_approval_hmac_key' => '',",
    "getenv('GJ_MEDIA_APPROVAL_HMAC_KEY');",
    "'site-config.local.php';",
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'content', 'gallery', record.id + '.json'), JSON.stringify(record, null, 2));
}


function injectDuplicateYamlProperty(root, blockMarker, existingLine, duplicateLine) {
  const configPath = path.join(root, 'admin', 'config.yml');
  const config = fs.readFileSync(configPath, 'utf8');
  const blockIndex = config.indexOf(blockMarker);
  assert.notEqual(blockIndex, -1, 'Expected YAML block marker: ' + blockMarker);
  const propertyIndex = config.indexOf(existingLine, blockIndex);
  assert.notEqual(propertyIndex, -1, 'Expected YAML property line: ' + existingLine);
  const nextCollection = config.indexOf('\n  - name:', blockIndex + blockMarker.length);
  assert.ok(nextCollection === -1 || propertyIndex < nextCollection,
    'Expected property to belong to the selected YAML block');
  const insertionPoint = propertyIndex + existingLine.length;
  const updated = config.slice(0, insertionPoint) + '\n' + duplicateLine + config.slice(insertionPoint);
  fs.writeFileSync(configPath, updated, 'utf8');
}
function moveGalleryCollectionOutsideRootCollections(root, rootKey = 'extension:') {
  const configPath = path.join(root, 'admin', 'config.yml');
  const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
  const galleryIndex = lines.indexOf('  - name: gallery');
  const nextCollectionIndex = lines.findIndex((line, index) =>
    index > galleryIndex && line === '  - name: page_media_slots'
  );
  assert.notEqual(galleryIndex, -1, 'Expected the real Gallery collection');
  assert.notEqual(nextCollectionIndex, -1, 'Expected the following page-media collection');

  const decoyGallery = lines.slice(galleryIndex, nextCollectionIndex);
  const unrelatedCollection = [
    '  - name: unrelated',
    '    folder: /content/unrelated',
    '    format: json',
    '    create: true',
    '    delete: false',
    '    identifier_field: id',
    '    fields:',
    '      - name: id',
    '        widget: string',
  ];
  lines.splice(galleryIndex, nextCollectionIndex - galleryIndex, ...unrelatedCollection);
  // This is valid YAML but is not a child of the root "collections" key.
  lines.push(rootKey, ...decoyGallery);
  fs.writeFileSync(configPath, lines.join('\n'), 'utf8');
}


function appendRootCollectionsDeclaration(root, declaration) {
  const configPath = path.join(root, 'admin', 'config.yml');
  fs.appendFileSync(configPath, '\n' + declaration + '\n', 'utf8');
}

const sourceAuditDirectory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'garh-source-gallery-audit-'));
try {
  const pinnedRoot = path.join(sourceAuditDirectory, 'pinned');
  const currentRoot = path.join(sourceAuditDirectory, 'current');
  const manifestPath = path.join(sourceAuditDirectory, 'manifest.json');
  fs.mkdirSync(pinnedRoot, { recursive: true });
  const pinnedCommit = 'a'.repeat(40);
  const currentCommit = 'b'.repeat(40);
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    sourceRepository: 'https://github.com/tchouhanjsm/garh-jaisal-website',
    sourceBranch: 'main',
    sourceCommit: pinnedCommit,
    entries: [],
  }));

  const unreviewedRecord = {
    id: 'hotel-01-facade',
    category: 'hotel',
    status: 'live',
    order: 1,
    image: {
      src: 'img/gallery/fixture.png',
      alt: '=HYPERLINK("https://attacker.invalid","Open")',
      crop: 'landscape',
    },
  };
  makeGalleryFixture(currentRoot, { includeEvidence: false }, unreviewedRecord);
  const decodedFixtureImages = decodeGalleryImages(currentRoot, [{ imagePath: unreviewedRecord.image.src }]);
  assert.equal(decodedFixtureImages.get(unreviewedRecord.image.src).status, 'verified');
  assert.equal(decodedFixtureImages.get(unreviewedRecord.image.src).width, 1);
  assert.equal(decodedFixtureImages.get(unreviewedRecord.image.src).height, 1);
  function auditFixture(options) {
    return auditAuthoritativeGallerySource({
      ...options,
      decodedImages: decodedFixtureImages,
      decodedPageMediaImages: decodedFixtureImages,
    });
  }
  const unreviewed = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unreviewed.status, 'REVIEW_REQUIRED');
  assert.equal(unreviewed.sourcePinDrift, true);
  assert.equal(unreviewed.sourceDiff.addedCount, 1);
  assert.equal(unreviewed.summary.liveRecords, 1);
  assert.equal(unreviewed.summary.missingReviewStatusCount, 1);
  assert.equal(unreviewed.summary.missingRightsEvidenceCount, 1);
  assert.equal(unreviewed.summary.approvalEligibleCount, 0);
  assert.equal(unreviewed.controls.automaticImportPerformed, false);
  assert.equal(unreviewed.controls.approvalAuthorized, false);
  assert.equal(unreviewed.pageMediaGovernance.summary.slotCount, 33);
  assert.equal(unreviewed.pageMediaGovernance.summary.expectedSlotCount, 33);
  assert.equal(unreviewed.pageMediaGovernance.summary.pendingCount, 33);
  assert.equal(unreviewed.pageMediaGovernance.summary.approvedStatusCount, 0);
  assert.equal(unreviewed.pageMediaGovernance.summary.approvalEligibleCount, 0);
  assert.equal(unreviewed.pageMediaGovernance.summary.tourismImportEligibleCount, 0);
  assert.equal(unreviewed.pageMediaGovernance.signatureVerification.performed, false);
  assert.equal(unreviewed.controls.pageMediaApprovalAuthorized, false);

  const reviewedRecord = {
    ...unreviewedRecord,
    review_status: 'approved',
    sourceEvidence: {
      status: 'owner-confirmed',
      creator: 'Garh Jaisal Haveli owner',
      evidenceReference: 'owner-rights-record-2026-11-02',
      verifiedBy: 'Hotel owner',
      verifiedAt: '2026-11-02',
    },
    visualReview: {
      status: 'matched',
      evidence: 'Reviewed against the original source image and intended gallery subject',
      reviewer: 'Editorial reviewer',
      reviewedAt: '2026-11-02',
    },
    technicalValidation: {
      status: 'verified',
      evidenceReference: 'image-integrity-report-2026-11-02',
    },
  };
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const complete = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(complete.status, 'EVIDENCE_COMPLETE_AWAITING_HUMAN_REVIEW');
  assert.equal(complete.summary.approvalEligibleCount, 1);
  assert.equal(complete.controls.approvalAuthorized, false);
  assert.equal(complete.controls.automaticImportPerformed, false);
  assert.equal(complete.cmsSchema.safeDefaults, true);
  assert.equal(complete.cmsSchema.supportsRequiredEvidence, true);
  assert.deepEqual(complete.cmsSchema.defaultViolations, []);
  assert.equal(complete.records[0].imageDecodeComplete, true);
  assert.equal(complete.records[0].imageWidth, 1);
  assert.equal(complete.records[0].imageHeight, 1);

  // A Gallery-shaped list under another root key must not satisfy the CMS contract.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  moveGalleryCollectionOutsideRootCollections(currentRoot);
  const outOfScopeGallery = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(outOfScopeGallery.status, 'REVIEW_REQUIRED');
  assert.equal(outOfScopeGallery.cmsSchema.available, false);
  assert.equal(outOfScopeGallery.cmsSchema.collectionValid, false);
  assert.equal(outOfScopeGallery.cmsSchema.supportsRequiredEvidence, false);
  assert.equal(outOfScopeGallery.summary.approvalEligibleCount, 0);
  assert.ok(outOfScopeGallery.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // Root-level YAML keys can contain spaces before the colon or be quoted.
  // None may allow a Gallery-shaped extension block to masquerade as a collection.
  for (const rootKey of ['extension :', "'extension':", '"extension":']) {
    makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
    moveGalleryCollectionOutsideRootCollections(currentRoot, rootKey);
    const rootKeyGallery = auditFixture({
      pinnedSourceRoot: pinnedRoot,
      pinnedSourceCommit: pinnedCommit,
      currentSourceRoot: currentRoot,
      currentSourceCommit: currentCommit,
      manifestPath,
    });
    assert.equal(rootKeyGallery.status, 'REVIEW_REQUIRED');
    assert.equal(rootKeyGallery.cmsSchema.available, false);
    assert.equal(rootKeyGallery.cmsSchema.collectionValid, false);
    assert.equal(rootKeyGallery.summary.approvalEligibleCount, 0);
    assert.ok(rootKeyGallery.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));
  }

  // Quoted YAML keys are equivalent to the unquoted collections key.
  // A later quoted duplicate must be counted before trusting the first section.
  for (const declaration of ["'collections': []", '"collections": []']) {
    makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
    appendRootCollectionsDeclaration(currentRoot, declaration);
    const duplicateQuotedCollections = auditFixture({
      pinnedSourceRoot: pinnedRoot,
      pinnedSourceCommit: pinnedCommit,
      currentSourceRoot: currentRoot,
      currentSourceCommit: currentCommit,
      manifestPath,
    });
    assert.equal(duplicateQuotedCollections.status, 'INVALID');
    assert.equal(duplicateQuotedCollections.pageMediaGovernance.status, 'INVALID');
    assert.equal(duplicateQuotedCollections.cmsSchema.available, false);
    assert.equal(duplicateQuotedCollections.cmsSchema.collectionValid, false);
    assert.equal(duplicateQuotedCollections.summary.approvalEligibleCount, 0);
    assert.ok(duplicateQuotedCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));
  }

  // A later root-level collections key can shadow the valid collection in YAML.
  // The audit must count declarations rather than silently trusting the first.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'collections: []');
  const duplicateRootCollections = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateRootCollections.status, 'INVALID');
  assert.equal(duplicateRootCollections.cmsSchema.available, false);
  assert.equal(duplicateRootCollections.cmsSchema.collectionValid, false);
  assert.equal(duplicateRootCollections.summary.approvalEligibleCount, 0);
  assert.ok(duplicateRootCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // Inline comments do not make a duplicate root-level declaration invisible.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'collections: # duplicate declaration');
  const duplicateCommentedRootCollections = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateCommentedRootCollections.status, 'INVALID');
  assert.equal(duplicateCommentedRootCollections.cmsSchema.available, false);
  assert.equal(duplicateCommentedRootCollections.summary.approvalEligibleCount, 0);
  assert.ok(duplicateCommentedRootCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // YAML treats whitespace before the mapping colon as the same root key.
  // A spaced duplicate must not bypass the duplicate-declaration guard.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'collections : []');
  const duplicateSpacedRootCollections = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateSpacedRootCollections.status, 'INVALID');
  assert.equal(duplicateSpacedRootCollections.cmsSchema.available, false);
  assert.equal(duplicateSpacedRootCollections.summary.approvalEligibleCount, 0);
  assert.ok(duplicateSpacedRootCollections.records[0].blockers.includes('cms-schema-does-not-capture-required-evidence'));

  // Quoted escape sequences are normalized by YAML before duplicate-key checks.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, '"\\u0063ollections": []');
  const escapedDuplicateCollectionKey = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(escapedDuplicateCollectionKey.status, 'INVALID');
  assert.equal(escapedDuplicateCollectionKey.cmsSchema.available, false);
  assert.ok(escapedDuplicateCollectionKey.cmsSchema.duplicatePropertyPaths.some(
    pathName => pathName.endsWith('.collections')
  ));
  assert.equal(escapedDuplicateCollectionKey.summary.approvalEligibleCount, 0);

  // Explicit YAML mapping keys are valid YAML but unsupported by the CMS contract;
  // the audit must not reinterpret them as an ordinary root section.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, '? extension\n: []');
  const explicitMappingKey = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(explicitMappingKey.status, 'INVALID');
  assert.equal(explicitMappingKey.cmsSchema.available, false);
  assert.ok(explicitMappingKey.cmsSchema.schemaViolations.some(
    item => item.includes('explicit YAML mapping keys are unsupported')
  ));
  assert.equal(explicitMappingKey.summary.approvalEligibleCount, 0);

  // Anchors and aliases can make a text-local field appear different from the
  // effective CMS configuration. They are rejected rather than expanded.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot,
    'extension: &shared\n  enabled: true\nother_extension: *shared');
  const yamlAlias = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(yamlAlias.status, 'INVALID');
  assert.equal(yamlAlias.cmsSchema.available, false);
  assert.ok(yamlAlias.cmsSchema.schemaViolations.some(
    item => item.includes('YAML anchors are unsupported') || item.includes('YAML aliases are unsupported')
  ));
  assert.equal(yamlAlias.summary.approvalEligibleCount, 0);

  // YAML merge keys are not expanded by the audit parser and must fail closed.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  appendRootCollectionsDeclaration(currentRoot, 'extension:\n  <<: { enabled: true }');
  const yamlMergeKey = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(yamlMergeKey.status, 'INVALID');
  assert.equal(yamlMergeKey.cmsSchema.available, false);
  assert.ok(yamlMergeKey.cmsSchema.schemaViolations.some(
    item => item.includes('YAML merge keys are unsupported')
  ));
  assert.equal(yamlMergeKey.summary.approvalEligibleCount, 0);

  // Duplicate keys are compared after YAML escape decoding, not as raw source text.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  injectDuplicateYamlProperty(
    currentRoot,
    '      - name: review_status',
    '        default: draft',
    '        "\\u0064efault": approved'
  );
  const escapedDuplicateProperty = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(escapedDuplicateProperty.status, 'INVALID');
  assert.equal(escapedDuplicateProperty.cmsSchema.available, false);
  assert.ok(escapedDuplicateProperty.cmsSchema.duplicatePropertyPaths.some(
    pathName => pathName.endsWith('.default')
  ));
  assert.ok(escapedDuplicateProperty.records[0].blockers.includes('cms-schema-contains-duplicate-properties'));
  assert.equal(escapedDuplicateProperty.summary.approvalEligibleCount, 0);

  // A mapping where the CMS contract requires a sequence must not be treated as
  // a valid collection field list.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const collectionConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  const originalCollectionConfig = fs.readFileSync(collectionConfigPath, 'utf8');
  const collectionFieldsStart = originalCollectionConfig.indexOf('    fields:');
  const nextCollectionStart = originalCollectionConfig.indexOf('\n  - name: page_media_slots', collectionFieldsStart);
  assert.ok(nextCollectionStart > collectionFieldsStart);
  const malformedCollectionFieldsConfig = originalCollectionConfig.slice(0, collectionFieldsStart) +
    '    fields:\n      status: { widget: select }\n' +
    originalCollectionConfig.slice(nextCollectionStart);
  assert.notEqual(malformedCollectionFieldsConfig, originalCollectionConfig);
  fs.writeFileSync(collectionConfigPath, malformedCollectionFieldsConfig, 'utf8');
  const malformedCollectionFields = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(malformedCollectionFields.status, 'REVIEW_REQUIRED');
  assert.equal(malformedCollectionFields.cmsSchema.available, true);
  assert.equal(malformedCollectionFields.cmsSchema.collectionValid, false);
  assert.ok(malformedCollectionFields.cmsSchema.collectionContractViolations.some(
    item => item.includes('fields must be a YAML sequence')
  ));
  assert.equal(malformedCollectionFields.summary.approvalEligibleCount, 0);
  assert.ok(malformedCollectionFields.records[0].blockers.includes('cms-gallery-collection-contract-invalid'));

  // Nested object fields also have to be sequences of named field mappings.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const nestedConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  const originalNestedConfig = fs.readFileSync(nestedConfigPath, 'utf8');
  const sourceEvidenceStart = originalNestedConfig.indexOf('      - name: sourceEvidence');
  const visualReviewStart = originalNestedConfig.indexOf('      - name: visualReview', sourceEvidenceStart);
  const nestedFieldsStart = originalNestedConfig.indexOf('        fields:', sourceEvidenceStart);
  assert.ok(sourceEvidenceStart >= 0 && nestedFieldsStart > sourceEvidenceStart);
  assert.ok(visualReviewStart > nestedFieldsStart);
  const malformedNestedFieldsConfig = originalNestedConfig.slice(0, nestedFieldsStart) +
    '        fields:\n          status: { widget: select }\n' +
    originalNestedConfig.slice(visualReviewStart);
  assert.notEqual(malformedNestedFieldsConfig, originalNestedConfig);
  fs.writeFileSync(nestedConfigPath, malformedNestedFieldsConfig, 'utf8');
  const malformedNestedFields = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(malformedNestedFields.status, 'REVIEW_REQUIRED');
  assert.equal(malformedNestedFields.cmsSchema.available, true);
  assert.equal(malformedNestedFields.cmsSchema.collectionValid, true);
  assert.equal(malformedNestedFields.cmsSchema.safeDefaults, false);
  assert.ok(malformedNestedFields.cmsSchema.schemaViolations.some(
    item => item.includes('gallery.sourceEvidence.fields must be a YAML sequence')
  ));
  assert.equal(malformedNestedFields.summary.approvalEligibleCount, 0);

  const mismatchedImageHash = auditAuthoritativeGallerySource({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
    decodedImages: new Map([[unreviewedRecord.image.src, {
      path: unreviewedRecord.image.src,
      status: 'verified',
      width: 1,
      height: 1,
      sha256: 'f'.repeat(64),
    }]]),
  });
  assert.equal(mismatchedImageHash.status, 'REVIEW_REQUIRED');
  assert.equal(mismatchedImageHash.summary.approvalEligibleCount, 0);
  assert.equal(mismatchedImageHash.records[0].imageDecodeComplete, false);
  assert.ok(mismatchedImageHash.records[0].blockers.includes('gallery-image-decode-validation-failed'));

  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: false }, reviewedRecord);
  const unsafeSchema = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unsafeSchema.status, 'REVIEW_REQUIRED');
  assert.equal(unsafeSchema.cmsSchema.safeDefaults, false);
  assert.equal(unsafeSchema.summary.approvalEligibleCount, 0);
  assert.ok(unsafeSchema.cmsSchema.defaultViolations.some(item => item.includes('review_status must default to draft')));
  assert.ok(unsafeSchema.records[0].blockers.includes('cms-schema-does-not-enforce-fail-closed-defaults'));

  // Duplicate field declarations must fail closed even when the last declaration is safe.
  makeGalleryFixture(currentRoot, {
    includeEvidence: true,
    safeDefaults: true,
    duplicateReviewStatus: true,
    duplicateEvidenceStatus: true,
  }, reviewedRecord);
  const duplicateSchema = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateSchema.status, 'REVIEW_REQUIRED');
  assert.equal(duplicateSchema.cmsSchema.collectionValid, true);
  assert.equal(duplicateSchema.cmsSchema.safeDefaults, false);
  assert.ok(duplicateSchema.cmsSchema.duplicateFieldPaths.includes('review_status'));
  assert.ok(duplicateSchema.cmsSchema.duplicateFieldPaths.includes('sourceEvidence.status'));
  assert.equal(duplicateSchema.summary.approvalEligibleCount, 0);
  assert.ok(duplicateSchema.records[0].blockers.includes('cms-schema-contains-duplicate-fields'));

  // The audit must bind evidence fields to the real JSON gallery collection, not a lookalike.
  makeGalleryFixture(currentRoot, {
    includeEvidence: true,
    safeDefaults: true,
    collectionFolder: '/content/unrelated',
    collectionFormat: 'yaml',
  }, reviewedRecord);
  const wrongCollection = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(wrongCollection.status, 'REVIEW_REQUIRED');
  assert.equal(wrongCollection.cmsSchema.collectionValid, false);
  assert.equal(wrongCollection.cmsSchema.safeDefaults, false);
  assert.ok(wrongCollection.cmsSchema.collectionContractViolations.some(item => item.includes('folder')));
  assert.ok(wrongCollection.cmsSchema.collectionContractViolations.some(item => item.includes('format')));
  assert.equal(wrongCollection.summary.approvalEligibleCount, 0);
  assert.ok(wrongCollection.records[0].blockers.includes('cms-gallery-collection-contract-invalid'));


  // Invalid UTF-8 inside a YAML comment must not be normalized by Node before parsing.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const invalidUtf8ConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  fs.appendFileSync(invalidUtf8ConfigPath, Buffer.from('# ignored invalid byte: \xff\n', 'binary'));
  const invalidUtf8Config = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(invalidUtf8Config.status, 'INVALID');
  assert.equal(invalidUtf8Config.cmsSchema.available, false);
  assert.ok(invalidUtf8Config.cmsSchema.schemaViolations.some(item => item.includes('valid UTF-8')));
  assert.equal(invalidUtf8Config.summary.approvalEligibleCount, 0);

  // CMS select fields must expose exactly the supported state values, not an
  // additional state that could bypass the editorial/publication vocabulary.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const optionConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  const optionConfig = fs.readFileSync(optionConfigPath, 'utf8');
  const reviewFieldStart = optionConfig.indexOf('      - name: review_status');
  const nextReviewField = optionConfig.indexOf('\n      - name:', reviewFieldStart + 1);
  assert.ok(reviewFieldStart >= 0 && nextReviewField > reviewFieldStart);
  const reviewFieldBlock = optionConfig.slice(reviewFieldStart, nextReviewField);
  assert.ok(reviewFieldBlock.includes('            value: rejected'));
  const extendedReviewFieldBlock = reviewFieldBlock.replace(
    '            value: rejected',
    '            value: rejected\n          - label: Unsupported state\n            value: published'
  );
  assert.notEqual(extendedReviewFieldBlock, reviewFieldBlock);
  fs.writeFileSync(optionConfigPath,
    optionConfig.slice(0, reviewFieldStart) + extendedReviewFieldBlock + optionConfig.slice(nextReviewField),
    'utf8');
  const unexpectedChoice = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unexpectedChoice.status, 'REVIEW_REQUIRED');
  assert.equal(unexpectedChoice.cmsSchema.safeDefaults, false);
  assert.ok(unexpectedChoice.cmsSchema.defaultViolations.some(
    item => item.includes('review_status options must match the exact allowed values')
  ));
  assert.equal(unexpectedChoice.summary.approvalEligibleCount, 0);

  // A select option without a non-empty display label is not a valid CMS choice.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const unlabeledOptionConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  const unlabeledOptionConfig = fs.readFileSync(unlabeledOptionConfigPath, 'utf8');
  const statusFieldStart = unlabeledOptionConfig.indexOf('      - name: status');
  const nextStatusField = unlabeledOptionConfig.indexOf('\n      - name:', statusFieldStart + 1);
  assert.ok(statusFieldStart >= 0 && nextStatusField > statusFieldStart);
  const statusFieldBlock = unlabeledOptionConfig.slice(statusFieldStart, nextStatusField);
  const unlabeledStatusFieldBlock = statusFieldBlock.replace(
    '          - label: draft\n            value: draft',
    '          - value: draft'
  );
  assert.notEqual(unlabeledStatusFieldBlock, statusFieldBlock);
  fs.writeFileSync(unlabeledOptionConfigPath,
    unlabeledOptionConfig.slice(0, statusFieldStart) + unlabeledStatusFieldBlock + unlabeledOptionConfig.slice(nextStatusField),
    'utf8');
  const unlabeledOption = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unlabeledOption.status, 'REVIEW_REQUIRED');
  assert.equal(unlabeledOption.cmsSchema.safeDefaults, false);
  assert.ok(unlabeledOption.cmsSchema.schemaViolations.some(
    item => item.includes('options[0] must contain non-empty string label and value')
  ));
  assert.equal(unlabeledOption.summary.approvalEligibleCount, 0);

  // Duplicate scalar YAML properties must fail closed; the CMS parser may use the later value.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  injectDuplicateYamlProperty(
    currentRoot,
    '      - name: review_status',
    '        default: draft',
    '        default: approved'
  );
  const duplicateFieldProperty = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateFieldProperty.status, 'INVALID');
  assert.equal(duplicateFieldProperty.cmsSchema.safeDefaults, false);
  assert.ok(duplicateFieldProperty.cmsSchema.duplicatePropertyPaths.some(pathName => pathName.endsWith('.default')));
  assert.ok(duplicateFieldProperty.records[0].blockers.includes('cms-schema-contains-duplicate-properties'));
  assert.equal(duplicateFieldProperty.summary.approvalEligibleCount, 0);

  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  injectDuplicateYamlProperty(
    currentRoot,
    '  - name: gallery',
    '    folder: /content/gallery',
    '    folder: /content/unrelated'
  );
  const duplicateCollectionProperty = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(duplicateCollectionProperty.status, 'INVALID');
  assert.equal(duplicateCollectionProperty.cmsSchema.collectionValid, false);
  assert.equal(duplicateCollectionProperty.cmsSchema.safeDefaults, false);
  assert.ok(duplicateCollectionProperty.cmsSchema.duplicatePropertyPaths.some(pathName => pathName.endsWith('.folder')));
  assert.equal(duplicateCollectionProperty.summary.approvalEligibleCount, 0);
  assert.ok(duplicateCollectionProperty.records[0].blockers.includes('cms-gallery-collection-contract-invalid'));

  // Parser complexity budgets are enforced during token scanning, before node composition.
  const nestedYaml = depth => {
    const lines = ['root:'];
    for (let level = 0; level < depth; level += 1) {
      lines.push('  '.repeat(level + 1) + '-');
    }
    lines.push('  '.repeat(depth + 1) + 'leaf');
    return lines.join('\n') + '\n';
  };
  const maximumDepth = runStrictYamlParserFixture(nestedYaml(63));
  assert.equal(maximumDepth.status, 0);
  assert.equal(maximumDepth.report.ok, true);
  const excessiveDepth = runStrictYamlParserFixture(nestedYaml(64));
  assert.equal(excessiveDepth.status, 1);
  assert.match(excessiveDepth.report.error, /nesting exceeds the 64-level parser limit/);

  const maximumScalar = runStrictYamlParserFixture(
    'value: "' + 'x'.repeat(64 * 1024) + '"\n'
  );
  assert.equal(maximumScalar.status, 0);
  assert.equal(maximumScalar.report.ok, true);
  const excessiveScalar = runStrictYamlParserFixture(
    'value: "' + 'x'.repeat(64 * 1024 + 1) + '"\n'
  );
  assert.equal(excessiveScalar.status, 1);
  assert.match(excessiveScalar.report.error, /scalar exceeds the 65,536-character parser limit/);

  const tokenBudgetYaml = count =>
    'extension:\n' + Array.from({ length: count }, () => '  - x').join('\n') + '\n';
  const maximumTokenBudget = runStrictYamlParserFixture(tokenBudgetYaml(49995));
  assert.equal(maximumTokenBudget.status, 0);
  assert.equal(maximumTokenBudget.report.ok, true);
  const excessiveTokenBudget = runStrictYamlParserFixture(tokenBudgetYaml(49996));
  assert.equal(excessiveTokenBudget.status, 1);
  assert.match(excessiveTokenBudget.report.error, /exceeds the 100,000 YAML token limit/);

  const unsafeRecord = {
    ...unreviewedRecord,
    image: { ...unreviewedRecord.image, src: 'img/../../outside.jpg' },
  };
  makeGalleryFixture(currentRoot, { includeEvidence: false, safeDefaults: true }, unsafeRecord);
  const unsafe = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unsafe.status, 'INVALID');
  assert.equal(unsafe.summary.recordCount, 0);

  // Page-media approval defaults must remain pending in the real CMS file collection.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const pageMediaConfigPath = path.join(currentRoot, 'admin', 'config.yml');
  const pageMediaConfig = fs.readFileSync(pageMediaConfigPath, 'utf8');
  const pageMediaCollectionStart = pageMediaConfig.indexOf('  - name: page_media_slots');
  const pendingDefaultIndex = pageMediaConfig.indexOf('default: pending', pageMediaCollectionStart);
  assert.ok(pageMediaCollectionStart >= 0 && pendingDefaultIndex > pageMediaCollectionStart);
  fs.writeFileSync(
    pageMediaConfigPath,
    pageMediaConfig.slice(0, pendingDefaultIndex) + 'default: approved' +
      pageMediaConfig.slice(pendingDefaultIndex + 'default: pending'.length),
    'utf8'
  );
  const unsafePageMediaDefault = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unsafePageMediaDefault.pageMediaGovernance.status, 'INVALID');
  assert.ok(unsafePageMediaDefault.pageMediaGovernance.schemaViolations.some(
    item => item.includes('.approval.status default must be "pending"')
  ));
  assert.equal(unsafePageMediaDefault.pageMediaGovernance.summary.approvalEligibleCount, 0);

  // A syntactically complete approval is still not eligible until the private HMAC is verified.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const approvedHomePath = path.join(currentRoot, 'content', 'page-media', 'home.json');
  const approvedHome = JSON.parse(fs.readFileSync(approvedHomePath, 'utf8'));
  const approvedSlotId = PAGE_MEDIA_SLOT_DEFINITIONS.home[0];
  const approvedRecord = approvedHome[approvedSlotId];
  const approvedAssetHash = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(currentRoot, 'img', 'gallery', 'fixture.png')))
    .digest('hex');
  approvedRecord.approval = {
    status: 'approved',
    source_credit: 'Photograph supplied by the hotel owner',
    rights_basis: 'Owner confirms permission for use on the hotel website',
    visual_match_review: 'Reviewer confirms the image matches the fixed page slot subject',
    alt_text_review: 'Reviewer confirms the descriptive alt text matches the visible image',
    technical_validation: 'passed',
    asset_sha256: approvedAssetHash,
    approved_by: 'Owner Reviewer',
    approved_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    signature: 'a'.repeat(64),
  };
  fs.writeFileSync(approvedHomePath, JSON.stringify(approvedHome, null, 2));
  const unverifiedPageMediaApproval = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unverifiedPageMediaApproval.pageMediaGovernance.summary.approvedStatusCount, 1);
  assert.equal(unverifiedPageMediaApproval.pageMediaGovernance.summary.approvedEvidenceCompleteCount, 1);
  assert.equal(unverifiedPageMediaApproval.pageMediaGovernance.signatureVerification.performed, false);
  assert.equal(unverifiedPageMediaApproval.pageMediaGovernance.summary.approvalEligibleCount, 0);
  assert.equal(unverifiedPageMediaApproval.pageMediaGovernance.summary.tourismImportEligibleCount, 0);
  assert.equal(unverifiedPageMediaApproval.pageMediaGovernance.status, 'REVIEW_REQUIRED_UNVERIFIED_SIGNATURES');

  // A missing fixed slot must not be hidden by the remaining valid records.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const missingSlotPath = path.join(currentRoot, 'content', 'page-media', 'home.json');
  const missingSlotRecords = JSON.parse(fs.readFileSync(missingSlotPath, 'utf8'));
  delete missingSlotRecords[PAGE_MEDIA_SLOT_DEFINITIONS.home[0]];
  fs.writeFileSync(missingSlotPath, JSON.stringify(missingSlotRecords, null, 2));
  const missingPageMediaSlot = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(missingPageMediaSlot.pageMediaGovernance.status, 'INVALID');
  assert.ok(missingPageMediaSlot.pageMediaGovernance.structuralErrors.some(
    item => item.includes('must contain exactly its 13 fixed slot records')
  ));

  // Unsafe image paths in page-media JSON must fail closed before import or approval.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  const unsafePagePath = path.join(currentRoot, 'content', 'page-media', 'home.json');
  const unsafePageRecords = JSON.parse(fs.readFileSync(unsafePagePath, 'utf8'));
  unsafePageRecords[PAGE_MEDIA_SLOT_DEFINITIONS.home[0]].src = 'img/../outside.webp';
  fs.writeFileSync(unsafePagePath, JSON.stringify(unsafePageRecords, null, 2));
  const unsafePageMediaPath = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unsafePageMediaPath.pageMediaGovernance.status, 'INVALID');
  assert.equal(unsafePageMediaPath.pageMediaGovernance.summary.approvalEligibleCount, 0);
  assert.equal(unsafePageMediaPath.controls.pageMediaTourismImportAuthorized, false);

  // The PHP runtime fallback must remain fail-closed and the signing CLI must remain non-web.
  makeGalleryFixture(currentRoot, { includeEvidence: true, safeDefaults: true }, reviewedRecord);
  fs.writeFileSync(
    path.join(currentRoot, 'include', 'site-media-slots.php'),
    "function gj_site_media_slot($slots, $slotId, $fallback) { return $slots[$slotId]['approved'] === true ? $slots[$slotId]['image'] : []; }"
  );
  const unsafePageMediaRuntime = auditFixture({
    pinnedSourceRoot: pinnedRoot,
    pinnedSourceCommit: pinnedCommit,
    currentSourceRoot: currentRoot,
    currentSourceCommit: currentCommit,
    manifestPath,
  });
  assert.equal(unsafePageMediaRuntime.pageMediaGovernance.status, 'INVALID');
  assert.ok(unsafePageMediaRuntime.pageMediaGovernance.structuralErrors.some(
    item => item.includes('PHP fixed-slot loader is missing its fail-closed contract')
  ));
} finally {
  fs.rmSync(sourceAuditDirectory, { recursive: true, force: true });
}



function testGalleryOwnerReviewBundle() {
  const os = require('node:os');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-gallery-review-fixture-'));
  const sourceRoot = path.join(fixtureRoot, 'source');
  const outputDirectory = path.join(fixtureRoot, 'review-bundle');
  const auditPath = path.join(fixtureRoot, 'audit.json');
  try {
    fs.mkdirSync(path.join(sourceRoot, 'img', 'gallery'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'content', 'gallery'), { recursive: true });
    const imageBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    fs.writeFileSync(path.join(sourceRoot, 'img', 'gallery', 'owner-review.png'), imageBytes);
    const galleryRecord = {
      id: 'hotel-01-facade',
      category: 'hotel',
      status: 'live',
      review_status: 'draft',
      order: 1,
      image: {
        src: 'img/gallery/owner-review.png',
        alt: 'Carved sandstone facade inside the historic Jaisalmer Fort',
        crop: 'landscape',
      },
    };
    const recordBytes = Buffer.from(JSON.stringify(galleryRecord, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'content', 'gallery', 'hotel-01-facade.json'), recordBytes);

    const git = (args) => {
      const result = spawnSync('git', args, { cwd: sourceRoot, encoding: 'utf8', timeout: 15000 });
      if (result.error || result.status !== 0) {
        throw new Error('Gallery bundle fixture Git command failed: ' +
          String(result.stderr || (result.error && result.error.message) || 'unknown error'));
      }
      return String(result.stdout || '').trim();
    };
    git(['init', '-q']);
    git(['config', 'user.name', 'Gallery Fixture']);
    git(['config', 'user.email', 'gallery-fixture@example.invalid']);
    git(['add', '.']);
    git(['commit', '-q', '-m', 'fixture source']);
    const sourceCommit = git(['rev-parse', 'HEAD']);
    const imageSha256 = crypto.createHash('sha256').update(imageBytes).digest('hex');
    const imageGitBlobSha = crypto.createHash('sha1')
      .update(Buffer.from('blob ' + imageBytes.length + '\0', 'utf8'))
      .update(imageBytes)
      .digest('hex');
    const stableFixtureJson = value => {
      if (Array.isArray(value)) return '[' + value.map(stableFixtureJson).join(',') + ']';
      if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(key =>
          JSON.stringify(key) + ':' + stableFixtureJson(value[key])
        ).join(',') + '}';
      }
      return JSON.stringify(value);
    };
    const recordSignature = crypto.createHash('sha256')
      .update(stableFixtureJson(galleryRecord) + '\0' + imageSha256)
      .digest('hex');
    const audit = {
      schemaVersion: 1,
      auditType: 'read-only-authoritative-gallery-source-drift',
      sourceRepository: 'https://github.com/tchouhanjsm/garh-jaisal-website',
      sourceBranch: 'main',
      pinnedSourceCommit: sourceCommit,
      currentSourceCommit: sourceCommit,
      sourcePinDrift: false,
      summary: { recordCount: 1, missingRightsEvidenceCount: 1, missingVisualReviewCount: 1 },
      records: [{
        id: 'hotel-01-facade',
        category: 'hotel',
        publicationStatus: 'live',
        reviewStatus: 'draft',
        imagePath: 'img/gallery/owner-review.png',
        imageBytes: imageBytes.length,
        imageSha256,
        imageGitBlobSha,
        signature: recordSignature,
        imageDecodeComplete: true,
        imageWidth: 1,
        imageHeight: 1,
        meaningfulAltText: false,
        rightsEvidenceComplete: false,
        visualReviewComplete: false,
        technicalValidationComplete: false,
        blockers: ['creator-source-rights-evidence-incomplete', 'documented-visual-match-missing'],
      }],
      structuralErrors: [],
      status: 'REVIEW_REQUIRED',
    };
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');
    const result = buildGalleryReviewBundle({
      sourceRoot,
      sourceCommit,
      auditPath,
      outputDirectory,
      generatedAt: '2026-11-03T12:00:00Z',
    });
    assert.equal(result.summary.recordCount, 1);
    assert.equal(result.summary.uniqueImageCount, 1);
    assert.equal(result.summary.missingRightsEvidenceCount, 1);
    assert.equal(result.summary.missingVisualReviewCount, 1);
    assert.equal(result.summary.approvalEligibleCount, 0);
    assert.equal(result.manifest.policy.mediaApproved, false);
    assert.equal(result.manifest.policy.sourceRecordsChanged, false);
    assert.equal(result.decisions.decisions[0].ownerDecision, 'pending');
    assert.equal(result.decisions.decisions[0].sourceEvidence.status, 'unverified');
    assert.equal(result.decisions.decisions[0].visualReview.status, 'not_assessed');
    assert.equal(result.decisions.decisions[0].technicalValidation.status, 'pending');
    assert.deepEqual(
      fs.readFileSync(path.join(outputDirectory, result.manifest.records[0].previewImagePath)),
      imageBytes
    );
    const reviewHtml = fs.readFileSync(path.join(outputDirectory, 'index.html'), 'utf8');
    const reviewCsv = fs.readFileSync(path.join(outputDirectory, 'review.csv'), 'utf8');
    assert.ok(reviewHtml.includes('hotel-01-facade'));
    assert.ok(reviewHtml.includes('Content-Security-Policy'));
    assert.ok(reviewHtml.includes("default-src 'none'"));
    assert.ok(reviewHtml.includes("img-src 'self'"));
    assert.ok(reviewHtml.includes('name="referrer" content="no-referrer"'));
    assert.ok(!reviewHtml.includes('<script'));
    assert.ok(!reviewHtml.includes('src="https://'));
    assert.ok(!reviewHtml.includes("src='https://"));
    assert.ok(!reviewHtml.includes('href="https://'));
    assert.ok(!reviewHtml.includes("href='https://"));
    assert.ok(reviewCsv.includes('creator-source-rights-evidence-incomplete'));
    assert.ok(reviewCsv.includes(csvCell(galleryRecord.image.alt)));
    assert.ok(fs.existsSync(path.join(outputDirectory, 'gallery-decisions.template.json')));

    fs.writeFileSync(path.join(sourceRoot, 'img', 'gallery', 'owner-review.png'), Buffer.from('changed'));
    assert.throws(
      () => buildGalleryReviewBundle({
        sourceRoot,
        sourceCommit,
        auditPath,
        outputDirectory: path.join(fixtureRoot, 'tampered-bundle'),
        generatedAt: '2026-11-03T12:00:00Z',
      }),
      /working tree is not clean/
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}
testGalleryOwnerReviewBundle();

async function testEditorialReviewAuthority() {
  const expectedHead = 'a'.repeat(40);
  const otherHead = 'b'.repeat(40);
  const baseSha = 'c'.repeat(40);
  const repository = 'owner/repository';
  const observedAt = '2026-11-03T11:30:00Z';

  const pullRequest = (overrides = {}) => ({
    number: 77,
    state: 'open',
    base: { ref: 'main', sha: baseSha, repo: { full_name: repository } },
    head: { sha: expectedHead, repo: { full_name: repository } },
    ...overrides,
  });
  const review = (id, overrides = {}) => ({
    id,
    state: 'COMMENTED',
    commit_id: expectedHead,
    submitted_at: observedAt,
    user: { login: 'reviewer-' + id, id: 10000 + id },
    ...overrides,
  });
  const response = data => ({ ok: true, status: 200, json: async () => data });

  function mockFetch(options = {}) {
    const snapshots = options.pullRequests || [pullRequest(), pullRequest()];
    const pages = options.reviewPages || { 1: [] };
    const requests = [];
    let pullRequestReads = 0;
    const fetchImpl = async (url, init) => {
      requests.push(url);
      assert.equal(init.headers.Authorization, 'Bearer fixture-token');
      assert.equal(init.headers['X-GitHub-Api-Version'], '2022-11-28');
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith('/pulls/77')) {
        const index = Math.min(pullRequestReads, snapshots.length - 1);
        pullRequestReads += 1;
        return response(snapshots[index]);
      }
      if (parsedUrl.pathname.endsWith('/pulls/77/reviews') &&
          parsedUrl.searchParams.get('per_page') === '100') {
        const page = Number(parsedUrl.searchParams.get('page'));
        if (!Number.isSafeInteger(page) || page < 1) {
          throw new Error('Invalid review page number in fixture URL.');
        }
        return response(pages[page] || []);
      }
      throw new Error('Unexpected GitHub API URL in fixture: ' + url);
    };
    return { fetchImpl, requests };
  }

  const runAudit = (fixture, overrides = {}) => auditEditorialReviewAuthority({
    repository,
    pullRequestNumber: 77,
    expectedHead,
    token: 'fixture-token',
    observedAt,
    fetchImpl: fixture.fetchImpl,
    ...overrides,
  });

  // An APPROVED code review is evidence only; it never authorizes editorial media.
  const approvedFixture = mockFetch({ reviewPages: { 1: [review(1, { state: 'APPROVED' })] } });
  const approvedEvidence = await runAudit(approvedFixture);
  assert.equal(approvedEvidence.pullRequest.exactHeadMatch, true);
  assert.equal(approvedEvidence.pullRequest.metadataRevalidatedAfterReviewRead, true);
  assert.equal(approvedEvidence.reviewEvidence.snapshotComplete, true);
  assert.equal(approvedEvidence.reviewEvidence.reviewCount, 1);
  assert.equal(approvedEvidence.reviewEvidence.currentHeadReviewCount, 1);
  assert.deepEqual(approvedEvidence.reviewEvidence.currentHeadReviewIds, [1]);
  assert.equal(approvedEvidence.reviewEvidence.currentHeadStateCounts.APPROVED, 1);
  assert.equal(approvedEvidence.reviewerAuthorization.state, 'NOT_CONFIGURED');
  assert.equal(approvedEvidence.reviewerAuthorization.policyConfigured, false);
  assert.equal(approvedEvidence.reviewerAuthorization.identityVerified, false);
  assert.equal(approvedEvidence.reviewerAuthorization.approvalAuthorized, false);
  assert.equal(approvedEvidence.releaseInvariants.reviewEvidenceIsAuthorization, false);
  assert.equal(approvedEvidence.releaseInvariants.publicationEligible, false);
  assert.equal(approvedEvidence.releaseInvariants.approvedMediaChanged, false);
  assert.equal(approvedEvidence.releaseInvariants.contentRecordsChanged, false);
  assert.equal(approvedEvidence.releaseInvariants.publicationTriggered, false);

  // Submitted reviews on older commits are recorded but never counted as current-head reviews.
  const staleReviewFixture = mockFetch({ reviewPages: { 1: [review(2, { commit_id: otherHead })] } });
  const staleReviewEvidence = await runAudit(staleReviewFixture);
  assert.equal(staleReviewEvidence.reviewEvidence.offHeadSubmittedReviewCount, 1);
  assert.equal(staleReviewEvidence.reviewEvidence.currentHeadReviewCount, 0);
  assert.equal(staleReviewEvidence.reviewEvidence.currentHeadReviewerIds.length, 0);
  assert.equal(staleReviewEvidence.reviewerAuthorization.approvalAuthorized, false);

  // Pagination must include the next page when a full page of 100 records is returned.
  const firstPage = Array.from({ length: 100 }, (_, index) => review(index + 1));
  const secondPage = [review(101)];
  const paginationFixture = mockFetch({ reviewPages: { 1: firstPage, 2: secondPage } });
  const paginatedEvidence = await runAudit(paginationFixture);
  assert.equal(paginatedEvidence.reviewEvidence.reviewCount, 101);
  assert.equal(paginatedEvidence.reviewEvidence.submittedReviewCount, 101);
  assert.equal(paginatedEvidence.reviewEvidence.currentHeadReviewCount, 101);
  assert.equal(paginatedEvidence.reviewEvidence.unsubmittedReviewCount, 0);
  assert.ok(paginationFixture.requests.some(url => url.endsWith('page=2')));

  // A repeated review ID across pages makes the snapshot ambiguous and must fail closed.
  const duplicateIdFixture = mockFetch({
    reviewPages: {
      1: [...Array.from({ length: 99 }, (_, index) => review(index + 1)), review(500)],
      2: [review(500)],
    },
  });
  await assert.rejects(
    () => runAudit(duplicateIdFixture),
    /duplicate review id: 500/
  );

  // Re-read the PR after review pagination: head movement invalidates the whole snapshot.
  const movedHeadFixture = mockFetch({
    pullRequests: [
      pullRequest(),
      pullRequest({ head: { sha: otherHead, repo: { full_name: repository } } }),
    ],
  });
  await assert.rejects(() => runAudit(movedHeadFixture), /head changed during review audit/);

  // A base branch or source repository change during pagination also invalidates the snapshot.
  const movedBaseFixture = mockFetch({
    pullRequests: [
      pullRequest(),
      pullRequest({ base: { ref: 'main', sha: otherHead, repo: { full_name: repository } } }),
    ],
  });
  await assert.rejects(() => runAudit(movedBaseFixture), /base changed during review audit/);

  const movedHeadRepositoryFixture = mockFetch({
    pullRequests: [
      pullRequest(),
      pullRequest({ head: { sha: expectedHead, repo: { full_name: 'owner/other-repo' } } }),
    ],
  });
  await assert.rejects(() => runAudit(movedHeadRepositoryFixture), /head repository changed/);

  // Incomplete identities and malformed review metadata cannot enter the evidence snapshot.
  const missingIdentity = mockFetch({
    reviewPages: { 1: [review(600, { user: { login: 'missing-stable-id' } })] },
  });
  await assert.rejects(() => runAudit(missingIdentity), /stable authenticated reviewer identity/);

  const invalidState = mockFetch({ reviewPages: { 1: [review(601, { state: 'PUBLISHED' })] } });
  await assert.rejects(() => runAudit(invalidState), /unsupported review state/);

  const invalidTimestamp = mockFetch({ reviewPages: { 1: [review(602, { submitted_at: 'not-a-date' })] } });
  await assert.rejects(() => runAudit(invalidTimestamp), /invalid submission timestamp/);

  const invalidCommit = mockFetch({ reviewPages: { 1: [review(603, { commit_id: 'not-a-sha' })] } });
  await assert.rejects(() => runAudit(invalidCommit), /invalid commit identity/);

  const closedPullRequest = mockFetch({
    pullRequests: [pullRequest({ state: 'closed' })],
  });
  await assert.rejects(() => runAudit(closedPullRequest), /incomplete, closed/);

  // A full final page at the configured ceiling is incomplete until another page is checked.
  const ceilingPages = {};
  for (let page = 1; page <= 20; page += 1) {
    ceilingPages[page] = Array.from({ length: 100 }, (_, index) => review((page - 1) * 100 + index + 1));
  }
  const ceilingFixture = mockFetch({ reviewPages: ceilingPages });
  await assert.rejects(() => runAudit(ceilingFixture), /pagination exceeded the safe audit limit/);

  const invalidObservedAtFixture = mockFetch();
  await assert.rejects(
    () => runAudit(invalidObservedAtFixture, { observedAt: 'yesterday' }),
    /valid ISO-8601/
  );
}

testEditorialReviewAuthority()
  .then(() => console.log('PASS: exact-head GitHub editorial review snapshot, pagination, identity integrity and non-authorization contracts.'))
  .catch(error => {
    console.error('FAIL: GitHub editorial review authority regression: ' + error.stack);
    process.exitCode = 1;
  });


console.log('PASS: curated media manifest, exact Git blob SHA/bytes, dimensions, role-based image budgets, picture/JPEG references, and page-specific image/alt contracts.');
