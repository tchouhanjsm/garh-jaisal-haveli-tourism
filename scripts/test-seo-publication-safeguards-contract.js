#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditPublicationSafeguards } = require('./test-seo-publication-safeguards.js');

const ORIGIN = 'https://hotelgarhjaisal.com';
const ROUTES = [
  ['index.html', '/'], ['rooms.html', '/rooms.html'], ['experiences.html', '/experiences.html'],
  ['experience-details.html', '/experience-details.html'], ['dining.html', '/dining.html'],
  ['about.html', '/about.html'], ['directions.html', '/directions.html'], ['gallery.html', '/gallery.html']
];
const GENERATED = ['tours/desert.html', 'blogs/fort.html', 'tours/nested/deeper/route.html', 'blogs/nested/deeper/guide.html'];

function publicPage(url, title) {
  return '<!doctype html><html lang="en"><head><title>' + title + '</title>'
    + '<meta name="description" content="A proper description for the publication fixture page.">'
    + '<link rel="canonical" href="' + url + '">'
    + '<meta name="robots" content="index,follow,max-image-preview:large">'
    + '<meta property="og:url" content="' + url + '">'
    + '<meta property="og:image" content="' + ORIGIN + '/assets/images/fixture.webp">'
    + '<meta name="twitter:image" content="' + ORIGIN + '/assets/images/fixture.webp">'
    + '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","url":"' + url + '"}</script>'
    + '</head><body><h1>' + title + '</h1></body></html>';
}
function withFixture(mutator=()=>{}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'garh-seo-publication-'));
  try {
    fs.mkdirSync(path.join(root,'content'),{recursive:true});
    fs.mkdirSync(path.join(root,'assets','images'),{recursive:true});
    fs.writeFileSync(path.join(root,'assets','images','fixture.webp'),'fixture');
    fs.writeFileSync(path.join(root,'content','site-config.json'),JSON.stringify({site:{canonicalHostApproved:true,newStaticSiteCanonicalHost:ORIGIN}}));
    for (const [file,route] of ROUTES) fs.writeFileSync(path.join(root,file),publicPage(ORIGIN+route,file));
    fs.writeFileSync(path.join(root,'404.html'),'<html><head><meta name="robots" content="noindex,follow"></head><body><h1>Not found</h1></body></html>');
    for (const file of GENERATED) {
      const target=path.join(root,file);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,publicPage(ORIGIN+'/'+file,file));
    }
    fs.writeFileSync(path.join(root,'robots.txt'),'User-agent: *\nAllow: /\n\nSitemap: '+ORIGIN+'/sitemap.xml\n');
    fs.writeFileSync(path.join(root,'robots-staging.txt'),'User-agent: *\nDisallow: /\n');
    fs.writeFileSync(path.join(root,'sitemap-staging.xml'),'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    fs.writeFileSync(path.join(root,'.htaccess'),[
      'RewriteRule ^ https://hotelgarhjaisal.com%{REQUEST_URI} [R=301,L,NE]',
      'RewriteRule ^robots\\.txt$ robots-staging.txt [L]',
      'RewriteRule ^sitemap\\.xml$ sitemap-staging.xml [L]',
      'RewriteRule ^ - [E=NON_CANONICAL_HOST:1]',
      'Header always set X-Robots-Tag "noindex, nofollow" env=NON_CANONICAL_HOST'
    ].join('\n'));
    const urls=ROUTES.map(([,route])=>ORIGIN+route).concat(GENERATED.map(file=>ORIGIN+'/'+file));
    fs.writeFileSync(path.join(root,'sitemap.xml'),'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      +urls.map(url=>'<url><loc>'+url+'</loc></url>').join('\n')+'\n</urlset>\n');
    mutator(root);
    return auditPublicationSafeguards(root);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
const baseline=withFixture();
assert.deepEqual(baseline.errors,[],'valid production publication fixture must pass');
assert.equal(baseline.pagesChecked,13,'eight core pages, 404 and four generated pages must be audited');
function rejects(mutator,pattern,message) {
  const result=withFixture(mutator);
  assert.ok(result.errors.some(error=>pattern.test(error)),message+'\nActual errors:\n'+result.errors.join('\n'));
}
rejects(root=>{
  const p=path.join(root,'rooms.html');
  fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(ORIGIN+'/rooms.html',ORIGIN+'/wrong.html'));
},/rooms\.html: canonical link/,'wrong canonical must be rejected');
rejects(root=>{
  fs.writeFileSync(path.join(root,'blogs/nested/deeper/guide.html'),publicPage(ORIGIN+'/wrong.html','nested'));
},/blogs\/nested\/deeper\/guide\.html: canonical link/,'wrong deep canonical must be rejected');
rejects(root=>{
  const p=path.join(root,'sitemap.xml');
  fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('<loc>'+ORIGIN+'/gallery.html</loc>',''));
},/sitemap\.xml is missing canonical route URL/,'missing sitemap route must be rejected');
rejects(root=>{
  fs.writeFileSync(path.join(root,'robots.txt'),'User-agent: *\nDisallow: /\n');
},/robots\.txt must allow crawling/,'blocked production robots must be rejected');
rejects(root=>{
  fs.writeFileSync(path.join(root,'content/site-config.json'),JSON.stringify({site:{canonicalHostApproved:false,newStaticSiteCanonicalHost:ORIGIN}}));
},/canonicalHostApproved must be true/,'disabled publication must be rejected');
rejects(root=>{
  fs.writeFileSync(path.join(root,'content/site-config.json'),JSON.stringify({site:{canonicalHostApproved:true,newStaticSiteCanonicalHost:'https://example.test'}}));
},/configured canonical host must equal/,'wrong origin must be rejected');
rejects(root=>{
  fs.writeFileSync(path.join(root,'robots-staging.txt'),'User-agent: *\nAllow: /\n');
},/robots-staging\.txt must block all crawlers/,'staging robots must block all crawlers');
rejects(root=>{
  const p=path.join(root,'dining.html');
  fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(ORIGIN+'/assets/images/fixture.webp','/assets/images/fixture.webp'));
},/dining\.html: og:image must be an absolute canonical HTTPS image URL/,'relative social image must be rejected');
rejects(root=>{
  fs.writeFileSync(path.join(root,'.htaccess'),'ErrorDocument 404 /404.html');
},/\.htaccess is missing SEO host policy/,'missing host isolation must be rejected');
console.log('PASS: SEO publication contract covers canonical routes, nested tour/blog URLs, sitemap completeness, production crawl policy and non-canonical host protection.');
