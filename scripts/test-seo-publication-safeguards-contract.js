#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditPublicationSafeguards, CORE_ROUTES, CANONICAL } = require('./test-seo-publication-safeguards.js');

function fixture(mode, mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'garh-seo-publication-'));
  try {
    fs.mkdirSync(path.join(root, 'content'), { recursive: true });
    fs.writeFileSync(path.join(root, 'content/site-config.json'), JSON.stringify({
      site: { newStaticSiteCanonicalHost: CANONICAL, canonicalHostApproved: false }
    }));
    fs.writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: '+CANONICAL+'/sitemap.xml\n');
    fs.writeFileSync(path.join(root, 'robots-staging.txt'), 'User-agent: *\nDisallow: /\n');
    fs.writeFileSync(path.join(root, 'sitemap.xml'), '<urlset>'+CORE_ROUTES.map(([,route])=>'<url><loc>'+CANONICAL+route+'</loc></url>').join('')+'</urlset>');
    fs.writeFileSync(path.join(root, 'sitemap-empty.xml'), '<urlset></urlset>');
    fs.writeFileSync(path.join(root, '.htaccess'), [
      'RewriteEngine On',
      'RewriteRule ^robots\\.txt$ robots-staging.txt [L]',
      'RewriteRule ^sitemap\\.xml$ sitemap-empty.xml [L]',
      'RewriteRule ^ https://hotelgarhjaisal.com%{REQUEST_URI} [R=301,L,NE]',
      'Header always set X-Robots-Tag "noindex, nofollow" env=STAGING_HOST'
    ].join('\n'));
    for (const [file, route] of CORE_ROUTES) {
      const title = file === 'index.html' ? 'Home' : file.replace('.html','');
      const url = CANONICAL + route;
      let html = '<html><head><title>'+title+'</title><link rel="canonical" href="'+url+'">'
        +'<meta property="og:url" content="'+url+'">'
        +'<meta property="og:image" content="'+CANONICAL+'/assets/images/hero.jpg"><meta property="og:image:alt" content="Fort rooftop image">'
        +'<meta name="twitter:image" content="'+CANONICAL+'/assets/images/hero.jpg"><meta name="twitter:image:alt" content="Fort rooftop image">'
        +'</head><body><h1>'+title+'</h1></body></html>';
      if (mode === 'staging') html = html.replace(/<link rel="canonical"[^>]*>/, '').replace(/<meta property="og:url"[^>]*>/, '');
      fs.writeFileSync(path.join(root,file), html);
    }
    fs.writeFileSync(path.join(root,'404.html'), '<html><head><meta name="robots" content="noindex,follow"></head></html>');
    mutate(root);
    return auditPublicationSafeguards(root, { mode });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function rejects(mode, mutate, pattern, label) {
  const result = fixture(mode, mutate);
  assert.ok(result.errors.some(error => pattern.test(error)), label + '\n' + result.errors.join('\n'));
}
assert.deepEqual(fixture('production').errors, [], 'production candidate fixture must pass');
assert.deepEqual(fixture('staging').errors, [], 'staging safeguard fixture must pass');
rejects('production', root => fs.writeFileSync(path.join(root,'rooms.html'), '<html><head><link rel="canonical" href="'+CANONICAL+'/wrong"><meta property="og:url" content="'+CANONICAL+'/wrong"></head></html>'), /rooms\.html: expected exactly one canonical/, 'canonical mismatch must fail');
rejects('production', root => fs.writeFileSync(path.join(root,'sitemap.xml'), '<urlset></urlset>'), /production sitemap missing core URL/, 'missing sitemap route must fail');
rejects('production', root => fs.writeFileSync(path.join(root,'robots.txt'), 'User-agent: *\nDisallow: /\n'), /production robots must allow crawling/, 'production crawl lock must fail');
rejects('production', root => fs.writeFileSync(path.join(root,'index.html'), '<html><head><link rel="canonical" href="'+CANONICAL+'/"><meta property="og:url" content="'+CANONICAL+'/"><meta property="og:image" content="/relative.jpg"></head></html>'), /social image must be absolute/, 'relative social image must fail');
rejects('staging', root => fs.writeFileSync(path.join(root,'sitemap-empty.xml'), '<urlset><url><loc>'+CANONICAL+'/</loc></url></urlset>'), /staging sitemap must remain URL-empty/, 'staging sitemap leak must fail');
rejects('staging', root => fs.writeFileSync(path.join(root,'rooms.html'), '<html><head><link rel="canonical" href="'+CANONICAL+'/rooms.html"></head></html>'), /canonical and og:url must be absent/, 'staging canonical leak must fail');
rejects('production', root => fs.writeFileSync(path.join(root,'404.html'), '<html><head><link rel="canonical" href="'+CANONICAL+'/404.html"><meta name="robots" content="index,follow"></head></html>'), /404.html must remain noindex,follow/, '404 indexability must fail closed');
console.log('PASS: candidate production/staging contracts check canonical routes, social images, sitemap/robots, host routing and 404 exclusion.');
