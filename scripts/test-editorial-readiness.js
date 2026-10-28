#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditEditorialReadiness } = require('./audit-editorial-readiness');
const { validateRecordPolicy } = require('./validate-content');

const ROOT = path.resolve(__dirname, '..');
const report = auditEditorialReadiness(ROOT);
assert.equal(report.state, 'BLOCKED', 'unreviewed, unillustrated draft cluster must remain blocked');
assert.equal(report.summary.totalArticles, 12, 'audit should cover the pillar and eleven supporting articles');
assert.equal(report.summary.contentPacketsReadyForHumanReview, 12,
  'all structurally valid articles should be visible in the human editorial queue');
assert.equal(report.summary.mediaComplete, 0, 'missing article-specific hero/OG media must be reported');
assert.equal(report.summary.releaseEligible, 0, 'no article may be release-eligible before review and owner approval');
assert.equal(report.summary.hardErrors, 0, 'known review blockers must not be misreported as structural errors');
assert.equal(report.summary.publicBlogPages, 0, 'drafts must not have public HTML pages');
assert.equal(report.siteGates.canonicalHostApproved, false, 'audit must not approve canonical host');
assert.equal(report.siteGates.robotsBlocking, true, 'audit must preserve the blocking pre-launch robots policy');
assert.equal(report.siteGates.sitemapUrlCount, 0, 'pre-launch sitemap must remain empty');
for (const article of report.articles) {
  assert.equal(article.status, 'draft', article.slug + ': publication status must remain draft');
  assert.equal(article.contentPacketReadyForHumanReview, true, article.slug + ': structured packet should be reviewable');
  assert.equal(article.releaseEligible, false, article.slug + ': article must remain release-blocked');
  assert.ok(article.blockers.includes('hero-image-missing-or-unreviewed'), article.slug + ': hero blocker must be explicit');
  assert.ok(article.blockers.includes('open-graph-image-missing-or-unreviewed'), article.slug + ': social-image blocker must be explicit');
  assert.ok(article.blockers.includes('owner-fact-approval-pending'), article.slug + ': owner approval blocker must be explicit');
  assert.equal(article.editorialReview.editorialStatus, 'pending');
  assert.equal(article.editorialReview.sourceStatus, 'pending');
  assert.equal(article.editorialReview.factStatus, 'pending');
  assert.equal(article.editorialReview.mediaStatus, 'missing');
}

// The audit is read-only: verify repeated calls produce identical reports and don't alter records or sitemap.
const before = new Map();
for (const article of report.articles) {
  before.set('content/blogs/' + article.slug + '.json',
    fs.readFileSync(path.join(ROOT, 'content', 'blogs', article.slug + '.json'), 'utf8'));
}
before.set('sitemap.xml', fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'));
assert.deepEqual(auditEditorialReadiness(ROOT), report, 'read-only report should be deterministic');
for (const [relative, bytes] of before) {
  assert.equal(fs.readFileSync(path.join(ROOT, relative), 'utf8'), bytes,
    'audit must not alter ' + relative);
}

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-editorial-readiness-'));
  fs.mkdirSync(path.join(root, 'content', 'blogs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content', 'schemas'), { recursive: true });
  fs.mkdirSync(path.join(root, 'blogs'), { recursive: true });
  for (const slug of report.articles.map(article => article.slug)) {
    fs.copyFileSync(
      path.join(ROOT, 'content', 'blogs', slug + '.json'),
      path.join(root, 'content', 'blogs', slug + '.json')
    );
  }
  for (const relative of ['content/schemas/blog.schema.json', 'content/site-config.json', 'robots.txt', 'sitemap.xml']) {
    fs.copyFileSync(path.join(ROOT, relative), path.join(root, relative));
  }
  return root;
}

const duplicateRoot = fixtureRoot();
try {
  const first = JSON.parse(fs.readFileSync(path.join(duplicateRoot, 'content/blogs/jaisalmer-fort-guide.json'), 'utf8'));
  const secondPath = path.join(duplicateRoot, 'content/blogs/staying-inside-jaisalmer-fort.json');
  const second = JSON.parse(fs.readFileSync(secondPath, 'utf8'));
  second.seo.primaryQuery = first.seo.primaryQuery;
  fs.writeFileSync(secondPath, JSON.stringify(second, null, 2) + '\n');
  const duplicateReport = auditEditorialReadiness(duplicateRoot);
  assert.ok(duplicateReport.errors.some(error => error.includes('primary query duplicates')),
    'audit must fail duplicate primary queries in an isolated fixture');
} finally {
  fs.rmSync(duplicateRoot, { recursive: true, force: true });
}

// The central repository validator must reject a premature status transition even when the record schema is valid.
const premature = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/blogs/jaisalmer-fort-guide.json'), 'utf8'));
premature.status = 'approved_for_release';
const findings = [];
validateRecordPolicy(
  'blog',
  premature,
  ROOT,
  { contentTypes: { blog: { outputDirectory: 'blogs', outputExtension: '.html' } } },
  JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site-config.json'), 'utf8')),
  findings,
  'content/blogs/jaisalmer-fort-guide.json'
);
assert.ok(findings.some(finding => finding.message.includes('approved/live blog requires')),
  'approved_for_release must require all review states and owner fact approval');
assert.ok(findings.some(finding => finding.message.includes('hero image, OG image')),
  'approved_for_release must require both article image roles and their alt text');

console.log('PASS: editorial readiness report, query-collision detection, read-only behavior, and release-state enforcement.');
