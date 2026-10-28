#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditMedia, imageInfo, inspectImage, safeImagePath } = require('./audit-editorial-media-readiness');
const { validateRecordPolicy } = require('./validate-content');

const ROOT = path.resolve(__dirname, '..');
const report = auditMedia(ROOT);
assert.equal(report.summary.articleCount, 12, 'media audit must cover all 12 articles');
assert.equal(report.state, 'BLOCKED', 'draft media cannot be release-ready');
assert.equal(report.summary.approvedArticleCount, 0, 'asset inventory must not infer approval');
assert.equal(report.summary.blockedArticleCount, 12);
assert.ok(report.summary.assetCount > 0, 'inventory should include existing non-blog media');
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
const second = auditMedia(ROOT);
assert.deepEqual(second, report, 'repeated audit calls must return deterministic data');
for (const [rel, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(ROOT, rel)), bytes, 'read-only audit mutated ' + rel);

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
  const corrupt = imageInfo(temp, 'assets/images/corrupt.png');
  assert.equal(corrupt.valid, false, 'corrupt image must not pass technical validation');
  assert.ok(corrupt.errors.some(message => /corrupt|invalid|signature/i.test(message)), 'corrupt-file reason should be explicit');

  const badCandidatePath = path.join(temp, 'content/blogs/jaisalmer-fort-guide.json');
  const badCandidateRecord = JSON.parse(fs.readFileSync(badCandidatePath, 'utf8'));
  badCandidateRecord.media.candidates.push({
    path: 'assets/images/corrupt.png', role: 'hero', fit: 'not-assessed',
    rationale: 'Synthetic corrupt asset used only by this negative regression fixture.',
    provenance: 'Synthetic test fixture; not image provenance.',
    rightsStatus: 'unverified', reviewStatus: 'unreviewed',
  });
  fs.writeFileSync(badCandidatePath, JSON.stringify(badCandidateRecord, null, 2) + '\n');
  const corruptReport = auditMedia(temp);
  assert.ok(corruptReport.articles.find(article => article.slug === badCandidateRecord.slug).candidates
    .some(candidate => candidate.path === 'assets/images/corrupt.png' && !candidate.technical),
  'corrupt candidate must be reported as technically invalid without auto-approval');

  badCandidateRecord.media.candidates.push({
    path: 'assets/images/no-such-file.webp', role: 'socialPreview', fit: 'not-assessed',
    rationale: 'Synthetic missing asset used only by this negative regression fixture.',
    provenance: 'Synthetic test fixture; not image provenance.',
    rightsStatus: 'unverified', reviewStatus: 'unreviewed',
  });
  fs.writeFileSync(badCandidatePath, JSON.stringify(badCandidateRecord, null, 2) + '\n');
  const missingReport = auditMedia(temp);
  assert.ok(missingReport.errors.some(message => message.includes('candidate path missing or unsafe')),
    'missing candidate reference must be detected');

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
    role: 'hero', fit: 'possible-contextual-match',
    rationale: 'Candidate fixture demonstrates that path presence is not approval.',
    provenance: 'Fixture only; not an evidence claim.',
    rightsStatus: 'unverified', reviewStatus: 'approved',
  }];
  validateRecordPolicy('blog', invalidApproval, ROOT,
    { contentTypes: { blog: { outputDirectory: 'blogs', outputExtension: '.html' } } },
    { site: { canonicalHostApproved: false } }, validatorFindings, 'content/blogs/jaisalmer-fort-guide.json');
  assert.ok(validatorFindings.some(finding => /owner-confirmed or licensed rights evidence/.test(finding.message)),
    'unverified rights must invalidate candidate approval');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

// Direct header tests ensure unsupported/corrupt formats fail closed.
assert.ok(inspectImage(Buffer.from('not webp'), '.webp').errors.length > 0);
assert.ok(inspectImage(Buffer.from('not avif'), '.avif').errors.length > 0);
console.log('PASS: editorial media readiness — 12-article coverage, contextual gaps, deterministic read-only reporting, invalid/missing candidates, unsafe paths, and approval/rights separation.');
