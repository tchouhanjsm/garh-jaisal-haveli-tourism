#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditPublicationSafeguards } = require('./test-seo-publication-safeguards.js');

const ORIGIN = 'https://hotelgarhjaisal.com';
const STATIC_ROUTES = [
  ['index.html', '/'],
  ['rooms.html', '/rooms.html'],
  ['experiences.html', '/experiences.html'],
  ['experience-details.html', '/experience-details.html'],
  ['dining.html', '/dining.html'],
  ['about.html', '/about.html'],
  ['directions.html', '/directions.html'],
  ['gallery.html', '/gallery.html'],
];
const GENERATED_ROUTES = [
  'tours/desert.html',
  'blogs/fort.html',
  'tours/nested/deeper/route.html',
  'blogs/nested/deeper/guide.html',
];

function pageFor(url, title = 'Fixture page') {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + title + '</title>'
    + '<meta name="description" content="A useful description for publication fixture testing.">'
    + '<link rel="canonical" href="' + url + '">'
    + '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">'
    + '<meta property="og:url" content="' + url + '">'
    + '<meta property="og:image" content="' + ORIGIN + '/assets/hero.jpg">'
    + '<meta property="og:image:alt" content="A descriptive fixture image">'
    + '<meta name="twitter:image" content="' + ORIGIN + '/assets/hero.jpg">'
    + '<meta name="twitter:image:alt" content="A descriptive fixture image">'
    + '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","url":"' + url + '"}</script>'
    + '</head><body><main><h1>' + title + '</h1></main></body></html>';
}

function stagingPage() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title>'
    + '<meta name="robots" content="noindex,follow"></head><body><main><h1>Not found</h1></main></body></html>';
}

function withFixture(mutator = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-seo-publication-'));
  try {
    fs.mkdirSync(path.join(root, 'content'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'hero.jpg'), 'fixture-image');
    fs.writeFileSync(path.join(root, 'content', 'site-config.json'), JSON.stringify({
      site: { canonicalHostApproved: true, newStaticSiteCanonicalHost: ORIGIN },
    }, null, 2));
    for (const [file, route] of STATIC_ROUTES) {
      const url = ORIGIN + route;
      fs.writeFileSync(path.join(root, file), pageFor(url, file === 'index.html' ? 'Home' : file));
    }
    fs.writeFileSync(path.join(root, '404.html'), stagingPage());
    for (const route of GENERATED_ROUTES) {
      const target = path.join(root, route);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, pageFor(ORIGIN + '/' + route, route));
    }
    fs.writeFileSync(path.join(root, 'robots.txt'),
      'User-agent: *\nAllow: /\n\nSitemap: ' + ORIGIN + '/sitemap.xml\n');
    fs.writeFileSync(path.join(root, 'robots-staging.txt'),
      '# Staging only\nUser-agent: *\nDisallow: /\n');
    fs.writeFileSync(path.join(root, 'sitemap-staging.xml'),
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    fs.writeFileSync(path.join(root, '.htaccess'), [
      'RewriteCond %{HTTP_HOST} ^www\\.hotelgarhjaisal\\.com$ [NC]',
      'RewriteRule ^ https://hotelgarhjaisal.com%{REQUEST_URI} [R=301,L,NE]',
      'RewriteCond %{HTTP_HOST} !^hotelgarhjaisal\\.com$ [NC]',
      'RewriteRule ^robots\\.txt$ robots-staging.txt [L]',
      'RewriteRule ^sitemap\\.xml$ sitemap-staging.xml [L]',
      'RewriteRule ^ - [E=NON_CANONICAL_HOST:1]',
      'Header always set X-Robots-Tag "noindex, nofollow" env=NON_CANONICAL_HOST',
    ].join('\n'));
    const locs = STATIC_ROUTES.map(([, route]) => ORIGIN + route)
      .concat(GENERATED_ROUTES.map(route => ORIGIN + '/' + route));
    fs.writeFileSync(path.join(root, 'sitemap.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + locs.map(url => '  <url><loc>' + url + '</loc></url>').join('\n')
      + '\n</urlset>\n');
    mutator(root);
    return auditPublicationSafeguards(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const baseline = withFixture();
assert.deepEqual(baseline.errors, [], 'approved production SEO and staging isolation fixture must pass');
assert.equal(baseline.pagesChecked, 13, 'all public root and generated HTML pages must be scanned');

const symlinkBaseline = withFixture(root => {
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'hidden.html'), pageFor(ORIGIN + '/hidden.html', 'Hidden'));
  fs.symlinkSync(outside, path.join(root, 'tours', 'linked'), 'dir');
});
assert.deepEqual(symlinkBaseline.errors, [], 'SEO checks must not follow symlinked generated directories');
assert.equal(symlinkBaseline.pagesChecked, 13, 'symlinked HTML must not be counted as public generated output');

function rejects(mutator, pattern, message) {
  const result = withFixture(mutator);
  assert.ok(result.errors.some(error => pattern.test(error)), message + '\nActual errors: ' + result.errors.join('\n'));
}

rejects(root => {
  const file = path.join(root, 'rooms.html');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(ORIGIN + '/rooms.html', ORIGIN + '/wrong.html'));
}, /rooms\.html: canonical link/, 'a mismatched canonical route must be rejected');

rejects(root => {
  const file = path.join(root, 'tours/nested/deeper/route.html');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('property="og:url" content="' + ORIGIN + '/tours/nested/deeper/route.html"',
    'property="og:url" content="' + ORIGIN + '/wrong.html"'));
}, /tours\/nested\/deeper\/route\.html: og:url/, 'generated routes at arbitrary depth must have correct social URLs');

rejects(root => {
  const file = path.join(root, '404.html');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('</head>',
    '<meta property="og:url" content="' + ORIGIN + '/404.html"></head>'));
}, /404\.html must not publish og:url/, 'the not-found route must not publish an indexable URL');

rejects(root => {
  const file = path.join(root, 'sitemap.xml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('<url><loc>' + ORIGIN + '/gallery.html</loc></url>', ''));
}, /missing canonical route URL/, 'every static and generated canonical URL must be listed in the sitemap');

rejects(root => {
  fs.writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
}, /robots\.txt must allow crawling/, 'production robots must not block search crawlers');

rejects(root => {
  fs.writeFileSync(path.join(root, 'content/site-config.json'), JSON.stringify({
    site: { canonicalHostApproved: false, newStaticSiteCanonicalHost: ORIGIN },
  }));
}, /canonicalHostApproved must be true/, 'publication requires the explicit host approval flag');

rejects(root => {
  fs.writeFileSync(path.join(root, 'content/site-config.json'), JSON.stringify({
    site: { canonicalHostApproved: true, newStaticSiteCanonicalHost: 'https://example.test' },
  }));
}, /must match the configured publication origin/, 'publication must reject a different canonical host');

rejects(root => {
  fs.writeFileSync(path.join(root, 'robots-staging.txt'), 'User-agent: *\nAllow: /\n');
}, /robots-staging\.txt must block all crawlers/, 'staging robots must keep all-crawl blocking');

rejects(root => {
  const file = path.join(root, 'dining.html');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(ORIGIN + '/assets/hero.jpg', '/assets/hero.jpg'));
}, /dining\.html: og:image must be an absolute HTTPS image URL/, 'relative social images must be rejected');

rejects(root => {
  fs.writeFileSync(path.join(root, '.htaccess'), 'ErrorDocument 404 /404.html\n');
}, /\.htaccess is missing host-aware SEO guard: robots-staging\.txt/, 'server config must preserve staging crawl isolation');

rejects(root => {
  fs.writeFileSync(path.join(root, 'content/site-config.json'), '{invalid');
}, /site-config\.json is missing or invalid/, 'malformed site config must fail closed');

console.log('PASS: SEO publication contract fixtures cover canonical routes, absolute previews, JSON-LD, sitemap completeness, 404 exclusion and staging crawl isolation.');
