#!/usr/bin/env node
'use strict';

/**
 * Validate a returned fixed page-media worksheet against exact source-main
 * JSON and image bytes. This is evidence validation only, never authorization.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseStrictJsonBytes } = require('./validate-editorial-media-decisions');
const { PAGE_MEDIA_SLOT_DEFINITIONS } = require('./audit-authoritative-gallery-source');
const { verifyBundleIntegrityManifest } = require('./review-bundle-integrity');

const SOURCE_REPOSITORY = 'https://github.com/tchouhanjsm/garh-jaisal-website';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_BLOB = /^[a-f0-9]{40}$/i;
const APPROVAL_FIELDS = [
  'status', 'source_credit', 'rights_basis', 'visual_match_review',
  'alt_text_review', 'technical_validation', 'asset_sha256',
  'approved_by', 'approved_at', 'signature',
];
const MANIFEST_KEYS = [
  'schemaVersion', 'artifactType', 'sourceRepository', 'sourceBranch', 'sourceCommit',
  'sourceAuditSha256', 'generatedAt', 'summary', 'policy', 'records',
];
const RECORD_KEYS = [
  'slotId', 'area', 'sourceFilePath', 'sourceFileSha256', 'sourceFileGitBlobSha',
  'sourceRecordSha256', 'sourceImagePath', 'imageBytes', 'imageSha256', 'imageGitBlobSha',
  'imageDecodeComplete', 'imageWidth', 'imageHeight', 'currentAltText', 'caption',
  'approvalStatus', 'previewImagePath',
];
const WORKSHEET_KEYS = [
  'schemaVersion', 'artifactType', 'sourceRepository', 'sourceBranch', 'sourceCommit',
  'sourceAuditSha256', 'manifestSha256', 'bundleIntegritySha256', 'reviewOnly', 'approvalStatus',
  'publicationEligible', 'policy', 'decisions',
];
const DECISION_KEYS = [
  'slotId', 'area', 'sourceFileSha256', 'sourceRecordSha256', 'imageSha256',
  'reviewDecision', 'sourceCredit', 'rightsBasis', 'visualMatchStatus',
  'visualMatchEvidence', 'altText', 'altTextReviewStatus', 'altTextReviewEvidence',
  'caption', 'notes',
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha(bytes) {
  return crypto.createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + '\0', 'utf8'))
    .update(bytes)
    .digest('hex');
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

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) &&
    relative !== '..' && !path.isAbsolute(relative));
}

function realDirectory(value, label) {
  const absolute = path.resolve(value);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(label + ' must be a non-symlink directory.');
  return fs.realpathSync(absolute);
}

function regularFile(root, relative, label, maxBytes) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)) {
    throw new Error(label + ' must be a safe relative path.');
  }
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error(label + ' has an unsafe path component.');
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(label + ' traverses a symlink.');
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(label + ' has a non-directory parent.');
    if (index === parts.length - 1 && !stat.isFile()) throw new Error(label + ' is not a regular file.');
  }
  const stat = fs.statSync(current);
  const resolved = fs.realpathSync(current);
  if (!within(root, resolved) || stat.size < 1 || stat.size > maxBytes) throw new Error(label + ' is outside its root or exceeds its byte limit.');
  return resolved;
}

function runGit(root, args) {
  const result = spawnSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Could not verify source Git state: ' +
      String(result.stderr || (result.error && result.error.message) || 'git command failed').trim());
  }
  return String(result.stdout || '').trim();
}

function exactKeys(value, expected, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(label + ' must be an object.');
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    errors.push(label + ' contains unsupported or missing fields.');
  }
}

function nonEmpty(value, minimum) {
  return typeof value === 'string' && value.trim().length >= minimum;
}

function meaningfulAlt(value) {
  return typeof value === 'string' && value.trim().length >= 15 &&
    value.trim().length <= 300 && !/^(image|photo|picture|gallery photo|view)$/i.test(value.trim());
}

function readJsonFile(root, relative, label, maxBytes, errors) {
  try {
    const file = regularFile(root, relative, label, maxBytes);
    return { file, bytes: fs.readFileSync(file), value: null };
  } catch (error) {
    errors.push(label + ': ' + error.message);
    return null;
  }
}

function validatePageMediaReviewDecisions(repoRoot, bundleDirectory, options) {
  const errors = [];
  const sourceRoot = realDirectory(options && options.sourceRoot, 'Authoritative source checkout');
  const bundle = realDirectory(bundleDirectory, 'Page-media review bundle');
  const repositoryRoot = fs.realpathSync(repoRoot || ROOT);
  if (within(repositoryRoot, bundle) || within(sourceRoot, bundle)) errors.push('Page-media review bundle must be outside both repositories.');
  let bundleIntegrity = null;
  try { bundleIntegrity = verifyBundleIntegrityManifest(bundle, ['page-media-decisions.template.json']); }
  catch (error) { errors.push('Page-media bundle integrity: ' + error.message); }
  const sourceCommit = String(options && options.sourceCommit || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) errors.push('Source commit must be an exact 40-character SHA.');
  let sourceHead = '';
  let sourceStatus = '';
  try {
    sourceHead = runGit(sourceRoot, ['rev-parse', 'HEAD']).toLowerCase();
    sourceStatus = runGit(sourceRoot, ['status', '--porcelain', '--untracked-files=all']);
    if (sourceHead !== sourceCommit) errors.push('Source checkout does not match the requested exact commit.');
    if (sourceStatus) errors.push('Authoritative source working tree is not clean.');
  } catch (error) {
    errors.push(error.message);
  }

  const auditPath = path.resolve(options && options.auditPath || '');
  let audit = null;
  let auditBytes = null;
  try {
    const auditStat = fs.lstatSync(auditPath);
    if (auditStat.isSymbolicLink() || !auditStat.isFile() ||
        auditStat.size < 1 || auditStat.size > 10 * 1024 * 1024 ||
        within(sourceRoot, auditPath)) {
      throw new Error('Exact-source page-media audit must be a bounded regular file outside the source checkout.');
    }
    auditBytes = fs.readFileSync(auditPath);
    audit = parseStrictJsonBytes(auditBytes, 'Exact-source page-media audit');
  } catch (error) {
    errors.push('Exact-source page-media audit: ' + error.message);
  }

  const manifestFile = readJsonFile(bundle, 'manifest.json', 'Page-media manifest', 10 * 1024 * 1024, errors);
  const templateFile = readJsonFile(bundle, 'page-media-decisions.template.json', 'Page-media decision template', 8 * 1024 * 1024, errors);
  let worksheetFile = templateFile;
  if (options && options.decisionsPath) {
    try {
      const returnedPath = path.resolve(options.decisionsPath);
      const returnedStat = fs.lstatSync(returnedPath);
      if (returnedStat.isSymbolicLink() || !returnedStat.isFile() ||
          returnedStat.size < 1 || returnedStat.size > 8 * 1024 * 1024) {
        throw new Error('Returned page-media worksheet must be a bounded regular non-symlink JSON file.');
      }
      if (within(repositoryRoot, returnedPath) || within(sourceRoot, returnedPath) || within(bundle, returnedPath)) {
        throw new Error('Returned page-media worksheet must be outside both repositories and the review bundle.');
      }
      worksheetFile = { file: returnedPath, bytes: fs.readFileSync(returnedPath) };
    } catch (error) {
      errors.push('Returned page-media worksheet: ' + error.message);
      worksheetFile = null;
    }
  }
  let manifest = null;
  let template = null;
  if (manifestFile) {
    try { manifest = parseStrictJsonBytes(manifestFile.bytes, 'Page-media manifest'); }
    catch (error) { errors.push(error.message); }
  }
  if (worksheetFile) {
    try { template = parseStrictJsonBytes(worksheetFile.bytes, 'Page-media decision worksheet'); }
    catch (error) { errors.push(error.message); }
  }

  const expectedCount = Object.values(PAGE_MEDIA_SLOT_DEFINITIONS).reduce((sum, ids) => sum + ids.length, 0);
  const manifestHash = manifestFile ? sha256(manifestFile.bytes) : '';
  if (manifest) {
    exactKeys(manifest, MANIFEST_KEYS, 'Page-media manifest', errors);
    const pageAudit = audit && audit.pageMediaGovernance;
    const auditExpectedCount = Object.values(PAGE_MEDIA_SLOT_DEFINITIONS).reduce((sum, ids) => sum + ids.length, 0);
    if (!audit || audit.auditType !== 'read-only-authoritative-gallery-source-drift' ||
        audit.sourceRepository !== SOURCE_REPOSITORY || audit.sourceBranch !== 'main' ||
        audit.currentSourceCommit !== sourceCommit || !Array.isArray(audit.structuralErrors) ||
        audit.structuralErrors.length !== 0 || !pageAudit ||
        pageAudit.status !== 'PENDING_OWNER_REVIEW' || pageAudit.schemaAvailable !== true ||
        !Array.isArray(pageAudit.schemaViolations) || pageAudit.schemaViolations.length !== 0 ||
        !Array.isArray(pageAudit.structuralErrors) || pageAudit.structuralErrors.length !== 0 ||
        !pageAudit.signatureVerification || pageAudit.signatureVerification.performed !== false ||
        !pageAudit.controls || pageAudit.controls.readOnly !== true ||
        pageAudit.controls.tourismImportAuthorized !== false || !pageAudit.summary ||
        pageAudit.summary.slotCount !== auditExpectedCount ||
        pageAudit.summary.expectedSlotCount !== auditExpectedCount ||
        pageAudit.summary.pendingCount !== auditExpectedCount ||
        pageAudit.summary.approvedStatusCount !== 0 ||
        pageAudit.summary.imageDecodeVerifiedCount !== auditExpectedCount ||
        pageAudit.summary.approvalEligibleCount !== 0 ||
        pageAudit.summary.tourismImportEligibleCount !== 0 ||
        !Array.isArray(pageAudit.records) || pageAudit.records.length !== auditExpectedCount ||
        !auditBytes || sha256(auditBytes) !== manifest.sourceAuditSha256) {
      errors.push('Page-media manifest is not bound to a complete, pending, exact-source audit.');
    }
    if (manifest.schemaVersion !== 1 || manifest.artifactType !== 'fixed-page-media-owner-review-manifest' ||
        manifest.sourceRepository !== SOURCE_REPOSITORY || manifest.sourceBranch !== 'main' ||
        manifest.sourceCommit !== sourceCommit || !SHA256.test(manifest.sourceAuditSha256 || '') ||
        !Number.isFinite(Date.parse(manifest.generatedAt || '')) ||
        !manifest.summary || manifest.summary.slotCount !== expectedCount ||
        manifest.summary.pendingCount !== expectedCount || manifest.summary.approvalEligibleCount !== 0 ||
        !manifest.policy || manifest.policy.reviewOnly !== true ||
        ['sourceRecordsChanged', 'approvedMediaChanged', 'rightsInferred', 'visualRelevanceInferred',
          'signatureCreated', 'approvalAuthorized', 'publicationAuthorized', 'tourismImportAuthorized']
          .some(key => manifest.policy[key] !== false)) {
      errors.push('Page-media manifest source binding or read-only policy is invalid.');
    }
  }

  if (template) {
    exactKeys(template, WORKSHEET_KEYS, 'Page-media decision worksheet', errors);
    if (template.schemaVersion !== 1 || template.artifactType !== 'fixed-page-media-owner-review-worksheet' ||
        template.sourceRepository !== SOURCE_REPOSITORY || template.sourceBranch !== 'main' ||
        template.sourceCommit !== sourceCommit || !manifest ||
        template.sourceAuditSha256 !== manifest.sourceAuditSha256 ||
        template.manifestSha256 !== manifestHash || !bundleIntegrity ||
         template.bundleIntegritySha256 !== bundleIntegrity.sha256 || template.reviewOnly !== true ||
        template.approvalStatus !== 'not-approved' || template.publicationEligible !== false ||
        !template.policy || ['autoApplied', 'sourceRecordsChanged', 'approvedMediaChanged',
          'rightsInferred', 'visualRelevanceInferred', 'signatureCreated',
          'approvalAuthorized', 'publicationAuthorized'].some(key => template.policy[key] !== false)) {
      errors.push('Page-media worksheet source binding or review-only policy is invalid.');
    }
  }

  const records = Array.isArray(manifest && manifest.records) ? manifest.records : [];
  if (records.length !== expectedCount || records.length > 100) {
    errors.push('Page-media manifest must contain exactly ' + expectedCount + ' fixed slots.');
  }
  const expectedIds = [];
  for (const area of Object.keys(PAGE_MEDIA_SLOT_DEFINITIONS)) {
    for (const slotId of PAGE_MEDIA_SLOT_DEFINITIONS[area]) expectedIds.push({ area, slotId });
  }
  const byId = new Map();
  const auditById = new Map();
  const auditRecords = audit && audit.pageMediaGovernance && Array.isArray(audit.pageMediaGovernance.records)
    ? audit.pageMediaGovernance.records : [];
  for (const item of auditRecords) {
    if (!item || typeof item.id !== 'string' || auditById.has(item.id)) {
      errors.push('Exact-source page-media audit contains an invalid or duplicate slot ID.');
      continue;
    }
    auditById.set(item.id, item);
  }
  if (auditById.size !== expectedCount) errors.push('Exact-source page-media audit must contain exactly ' + expectedCount + ' unique slot records.');
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const expected = expectedIds[index];
    exactKeys(record, RECORD_KEYS, 'Page-media manifest record ' + index, errors);
    if (!record || !expected || record.slotId !== expected.slotId || record.area !== expected.area ||
        byId.has(record.slotId)) {
      errors.push('Page-media manifest has an unexpected, reordered, or duplicate fixed slot.');
      continue;
    }
    byId.set(record.slotId, record);
    const audited = auditById.get(record.slotId);
    if (!audited || audited.area !== record.area || audited.source !== record.sourceImagePath ||
        audited.approvalStatus !== 'pending' || audited.imageDecodeComplete !== true ||
        audited.assetBytes !== record.imageBytes || audited.assetSha256 !== record.imageSha256 ||
        audited.imageGitBlobSha !== record.imageGitBlobSha ||
        audited.imageWidth !== record.imageWidth || audited.imageHeight !== record.imageHeight) {
      errors.push('Page-media manifest record is not bound to exact-source decode evidence: ' + record.slotId + '.');
    }
    if (record.sourceFilePath !== 'content/page-media/' + record.area + '.json' ||
        !SHA256.test(record.sourceFileSha256 || '') || !GIT_BLOB.test(record.sourceFileGitBlobSha || '') ||
        !SHA256.test(record.sourceRecordSha256 || '') ||
        typeof record.sourceImagePath !== 'string' || !record.sourceImagePath.startsWith('img/') ||
        record.sourceImagePath.includes('\\') || path.isAbsolute(record.sourceImagePath) ||
        record.sourceImagePath.split('/').some(part => !part || part === '.' || part === '..') ||
        !IMAGE_EXTENSIONS.has(path.extname(record.sourceImagePath).toLowerCase()) ||
        record.previewImagePath !== 'images/' + String(record.imageSha256 || '').toLowerCase() +
          path.extname(record.sourceImagePath).toLowerCase() ||
        !Number.isSafeInteger(record.imageBytes) || record.imageBytes < 1 ||
        !SHA256.test(record.imageSha256 || '') || !GIT_BLOB.test(record.imageGitBlobSha || '') ||
        record.imageDecodeComplete !== true || !Number.isInteger(record.imageWidth) || record.imageWidth < 1 ||
        !Number.isInteger(record.imageHeight) || record.imageHeight < 1 ||
        !meaningfulAlt(record.currentAltText) || typeof record.caption !== 'string' ||
        record.caption.length > 180 || record.approvalStatus !== 'pending') {
      errors.push('Page-media manifest record has incomplete or unsafe source evidence: ' + record.slotId + '.');
    }
  }

  const areaCache = new Map();
  if (manifest && sourceHead === sourceCommit && !sourceStatus) {
    for (const record of records) {
      if (!record || !byId.has(record.slotId)) continue;
      try {
        let area = areaCache.get(record.area);
        if (!area) {
          const sourceFile = regularFile(sourceRoot, record.sourceFilePath, 'Page-media source JSON ' + record.area, 2 * 1024 * 1024);
          const bytes = fs.readFileSync(sourceFile);
          if (sha256(bytes) !== record.sourceFileSha256 || gitBlobSha(bytes) !== record.sourceFileGitBlobSha) {
            throw new Error('source JSON byte identity changed');
          }
          const value = parseStrictJsonBytes(bytes, 'Page-media source JSON ' + record.area);
          area = { value };
          areaCache.set(record.area, area);
        }
        const sourceRecord = area.value[record.slotId];
        if (!sourceRecord || typeof sourceRecord !== 'object' || Array.isArray(sourceRecord) ||
            sha256(Buffer.from(stableStringify(sourceRecord), 'utf8')) !== record.sourceRecordSha256 ||
            sourceRecord.src !== record.sourceImagePath || sourceRecord.alt !== record.currentAltText ||
            (sourceRecord.caption || '') !== record.caption || !sourceRecord.approval ||
            sourceRecord.approval.status !== 'pending' ||
            APPROVAL_FIELDS.filter(name => name !== 'status').some(name => sourceRecord.approval[name] !== '')) {
          throw new Error('source record fields or pending approval state changed');
        }
        const imageFile = regularFile(sourceRoot, record.sourceImagePath, 'Page-media image ' + record.slotId, 25 * 1024 * 1024);
        const imageBytes = fs.readFileSync(imageFile);
        if (imageBytes.length !== record.imageBytes || sha256(imageBytes) !== record.imageSha256 ||
            gitBlobSha(imageBytes) !== record.imageGitBlobSha) throw new Error('source image byte identity changed');
        const previewFile = regularFile(bundle, record.previewImagePath, 'Page-media review image ' + record.slotId, 25 * 1024 * 1024);
        if (!fs.readFileSync(previewFile).equals(imageBytes)) throw new Error('review image copy differs from exact source bytes');
      } catch (error) {
        errors.push('Source verification failed for ' + record.slotId + ': ' + error.message);
      }
    }
  }

  const decisions = Array.isArray(template && template.decisions) ? template.decisions : [];
  if (decisions.length !== expectedCount || decisions.length > 100) {
    errors.push('Page-media worksheet must contain exactly one row for every fixed slot.');
  }
  const seen = new Set();
  let pendingCount = 0;
  let rejectedCount = 0;
  let requestedRecommendations = 0;
  let evidenceCompleteRecommendations = 0;
  let blockedRecommendations = 0;
  const decisionResults = [];
  for (const decision of decisions) {
    const slotId = decision && decision.slotId;
    if (typeof slotId !== 'string' || seen.has(slotId)) {
      errors.push('Page-media worksheet contains an invalid or duplicate slot ID.');
      continue;
    }
    seen.add(slotId);
    const record = byId.get(slotId);
    if (!record) {
      errors.push('Page-media worksheet contains a slot absent from the exact source manifest: ' + slotId);
      continue;
    }
    exactKeys(decision, DECISION_KEYS, 'Page-media decision ' + slotId, errors);
    if (decision.area !== record.area || decision.sourceFileSha256 !== record.sourceFileSha256 ||
        decision.sourceRecordSha256 !== record.sourceRecordSha256 || decision.imageSha256 !== record.imageSha256) {
      errors.push('Page-media decision ' + slotId + ' is stale or not bound to exact source bytes.');
    }
    const stringFields = [
      decision.sourceCredit, decision.rightsBasis, decision.visualMatchEvidence,
      decision.altText, decision.altTextReviewEvidence, decision.caption, decision.notes,
    ];
    if (stringFields.some(value => typeof value !== 'string')) {
      errors.push('Page-media decision ' + slotId + ' contains a non-string evidence field.');
      continue;
    }
    if (decision.sourceCredit.length > 500 || decision.rightsBasis.length > 2000 ||
        decision.visualMatchEvidence.length > 2000 || decision.altText.length > 300 ||
        decision.altTextReviewEvidence.length > 2000 || decision.caption.length > 180 ||
        decision.notes.length > 2000) {
      errors.push('Page-media decision ' + slotId + ' exceeds an evidence field length limit.');
    }
    if (!['pending', 'recommend-approval', 'reject'].includes(decision.reviewDecision)) {
      errors.push('Page-media decision ' + slotId + ' has an unsupported review decision.');
    }
    if (!['not-assessed', 'matched', 'mismatch'].includes(decision.visualMatchStatus)) {
      errors.push('Page-media decision ' + slotId + ' has an unsupported visual-match state.');
    }
    if (!['pending', 'approved', 'rejected'].includes(decision.altTextReviewStatus)) {
      errors.push('Page-media decision ' + slotId + ' has an unsupported alt-text review state.');
    }

    const blockers = [];
    if (decision.visualMatchStatus === 'mismatch' && decision.reviewDecision !== 'reject') {
      blockers.push('visual-mismatch-must-be-rejected');
    }
    if (decision.altTextReviewStatus === 'rejected' && decision.reviewDecision === 'recommend-approval') {
      blockers.push('rejected-alt-text-cannot-be-recommended');
    }
    if (decision.reviewDecision === 'recommend-approval') {
      requestedRecommendations += 1;
      if (!nonEmpty(decision.sourceCredit, 5) || !nonEmpty(decision.rightsBasis, 15)) {
        blockers.push('creator-source-rights-evidence-incomplete');
      }
      if (decision.visualMatchStatus !== 'matched' || !nonEmpty(decision.visualMatchEvidence, 15)) {
        blockers.push('documented-visual-match-missing');
      }
      if (!meaningfulAlt(decision.altText)) blockers.push('descriptive-alt-text-incomplete');
      if (decision.altTextReviewStatus !== 'approved' || !nonEmpty(decision.altTextReviewEvidence, 15)) {
        blockers.push('alt-text-review-incomplete');
      }
      if (record.imageDecodeComplete !== true || record.imageWidth < 1 || record.imageHeight < 1) {
        blockers.push('technical-image-validation-incomplete');
      }
      if (blockers.length) blockedRecommendations += 1;
      else evidenceCompleteRecommendations += 1;
    }
    if (decision.reviewDecision === 'pending') pendingCount += 1;
    if (decision.reviewDecision === 'reject') rejectedCount += 1;
    decisionResults.push({
      slotId,
      reviewDecision: decision.reviewDecision,
      state: decision.reviewDecision === 'reject' ? 'REJECTED' :
        decision.reviewDecision === 'recommend-approval'
          ? blockers.length ? 'RECOMMENDATION_BLOCKED' : 'EVIDENCE_COMPLETE_AWAITING_SEPARATE_SIGNED_APPROVAL'
          : 'PENDING',
      blockers: [...new Set(blockers)].sort(),
    });
  }
  for (const slotId of byId.keys()) {
    if (!seen.has(slotId)) errors.push('Page-media worksheet is missing fixed slot: ' + slotId);
  }

  const state = errors.length ? 'INVALID' : blockedRecommendations ? 'RECOMMENDATION_BLOCKED' :
    evidenceCompleteRecommendations ? 'EVIDENCE_COMPLETE_AWAITING_SEPARATE_SIGNED_APPROVAL' :
      rejectedCount && pendingCount === 0 ? 'OWNER_REJECTIONS_RECORDED' : 'PENDING_OWNER_REVIEW';
  return {
    schemaVersion: 1,
    artifactType: 'fixed-page-media-owner-review-validation',
    state,
    sourceVerification: {
      state: errors.length ? 'INVALID' : 'VERIFIED',
      repository: SOURCE_REPOSITORY,
      branch: 'main',
      commit: sourceCommit,
      cleanWorkingTree: sourceStatus === '',
    },
    sourceAuditVerification: {
      state: errors.length ? 'INVALID' : 'VERIFIED',
      sha256: auditBytes ? sha256(auditBytes) : '',
      exactSourceCommit: sourceCommit,
      pageMediaSlotCount: auditById.size,
      signatureVerificationPerformed: false,
    },
    bundle: {
      manifestSha256: manifestHash,
      slotCount: records.length,
      integrity: bundleIntegrity ? { state: 'VERIFIED', sha256: bundleIntegrity.sha256,
        fileCount: bundleIntegrity.fileCount, totalBytes: bundleIntegrity.totalBytes } : { state: 'INVALID' },
    },
    decisionWorksheet: {
      source: options && options.decisionsPath ? 'returned-file' : 'generated-template',
      sha256: worksheetFile ? sha256(worksheetFile.bytes) : '',
    },
    reviewerAuthorization: {
      state: 'NOT_CONFIGURED',
      policyConfigured: false,
      identityVerified: false,
      approvalAuthorized: false,
    },
    summary: {
      decisionRowCount: decisions.length,
      pendingCount,
      rejectedCount,
      requestedRecommendations,
      evidenceCompleteRecommendations,
      blockedRecommendations,
      approvalEligibleCount: 0,
    },
    policy: {
      reviewOnly: true,
      publicationEligible: false,
      autoApplied: false,
      sourceRecordsChanged: false,
      approvedMediaChanged: false,
      rightsInferred: false,
      visualRelevanceInferred: false,
      signatureCreated: false,
      approvalAuthorized: false,
      publicationAuthorized: false,
    },
    errors,
    decisions: decisionResults,
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--bundle' && argv[index + 1]) values.bundle = argv[++index];
    else if (arg === '--source-root' && argv[index + 1]) values.sourceRoot = argv[++index];
    else if (arg === '--source-commit' && argv[index + 1]) values.sourceCommit = argv[++index];
    else if (arg === '--audit' && argv[index + 1]) values.auditPath = argv[++index];
    else if (arg === '--decisions' && argv[index + 1]) values.decisions = argv[++index];
    else if (arg === '--json') values.json = true;
    else throw new Error('Unknown or incomplete argument: ' + arg);
  }
  if (!values.bundle || !values.sourceRoot || !values.auditPath || !/^[a-f0-9]{40}$/i.test(values.sourceCommit || '')) {
    throw new Error('Usage: node scripts/validate-page-media-review-decisions.js --bundle <bundle> --source-root <source-main> --source-commit <40-character-sha> --audit <exact-source-audit.json> [--decisions <returned-worksheet>] [--json]');
  }
  return values;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = validatePageMediaReviewDecisions(__dirname, args.bundle, {
      sourceRoot: args.sourceRoot,
      sourceCommit: args.sourceCommit,
      auditPath: args.auditPath,
      decisionsPath: args.decisions,
    });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('FIXED PAGE-MEDIA OWNER-REVIEW VALIDATION: ' + report.state);
      console.log('Rows: ' + report.summary.decisionRowCount + ' | pending: ' + report.summary.pendingCount +
        ' | rejected: ' + report.summary.rejectedCount + ' | recommendations: ' + report.summary.requestedRecommendations +
        ' | evidence complete (not signed): ' + report.summary.evidenceCompleteRecommendations +
        ' | blocked recommendations: ' + report.summary.blockedRecommendations);
      console.log('Source verification: ' + report.sourceVerification.state +
        ' | reviewer authorization: ' + report.reviewerAuthorization.state +
        ' | approval authorized: no | publication eligible: no');
      for (const error of report.errors) console.error('ERROR: ' + error);
    }
    if (report.errors.length) process.exitCode = 1;
    else if (report.summary.blockedRecommendations > 0) process.exitCode = 2;
  } catch (error) {
    console.error('FAIL: fixed page-media worksheet validation stopped safely: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { validatePageMediaReviewDecisions };
