#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditMedia, imageInfo, inspectImage, safeImagePath, imagePolicy, validateForRole, verifyImageDecode } = require('./audit-editorial-media-readiness');
const { validateRecordPolicy } = require('./validate-content');

const ROOT = path.resolve(__dirname, '..');
const report = auditMedia(ROOT);
assert.equal(imagePolicy(ROOT).supporting.maxBytes, 81920, 'production social/supporting image budget must remain strict');
assert.equal(report.summary.articleCount, 12, 'media audit must cover all 12 articles');
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
