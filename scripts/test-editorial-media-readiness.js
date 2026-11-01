#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditMedia, imageInfo, inspectImage, safeImagePath, imagePolicy, validateForRole, roleEligibilitySummary, verifyImageDecode } = require('./audit-editorial-media-readiness');
const { validateRecordPolicy, mediaSourceEvidenceIssues } = require('./validate-content');
const { buildEditorialMediaReview } = require('./build-editorial-media-review');
const { validateEditorialMediaDecisions } = require('./validate-editorial-media-decisions');

const ROOT = path.resolve(__dirname, '..');
const report = auditMedia(ROOT);
assert.equal(imagePolicy(ROOT).supporting.maxBytes, 81920, 'production social/supporting image budget must remain strict');
assert.equal(report.summary.articleCount, 12, 'media audit must cover all 12 articles');
assert.equal(report.summary.headerValidAssetCount, report.inventory.filter(asset => asset.headerValid).length,
  'header validation must be reported separately from full pixel decoding');
assert.equal(report.summary.technicallyValidAssetCount, report.inventory.filter(asset => asset.headerValid && asset.decodeStatus === 'verified').length,
  'technical validity requires successful full pixel decoding');
const policy = imagePolicy(ROOT);
const roleProbe = {
  path: 'assets/images/editorial/custom-name.webp', exists: true, safe: true, bytes: 180 * 1024,
  format: 'webp', width: 1500, height: 1000, sha256: 'fixture-only', headerValid: true,
  valid: true, errors: [], warnings: [], decodeStatus: 'verified',
};
assert.deepEqual(roleEligibilitySummary([roleProbe], policy), {
  roleEligibleAssetCount: 1, heroRoleEligibleAssetCount: 1, socialPreviewRoleEligibleAssetCount: 0,
}, 'role eligibility must use declared role budgets rather than filename patterns');
const roleNeutralInventory = imageInfo(ROOT, 'assets/images/gallery/hotel/fort-from-roof.webp', policy);
assert.equal(roleNeutralInventory.headerValid, true, 'inventory header checks must not impose an inferred supporting-image budget');
assert.ok(!roleNeutralInventory.errors.some(message => /width below |width above |file exceeds /.test(message)),
  'role-specific width/byte checks belong only in validateForRole');
assert.equal(report.state, 'BLOCKED', 'draft media cannot be release-ready');
assert.equal(report.summary.approvedArticleCount, 0, 'asset inventory must not infer approval');
assert.equal(report.summary.declaredApprovedArticleCount, 0, 'no draft record may claim media approval');
assert.ok(report.articles.every(article => article.requirements.hero.subject && article.requirements.socialPreview.subject), 'human report must expose role-specific requirements');
assert.ok(report.articles.flatMap(article => article.candidates).every(candidate => candidate.fit === 'not-assessed' && candidate.visualReview.status === 'not_assessed'), 'unreviewed candidates must not claim contextual fit');
assert.equal(report.summary.blockedArticleCount, 12);
assert.ok(report.summary.verifiedPixelDecodeAssetCount > 0, 'real local image assets must receive a complete Chromium pixel decode');
assert.ok(report.summary.assetCount > 0, 'inventory should include existing non-blog media');
assert.ok(report.inventory.some(asset => asset.path.endsWith('.jpg') && asset.warnings?.some(warning => /convert to WebP or AVIF/.test(warning))), 'JPEG source candidates should be distinguished from permitted publication formats');
assert.ok(report.articles.some(article => article.candidateWarnings.length > 0), 'candidate technical/rights warnings must be visible separately from blockers');
assert.equal(report.articles.filter(article => article.slug === 'gadisar-lake-jaisalmer-guide')[0].candidates.length, 0,
  'do not fabricate candidates when the inventory contains no suitable lake asset');
assert.equal(report.articles.filter(article => article.slug === 'bada-bagh-vyas-chhatri-guide')[0].candidates.length, 0,
  'do not fabricate memorial-site candidates');
assert.equal(report.articles.filter(article => article.slug === 'kuldhara-village-jaisalmer-guide')[0].candidates.length, 0,
  'do not fabricate Kuldhara candidates');
assert.ok(report.articles.every(article => article.missingRoles.includes('hero') && article.missingRoles.includes('socialPreview')),
  'all drafts must explicitly show unapproved hero and social media roles');

const before = new Map();
for (const article of report.articles) {
  const rel = 'content/blogs/' + article.slug + '.json';
  before.set(rel, fs.readFileSync(path.join(ROOT, rel)));
}
for (const rel of ['sitemap.xml', 'content/site-config.json', 'robots.txt']) before.set(rel, fs.readFileSync(path.join(ROOT, rel)));
const publicBlogDir = path.join(ROOT, 'blogs');
const publicBlogFilesBefore = fs.readdirSync(publicBlogDir).sort();

const reviewTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-editorial-media-review-'));
try {
  const reviewOutput = path.join(reviewTemp, 'bundle');
  const reviewManifest = buildEditorialMediaReview(ROOT, reviewOutput, report);
  assert.equal(reviewManifest.reviewOnly, true, 'review bundle must remain explicitly local-only');
  assert.equal(reviewManifest.publicationEligible, false, 'review bundle must never claim publication eligibility');
  assert.equal(reviewManifest.summary.articleCount, 12);
  assert.equal(reviewManifest.summary.candidatePlacementCount, 13);
  assert.equal(reviewManifest.summary.uniqueCandidateAssetCount, 5);
  assert.equal(reviewManifest.summary.approvedPlacementCount, 0);
  assert.equal(reviewManifest.summary.approvedArticleCount, 0);
  assert.equal(reviewManifest.summary.sourceMappedCandidateCount, 2);
  assert.equal(reviewManifest.summary.unmappedCandidateCount, 3);
  assert.equal(reviewManifest.summary.verifiedTargetBlobCount, 2);
  assert.equal(reviewManifest.sourceRepository, 'https://github.com/tchouhanjsm/garh-jaisal-website');
  assert.equal(reviewManifest.sourceBranch, 'main');
  assert.match(reviewManifest.sourceCommit, /^[0-9a-f]{40}$/);
  const migrationManifestBytes = fs.readFileSync(path.join(ROOT, 'docs/MEDIA-MIGRATION-MANIFEST.json'));
  const migrationManifest = JSON.parse(migrationManifestBytes.toString('utf8'));
  assert.equal(reviewManifest.sourceCommit, migrationManifest.sourceCommit);
  assert.equal(reviewManifest.migrationManifestSha256,
    crypto.createHash('sha256').update(migrationManifestBytes).digest('hex'),
    'review manifest must pin exact migration-manifest bytes');
  assert.equal(reviewManifest.migrationEntryCount, migrationManifest.entries.length);
  assert.equal(reviewManifest.assets.length, 5);
  assert.equal(fs.readdirSync(path.join(reviewOutput, 'images')).length, 5);

  for (const asset of reviewManifest.assets) {
    assert.equal(asset.copyStatus, 'copied-verified', 'each current candidate must be copied byte-for-byte for review');
    const copied = fs.readFileSync(path.join(reviewOutput, asset.copyPath));
    assert.equal(copied.length, asset.bytes, 'review copy byte count must match the source');
    assert.equal(crypto.createHash('sha256').update(copied).digest('hex'), asset.sha256,
      'review copy SHA-256 must match the original candidate');
    assert.ok(asset.placements.every(placement =>
      placement.approvalState === 'not-approved' &&
      placement.fit === 'not-assessed' &&
      placement.visualReviewStatus === 'not_assessed' &&
      placement.rightsStatus === 'unverified' &&
      placement.sourceEvidenceStatus === 'unverified'
    ), 'candidate review bundle must preserve all current unapproved states');
  }

  const decisionWorksheetPath = path.join(reviewOutput, 'review-decisions.template.json');
  const decisionWorksheetBytes = fs.readFileSync(decisionWorksheetPath);
  const decisionWorksheet = JSON.parse(decisionWorksheetBytes.toString('utf8'));
  const manifestBytes = fs.readFileSync(path.join(reviewOutput, 'manifest.json'));
  assert.equal(decisionWorksheet.artifactType, 'editorial-media-decision-worksheet');
  assert.equal(decisionWorksheet.approvalStatus, 'not-approved');
  assert.equal(decisionWorksheet.publicationEligible, false);
  assert.equal(decisionWorksheet.policy.autoApplied, false);
  assert.equal(decisionWorksheet.policy.contentRecordsChanged, false);
  assert.equal(decisionWorksheet.reviewManifestSha256,
    crypto.createHash('sha256').update(manifestBytes).digest('hex'),
    'decision worksheet must be bound to the exact review manifest bytes');
  assert.equal(decisionWorksheet.summary.candidatePlacementCount, 13);
  assert.equal(decisionWorksheet.summary.missingCandidateRoleCount, 11);
  assert.equal(decisionWorksheet.summary.decisionRowCount, 24);
  assert.equal(decisionWorksheet.decisions.length, 24);

  const candidateDecisionRows = decisionWorksheet.decisions.filter(row => row.entryType === 'candidate-placement');
  const missingRoleRows = decisionWorksheet.decisions.filter(row => row.entryType === 'missing-candidate-role');
  assert.equal(candidateDecisionRows.length, 13);
  assert.equal(missingRoleRows.length, 11);
  assert.ok(decisionWorksheet.decisions.every(row =>
    row.ownerDecision === 'pending' &&
    row.rightsStatus === 'unverified' &&
    row.sourceEvidence.status === 'unverified' &&
    row.sourceEvidence.creator === null &&
    row.sourceEvidence.sourceUrl === null &&
    row.sourceEvidence.licenseName === null &&
    row.sourceEvidence.evidenceReference === null &&
    row.visualReview.status === 'not_assessed' &&
    row.visualReview.reviewer === null &&
    row.visualReview.reviewedAt === null &&
    row.altText === null &&
    row.technicalValidation.status === 'not_verified'
  ), 'worksheet must leave every human decision and evidence field unfilled');

  for (const row of candidateDecisionRows) {
    const asset = reviewManifest.assets.find(item => item.path === row.candidatePath);
    assert.ok(asset, 'candidate decision must reference an inventoried image');
    assert.equal(row.candidateSha256, asset.sha256);
    assert.equal(row.candidateGitBlobSha, asset.migrationRecord.targetGitBlobSha);
    assert.equal(row.migrationStatus, asset.migrationRecord.status);
  }
  for (const row of missingRoleRows) {
    assert.equal(row.candidatePath, null);
    assert.equal(row.proposedCandidatePath, null, 'missing media must not receive an invented candidate path');
    assert.equal(row.proposedCandidateSha256, null, 'missing media must not receive an invented candidate hash');
    assert.equal(row.proposedCandidateGitBlobSha, null, 'missing media must not receive an invented candidate Git blob');
    assert.ok(row.requiredSubject, 'missing-role request must preserve the draft-stated subject requirement');
    assert.match(row.articleRecordSha256, /^[0-9a-f]{64}$/, 'each missing-role request must pin its exact article record');
  }

  assert.ok(reviewManifest.articles.every(article => /^[0-9a-f]{64}$/.test(article.recordSha256)),
    'review manifest must pin exact draft article bytes');
  const sourceRoot = path.join(reviewTemp, 'authoritative-source');
  for (const entry of migrationManifest.entries) {
    const sourceFile = path.join(sourceRoot, ...entry.sourcePath.split('/'));
    const targetFile = path.join(ROOT, ...entry.targetPath.split('/'));
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.copyFileSync(targetFile, sourceFile);
  }
  const sourceOptions = { sourceRoot, sourceCommit: migrationManifest.sourceCommit };
  const decisionValidation = validateEditorialMediaDecisions(ROOT, reviewOutput, sourceOptions);
  assert.equal(decisionValidation.sourceVerification.state, 'VERIFIED',
    'all pinned source migration entries must match the checked-out authoritative source bytes');
  assert.equal(decisionValidation.sourceVerification.entryCount, migrationManifest.entries.length);
  assert.equal(decisionValidation.sourceVerification.verifiedEntryCount, migrationManifest.entries.length);
  assert.equal(decisionValidation.state, 'PENDING_OWNER_REVIEW',
    'a complete blank worksheet must validate structurally without implying approval');
  assert.deepEqual(decisionValidation.errors, [], 'blank owner worksheet must have no structural errors');
  assert.equal(decisionValidation.summary.pendingCount, 24);
  assert.equal(decisionValidation.summary.requestedApprovals, 0);
  assert.equal(decisionValidation.policy.publicationEligible, false);
  assert.equal(decisionValidation.policy.contentRecordsChanged, false);
  assert.equal(decisionValidation.policy.approvedMediaChanged, false);

  const tamperedSourceRoot = path.join(reviewTemp, 'tampered-source');
  fs.cpSync(sourceRoot, tamperedSourceRoot, { recursive: true });
  const sourceEntry = migrationManifest.entries[0];
  fs.appendFileSync(path.join(tamperedSourceRoot, ...sourceEntry.sourcePath.split('/')), 'tampered');
  const tamperedSourceValidation = validateEditorialMediaDecisions(ROOT, reviewOutput, {
    sourceRoot: tamperedSourceRoot, sourceCommit: migrationManifest.sourceCommit,
  });
  assert.ok(tamperedSourceValidation.errors.some(message => /Source Git blob mismatch/.test(message)),
    'source bytes must be independently checked against the pinned source Git blob');

  const tamperedManifestOutput = path.join(reviewTemp, 'tampered-manifest');
  fs.cpSync(reviewOutput, tamperedManifestOutput, { recursive: true });
  fs.appendFileSync(path.join(tamperedManifestOutput, 'manifest.json'), '\n');
  const tamperedManifestResult = validateEditorialMediaDecisions(ROOT, tamperedManifestOutput, sourceOptions);
  assert.ok(tamperedManifestResult.errors.some(message => /SHA-256 does not match/.test(message)),
    'worksheet must be rejected when the exact manifest bytes change');

  const tamperedWorksheetOutput = path.join(reviewTemp, 'tampered-worksheet');
  fs.cpSync(reviewOutput, tamperedWorksheetOutput, { recursive: true });
  const tamperedWorksheetPath = path.join(tamperedWorksheetOutput, 'review-decisions.template.json');
  const tamperedWorksheet = JSON.parse(fs.readFileSync(tamperedWorksheetPath, 'utf8'));
  tamperedWorksheet.decisions[0].candidateSha256 = '0'.repeat(64);
  fs.writeFileSync(tamperedWorksheetPath, JSON.stringify(tamperedWorksheet, null, 2) + '\n');
  const tamperedWorksheetResult = validateEditorialMediaDecisions(ROOT, tamperedWorksheetOutput, sourceOptions);
  assert.ok(tamperedWorksheetResult.errors.some(message => /candidate identity does not match/.test(message)),
    'worksheet must reject a changed candidate identity');

  const approvalRequestOutput = path.join(reviewTemp, 'approval-request');
  fs.cpSync(reviewOutput, approvalRequestOutput, { recursive: true });
  const approvalWorksheetPath = path.join(approvalRequestOutput, 'review-decisions.template.json');
  const approvalWorksheet = JSON.parse(fs.readFileSync(approvalWorksheetPath, 'utf8'));
  const approvalRow = approvalWorksheet.decisions.find(row => row.entryType === 'candidate-placement');
  approvalRow.ownerDecision = 'approve';
  approvalRow.visualReview = {
    status: 'matched',
    evidence: 'Fixture-only reviewer statement; not an actual editorial decision.',
    reviewer: 'Fixture reviewer',
    reviewedAt: '2026-10-28',
  };
  approvalRow.sourceEvidence = {
    status: 'owner-created',
    creator: 'Fixture creator',
    sourceUrl: null,
    licenseName: null,
    evidenceReference: 'fixture-evidence:owner-created',
    verifiedBy: 'Fixture reviewer',
    verifiedAt: '2026-10-28',
  };
  approvalRow.rightsStatus = 'owner-confirmed';
  approvalRow.altText = 'Fixture description of the visible subject for validator regression coverage.';
  approvalRow.technicalValidation = { status: 'verified', evidenceReference: 'sha256:' + '0'.repeat(64) };
  fs.writeFileSync(approvalWorksheetPath, JSON.stringify(approvalWorksheet, null, 2) + '\n');
  const approvalValidation = validateEditorialMediaDecisions(ROOT, approvalRequestOutput, sourceOptions);
  assert.equal(approvalValidation.summary.requestedApprovals, 1);
  assert.equal(approvalValidation.summary.blockedApprovalCount, 1,
    'a requested approval must remain blocked when technical evidence is not independently verified');
  assert.equal(approvalValidation.policy.publicationEligible, false,
    'even evidence-complete worksheet decisions must never claim publication eligibility');
  assert.equal(approvalValidation.policy.contentRecordsChanged, false,
    'worksheet validation must never mutate article records');
  assert.ok(approvalValidation.warnings.some(message => /technical evidence reference does not match/.test(message) ||
    /technical role validation failed/.test(message)),
  'technical validation must be recomputed from current image bytes and role policy');

  const incompleteInventoryOutput = path.join(reviewTemp, 'incomplete-inventory');
  fs.cpSync(reviewOutput, incompleteInventoryOutput, { recursive: true });
  const incompleteManifestPath = path.join(incompleteInventoryOutput, 'manifest.json');
  const incompleteManifest = JSON.parse(fs.readFileSync(incompleteManifestPath, 'utf8'));
  const incompleteArticle = incompleteManifest.articles.find(article => article.candidatePaths.length > 0);
  incompleteArticle.candidatePaths.pop();
  const incompleteManifestBytes = Buffer.from(JSON.stringify(incompleteManifest, null, 2) + '\n');
  fs.writeFileSync(incompleteManifestPath, incompleteManifestBytes);
  const incompleteWorksheetPath = path.join(incompleteInventoryOutput, 'review-decisions.template.json');
  const incompleteWorksheet = JSON.parse(fs.readFileSync(incompleteWorksheetPath, 'utf8'));
  incompleteWorksheet.reviewManifestSha256 = crypto.createHash('sha256').update(incompleteManifestBytes).digest('hex');
  fs.writeFileSync(incompleteWorksheetPath, JSON.stringify(incompleteWorksheet, null, 2) + '\n');
  const incompleteInventoryValidation = validateEditorialMediaDecisions(ROOT, incompleteInventoryOutput, sourceOptions);
  assert.ok(incompleteInventoryValidation.errors.some(message => /candidate declarations do not exactly match/.test(message) ||
    /article declarations and asset placements do not form the same exact inventory/.test(message)),
  'the worksheet manifest must not omit a candidate declared in the current draft record');

  const mappedAssets = reviewManifest.assets.filter(asset => asset.migrationRecord.status === 'recorded-target-blob-verified');
  assert.equal(mappedAssets.length, 2);
  assert.ok(mappedAssets.every(asset =>
    asset.migrationRecord.targetBlobMatches === true &&
    asset.migrationRecord.sourceTargetRecordedMatch === true &&
    /^[0-9a-f]{40}$/.test(asset.migrationRecord.targetGitBlobSha)
  ), 'recorded source/target mapping must match the current candidate Git blob');
  assert.ok(reviewManifest.assets.filter(asset => asset.migrationRecord.status === 'not-recorded-in-migration-manifest')
    .every(asset => asset.migrationRecord.targetGitBlobSha && asset.migrationRecord.sourcePath === undefined),
  'unmapped candidates may have a target identity but must not gain an invented source path');

  const reviewHtml = fs.readFileSync(path.join(reviewOutput, 'index.html'), 'utf8');
  assert.match(reviewHtml, /REVIEW ONLY/);
  assert.match(reviewHtml, /NOT APPROVED/);
  assert.match(reviewHtml, /noindex,nofollow/);
  assert.match(reviewHtml, /review-decisions\.template\.json/);
  assert.match(reviewHtml, /does not approve media or change repository records/);
  assert.doesNotMatch(reviewHtml, /<script\b/i, 'review artifact must not execute scripts');
  assert.ok(reviewHtml.includes('bada-bagh-vyas-chhatri-guide'),
    'article candidate gaps must remain visible to the reviewer');
  assert.throws(() => buildEditorialMediaReview(ROOT, path.join(ROOT, 'artifacts', 'editorial-media-review'), report),
    /outside the repository root/, 'review artifact must never be written into the website repository');

  const escapedReport = JSON.parse(JSON.stringify(report));
  escapedReport.articles.find(article => article.candidates.length > 0).candidates[0].rationale = '<script>alert(1)</script>';
  const escapedOutput = path.join(reviewTemp, 'escaped');
  buildEditorialMediaReview(ROOT, escapedOutput, escapedReport);
  const escapedHtml = fs.readFileSync(path.join(escapedOutput, 'index.html'), 'utf8');
  assert.ok(escapedHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'candidate text must be escaped before inclusion in review HTML');
  assert.ok(!escapedHtml.includes('<script>alert(1)</script>'),
    'review artifact must not permit candidate text to inject markup');
} finally {
  fs.rmSync(reviewTemp, { recursive: true, force: true });
}

assert.ok(!publicBlogFilesBefore.some(name => name.endsWith('.html')), 'there must be no generated public blog pages for drafts');
const second = auditMedia(ROOT);
assert.deepEqual(second, report, 'repeated audit calls must return deterministic data');
for (const [rel, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(ROOT, rel)), bytes, 'read-only audit mutated ' + rel);
assert.deepEqual(fs.readdirSync(publicBlogDir).sort(), publicBlogFilesBefore, 'media audit must not create or change generated public blog pages');

assert.equal(safeImagePath(ROOT, '../outside.webp'), null, 'path traversal must be rejected');
assert.equal(safeImagePath(ROOT, 'https://example.test/image.webp'), null, 'remote paths must be rejected');
assert.equal(safeImagePath(ROOT, 'assets/images/blogs/.gitkeep'), null, 'non-image bookkeeping files are not eligible candidate assets');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-media-readiness-'));
try {
  fs.cpSync(path.join(ROOT, 'content'), path.join(temp, 'content'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets/images'), path.join(temp, 'assets/images'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'content/paths.json'), path.join(temp, 'content/paths.json'));
  fs.mkdirSync(path.join(temp, 'docs'), { recursive: true });
  const tempMigrationManifestPath = path.join(temp, 'docs/MEDIA-MIGRATION-MANIFEST.json');
  fs.copyFileSync(path.join(ROOT, 'docs/MEDIA-MIGRATION-MANIFEST.json'), tempMigrationManifestPath);
  const migrationDrift = JSON.parse(fs.readFileSync(tempMigrationManifestPath, 'utf8'));
  migrationDrift.updatedAt = '2026-11-01';
  fs.writeFileSync(tempMigrationManifestPath, JSON.stringify(migrationDrift, null, 2) + '\n');
  const staleMigrationValidation = validateEditorialMediaDecisions(temp, reviewOutput, sourceOptions);
  assert.ok(staleMigrationValidation.errors.some(message => /migration manifest changed after review bundle creation/.test(message)),
    'a review bundle must be rejected when the migration manifest changes after bundle creation');
  fs.copyFileSync(path.join(ROOT, 'docs/MEDIA-MIGRATION-MANIFEST.json'), tempMigrationManifestPath);
  const fakePath = path.join(temp, 'assets/images/corrupt.png');
  fs.writeFileSync(fakePath, Buffer.from('not a png'));
  fs.copyFileSync(fakePath, path.join(temp, 'assets/images/corrupt-copy.png'));
  const corrupt = imageInfo(temp, 'assets/images/corrupt.png');
  assert.equal(corrupt.valid, false, 'corrupt image must not pass technical validation');
  assert.ok(corrupt.errors.some(message => /corrupt|invalid|signature/i.test(message)), 'corrupt-file reason should be explicit');
  assert.equal(verifyImageDecode(temp, [corrupt]).get('assets/images/corrupt.png').status, 'failed', 'a corrupt file must not receive decode verification');

  const badCandidatePath = path.join(temp, 'content/blogs/jaisalmer-fort-guide.json');
  const badCandidateRecord = JSON.parse(fs.readFileSync(badCandidatePath, 'utf8'));
  badCandidateRecord.media.candidates.push({
    path: 'assets/images/corrupt.png', role: 'hero', fit: 'not-assessed',
    rationale: 'Synthetic corrupt asset used only by this negative regression fixture.',
    provenance: 'Synthetic test fixture; not image provenance.',
    sourceEvidence: { status: 'unverified', creator: null, sourceUrl: null, licenseName: null, evidenceReference: null, verifiedBy: null, verifiedAt: null },
    rightsStatus: 'unverified', reviewStatus: 'unreviewed',
    visualReview: { status: 'not_assessed', evidence: 'Not visually assessed in negative fixture.', reviewer: null, reviewedAt: null },
  });
  fs.writeFileSync(badCandidatePath, JSON.stringify(badCandidateRecord, null, 2) + '\n');
  const corruptReport = auditMedia(temp);
  assert.ok(corruptReport.duplicateFiles.some(group => group.files.includes('assets/images/corrupt.png') && group.files.includes('assets/images/corrupt-copy.png')), 'byte-identical assets at different paths must be grouped');
  assert.ok(corruptReport.articles.find(article => article.slug === badCandidateRecord.slug).candidates
    .some(candidate => candidate.path === 'assets/images/corrupt.png' && !candidate.technical),
  'corrupt candidate must be reported as technically invalid without auto-approval');

  badCandidateRecord.media.candidates.push({
    path: 'assets/images/no-such-file.webp', role: 'socialPreview', fit: 'not-assessed',
    rationale: 'Synthetic missing asset used only by this negative regression fixture.',
    provenance: 'Synthetic test fixture; not image provenance.',
    sourceEvidence: { status: 'unverified', creator: null, sourceUrl: null, licenseName: null, evidenceReference: null, verifiedBy: null, verifiedAt: null },
    rightsStatus: 'unverified', reviewStatus: 'unreviewed',
    visualReview: { status: 'not_assessed', evidence: 'Not visually assessed in negative fixture.', reviewer: null, reviewedAt: null },
  });
  fs.writeFileSync(badCandidatePath, JSON.stringify(badCandidateRecord, null, 2) + '\n');
  const missingReport = auditMedia(temp);
  assert.ok(missingReport.errors.some(message => message.includes('candidate path missing or unsafe')),
    'missing candidate reference must be detected');

  badCandidateRecord.media.candidates[0].visualReview = {
    status: 'mismatch',
    evidence: 'Synthetic negative fixture confirms a mismatch state must be rejected.',
    reviewer: 'fixture-reviewer',
    reviewedAt: '2026-10-28',
  };
  fs.writeFileSync(badCandidatePath, JSON.stringify(badCandidateRecord, null, 2) + '\n');
  const mismatchReport = auditMedia(temp);
  assert.ok(mismatchReport.errors.some(message => message.includes('visual mismatch must be marked not-a-match and rejected')),
    'mismatched visual evidence must not remain a potential or approved candidate');

  const validatorFindings = [];
  const invalidApproval = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/blogs/jaisalmer-fort-guide.json'), 'utf8'));
  invalidApproval.editorialReview.mediaStatus = 'approved';
  invalidApproval.media.approvedAssets = [{
    path: 'assets/images/gallery/hotel/fort-from-roof.webp',
    role: 'hero', alt: 'An image', approvedBy: 'test', approvedAt: '2026-10-28',
    rightsEvidence: 'No actual evidence; negative test fixture only.'
  }];
  invalidApproval.media.candidates = [{
    path: 'assets/images/gallery/hotel/fort-from-roof.webp',
    role: 'hero', fit: 'not-assessed',
    rationale: 'Candidate fixture demonstrates that path presence is not approval.',
    provenance: 'Fixture only; not an evidence claim.',
    sourceEvidence: { status: 'unverified', creator: null, sourceUrl: null, licenseName: null, evidenceReference: null, verifiedBy: null, verifiedAt: null },
    rightsStatus: 'unverified', reviewStatus: 'approved',
    visualReview: { status: 'not_assessed', evidence: 'Not visually assessed in negative fixture.', reviewer: null, reviewedAt: null },
  }];
  validateRecordPolicy('blog', invalidApproval, ROOT,
    { contentTypes: { blog: { outputDirectory: 'blogs', outputExtension: '.html' } } },
    { site: { canonicalHostApproved: false } }, validatorFindings, 'content/blogs/jaisalmer-fort-guide.json');
  assert.ok(validatorFindings.some(finding => /owner-confirmed or licensed rights evidence/.test(finding.message)),
    'unverified rights must invalidate candidate approval');
  assert.ok(validatorFindings.some(finding => /documented visual subject match/.test(finding.message)),
    'candidate approval must require recorded visual subject review');

  const reviewed = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/blogs/jaisalmer-fort-guide.json'), 'utf8'));
  reviewed.editorialReview.mediaStatus = 'pending';
  reviewed.media.approvedAssets = [];
  reviewed.media.candidates = [{
    path: 'assets/images/gallery/hotel/fort-from-roof.webp',
    role: 'hero', fit: 'possible-contextual-match',
    rationale: 'A visually inspected fixture candidate for review-date validation.',
    provenance: 'Fixture only; no rights claim.',
    sourceEvidence: { status: 'owner-created', creator: 'Fixture image creator', sourceUrl: null, licenseName: null, evidenceReference: 'fixture-evidence:reviewed-source', verifiedBy: 'fixture-reviewer', verifiedAt: '2026-10-28' },
    rightsStatus: 'owner-confirmed', reviewStatus: 'approved',
    visualReview: {
      status: 'matched',
      evidence: 'The reviewer confirmed the visible fort and rooftop subject is relevant for this fixture.',
      reviewer: 'fixture-reviewer',
      reviewedAt: '2026-10-28',
    },
  }];
  const matchedFindings = [];
  validateRecordPolicy('blog', reviewed, ROOT,
    { contentTypes: { blog: { outputDirectory: 'blogs', outputExtension: '.html' } } },
    { site: { canonicalHostApproved: false } }, matchedFindings, 'content/blogs/jaisalmer-fort-guide.json');
  assert.ok(!matchedFindings.some(finding => /visual match requires evidence, reviewer and valid review date/.test(finding.message)),
    'a documented visual match with a valid date must pass the candidate cross-field gate');
  reviewed.media.candidates[0].visualReview.reviewedAt = '2026-02-31';
  const invalidDateFindings = [];
  validateRecordPolicy('blog', reviewed, ROOT,
    { contentTypes: { blog: { outputDirectory: 'blogs', outputExtension: '.html' } } },
    { site: { canonicalHostApproved: false } }, invalidDateFindings, 'content/blogs/jaisalmer-fort-guide.json');
  assert.ok(invalidDateFindings.some(finding => /visual match requires evidence, reviewer and valid review date/.test(finding.message)),
    'impossible calendar dates must not pass the visual-review evidence gate');

const incompleteLicensedSource = {
  rightsStatus: 'licensed', reviewStatus: 'approved',
  sourceEvidence: { status: 'licensed', creator: 'Fixture photographer', sourceUrl: null, licenseName: null, evidenceReference: null, verifiedBy: 'fixture-reviewer', verifiedAt: '2026-10-28' },
};
assert.ok(mediaSourceEvidenceIssues(incompleteLicensedSource).some(issue => /licensed source evidence requires an HTTPS source URL and named license/.test(issue)),
  'licensed media must not pass without the source URL and licence identifier');
const completeLicensedSource = {
  rightsStatus: 'licensed', reviewStatus: 'approved',
  sourceEvidence: { status: 'licensed', creator: 'Fixture photographer', sourceUrl: 'https://example.com/license-record', licenseName: 'CC BY 4.0', evidenceReference: 'fixture-evidence:license-record', verifiedBy: 'fixture-reviewer', verifiedAt: '2026-10-28' },
};
assert.deepEqual(mediaSourceEvidenceIssues(completeLicensedSource), [],
  'structured licensed-source evidence must pass when each required field is present');

const migrationManifestPath = path.join(temp, 'docs/MEDIA-MIGRATION-MANIFEST.json');
const tamperedMigration = JSON.parse(fs.readFileSync(migrationManifestPath, 'utf8'));
const fortMapping = tamperedMigration.entries.find(entry =>
  entry.targetPath === 'assets/images/gallery/hotel/fort-from-roof.webp');
assert.ok(fortMapping, 'negative migration fixture must include the known mapped candidate');
fortMapping.targetBlobSha = '0'.repeat(40);
fs.writeFileSync(migrationManifestPath, JSON.stringify(tamperedMigration, null, 2) + '\n');
const migrationMismatchReport = auditMedia(temp);
const migrationReviewTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-migration-media-review-'));
try {
  assert.throws(
    () => buildEditorialMediaReview(temp, path.join(migrationReviewTemp, 'migration-mismatch'), migrationMismatchReport),
    /Recorded migration target blob does not match candidate bytes/,
    'review bundle must fail closed when a recorded target blob does not match current candidate bytes'
  );
} finally {
  fs.rmSync(migrationReviewTemp, { recursive: true, force: true });
}
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

// Direct header tests ensure unsupported/corrupt formats fail closed.
assert.ok(inspectImage(Buffer.from('not webp'), '.webp').errors.length > 0);
assert.ok(inspectImage(Buffer.from('not avif'), '.avif').errors.length > 0);
const sourcePolicy = imagePolicy(ROOT);
const headerOnly = {
  path: 'assets/images/blogs/example/example-hero-01.webp',
  exists: true, safe: true, bytes: 50000, format: 'webp',
  width: 1200, height: 800, sha256: 'fixture-header-only', errors: [], warnings: [],
};
const headerOnlyResult = validateForRole(headerOnly, 'hero', sourcePolicy);
assert.equal(headerOnlyResult.valid, false, 'headers and dimensions alone must not pass release validation');
assert.ok(headerOnlyResult.errors.some(message => /full pixel decode has not been verified/.test(message)),
  'missing full-decode evidence must be an explicit blocker');
const sourceCandidate = imageInfo(ROOT, 'assets/images/legacy/rooftop-candlelight.webp', sourcePolicy);
assert.equal(verifyImageDecode(ROOT, [sourceCandidate]).get(sourceCandidate.path).status, 'verified', 'real WebP source must decode in Chromium and match header dimensions');
const tooLargeForSocial = validateForRole(sourceCandidate, 'socialPreview', sourcePolicy);
assert.equal(tooLargeForSocial.valid, false, 'oversized source file must not be approved as a production social image');
assert.ok(tooLargeForSocial.errors.some(message => /file exceeds 81920-byte policy/.test(message)), 'supporting budget failure must be explicit');
console.log('PASS: editorial media readiness — 12-article coverage, contextual gaps, deterministic read-only reporting, invalid/missing candidates, unsafe paths, and approval/rights separation.');
