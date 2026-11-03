#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parseStrictJsonBytes } = require('./validate-editorial-media-decisions');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_REPOSITORY = 'https://github.com/tchouhanjsm/garh-jaisal-website';
const SOURCE_BRANCH = 'main';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_BLOB = /^[a-f0-9]{40}$/i;
const DECISION_KEYS = ['galleryId', 'sourceRecordSha256', 'imageSha256', 'ownerDecision',
  'sourceEvidence', 'visualReview', 'technicalValidation', 'altText', 'altTextReview', 'notes'];

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function gitBlobSha(bytes) {
  return crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
function within(parent, candidate) {
  const rel = path.relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function realDirectory(value, label) {
  const absolute = path.resolve(value);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(label + ' must be a non-symlink directory.');
  return fs.realpathSync(absolute);
}
function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') &&
    !path.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
}
function regularFile(root, relative, label, maxBytes) {
  if (!safeRelative(relative)) throw new Error(label + ' has an unsafe relative path.');
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(label + ' traverses a symlink.');
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error(label + ' has a non-directory parent.');
    if (i === parts.length - 1 && !stat.isFile()) throw new Error(label + ' is not a regular file.');
    if (i === parts.length - 1 && maxBytes && stat.size > maxBytes) throw new Error(label + ' exceeds its size limit.');
  }
  const resolved = fs.realpathSync(current);
  if (!within(root, resolved)) throw new Error(label + ' resolves outside its root.');
  return resolved;
}
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Could not verify source Git state: ' +
    String(result.stderr || (result.error && result.error.message) || 'git failed').trim());
  return String(result.stdout || '').trim();
}
function exactKeys(value, keys, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(label + ' must be an object.');
    return false;
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(label + ' has unsupported field: ' + key);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(label + ' is missing field: ' + key);
  return true;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function nonEmpty(value, minimum = 2) { return typeof value === 'string' && value.trim().length >= minimum; }
function meaningfulAlt(value) {
  return nonEmpty(value, 10) && value.length <= 200 &&
    !/^(image|photo|picture|image of|photo of|jaisalmer|a photo|a picture)(\b|$)/i.test(value.trim());
}
function validHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch (_) { return false; }
}
function readJson(root, relative, label, maxBytes = 8 * 1024 * 1024) {
  const file = regularFile(root, relative, label, maxBytes);
  const bytes = fs.readFileSync(file);
  return { bytes, value: parseStrictJsonBytes(bytes, label) };
}
function readExternalJson(filePath, label, forbiddenRoots) {
  const absolute = path.resolve(filePath);
  if (forbiddenRoots.some(root => within(root, absolute))) {
    throw new Error(label + ' must be outside the repository, source checkout and review bundle.');
  }
  const parsed = path.parse(absolute);
  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(label + ' must not traverse a symlink.');
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error(label + ' has a non-directory parent.');
    if (i === parts.length - 1 && (!stat.isFile() || stat.size > 8 * 1024 * 1024)) {
      throw new Error(label + ' must be a bounded regular file.');
    }
  }
  const bytes = fs.readFileSync(absolute);
  return { bytes, value: parseStrictJsonBytes(bytes, label) };
}
function validateGalleryReviewDecisions(root, bundlePath, options = {}) {
  const errors = [];
  const sourceRoot = realDirectory(options.sourceRoot, 'Authoritative source checkout');
  const bundle = realDirectory(bundlePath, 'Gallery review bundle');
  const repoRoot = fs.realpathSync(root || ROOT);
  if (within(repoRoot, bundle) || within(sourceRoot, bundle)) throw new Error('Review bundle must be outside both repositories.');
  const sourceCommit = String(options.sourceCommit || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Source commit must be an exact 40-character SHA.');
  let sourceClean = false;
  try {
    if (git(sourceRoot, ['rev-parse', 'HEAD']).toLowerCase() !== sourceCommit) throw new Error('Source checkout SHA mismatch.');
    if (git(sourceRoot, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Source checkout is not clean.');
    sourceClean = true;
  } catch (error) { errors.push(error.message); }

  const manifestFile = readJson(bundle, 'manifest.json', 'Gallery review manifest', 10 * 1024 * 1024);
  const manifest = manifestFile.value;
  const manifestHash = sha256(manifestFile.bytes);
  const manifestKeys = ['schemaVersion', 'artifactType', 'generatedAt', 'sourceRepository', 'sourceBranch',
    'sourceCommit', 'sourceAuditSha256', 'reviewOnly', 'approvalStatus', 'publicationEligible', 'summary', 'policy', 'records'];
  exactKeys(manifest, manifestKeys, 'Gallery review manifest', errors);
  if (!manifest || manifest.schemaVersion !== 1 ||
      manifest.artifactType !== 'authoritative-gallery-owner-review-bundle' ||
      manifest.sourceRepository !== SOURCE_REPOSITORY || manifest.sourceBranch !== SOURCE_BRANCH ||
      manifest.sourceCommit !== sourceCommit || !SHA256.test(manifest.sourceAuditSha256 || '') ||
      manifest.reviewOnly !== true || manifest.approvalStatus !== 'not-approved' ||
      manifest.publicationEligible !== false) errors.push('Gallery review manifest source binding or review-only invariant is invalid.');
  const policyKeys = ['sourceRecordsChanged', 'mediaApproved', 'rightsInferred', 'visualRelevanceInferred',
    'automaticImportPerformed', 'approvalAuthorized', 'publicationAuthorized', 'signatureCreated'];
  exactKeys(manifest && manifest.policy, policyKeys, 'Gallery manifest policy', errors);
  if (!manifest || !manifest.policy || policyKeys.some(key => manifest.policy[key] !== false)) {
    errors.push('Gallery manifest policy must keep all mutation, approval and publication flags false.');
  }
  const records = Array.isArray(manifest && manifest.records) ? manifest.records : [];
  if (!records.length || records.length > 500) errors.push('Gallery manifest must contain a bounded non-empty record inventory.');
  const byId = new Map();
  for (const record of records) {
    const id = record && record.id;
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || byId.has(id)) {
      errors.push('Gallery manifest contains an invalid or duplicate record ID.');
      continue;
    }
    byId.set(id, record);
    if (record.sourceRecordPath !== 'content/gallery/' + id + '.json' ||
        !safeRelative(record.sourceImagePath) || record.sourceImagePath.split('/')[0] !== 'img' ||
        !IMAGE_EXTENSIONS.has(path.extname(record.sourceImagePath).toLowerCase()) ||
        !SHA256.test(record.sourceRecordSha256 || '') || !GIT_BLOB.test(record.sourceRecordGitBlobSha || '') ||
        !SHA256.test(record.imageSha256 || '') || !GIT_BLOB.test(record.imageGitBlobSha || '') ||
        !Number.isSafeInteger(record.imageBytes) || record.imageBytes < 1 ||
        !Number.isInteger(record.imageWidth) || record.imageWidth < 1 ||
        !Number.isInteger(record.imageHeight) || record.imageHeight < 1 ||
        record.previewImagePath !== 'images/' + String(record.imageSha256).toLowerCase() +
          path.extname(record.sourceImagePath).toLowerCase()) {
      errors.push('Gallery manifest record has invalid source/image identity: ' + id);
    }
  }
  if (manifest && manifest.summary && manifest.summary.recordCount !== records.length) {
    errors.push('Gallery manifest record count does not match its inventory.');
  }
  if (!manifest || !manifest.summary || manifest.summary.approvalEligibleCount !== 0) {
    errors.push('Gallery manifest must report zero approval eligibility.');
  }

  const worksheetFile = options.decisionsPath
    ? readExternalJson(options.decisionsPath, 'Returned Gallery worksheet', [repoRoot, sourceRoot, bundle])
    : readJson(bundle, 'gallery-decisions.template.json', 'Gallery decision worksheet');
  const worksheet = worksheetFile.value;
  const worksheetKeys = ['schemaVersion', 'artifactType', 'sourceRepository', 'sourceBranch', 'sourceCommit',
    'sourceAuditSha256', 'reviewOnly', 'approvalStatus', 'publicationEligible', 'policy', 'decisions'];
  exactKeys(worksheet, worksheetKeys, 'Gallery decision worksheet', errors);
  if (!worksheet || worksheet.schemaVersion !== 1 ||
      worksheet.artifactType !== 'authoritative-gallery-owner-review-worksheet' ||
      worksheet.sourceRepository !== SOURCE_REPOSITORY || worksheet.sourceBranch !== SOURCE_BRANCH ||
      worksheet.sourceCommit !== sourceCommit || worksheet.sourceAuditSha256 !== manifest.sourceAuditSha256 ||
      worksheet.reviewOnly !== true || worksheet.approvalStatus !== 'not-approved' ||
      worksheet.publicationEligible !== false) errors.push('Gallery worksheet source binding or review-only invariant is invalid.');
  const worksheetPolicyKeys = ['autoApplied', 'sourceRecordsChanged', 'rightsInferred',
    'visualRelevanceInferred', 'approvalAuthorized', 'publicationAuthorized'];
  exactKeys(worksheet && worksheet.policy, worksheetPolicyKeys, 'Gallery worksheet policy', errors);
  if (!worksheet || !worksheet.policy || worksheetPolicyKeys.some(key => worksheet.policy[key] !== false)) {
    errors.push('Gallery worksheet policy must keep all mutation, approval and publication flags false.');
  }

  const decisions = Array.isArray(worksheet && worksheet.decisions) ? worksheet.decisions : [];
  if (decisions.length !== records.length || decisions.length > 500) {
    errors.push('Gallery worksheet must contain exactly one decision for every manifest record.');
  }
  const seen = new Set();
  let pendingCount = 0;
  let rejectedCount = 0;
  let requestedApprovals = 0;
  let evidenceCompleteApprovalCount = 0;
  let blockedApprovalCount = 0;
  const decisionResults = [];
  for (const decision of decisions) {
    const id = decision && decision.galleryId;
    if (typeof id !== 'string' || seen.has(id)) {
      errors.push('Gallery worksheet contains an invalid or duplicate Gallery ID.');
      continue;
    }
    seen.add(id);
    const record = byId.get(id);
    if (!record) { errors.push('Gallery worksheet contains an ID absent from the manifest: ' + id); continue; }
    const label = 'Gallery decision ' + id;
    exactKeys(decision, DECISION_KEYS, label, errors);
    if (decision.sourceRecordSha256 !== record.sourceRecordSha256 || decision.imageSha256 !== record.imageSha256) {
      errors.push(label + ' is stale or does not bind to the exact source record and image bytes.');
    }
    if (!['pending', 'approve', 'reject'].includes(decision.ownerDecision)) errors.push(label + ' has an unsupported owner decision.');
    const source = decision.sourceEvidence || {};
    const visual = decision.visualReview || {};
    const technical = decision.technicalValidation || {};
    const altReview = decision.altTextReview || {};
    exactKeys(source, ['status', 'creator', 'sourceUrl', 'licenseName', 'evidenceReference', 'verifiedBy', 'verifiedAt'], label + ' source evidence', errors);
    exactKeys(visual, ['status', 'evidence', 'reviewer', 'reviewedAt'], label + ' visual review', errors);
    exactKeys(technical, ['status', 'evidenceReference'], label + ' technical validation', errors);
    exactKeys(altReview, ['status', 'reviewer', 'reviewedAt'], label + ' alt-text review', errors);
    const fields = [
      source.creator, source.sourceUrl, source.licenseName, source.evidenceReference, source.verifiedBy, source.verifiedAt,
      visual.evidence, visual.reviewer, visual.reviewedAt, technical.evidenceReference,
      altReview.reviewer, altReview.reviewedAt, decision.altText, decision.notes,
    ];
    if (fields.some(value => typeof value !== 'string')) errors.push(label + ' contains a non-string evidence field.');
    if (typeof decision.altText === 'string' && decision.altText.length > 200) errors.push(label + ' alt text exceeds 200 characters.');
    if (typeof decision.notes === 'string' && decision.notes.length > 2000) errors.push(label + ' notes exceed 2000 characters.');
    if (!['unverified', 'owner-confirmed', 'licensed'].includes(source.status)) errors.push(label + ' has an unsupported rights state.');
    if (source.sourceUrl && !validHttps(source.sourceUrl)) errors.push(label + ' source URL must be valid HTTPS without credentials.');
    if (source.verifiedAt && !validDate(source.verifiedAt)) errors.push(label + ' rights date must be a real YYYY-MM-DD date.');
    if (!['not_assessed', 'matched', 'mismatch'].includes(visual.status)) errors.push(label + ' has an unsupported visual state.');
    if (visual.reviewedAt && !validDate(visual.reviewedAt)) errors.push(label + ' visual review date is invalid.');
    if (!['pending', 'verified', 'failed'].includes(technical.status)) errors.push(label + ' has an unsupported technical state.');
    if (!['pending', 'approved', 'rejected'].includes(altReview.status)) errors.push(label + ' has an unsupported alt-text review state.');
    if (altReview.reviewedAt && !validDate(altReview.reviewedAt)) errors.push(label + ' alt-text review date is invalid.');

    const blockers = [];
    if (visual.status !== 'not_assessed' &&
        (!nonEmpty(visual.evidence, 10) || !nonEmpty(visual.reviewer) || !validDate(visual.reviewedAt))) {
      blockers.push('visual-review-evidence-incomplete');
    }
    if (visual.status === 'mismatch' && decision.ownerDecision !== 'reject') blockers.push('visual-mismatch-must-be-rejected');
    if (technical.status !== 'pending' && !nonEmpty(technical.evidenceReference, 5)) blockers.push('technical-validation-evidence-incomplete');
    if (altReview.status !== 'pending' &&
        (!nonEmpty(altReview.reviewer) || !validDate(altReview.reviewedAt))) blockers.push('alt-text-review-evidence-incomplete');
    if (altReview.status === 'rejected' && decision.ownerDecision !== 'reject') blockers.push('rejected-alt-text-must-not-be-approved');
    if (technical.status === 'failed' && decision.ownerDecision === 'approve') blockers.push('failed-technical-validation-cannot-be-approved');
    if (decision.ownerDecision === 'approve') {
      if (!['owner-confirmed', 'licensed'].includes(source.status) || !nonEmpty(source.creator) ||
          !nonEmpty(source.evidenceReference, 5) || !nonEmpty(source.verifiedBy) || !validDate(source.verifiedAt)) {
        blockers.push('creator-source-rights-evidence-incomplete');
      }
      if (source.status === 'licensed' && (!validHttps(source.sourceUrl) || !nonEmpty(source.licenseName))) {
        blockers.push('license-source-and-scope-incomplete');
      }
      if (visual.status !== 'matched' || !nonEmpty(visual.evidence, 10) ||
          !nonEmpty(visual.reviewer) || !validDate(visual.reviewedAt)) blockers.push('documented-visual-match-missing');
      if (technical.status !== 'verified' || !nonEmpty(technical.evidenceReference, 5) ||
          record.imageWidth < 1 || record.imageHeight < 1) blockers.push('technical-image-validation-incomplete');
      if (!meaningfulAlt(decision.altText)) blockers.push('descriptive-alt-text-incomplete');
      if (altReview.status !== 'approved' || !nonEmpty(altReview.reviewer) ||
          !validDate(altReview.reviewedAt)) blockers.push('alt-text-review-incomplete');
      requestedApprovals += 1;
      if (blockers.length) blockedApprovalCount += 1;
      else evidenceCompleteApprovalCount += 1;
    }
    if (decision.ownerDecision === 'pending') pendingCount += 1;
    if (decision.ownerDecision === 'reject') rejectedCount += 1;
    decisionResults.push({
      galleryId: id,
      ownerDecision: decision.ownerDecision,
      state: decision.ownerDecision === 'reject' ? 'REJECTED' :
        decision.ownerDecision === 'approve'
          ? blockers.length ? 'APPROVAL_REQUEST_BLOCKED' : 'EVIDENCE_COMPLETE_AWAITING_SEPARATE_REVIEW'
          : blockers.length ? 'BLOCKED' : 'PENDING',
      blockers: [...new Set(blockers)].sort(),
    });
  }
  for (const id of byId.keys()) if (!seen.has(id)) errors.push('Gallery worksheet is missing manifest record: ' + id);

  if (sourceClean) {
    for (const record of records) {
      try {
        const recordFile = regularFile(sourceRoot, record.sourceRecordPath, 'Source Gallery record ' + record.id, 1024 * 1024);
        const recordBytes = fs.readFileSync(recordFile);
        if (sha256(recordBytes) !== record.sourceRecordSha256 || gitBlobSha(recordBytes) !== record.sourceRecordGitBlobSha) {
          throw new Error('source record byte identity changed');
        }
        const sourceRecord = parseStrictJsonBytes(recordBytes, 'Source Gallery record ' + record.id);
        if (sourceRecord.id !== record.id || sourceRecord.category !== record.category ||
            sourceRecord.status !== record.publicationStatus ||
            (sourceRecord.review_status || 'missing') !== record.reviewStatus ||
            !sourceRecord.image || sourceRecord.image.src !== record.sourceImagePath) throw new Error('source record fields changed');
        const imageFile = regularFile(sourceRoot, record.sourceImagePath, 'Source Gallery image ' + record.id, 20 * 1024 * 1024);
        const imageBytes = fs.readFileSync(imageFile);
        if (imageBytes.length !== record.imageBytes || sha256(imageBytes) !== record.imageSha256 ||
            gitBlobSha(imageBytes) !== record.imageGitBlobSha) throw new Error('source image bytes changed');
        const copyFile = regularFile(bundle, record.previewImagePath, 'Review image copy ' + record.id, 20 * 1024 * 1024);
        if (!fs.readFileSync(copyFile).equals(imageBytes)) throw new Error('review image copy differs from source bytes');
      } catch (error) {
        errors.push('Source verification failed for ' + record.id + ': ' + error.message);
      }
    }
  }
  const state = errors.length ? 'INVALID' : blockedApprovalCount ? 'APPROVAL_REQUEST_BLOCKED' :
    evidenceCompleteApprovalCount ? 'EVIDENCE_COMPLETE_AWAITING_SEPARATE_REVIEW' :
      rejectedCount && pendingCount === 0 ? 'OWNER_REJECTIONS_RECORDED' : 'PENDING_OWNER_REVIEW';
  return {
    schemaVersion: 1,
    artifactType: 'authoritative-gallery-owner-review-validation',
    state,
    sourceVerification: { state: errors.length ? 'INVALID' : sourceClean ? 'VERIFIED' : 'INVALID',
      repository: SOURCE_REPOSITORY, branch: SOURCE_BRANCH, commit: sourceCommit, cleanWorkingTree: sourceClean },
    bundle: { manifestSha256: manifestHash, recordCount: records.length },
    decisionWorksheet: { source: options.decisionsPath ? 'returned-file' : 'generated-template', sha256: sha256(worksheetFile.bytes) },
    reviewerAuthorization: { state: 'NOT_CONFIGURED', policyConfigured: false, identityVerified: false, approvalAuthorized: false },
    summary: { decisionRowCount: decisions.length, pendingCount, rejectedCount, requestedApprovals,
      evidenceCompleteApprovalCount, blockedApprovalCount, approvalEligibleCount: 0 },
    policy: { reviewOnly: true, publicationEligible: false, autoApplied: false, sourceRecordsChanged: false,
      approvedMediaChanged: false, rightsInferred: false, visualRelevanceInferred: false,
      approvalAuthorized: false, publicationAuthorized: false },
    errors,
    decisions: decisionResults,
  };
}

function parseArgs(args) {
  const parsed = { bundle: null, sourceRoot: null, sourceCommit: null, decisions: null, json: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--bundle' && args[i + 1]) parsed.bundle = args[++i];
    else if (arg === '--source-root' && args[i + 1]) parsed.sourceRoot = args[++i];
    else if (arg === '--source-commit' && args[i + 1]) parsed.sourceCommit = args[++i];
    else if (arg === '--decisions' && args[i + 1]) parsed.decisions = args[++i];
    else if (arg === '--json') parsed.json = true;
    else throw new Error('Unknown or incomplete argument: ' + arg);
  }
  if (!parsed.bundle || !parsed.sourceRoot || !/^[a-f0-9]{40}$/i.test(parsed.sourceCommit || '')) {
    throw new Error('Usage: node scripts/validate-gallery-review-decisions.js --bundle <bundle> --source-root <source-main> --source-commit <40-character-sha> [--decisions <returned-worksheet>] [--json]');
  }
  return parsed;
}
if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = validateGalleryReviewDecisions(ROOT, args.bundle, {
      sourceRoot: args.sourceRoot, sourceCommit: args.sourceCommit, decisionsPath: args.decisions,
    });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('GALLERY OWNER-REVIEW VALIDATION: ' + report.state);
      console.log('Rows: ' + report.summary.decisionRowCount + ' | pending: ' + report.summary.pendingCount +
        ' | rejected: ' + report.summary.rejectedCount + ' | requested approvals: ' + report.summary.requestedApprovals +
        ' | evidence complete (not authorized): ' + report.summary.evidenceCompleteApprovalCount +
        ' | blocked approvals: ' + report.summary.blockedApprovalCount);
      console.log('Source verification: ' + report.sourceVerification.state +
        ' | reviewer authorization: ' + report.reviewerAuthorization.state +
        ' | approval authorized: no | publication eligible: no');
      for (const error of report.errors) console.error('ERROR: ' + error);
    }
    if (report.errors.length) process.exitCode = 1;
    else if (report.summary.blockedApprovalCount > 0) process.exitCode = 2;
  } catch (error) {
    console.error('FAIL: Gallery owner-review validation stopped safely: ' + error.message);
    process.exitCode = 1;
  }
}
module.exports = { validateGalleryReviewDecisions };
