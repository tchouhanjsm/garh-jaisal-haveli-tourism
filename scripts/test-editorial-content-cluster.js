#!/usr/bin/env node
'use strict';

// Editorial cluster policy: validate source-backed drafts without publishing them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateAgainstSchema } = require('./validate-content');
const { buildContentPages } = require('./build-content-pages');

const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'content', 'blogs');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'schemas', 'blog.schema.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site-config.json'), 'utf8'));
const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

const EXPECTED_CLUSTER = [
  'staying-inside-jaisalmer-fort',
  'jaisalmer-two-day-itinerary',
  'best-time-to-visit-jaisalmer',
  'jain-temples-jaisalmer-guide',
  'gadisar-lake-jaisalmer-guide',
  'bada-bagh-vyas-chhatri-guide',
  'kuldhara-village-jaisalmer-guide',
  'thar-desert-experience-planning',
  'jaisalmer-photography-guide',
  'jaisalmer-fort-arrival-checklist',
  'heritage-hotel-booking-checklist'
];
const OFFICIAL_HOSTS = new Set([
  'whc.unesco.org',
  'www.tourism.rajasthan.gov.in',
  'tourism.rajasthan.gov.in',
  'mausam.imd.gov.in',
  'github.com'
]);
const files = fs.readdirSync(BLOG_DIR).filter(name => name.endsWith('.json')).sort();
const records = files.map(name => {
  const file = path.join(BLOG_DIR, name);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  const findings = validateAgainstSchema(schema, record, relative);
  assert.deepEqual(findings, [], relative + ': blog schema violations: ' + JSON.stringify(findings));
  assert.equal(name, record.slug + '.json', relative + ': filename must match slug');
  return record;
});
const bySlug = new Map(records.map(record => [record.slug, record]));
assert.equal(bySlug.size, records.length, 'blog slugs must be unique');
const primaryQueries = records.map(record => String(record.seo.primaryQuery || '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' '));
assert.ok(primaryQueries.every(query => query.length >= 4), 'every article must declare a primary query');
assert.equal(new Set(primaryQueries).size, records.length,
  'primary queries must be unique across the cluster to reduce keyword cannibalization');
const allowedIntents = new Set(['informational', 'commercial', 'transactional', 'local']);
for (const record of records) {
  assert.ok(allowedIntents.has(record.seo.searchIntent),
    record.slug + ': search intent must use the controlled editorial vocabulary');
}
assert.equal(EXPECTED_CLUSTER.length, 11);
for (const slug of EXPECTED_CLUSTER) {
  assert.ok(bySlug.has(slug), 'missing editorial-cluster record: ' + slug);
  const record = bySlug.get(slug);
  assert.equal(record.status, 'draft', slug + ': all new articles must remain unpublished drafts');
  assert.ok(record.media.requirements.hero.subject.length >= 8, slug + ': hero requirements must be explicit');
  assert.ok(record.media.requirements.socialPreview.subject.length >= 8, slug + ': social preview requirements must be explicit');
  assert.equal(record.media.approvedAssets.length, 0, slug + ': no image may be pre-approved');
  assert.ok(record.media.candidates.every(candidate =>
    candidate.reviewStatus === 'unreviewed'
    && candidate.rightsStatus === 'unverified'
    && candidate.sourceEvidence.status === 'unverified'
    && candidate.sourceEvidence.verifiedBy === null
    && candidate.sourceEvidence.verifiedAt === null
    && candidate.fit === 'not-assessed'
    && candidate.visualReview.status === 'not_assessed'
    && candidate.visualReview.reviewer === null
    && candidate.visualReview.reviewedAt === null
  ), slug + ': candidate fit, rights and visual review must remain unassessed without human evidence');
  assert.equal(record.editorialReview.mediaStatus, record.media.candidates.length ? 'pending' : 'missing', slug + ': media status must distinguish candidate review from missing assets');
  assert.equal(record.lastReviewed, null, slug + ': editor review must not be claimed');
  assert.equal(record.publishedAt, null, slug + ': publication date must remain unset');
  assert.ok(record.sections.length >= 3, slug + ': require substantive structured sections');
  assert.ok(record.sources.length >= 2, slug + ': require multiple sources');
  assert.ok(record.relatedBlogs.length >= 2, slug + ': article must connect to related guides');
  for (const source of record.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:', slug + ': sources must use HTTPS');
    assert.ok(OFFICIAL_HOSTS.has(url.hostname.toLowerCase()),
      slug + ': source host is outside the approved editorial source list: ' + url.hostname);
  }
  for (const related of record.relatedBlogs) {
    assert.ok(bySlug.has(related), slug + ': dangling relatedBlogs reference ' + related);
  }
}
const pillar = bySlug.get('jaisalmer-fort-guide');
assert.ok(pillar, 'existing Jaisalmer Fort pillar guide must remain present');
assert.equal(pillar.status, 'draft', 'existing pillar remains unpublished');
for (const related of pillar.relatedBlogs) {
  assert.ok(bySlug.has(related), 'pillar guide has dangling relatedBlogs reference ' + related);
}
assert.equal(config.site.canonicalHostApproved, false,
  'editorial preparation must not approve the canonical host');
assert.match(robots, /Disallow:\s*\//, 'pre-launch robots policy must remain blocking');
assert.doesNotMatch(sitemap, /<loc>\s*https?:\/\//i,
  'editorial drafts must not add public sitemap URLs');

const render = buildContentPages(ROOT, { write: false });
assert.equal(render.publishedBlogs, 0, 'draft editorial cluster must not render public blog pages');
assert.equal(render.publishedTours, 0, 'editorial preparation must not publish tours');
assert.deepEqual(render.outputFiles, [], 'draft-only validation must not generate pages');
console.log('PASS: 11 source-backed SEO drafts, internal related-blog graph, and owner-gated no-publication contract.');
