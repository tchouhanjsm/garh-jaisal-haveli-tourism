#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditPublicationSafeguards } = require('./test-seo-publication-safeguards.js');

function withFixture(mutator = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-seo-publication-'));
  try {
    fs.mkdirSync(path.join(root, 'content'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tours'), { recursive: true });
    fs.mkdirSync(path.join(root, 'blogs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'content', 'site-config.json'), JSON.stringify({
      site: { canonicalHostApproved: false, newStaticSiteCanonicalHost: 'https://example.test' },
    }));
    fs.writeFileSync(path.join(root, 'robots.txt'), '# staging only\nUser-agent: *\nDisallow: /\n');
    fs.writeFileSync(path.join(root, 'sitemap.xml'), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    fs.writeFileSync(path.join(root, 'index.html'), '<html><head><meta property="og:image" content="/assets/hero.jpg"></head><body><h1>Home</h1></body></html>');
    fs.writeFileSync(path.join(root, '404.html'), '<html><head><meta name="robots" content="noindex,follow"></head><body><h1>Not found</h1></body></html>');
    fs.writeFileSync(path.join(root, 'tours', 'desert.html'), '<html><head><meta property="og:title" content="Desert"></head><body><h1>Desert</h1></body></html>');
    fs.writeFileSync(path.join(root, 'blogs', 'fort.html'), '<html><head><meta property="og:description" content="Fort"></head><body><h1>Fort</h1></body></html>');
    mutator(root);
    return auditPublicationSafeguards(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const baseline = withFixture();
assert.deepEqual(baseline.errors, [], 'valid pre-launch state must pass');
assert.equal(baseline.pagesChecked, 4, 'root, tours and blogs HTML must all be scanned');

function rejects(mutator, pattern, message) {
  const result = withFixture(mutator);
  assert.ok(result.errors.some(error => pattern.test(error)), message + '\nActual errors: ' + result.errors.join('\n'));
}

rejects(root => {
  fs.writeFileSync(path.join(root, 'tours', 'desert.html'),
    '<html><head><link href="https://example.test/tours/desert.html" rel="alternate canonical"></head></html>');
}, /tours\/desert\.html: canonical link/, 'canonical links in generated tour pages must be rejected');

rejects(root => {
  fs.writeFileSync(path.join(root, '404.html'),
    '<html><head><meta name="og:url" content="https://example.test/404.html"></head></html>');
}, /404\.html: og:url/, 'og:url metadata must be rejected even on the recovery page');

rejects(root => {
  fs.writeFileSync(path.join(root, 'sitemap.xml'),
    '<urlset><url><loc>https://example.test/</loc></url></urlset>');
}, /sitemap\.xml must not contain URL entries/, 'sitemap URL entries must be rejected');

rejects(root => {
  fs.writeFileSync(path.join(root, 'robots.txt'),
    'User-agent: *\nDisallow: /\nSitemap: https://example.test/sitemap.xml\n');
}, /robots\.txt must not publish a Sitemap/, 'robots sitemap directives must be rejected');

rejects(root => {
  fs.writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\nAllow: /\n');
}, /must retain Disallow: \/ /, 'removing pre-launch crawl blocking must be rejected');

rejects(root => {
  fs.writeFileSync(path.join(root, 'content', 'site-config.json'),
    JSON.stringify({ site: { canonicalHostApproved: true, newStaticSiteCanonicalHost: 'https://example.test' } }));
}, /canonicalHostApproved must remain exactly false/, 'host approval must require a separately authorized publication implementation');

rejects(root => {
  fs.unlinkSync(path.join(root, 'content', 'site-config.json'));
}, /site-config\.json is missing or invalid/, 'missing config must fail closed');

rejects(root => {
  fs.writeFileSync(path.join(root, 'content', 'site-config.json'), '{invalid');
}, /site-config\.json is missing or invalid/, 'malformed config must fail closed');

console.log('PASS: SEO publication guard fixtures cover root/tour/blog pages, safe social metadata, canonical/OG URL regressions, sitemap/robots publication and fail-closed config handling.');
