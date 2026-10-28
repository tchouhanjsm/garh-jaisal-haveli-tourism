#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applySeoPublication, publicationChanges } = require('./prepare-seo-publication.js');

const ORIGIN = 'https://hotelgarhjaisal.com';
const ROUTES = [
  ['index.html', '/'],
  ['rooms.html', '/rooms.html'],
  ['experiences.html', '/experiences.html'],
  ['experience-details.html', '/experience-details.html'],
  ['dining.html', '/dining.html'],
  ['about.html', '/about.html'],
  ['directions.html', '/directions.html'],
  ['gallery.html', '/gallery.html'],
];

function fixture(approved = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-seo-release-'));
  fs.mkdirSync(path.join(root, 'content'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'images'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'images', 'hero.jpg'), 'fixture image bytes');
  fs.writeFileSync(path.join(root, 'content', 'site-config.json'), JSON.stringify({
    site: {
      newStaticSiteCanonicalHost: ORIGIN,
      canonicalHostApproved: approved,
      canonicalPublicationMode: 'candidate-configured-owner-release-required',
    },
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'content', 'staging-route-contract.json'), JSON.stringify({
    schemaVersion: 1,
    routes: ROUTES.map(([file], index) => ({ file, title: 'Route ' + (index + 1) })),
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(root, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ' +
    '<!-- BEGIN generated content URLs: scripts/build-content-pages.js -->\n  <!-- END generated content URLs -->\n</urlset>\n');
  for (const [file] of ROUTES) {
    const title = file === 'index.html' ? 'Garh Jaisal Haveli | Home' : file.replace('.html', '').replace(/-/g, ' ');
    const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<title>' + title + '</title>' +
      '<meta name="description" content="Plan your stay with source-backed details.">' +
      '<meta property="og:title" content="' + title + '">' +
      '<meta property="og:description" content="Plan your stay with source-backed details.">' +
      '<meta property="og:image" content="assets/images/hero.jpg">' +
      '<meta property="og:image:alt" content="Golden sandstone rooftop at dusk">' +
      '<meta name="twitter:image" content="assets/images/hero.jpg">' +
      '</head><body><h1>' + title + '</h1></body></html>';
    fs.writeFileSync(path.join(root, file), html);
  }
  fs.writeFileSync(path.join(root, '404.html'), '<!doctype html><html><head><meta name="robots" content="noindex,follow"></head><body>Not found</body></html>');
  return root;
}

function trackedFiles(root) {
  return [...ROUTES.map(([file]) => file), 'robots.txt', 'sitemap.xml'];
}
function snapshot(root) {
  return new Map(trackedFiles(root).map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
}
function assertSnapshot(root, before) {
  for (const [file, content] of before) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), content, file + ' unexpectedly changed');
}
function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }

{
  const root = fixture(false);
  try {
    const before = snapshot(root);
    assert.throws(() => applySeoPublication(root), /canonicalHostApproved must be explicitly true/,
      'unapproved publication must fail closed');
    assertSnapshot(root, before);
  } finally { cleanup(root); }
}

{
  const root = fixture(true);
  try {
    const result = applySeoPublication(root);
    assert.equal(result.filesChanged, 10, 'eight routes plus robots.txt and sitemap.xml must be prepared');
    assert.equal(result.origin, ORIGIN);

    for (const [file, route] of ROUTES) {
      const html = fs.readFileSync(path.join(root, file), 'utf8');
      const expected = ORIGIN + route;
      assert.equal((html.match(/rel="canonical"/g) || []).length, 1, file + ' should have exactly one canonical');
      assert.ok(html.includes('<link rel="canonical" href="' + expected + '">'), file + ' canonical route mismatch');
      assert.ok(html.includes('<meta property="og:url" content="' + expected + '">'), file + ' og:url mismatch');
      assert.ok(html.includes('content="' + ORIGIN + '/assets/images/hero.jpg"'), file + ' social image must be absolute on the canonical host');
      assert.ok(html.includes('<meta name="twitter:image:alt" content="Golden sandstone rooftop at dusk">'), file + ' must provide a descriptive Twitter image alt');
      assert.doesNotMatch(html, /content="assets\/images\/hero\.jpg"/, file + ' must not retain relative social image URLs');
    }

    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    assert.deepEqual(locs, ROUTES.map(([, route]) => ORIGIN + route), 'sitemap must list only the eight core routes before dynamic content markers');
    assert.equal((sitemap.match(/<loc>/g) || []).length, 8);
    assert.ok(sitemap.includes('<!-- BEGIN generated content URLs: scripts/build-content-pages.js -->'));
    assert.ok(sitemap.includes('<!-- END generated content URLs -->'));
    assert.doesNotMatch(sitemap, /404\.html/i, 'recovery page must not be included in the sitemap');

    const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
    assert.match(robots, /^User-agent: \*\nAllow: \/$/m);
    assert.ok(robots.includes('Sitemap: ' + ORIGIN + '/sitemap.xml'));

    const once = snapshot(root);
    const second = applySeoPublication(root);
    assert.equal(second.filesChanged, 10);
    assertSnapshot(root, once);
  } finally { cleanup(root); }
}

{
  const root = fixture(true);
  try {
    fs.writeFileSync(path.join(root, 'gallery.html'), '<html><head><title>Gallery</title></head><body></body></html>');
    const before = snapshot(root);
    assert.throws(() => publicationChanges(root), /meta description/,
      'missing route metadata must fail before writes are attempted');
    assertSnapshot(root, before);
  } finally { cleanup(root); }
}

{
  const root = fixture(true);
  try {
    fs.writeFileSync(path.join(root, 'content', 'site-config.json'), JSON.stringify({
      site: {
        newStaticSiteCanonicalHost: 'http://hotelgarhjaisal.com/path',
        canonicalHostApproved: true,
        canonicalPublicationMode: 'candidate-configured-owner-release-required',
      },
    }));
    assert.throws(() => publicationChanges(root), /must be an HTTPS origin/,
      'HTTP or path-bearing origins must be rejected');
  } finally { cleanup(root); }
}

{
  const root = path.resolve(__dirname, '..');
  const htaccess = fs.readFileSync(path.join(root, '.htaccess'), 'utf8');
  const stagingRobots = fs.readFileSync(path.join(root, 'robots-staging.txt'), 'utf8');
  const emptySitemap = fs.readFileSync(path.join(root, 'sitemap-empty.xml'), 'utf8');
  assert.match(htaccess, /RewriteCond %\{HTTP_HOST\} !\^hotelgarhjaisal\\\.com/i,
    '.htaccess must isolate non-canonical hosts');
  assert.match(htaccess, /RewriteRule \^robots\\\.txt\$ robots-staging\.txt \[L\]/,
    '.htaccess must serve the staging robots policy on non-canonical hosts');
  assert.match(htaccess, /RewriteRule \^sitemap\\\.xml\$ sitemap-empty\.xml \[L\]/,
    '.htaccess must serve the empty sitemap on non-canonical hosts');
  assert.match(htaccess, /X-Robots-Tag "noindex, nofollow" env=GJ_NONCANONICAL_HOST/,
    'non-canonical hosts must emit a noindex response header');
  assert.match(stagingRobots, /(?:^|\n)User-agent:\s*\*\s*\nDisallow:\s*\/\s*(?:\n|$)/, 'staging robots must block crawlers');
  assert.doesNotMatch(emptySitemap, /<loc\b/i, 'non-canonical hosts must not expose crawlable sitemap URLs');
  const actualConfig = JSON.parse(fs.readFileSync(path.join(root, 'content', 'site-config.json'), 'utf8'));
  assert.equal(actualConfig.site.canonicalHostApproved, false,
    'the current branch must not silently enable public SEO without owner approval');
}

console.log('PASS: gated SEO release builder covers fail-closed approval, canonical/OG metadata, absolute share images, eight-route sitemap, robots policy, idempotence, no-partial-write validation and host isolation.');
