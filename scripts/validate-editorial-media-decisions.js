#!/usr/bin/env node
'use strict';

/**
 * Validate a returned editorial decision worksheet against its exact review
 * manifest, current draft records, original image bytes and technical policy.
 * This tool is read-only: it never edits content, approves media or publishes.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  imageInfo,
  safeImagePath,
  imagePolicy,
  validateForRole,
  verifyImageDecode,
} = require('./audit-editorial-media-readiness');
const { mediaSourceEvidenceIssues } = require('./validate-content');

const ROOT = path.resolve(__dirname, '..');
const ROLES = ['hero', 'socialPreview'];
const DECISIONS = ['pending', 'approve', 'reject'];
const CANDIDATE_KEYS = [
  'entryType', 'articleSlug', 'articleTitle', 'articleStatus', 'articleRecordSha256',
  'role', 'requiredSubject', 'candidatePath', 'candidateSha256', 'candidateGitBlobSha',
  'migrationStatus', 'ownerDecision', 'visualReview', 'sourceEvidence', 'rightsStatus',
  'altText', 'technicalValidation', 'notes',
];
const MISSING_KEYS = [
  ...CANDIDATE_KEYS,
  'proposedCandidatePath', 'proposedCandidateSha256', 'proposedCandidateGitBlobSha',
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

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) &&
    relative !== '..' && !path.isAbsolute(relative));
}

function regularFile(root, relative, label) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)) {
    throw new Error(label + ' has an unsafe relative path.');
  }
  const segments = relative.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(label + ' has an unsafe relative path.');
  }
  const absolute = path.resolve(root, ...segments);
  if (!isWithin(path.resolve(root), absolute)) throw new Error(label + ' escapes its root.');
  let current = path.resolve(root);
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(label + ' must not traverse a symlink.');
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(label + ' contains a non-directory parent.');
    }
    if (index === segments.length - 1 && !stat.isFile()) {
      throw new Error(label + ' must be a regular file.');
    }
  }
  return absolute;
}

function readJsonFile(root, relative, label) {
  const absolute = regularFile(root, relative, label);
  const bytes = fs.readFileSync(absolute);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    throw new Error(label + ' is not valid JSON: ' + error.message);
  }
}

function resolveBundle(root, bundleDirectory) {
  const rootReal = fs.realpathSync(root);
  const output = path.resolve(bundleDirectory);
  const parentReal = fs.realpathSync(path.dirname(output));
  const resolved = path.join(parentReal, path.basename(output));
  if (isWithin(rootReal, resolved)) {
    throw new Error('Decision validation bundle must be outside the repository root.');
  }
  const stat = fs.lstatSync(output);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Decision validation bundle must be a regular directory.');
  }
  const real = fs.realpathSync(output);
  if (isWithin(rootReal, real)) {
    throw new Error('Decision validation bundle resolves inside the repository root.');
  }
  return real;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nonEmpty(value, minimum = 2) {
  return typeof value === 'string' && value.trim().length >= minimum;
}

function meaningfulAlt(value) {
  if (!nonEmpty(value, 10) || value.length > 200) return false;
  return !/^(image|photo|picture|image of|photo of|jaisalmer|a photo|a picture)(\b|$)/i.test(value.trim());
}

function exactKeys(value, keys, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(label + ' must be an object.');
    return false;
  }
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) errors.push(label + ' contains unsupported field: ' + key);
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(label + ' is missing field: ' + key);
    }
  }
  return true;
}

function readArticle(root, article, errors) {
  const relative = 'content/blogs/' + article.slug + '.json';
  if (!/^[a-z0-9-]+$/.test(article.slug || '')) {
    errors.push('Manifest contains an unsafe article slug: ' + String(article.slug));
    return null;
  }
  try {
    const file = readJsonFile(root, relative, 'Article record ' + article.slug);
    const digest = sha256(file.bytes);
    if (!/^[0-9a-f]{64}$/i.test(article.recordSha256 || '') || digest !== article.recordSha256) {
      errors.push('Article record changed after review bundle creation: ' + article.slug);
    }
    const record = file.value;
    if (record.slug !== article.slug || record.title !== article.title || record.status !== 'draft') {
      errors.push('Article identity/status no longer matches the review manifest: ' + article.slug);
    }
    if (!record.media || !Array.isArray(record.media.candidates) ||
        !Array.isArray(record.media.approvedAssets) || record.media.approvedAssets.length !== 0) {
      errors.push('Article media state is no longer an unapproved draft: ' + article.slug);
    }
    return record;
  } catch (error) {
    errors.push(error.message);
    return null;
  }
}

function verifyManifest(root, bundle, manifestBytes, manifest, errors) {
  if (!manifest || manifest.schemaVersion !== 1 ||
      manifest.artifactType !== 'editorial-media-review' ||
      manifest.reviewOnly !== true || manifest.publicationEligible !== false ||
      manifest.approvalStatus !== 'not-approved') {
    errors.push('Review manifest must retain its versioned review-only, not-approved contract.');
  }
  if (!manifest || !manifest.policy || manifest.policy.derivativesCreated !== false ||
      manifest.policy.publicRoutesChanged !== false || manifest.policy.draftRecordsChanged !== false ||
      manifest.policy.rightsInferred !== false || manifest.policy.visualRelevanceInferred !== false ||
      manifest.policy.candidateDeclarationsAreNotApproval !== true) {
    errors.push('Review manifest policy flags are missing or unsafe.');
  }
  if (!manifest || !Array.isArray(manifest.assets) || !Array.isArray(manifest.articles) ||
      !manifest.summary || !Number.isInteger(manifest.summary.articleCount)) {
    errors.push('Review manifest inventory or summary is incomplete.');
    return { articleRecords: new Map(), assetBytes: new Map() };
  }

  const articleRecords = new Map();
  const articleBySlug = new Map();
  for (const article of manifest.articles) {
    if (!article || typeof article.slug !== 'string' || articleBySlug.has(article.slug)) {
      errors.push('Review manifest contains an invalid or duplicate article.');
      continue;
    }
    articleBySlug.set(article.slug, article);
    articleRecords.set(article.slug, readArticle(root, article, errors));
  }
  if (manifest.articles.length !== manifest.summary.articleCount) {
    errors.push('Review manifest article count does not match its summary.');
  }

  const assetBytes = new Map();
  const assetByPath = new Map();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.path !== 'string' || assetByPath.has(asset.path)) {
      errors.push('Review manifest contains an invalid or duplicate candidate asset.');
      continue;
    }
    assetByPath.set(asset.path, asset);
    try {
      const absolute = safeImagePath(root, asset.path);
      if (!absolute) throw new Error('candidate image path is missing or unsafe');
      const bytes = fs.readFileSync(absolute);
      const digest = sha256(bytes);
      const blob = gitBlobSha(bytes);
      if (digest !== asset.sha256 || bytes.length !== asset.bytes) {
        errors.push('Candidate image bytes changed after review bundle creation: ' + asset.path);
      }
      if (asset.migrationRecord && asset.migrationRecord.targetGitBlobSha &&
          blob !== asset.migrationRecord.targetGitBlobSha) {
        errors.push('Candidate Git blob identity changed after review bundle creation: ' + asset.path);
      }
      assetBytes.set(asset.path, { bytes, sha256: digest, gitBlobSha: blob });
      if (asset.copyStatus === 'copied-verified') {
        if (typeof asset.copyPath !== 'string' || !asset.copyPath.startsWith('images/')) {
          errors.push('Review copy path is missing or unsafe: ' + asset.path);
        } else {
          const copyAbsolute = regularFile(bundle, asset.copyPath, 'Review copy ' + asset.path);
          const copyBytes = fs.readFileSync(copyAbsolute);
          if (sha256(copyBytes) !== digest || copyBytes.length !== bytes.length) {
            errors.push('Review copy is not byte-identical to its candidate: ' + asset.path);
          }
        }
      } else {
        errors.push('Candidate has no byte-verified review copy: ' + asset.path);
      }
    } catch (error) {
      errors.push('Candidate integrity check failed for ' + asset.path + ': ' + error.message);
    }
  }

  const actualPlacements = manifest.assets.reduce((count, asset) =>
    count + (Array.isArray(asset.placements) ? asset.placements.length : 0), 0);
  if (actualPlacements !== manifest.summary.candidatePlacementCount) {
    errors.push('Candidate placement count does not match the review manifest summary.');
  }
  return { articleRecords, articleBySlug, assetBytes, assetByPath };
}

function expectedRows(manifest, errors) {
  const expected = new Map();
  for (const asset of manifest.assets || []) {
    for (const placement of asset.placements || []) {
      const key = ['candidate-placement', placement.articleSlug, placement.role, asset.path].join('|');
      if (expected.has(key)) errors.push('Review manifest contains a duplicate placement: ' + key);
      expected.set(key, { type: 'candidate-placement', article: placement.articleSlug,
        role: placement.role, path: asset.path, asset, placement });
    }
  }
  for (const article of manifest.articles || []) {
    const declared = new Set((article.candidatePaths || []).map(candidate => candidate.role));
    for (const role of ROLES) {
      if (declared.has(role)) continue;
      const key = ['missing-candidate-role', article.slug, role, ''].join('|');
      expected.set(key, { type: 'missing-candidate-role', article: article.slug, role, path: null, article });
    }
  }
  return expected;
}

function validateVisualReview(row, label, blockers) {
  const review = row.visualReview;
  if (!review || typeof review !== 'object' || Array.isArray(review) ||
      !['not_assessed', 'matched', 'mismatch'].includes(review.status)) {
    blockers.push(label + ': visual review state is invalid.');
    return;
  }
  if (review.status === 'not_assessed') {
    if (review.reviewer !== null || review.reviewedAt !== null) {
      blockers.push(label + ': unassessed visual review cannot claim reviewer/date evidence.');
    }
  } else if (!nonEmpty(review.evidence, 10) || !nonEmpty(review.reviewer) || !validDate(review.reviewedAt)) {
    blockers.push(label + ': visual review requires evidence, reviewer and a real review date.');
  }
  if (review.status === 'mismatch' && row.ownerDecision !== 'reject') {
    blockers.push(label + ': a visual mismatch must be rejected, never approved or left pending.');
  }
}

function technicalReference(info, role, check, blobSha, policy) {
  const limits = role === 'hero' ? policy.hero : policy.supporting;
  const payload = {
    path: info.path, role, sha256: info.sha256, gitBlobSha: blobSha,
    bytes: info.bytes, format: info.format, width: info.width, height: info.height,
    decodeStatus: info.decodeStatus, valid: check.valid, errors: check.errors, limits,
  };
  return 'sha256:' + sha256(Buffer.from(JSON.stringify(payload), 'utf8'));
}

function validateEditorialMediaDecisions(root, bundleDirectory) {
  const errors = [];
  const warnings = [];
  const bundle = resolveBundle(root, bundleDirectory);
  const manifestFile = readJsonFile(bundle, 'manifest.json', 'Review manifest');
  const worksheetFile = readJsonFile(bundle, 'review-decisions.template.json', 'Decision worksheet');
  const manifest = manifestFile.value;
  const worksheet = worksheetFile.value;
  const manifestDigest = sha256(manifestFile.bytes);

  if (!worksheet || worksheet.schemaVersion !== 1 ||
      worksheet.artifactType !== 'editorial-media-decision-worksheet' ||
      worksheet.reviewOnly !== true || worksheet.approvalStatus !== 'not-approved' ||
      worksheet.publicationEligible !== false) {
    errors.push('Decision worksheet must retain its versioned review-only, not-approved contract.');
  }
  if (!worksheet || worksheet.reviewManifestSha256 !== manifestDigest) {
    errors.push('Decision worksheet is stale: its SHA-256 does not match the exact manifest bytes.');
  }
  const policy = worksheet && worksheet.policy;
  if (!policy || policy.autoApplied !== false || policy.contentRecordsChanged !== false ||
      policy.rightsInferred !== false || policy.visualRelevanceInferred !== false ||
      policy.publicationEligible !== false) {
    errors.push('Decision worksheet policy flags are missing or unsafe.');
  }
  if (!worksheet || !worksheet.summary || !Array.isArray(worksheet.decisions)) {
    errors.push('Decision worksheet summary or decision rows are missing.');
    return emptyReport(manifestDigest, errors);
  }

  const verified = verifyManifest(root, bundle, manifestFile.bytes, manifest, errors);
  const expected = expectedRows(manifest, errors);
  const actualCounts = { candidatePlacementCount: 0, missingCandidateRoleCount: 0 };
  const seen = new Set();
  const approvalRows = [];
  const rowResults = [];

  for (const row of worksheet.decisions) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push('Decision worksheet contains a malformed row.');
      continue;
    }
    const isCandidate = row.entryType === 'candidate-placement';
    const isMissing = row.entryType === 'missing-candidate-role';
    if (!isCandidate && !isMissing) {
      errors.push('Decision worksheet contains an unsupported entry type.');
      continue;
    }
    const label = row.articleSlug + ':' + row.role;
    exactKeys(row, isCandidate ? CANDIDATE_KEYS : MISSING_KEYS, 'Decision row ' + label, errors);
    const key = [row.entryType, row.articleSlug, row.role, isCandidate ? row.candidatePath : ''].join('|');
    const expectedRow = expected.get(key);
    if (!expectedRow || seen.has(key)) {
      errors.push('Decision row is unknown or duplicated: ' + label);
      continue;
    }
    seen.add(key);
    actualCounts[isCandidate ? 'candidatePlacementCount' : 'missingCandidateRoleCount'] += 1;

    const article = verified.articleBySlug && verified.articleBySlug.get(row.articleSlug);
    const record = verified.articleRecords && verified.articleRecords.get(row.articleSlug);
    const articleManifest = expectedRow.article || (manifest.articles || []).find(item => item.slug === row.articleSlug);
    if (!article || !record || !articleManifest) {
      errors.push('Decision row has no current draft article binding: ' + label);
      continue;
    }
    const recordDigest = article.recordSha256;
    if (row.articleTitle !== article.title || row.articleStatus !== article.status ||
        row.articleRecordSha256 !== recordDigest || article.status !== 'draft') {
      errors.push('Decision row article identity is stale or not a draft: ' + label);
    }
    if (!ROLES.includes(row.role) || row.requiredSubject !== (expectedRow.placement
      ? expectedRow.placement.requirement : (article.requirements && article.requirements[row.role] && article.requirements[row.role].subject) || null)) {
      errors.push('Decision row role/subject does not match the reviewed article requirement: ' + label);
    }
    if (row.ownerDecision && !DECISIONS.includes(row.ownerDecision)) {
      errors.push('Decision row has an unsupported ownerDecision: ' + label);
    }
    if (!DECISIONS.includes(row.ownerDecision)) errors.push('Decision row ownerDecision is required: ' + label);

    if (isCandidate) {
      const asset = expectedRow.asset;
      const placement = expectedRow.placement;
      if (row.candidateSha256 !== asset.sha256 ||
          row.candidateGitBlobSha !== (asset.migrationRecord && asset.migrationRecord.targetGitBlobSha) ||
          row.migrationStatus !== (asset.migrationRecord && asset.migrationRecord.status)) {
        errors.push('Decision row candidate identity does not match the review manifest: ' + label);
      }
      if (!record.media.candidates.some(candidate => candidate.path === row.candidatePath && candidate.role === row.role)) {
        errors.push('Candidate is no longer declared in the exact draft record: ' + label);
      }
      if (row.articleTitle !== placement.articleTitle || row.articleStatus !== placement.articleStatus) {
        errors.push('Candidate placement context changed in the review manifest: ' + label);
      }
    } else {
      if (row.candidatePath !== null || row.candidateSha256 !== null || row.candidateGitBlobSha !== null ||
          row.proposedCandidatePath === undefined || row.proposedCandidateSha256 === undefined ||
          row.proposedCandidateGitBlobSha === undefined) {
        errors.push('Missing-role row must not invent an existing candidate and must include nullable proposal bindings: ' + label);
      }
      if (record.media.candidates.some(candidate => candidate.role === row.role)) {
        errors.push('Missing-role request is stale because the draft now declares this role: ' + label);
      }
    }

    if (!row.visualReview || !row.sourceEvidence || !row.technicalValidation) {
      errors.push('Decision row evidence objects are incomplete: ' + label);
      continue;
    }
    const blockers = [];
    validateVisualReview(row, label, blockers);
    if (row.ownerDecision === 'approve') approvalRows.push({ row, label, blockers });
    if (row.ownerDecision === 'reject') {
      if (!nonEmpty(row.notes, 10)) blockers.push(label + ': rejection requires a documented reason of at least 10 characters.');
      if (row.visualReview.status === 'not_assessed' || !nonEmpty(row.visualReview.reviewer) ||
          !validDate(row.visualReview.reviewedAt)) {
        blockers.push(label + ': rejection requires a named reviewer and review date.');
      }
    }
    if (row.altText !== null && row.altText !== undefined &&
        (typeof row.altText !== 'string' || row.altText.length > 200)) {
      blockers.push(label + ': alt text must be null or at most 200 characters.');
    }
    if (!['unverified', 'owner-confirmed', 'licensed', 'rejected'].includes(row.rightsStatus)) {
      blockers.push(label + ': rightsStatus is invalid.');
    }
    if (!row.technicalValidation || !['not_verified', 'verified'].includes(row.technicalValidation.status) ||
        !(row.technicalValidation.evidenceReference === null || typeof row.technicalValidation.evidenceReference === 'string')) {
      blockers.push(label + ': technical validation declaration is malformed.');
    }
    if (row.ownerDecision === 'approve') {
      if (row.visualReview.status !== 'matched') blockers.push(label + ': approval requires a documented visual subject match.');
      if (!meaningfulAlt(row.altText)) blockers.push(label + ': approval requires descriptive, non-generic alt text.');
      const sourceIssues = mediaSourceEvidenceIssues({
        sourceEvidence: row.sourceEvidence,
        rightsStatus: row.rightsStatus,
        reviewStatus: 'approved',
      });
      for (const issue of sourceIssues) blockers.push(label + ': ' + issue);
      if (isMissing && !row.proposedCandidatePath) blockers.push(label + ': missing role requires a proposed candidate path before approval can be assessed.');
    }
    if (row.technicalValidation.status === 'verified' && !row.technicalValidation.evidenceReference) {
      blockers.push(label + ': verified technical validation requires its deterministic evidence reference.');
    }
    if (blockers.length) warnings.push(...blockers);
    rowResults.push({ articleSlug: row.articleSlug, role: row.role, decision: row.ownerDecision,
      state: blockers.length ? 'BLOCKED' : row.ownerDecision === 'pending' ? 'PENDING' : row.ownerDecision === 'reject' ? 'REJECTED' : 'EVIDENCE_PENDING',
      blockers });
  }

  for (const key of expected.keys()) {
    if (!seen.has(key)) errors.push('Decision worksheet is missing a required row: ' + key);
  }
  if (actualCounts.candidatePlacementCount !== worksheet.summary.candidatePlacementCount ||
      actualCounts.missingCandidateRoleCount !== worksheet.summary.missingCandidateRoleCount ||
      worksheet.summary.decisionRowCount !== worksheet.decisions.length ||
      worksheet.decisions.length !== expected.size) {
    errors.push('Decision worksheet row counts do not match the exact review manifest.');
  }

  const technicalRows = [];
  for (const item of approvalRows) {
    const { row, label, blockers } = item;
    const candidatePath = row.entryType === 'candidate-placement' ? row.candidatePath : row.proposedCandidatePath;
    if (typeof candidatePath !== 'string' || !candidatePath) continue;
    const absolute = safeImagePath(root, candidatePath);
    if (!absolute) {
      blockers.push(label + ': selected candidate path is missing or unsafe.');
      continue;
    }
    const bytes = fs.readFileSync(absolute);
    const digest = sha256(bytes);
    const blob = gitBlobSha(bytes);
    const expectedSha = row.entryType === 'candidate-placement' ? row.candidateSha256 : row.proposedCandidateSha256;
    const expectedBlob = row.entryType === 'candidate-placement' ? row.candidateGitBlobSha : row.proposedCandidateGitBlobSha;
    if (digest !== expectedSha || blob !== expectedBlob) {
      blockers.push(label + ': selected candidate bytes do not match the worksheet SHA-256/Git blob pins.');
      continue;
    }
    const info = imageInfo(root, candidatePath, imagePolicy(root));
    technicalRows.push({ row, label, blockers, info, blob });
  }

  const policy = imagePolicy(root);
  const decode = verifyImageDecode(root, technicalRows.map(item => item.info));
  for (const item of technicalRows) {
    const result = decode.get(item.info.path);
    item.info.decodeStatus = result ? result.status : 'unavailable';
    const check = validateForRole(item.info, item.row.role, policy);
    const reference = technicalReference(item.info, item.row.role, check, item.blob, policy);
    if (!check.valid) item.blockers.push(item.label + ': technical role validation failed: ' + check.errors.join('; '));
    if (item.row.technicalValidation.status !== 'verified' ||
        item.row.technicalValidation.evidenceReference !== reference) {
      item.blockers.push(item.label + ': technical evidence reference does not match the independently recomputed image/role validation.');
    }
    const resultRow = rowResults.find(row => row.articleSlug === item.row.articleSlug &&
      row.role === item.row.role && row.decision === item.row.ownerDecision);
    if (resultRow && item.blockers.length) {
      resultRow.state = 'BLOCKED';
      resultRow.blockers = [...item.blockers];
    }
  }

  const requestedApprovals = approvalRows.length;
  const blockedApprovalCount = approvalRows.filter(item => item.blockers.length > 0).length;
  const evidenceCompleteApprovalCount = requestedApprovals - blockedApprovalCount;
  const summary = {
    decisionRowCount: worksheet.decisions.length,
    candidatePlacementCount: actualCounts.candidatePlacementCount,
    missingCandidateRoleCount: actualCounts.missingCandidateRoleCount,
    pendingCount: worksheet.decisions.filter(row => row.ownerDecision === 'pending').length,
    rejectedCount: worksheet.decisions.filter(row => row.ownerDecision === 'reject').length,
    requestedApprovals,
    evidenceCompleteApprovalCount,
    blockedApprovalCount,
  };
  const state = errors.length ? 'INVALID' : requestedApprovals
    ? blockedApprovalCount ? 'APPROVAL_REQUEST_BLOCKED' : 'EVIDENCE_COMPLETE_AWAITING_SEPARATE_REVIEW'
    : 'PENDING_OWNER_REVIEW';

  return {
    schemaVersion: 1,
    artifactType: 'editorial-media-decision-validation',
    state,
    reviewManifestSha256: manifestDigest,
    summary,
    policy: {
      reviewOnly: true,
      publicationEligible: false,
      autoApplied: false,
      contentRecordsChanged: false,
      approvedMediaChanged: false,
      rightsInferred: false,
      visualRelevanceInferred: false,
    },
    errors,
    warnings,
    decisions: rowResults,
  };
}

function emptyReport(manifestDigest, errors) {
  return {
    schemaVersion: 1,
    artifactType: 'editorial-media-decision-validation',
    state: 'INVALID',
    reviewManifestSha256: manifestDigest,
    summary: { decisionRowCount: 0, candidatePlacementCount: 0, missingCandidateRoleCount: 0,
      pendingCount: 0, rejectedCount: 0, requestedApprovals: 0,
      evidenceCompleteApprovalCount: 0, blockedApprovalCount: 0 },
    policy: { reviewOnly: true, publicationEligible: false, autoApplied: false,
      contentRecordsChanged: false, approvedMediaChanged: false,
      rightsInferred: false, visualRelevanceInferred: false },
    errors,
    warnings: [],
    decisions: [],
  };
}

function parseArgs(args) {
  let bundle = null;
  let json = false;
  let strictApprovals = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--bundle' && args[index + 1]) bundle = args[++index];
    else if (argument === '--json') json = true;
    else if (argument === '--strict-approvals') strictApprovals = true;
    else throw new Error('Unknown or incomplete argument: ' + argument);
  }
  if (!bundle) throw new Error('Usage: node scripts/validate-editorial-media-decisions.js --bundle <review-bundle-outside-repository> [--json] [--strict-approvals]');
  return { bundle, json, strictApprovals };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = validateEditorialMediaDecisions(ROOT, args.bundle);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('EDITORIAL MEDIA DECISION VALIDATION: ' + report.state);
      console.log('Rows: ' + report.summary.decisionRowCount +
        ' | pending: ' + report.summary.pendingCount +
        ' | rejected: ' + report.summary.rejectedCount +
        ' | requested approvals: ' + report.summary.requestedApprovals +
        ' | evidence-complete (not approved): ' + report.summary.evidenceCompleteApprovalCount +
        ' | blocked approvals: ' + report.summary.blockedApprovalCount);
      for (const error of report.errors) console.error('ERROR: ' + error);
      for (const warning of report.warnings) console.error('BLOCKED: ' + warning);
      console.log('Review-only: yes | content records changed: no | publication eligible: no');
    }
    if (report.errors.length) process.exitCode = 1;
    else if (args.strictApprovals && report.summary.blockedApprovalCount > 0) process.exitCode = 2;
  } catch (error) {
    console.error('FAIL: editorial media decision validation stopped safely: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateEditorialMediaDecisions, technicalReference, meaningfulAlt, validDate };
