#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildContentPages, GENERATED_MARKER, SITEMAP_BEGIN, SITEMAP_END } = require('./build-content-pages');

const ROOT = path.resolve(__dirname, '..');
const TEMP_PREFIX = path.join(os.tmpdir(), 'garh-content-renderer-');
const REQUIRED_FILES = [
  'content/paths.json',
  'content/site-config.json',
  'content/schemas/tour.schema.json',
  'content/schemas/blog.schema.json',
  'content/tours/sunset-camel-safari.json',
  'content/blogs/jaisalmer-fort-guide.json',
  'sitemap.xml',
  'assets/site.css',
  'assets/site.js',
  'assets/css/content-pages.css',
  'favicon.svg',
];

function copyFixture() {
  const root = fs.mkdtempSync(TEMP_PREFIX);
  for (const relative of REQUIRED_FILES) {
    const source = path.join(ROOT, relative);
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  for (const relative of ['tours/.gitkeep', 'blogs/.gitkeep']) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '', 'utf8');
  }
  return root;
}

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function writeJson(root, relative, value) {
  fs.writeFileSync(path.join(root, relative), JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function approveCanonicalAndContact(root) {
  const config = readJson(root, 'content/site-config.json');
  config.verificationStatus = 'owner-verified';
  config.site.canonicalHostApproved = true;
  config.contact.status = 'verified';
  writeJson(root, 'content/site-config.json', config);
}

function makeTourLive(root) {
  const tour = readJson(root, 'content/tours/sunset-camel-safari.json');
  tour.status = 'live';
  tour.factsConfirmed = true;
  tour.lastVerified = '2026-10-25';
  tour.publishedAt = '2026-10-25';
  writeJson(root, 'content/tours/sunset-camel-safari.json', tour);
}

function makeBlogLive(root) {
  const blog = readJson(root, 'content/blogs/jaisalmer-fort-guide.json');
  blog.status = 'live';
  blog.lastReviewed = '2026-10-25';
  blog.publishedAt = '2026-10-25';
  blog.enquiryCta = { label: 'Email the hotel with a question', mode: 'contact' };
  writeJson(root, 'content/blogs/jaisalmer-fort-guide.json', blog);
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

const root = copyFixture();
try {
  const initialSitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const draftResult = buildContentPages(root, { write: true });
  assert.equal(draftResult.publishedTours, 0);
  assert.equal(draftResult.publishedBlogs, 0);
  assert.deepEqual(draftResult.outputFiles, []);
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false, 'draft tour must not produce a public page');
  assert.equal(fs.existsSync(path.join(root, 'blogs/jaisalmer-fort-guide.html')), false, 'draft article must not produce a public page');
  assert.equal(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), initialSitemap, 'drafts must not change the sitemap');

  approveCanonicalAndContact(root);
  makeTourLive(root);
  assert.throws(() => buildContentPages(root, { write: true }), /verified factSources entry/, 'live tour without evidence must be blocked');
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false, 'failed preflight must not partially write output');

  const tour = readJson(root, 'content/tours/sunset-camel-safari.json');
  tour.factSources = [{ field: 'current package', source: 'Owner-signed verification record', verifiedOn: '2026-10-25', verifiedBy: 'Hotel owner' }];
  writeJson(root, 'content/tours/sunset-camel-safari.json', tour);
  const config = readJson(root, 'content/site-config.json');
  config.contact.status = 'owner-verification-required';
  writeJson(root, 'content/site-config.json', config);
  assert.throws(() => buildContentPages(root, { write: true }), /WhatsApp contact endpoint is not verified/, 'unverified contact endpoint must block publication');
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false);
  approveCanonicalAndContact(root);

  makeBlogLive(root);
  const beforeWrite = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.throws(() => buildContentPages(root, { write: false }), /Generated content is out of date/, 'check mode must detect missing generated output');
  assert.equal(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), beforeWrite, 'check mode must be read-only');

  const published = buildContentPages(root, { write: true });
  assert.equal(published.publishedTours, 1);
  assert.equal(published.publishedBlogs, 1);
  assert.ok(published.outputFiles.includes('tours/index.html'));
  assert.ok(published.outputFiles.includes('tours/sunset-camel-safari.html'));
  assert.ok(published.outputFiles.includes('blogs/index.html'));
  assert.ok(published.outputFiles.includes('blogs/jaisalmer-fort-guide.html'));

  const tourHtml = fs.readFileSync(path.join(root, 'tours/sunset-camel-safari.html'), 'utf8');
  const blogHtml = fs.readFileSync(path.join(root, 'blogs/jaisalmer-fort-guide.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.ok(tourHtml.startsWith(GENERATED_MARKER));
  assert.ok(tourHtml.includes('<h1 class="display-title">Sunset Camel Safari in Jaisalmer</h1>'));
  const whatsappHref = tourHtml.match(/href="(https:\/\/wa\.me\/[^"]+)"/);
  assert.ok(whatsappHref, 'approved WhatsApp CTA should be rendered');
  assert.ok(new URL(whatsappHref[1].replace(/&amp;/g, '&')).searchParams.get('text').includes('I understand this is an enquiry, not a confirmed booking.'));
  assert.ok(tourHtml.includes('rel="noopener noreferrer"'));
  assert.ok(blogHtml.includes('aria-label="On this page"'));
  assert.ok(blogHtml.includes('id="overview"'));
  assert.ok(blogHtml.includes('Rajasthan Tourism — Jaisalmer destination guide'));
  assert.ok(blogHtml.includes('../tours/sunset-camel-safari.html'), 'related link must resolve only to a published tour');
  assert.ok(sitemap.includes(SITEMAP_BEGIN) && sitemap.includes(SITEMAP_END));
  assert.ok(sitemap.includes('https://hotelgarhjaisal.com/tours/'));
  assert.ok(sitemap.includes('https://hotelgarhjaisal.com/tours/sunset-camel-safari.html'));
  assert.ok(sitemap.includes('https://hotelgarhjaisal.com/blogs/jaisalmer-fort-guide.html'));
  assert.equal(buildContentPages(root, { write: false }).sitemapChanged, false, 'second check should be deterministic');

  const unsafeConfig = readJson(root, 'content/site-config.json');
  unsafeConfig.site.canonicalHostApproved = false;
  writeJson(root, 'content/site-config.json', unsafeConfig);
  assert.throws(() => buildContentPages(root, { write: true }), /explicitly approve the canonical host/);
  writeJson(root, 'content/site-config.json', { ...unsafeConfig, site: { ...unsafeConfig.site, canonicalHostApproved: true } });

  const unsafeBlog = readJson(root, 'content/blogs/jaisalmer-fort-guide.json');
  unsafeBlog.sections[0].body[0] = '<script>alert("x")</script> This text is a renderer-escaping test.';
  writeJson(root, 'content/blogs/jaisalmer-fort-guide.json', unsafeBlog);
  buildContentPages(root, { write: true });
  const escapedBlog = fs.readFileSync(path.join(root, 'blogs/jaisalmer-fort-guide.html'), 'utf8');
  assert.ok(escapedBlog.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.equal(escapedBlog.includes('<script>alert("x")</script>'), false, 'record text must not inject executable HTML');

  const manualPage = path.join(root, 'tours/manual-editorial.html');
  fs.writeFileSync(manualPage, '<!doctype html><title>Manual page</title>', 'utf8');
  const draftTour = readJson(root, 'content/tours/sunset-camel-safari.json');
  draftTour.status = 'draft';
  draftTour.factsConfirmed = false;
  draftTour.lastVerified = null;
  draftTour.factSources = [];
  writeJson(root, 'content/tours/sunset-camel-safari.json', draftTour);
  const draftBlog = readJson(root, 'content/blogs/jaisalmer-fort-guide.json');
  draftBlog.status = 'draft';
  draftBlog.lastReviewed = null;
  writeJson(root, 'content/blogs/jaisalmer-fort-guide.json', draftBlog);
  const cleanupResult = buildContentPages(root, { write: true });
  assert.equal(cleanupResult.outputFiles.length, 0);
  assert.ok(cleanupResult.removedFiles.includes('tours/index.html'));
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'blogs/jaisalmer-fort-guide.html')), false);
  assert.equal(fs.existsSync(manualPage), true, 'renderer must not delete unowned HTML files');
  const cleanSitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.equal(cleanSitemap.includes(SITEMAP_BEGIN), false, 'draft transition must remove generated sitemap URLs');
  assert.equal(cleanSitemap.includes(SITEMAP_END), false);
  buildContentPages(root, { write: false });

  console.log('PASS: static content renderer — draft exclusion, fact/canonical/contact gates, read-only check mode, deterministic pages/sitemap, related links, escaping and safe stale-output cleanup.');
} finally {
  cleanup(root);
}
