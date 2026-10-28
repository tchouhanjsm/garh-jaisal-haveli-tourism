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
  'content/paths.json', 'content/site-config.json', 'content/schemas/tour.schema.json',
  'content/schemas/blog.schema.json', 'content/tours/sunset-camel-safari.json',
  'content/blogs/jaisalmer-fort-guide.json', 'sitemap.xml',
  'assets/images/gallery/hotel/fort-from-roof.webp', 'assets/site.css', 'assets/site.js',
  'assets/css/content-pages.css', 'favicon.svg',
];

function copyFixture() {
  const root = fs.mkdtempSync(TEMP_PREFIX);
  for (const relative of REQUIRED_FILES) {
    const source = path.join(ROOT, relative), target = path.join(root, relative);
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
function readJson(root, relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
function writeJson(root, relative, value) { fs.writeFileSync(path.join(root, relative), JSON.stringify(value, null, 2) + '\n', 'utf8'); }
function copyFixtureImage(root, relative) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'assets/images/gallery/hotel/fort-from-roof.webp'), target);
}
function approveCanonicalAndContact(root) {
  const config = readJson(root, 'content/site-config.json');
  config.verificationStatus = 'owner-verified';
  config.site.canonicalHostApproved = true;
  config.contact.status = 'verified';
  config.contact.whatsappBaseUrl = 'https://wa.me/15551234567';
  config.contact.primaryPhoneE164 = '+15551234567';
  config.contact.primaryPhoneDisplay = '+1 555 123 4567';
  config.contact.email = 'qa@example.test';
  writeJson(root, 'content/site-config.json', config);
}
function makeTourLive(root) {
  const tour = readJson(root, 'content/tours/sunset-camel-safari.json');
  tour.status = 'live';
  tour.factsConfirmed = true;
  tour.lastVerified = '2026-10-25';
  tour.publishedAt = '2026-10-25';
  tour.seo.ogImage = 'assets/images/tours/sunset-camel-safari/sunset-camel-safari-og-01.webp';
  tour.seo.ogAlt = 'Carved sandstone rooftop terrace looking across Jaisalmer Fort and the surrounding city at dusk';
  copyFixtureImage(root, tour.seo.ogImage);
  writeJson(root, 'content/tours/sunset-camel-safari.json', tour);
}
function makeBlogLive(root) {
  const blog = readJson(root, 'content/blogs/jaisalmer-fort-guide.json');
  blog.status = 'live';
  blog.lastReviewed = '2026-10-25';
  blog.publishedAt = '2026-10-25';
  blog.heroImage = 'assets/images/blogs/jaisalmer-fort-guide/jaisalmer-fort-guide-hero-01.webp';
  blog.heroAlt = 'Carved sandstone rooftop terrace looking across Jaisalmer Fort and the surrounding city at dusk';
  copyFixtureImage(root, blog.heroImage);
  blog.enquiryCta = { label: 'Email the hotel with a question', mode: 'contact' };
  writeJson(root, 'content/blogs/jaisalmer-fort-guide.json', blog);
}
function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }

const root = copyFixture();
try {
  const initialSitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.equal(initialSitemap.split(SITEMAP_BEGIN).length - 1, 1);
  assert.equal(initialSitemap.split(SITEMAP_END).length - 1, 1);
  // Core URLs live outside the renderer-owned block and must survive registry renders.
  const generatedBlock = initialSitemap.split(SITEMAP_BEGIN)[1].split(SITEMAP_END)[0];
  assert.doesNotMatch(generatedBlock, /<loc>\s*https?:\/\//i, 'draft generated block starts URL-empty');
  const requiredCoreUrls = [
    'https://hotelgarhjaisal.com/',
    'https://hotelgarhjaisal.com/rooms.html',
    'https://hotelgarhjaisal.com/experiences.html',
    'https://hotelgarhjaisal.com/experience-details.html',
    'https://hotelgarhjaisal.com/dining.html',
    'https://hotelgarhjaisal.com/about.html',
    'https://hotelgarhjaisal.com/directions.html',
    'https://hotelgarhjaisal.com/gallery.html',
  ];
  for (const url of requiredCoreUrls) assert.ok(initialSitemap.includes('<loc>' + url + '</loc>'), 'core route missing from sitemap: ' + url);
  const draftResult = buildContentPages(root, { write: true });
  assert.equal(draftResult.publishedTours, 0);
  assert.equal(draftResult.publishedBlogs, 0);
  assert.deepEqual(draftResult.outputFiles, []);
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'blogs/jaisalmer-fort-guide.html')), false);
  assert.equal(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), initialSitemap);

  approveCanonicalAndContact(root);
  makeTourLive(root);
  assert.throws(() => buildContentPages(root, { write: true }), /verified factSources entry/);
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false);
  const tour = readJson(root, 'content/tours/sunset-camel-safari.json');
  tour.factSources = [{ field: 'current package', source: 'Owner-signed verification record', verifiedOn: '2026-10-25', verifiedBy: 'Hotel owner' }];
  writeJson(root, 'content/tours/sunset-camel-safari.json', tour);
  const config = readJson(root, 'content/site-config.json');
  config.contact.status = 'owner-verification-required';
  writeJson(root, 'content/site-config.json', config);
  assert.throws(() => buildContentPages(root, { write: true }), /WhatsApp contact endpoint is not verified/);
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false);
  approveCanonicalAndContact(root);

  makeBlogLive(root);
  const beforeWrite = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.throws(() => buildContentPages(root, { write: false }), /Generated content is out of date/);
  assert.equal(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), beforeWrite);
  const published = buildContentPages(root, { write: true });
  assert.equal(published.publishedTours, 1);
  assert.equal(published.publishedBlogs, 1);
  for (const filename of ['tours/index.html','tours/sunset-camel-safari.html','blogs/index.html','blogs/jaisalmer-fort-guide.html']) assert.ok(published.outputFiles.includes(filename));

  const tourHtml = fs.readFileSync(path.join(root, 'tours/sunset-camel-safari.html'), 'utf8');
  const blogHtml = fs.readFileSync(path.join(root, 'blogs/jaisalmer-fort-guide.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.ok(tourHtml.startsWith('<!doctype html>\n' + GENERATED_MARKER));
  assert.ok(tourHtml.includes('<h1 class="display-title">Sunset Camel Safari in Jaisalmer</h1>'));
  const whatsappHref = tourHtml.match(/href="(https:\/\/wa\.me\/[^"]+)"/);
  assert.ok(whatsappHref);
  assert.ok(new URL(whatsappHref[1].replace(/&amp;/g, '&')).searchParams.get('text').includes('I understand this is an enquiry, not a confirmed booking.'));
  assert.ok(tourHtml.includes('rel="noopener noreferrer"'));
  const imageAlt = 'Carved sandstone rooftop terrace looking across Jaisalmer Fort and the surrounding city at dusk';
  const tourImage = 'https://hotelgarhjaisal.com/assets/images/tours/sunset-camel-safari/sunset-camel-safari-og-01.webp';
  const blogImage = 'https://hotelgarhjaisal.com/assets/images/blogs/jaisalmer-fort-guide/jaisalmer-fort-guide-hero-01.webp';
  for (const [html, image] of [[tourHtml,tourImage],[blogHtml,blogImage]]) {
    assert.ok(html.includes('<meta property="og:image" content="' + image + '">'));
    assert.ok(html.includes('<meta property="og:image:alt" content="' + imageAlt + '">'));
    assert.ok(html.includes('<meta name="twitter:image" content="' + image + '">'));
    assert.ok(html.includes('<meta name="twitter:image:alt" content="' + imageAlt + '">'));
  }
  assert.ok(blogHtml.includes('aria-label="On this page"'));
  assert.ok(blogHtml.includes('id="living-fort"'));
  assert.ok(blogHtml.includes('Rajasthan Tourism — Jaisalmer destination guide'));
  assert.ok(blogHtml.includes('../tours/sunset-camel-safari.html'));
  assert.ok(sitemap.includes(SITEMAP_BEGIN) && sitemap.includes(SITEMAP_END));
  assert.ok(sitemap.includes('https://hotelgarhjaisal.com/tours/'));
  assert.ok(sitemap.includes('https://hotelgarhjaisal.com/tours/sunset-camel-safari.html'));
  assert.ok(sitemap.includes('https://hotelgarhjaisal.com/blogs/jaisalmer-fort-guide.html'));
  assert.equal(buildContentPages(root, { write: false }).sitemapChanged, false);

  const noAlt = readJson(root, 'content/tours/sunset-camel-safari.json');
  delete noAlt.seo.ogAlt;
  writeJson(root, 'content/tours/sunset-camel-safari.json', noAlt);
  assert.throws(() => buildContentPages(root, { write: false }), /seo\.ogImage requires meaningful seo\.ogAlt text/);
  const restore = { ...noAlt, seo: { ...noAlt.seo, ogAlt: imageAlt } };
  writeJson(root, 'content/tours/sunset-camel-safari.json', restore);

  const unsafe = readJson(root, 'content/site-config.json');
  unsafe.site.canonicalHostApproved = false;
  writeJson(root, 'content/site-config.json', unsafe);
  assert.throws(() => buildContentPages(root, { write: true }), /explicitly approve the canonical host/);
  writeJson(root, 'content/site-config.json', { ...unsafe, site: { ...unsafe.site, canonicalHostApproved: true } });

  const unsafeBlog = readJson(root, 'content/blogs/jaisalmer-fort-guide.json');
  unsafeBlog.sections[0].body[0] = '<script>alert("x")</script> This text is a renderer-escaping test.';
  writeJson(root, 'content/blogs/jaisalmer-fort-guide.json', unsafeBlog);
  buildContentPages(root, { write: true });
  const escapedBlog = fs.readFileSync(path.join(root, 'blogs/jaisalmer-fort-guide.html'), 'utf8');
  assert.ok(escapedBlog.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.equal(escapedBlog.includes('<script>alert("x")</script>'), false);

  const manual = path.join(root, 'tours/manual-editorial.html');
  fs.writeFileSync(manual, '<!doctype html><title>Manual page</title>', 'utf8');
  const draftTour = readJson(root, 'content/tours/sunset-camel-safari.json');
  Object.assign(draftTour, { status:'draft', factsConfirmed:false, lastVerified:null, factSources:[] });
  writeJson(root, 'content/tours/sunset-camel-safari.json', draftTour);
  const draftBlog = readJson(root, 'content/blogs/jaisalmer-fort-guide.json');
  Object.assign(draftBlog, { status:'draft', lastReviewed:null });
  writeJson(root, 'content/blogs/jaisalmer-fort-guide.json', draftBlog);
  const cleanupResult = buildContentPages(root, { write: true });
  assert.equal(cleanupResult.outputFiles.length, 0);
  assert.ok(cleanupResult.removedFiles.includes('tours/index.html'));
  assert.equal(fs.existsSync(path.join(root, 'tours/sunset-camel-safari.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'blogs/jaisalmer-fort-guide.html')), false);
  assert.equal(fs.existsSync(manual), true);
  const clean = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.equal((clean.match(new RegExp(SITEMAP_BEGIN, 'g')) || []).length, 1);
  assert.equal((clean.match(new RegExp(SITEMAP_END, 'g')) || []).length, 1);
  assert.doesNotMatch(clean, /https:\/\/hotelgarhjaisal\.com\/(?:tours\/sunset-camel-safari\.html|blogs\/jaisalmer-fort-guide\.html)/);
  for (const url of requiredCoreUrls) assert.ok(clean.includes('<loc>' + url + '</loc>'), 'draft cleanup removed core route from sitemap: ' + url);
  buildContentPages(root, { write: false });
  console.log('PASS: renderer draft exclusion, factual/contact/canonical gates, marker-preserving sitemap, deterministic output and safe cleanup.');
} finally {
  cleanup(root);
}
