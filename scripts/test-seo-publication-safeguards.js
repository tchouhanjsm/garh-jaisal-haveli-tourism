#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

function parseAttributes(tag) {
  const result = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return result;
}
function publicHtmlFiles(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && /\.html$/i.test(entry.name)) files.push(path.join(root, entry.name));
  }
  for (const directory of ['tours', 'blogs']) {
    const base = path.join(root, directory);
    let stat;
    try { stat = fs.lstatSync(base); } catch (_) { continue; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    const walk = current => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const candidate = path.join(current, entry.name);
        if (entry.isDirectory()) walk(candidate);
        else if (entry.isFile() && /\.html$/i.test(entry.name)) files.push(candidate);
      }
    };
    walk(base);
  }
  return [...new Set(files)].sort();
}
function findHref(html, rel) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes(rel)) return attrs.href || '';
  }
  return '';
}
function findMeta(html, key, expected) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs[key] || '').toLowerCase() === expected) return attrs.content || '';
  }
  return '';
}
function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map(match => match[1].trim()
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}
function canonicalForPage(relative) {
  if (relative === 'index.html') return ORIGIN + '/';
  if (relative === 'tours/index.html' || relative === 'blogs/index.html') return ORIGIN + '/' + relative.split('/')[0] + '/';
  return ORIGIN + '/' + relative;
}

function auditPublicationSafeguards(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const errors = [];
  const fail = message => errors.push(message);
  const read = relative => {
    try { return fs.readFileSync(path.join(root, relative), 'utf8'); }
    catch (error) { fail(relative + ' is missing or unreadable: ' + error.message); return ''; }
  };

  let config = null;
  try { config = JSON.parse(read('content/site-config.json')); }
  catch (error) { fail('content/site-config.json is missing or invalid: ' + error.message); }
  if (!config || !config.site) fail('content/site-config.json must include site publication settings');
  else {
    if (config.site.canonicalHostApproved !== true) fail('site.canonicalHostApproved must be true for source SEO publication');
    let origin = '';
    try {
      const url = new URL(config.site.newStaticSiteCanonicalHost);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        fail('configured canonical host must be an HTTPS origin without credentials, path, query or fragment');
      }
      origin = url.origin;
    } catch (_) { fail('configured canonical host must be a valid HTTPS origin'); }
    if (origin !== ORIGIN) fail('configured canonical host must equal ' + ORIGIN);
  }

  const pages = publicHtmlFiles(root);
  if (!pages.length) fail('no public HTML pages found in root, tours/ or blogs/');
  const expectedSitemap = new Set(STATIC_ROUTES.map(([, route]) => ORIGIN + route));

  for (const page of pages) {
    const label = path.relative(root, page).split(path.sep).join('/');
    let html;
    try { html = fs.readFileSync(page, 'utf8'); }
    catch (error) { fail(label + ': could not read public HTML: ' + error.message); continue; }

    if (label === '404.html') {
      if (findHref(html, 'canonical')) fail('404.html must not declare a canonical URL');
      if (findMeta(html, 'property', 'og:url') || findMeta(html, 'name', 'og:url')) fail('404.html must not publish og:url');
      const directive = findMeta(html, 'name', 'robots').toLowerCase().replace(/\s+/g, '');
      if (!directive.includes('noindex') || !directive.includes('follow')) fail('404.html must remain noindex,follow');
      continue;
    }

    const staticRoute = STATIC_ROUTES.find(([file]) => file === label);
    let expectedUrl = staticRoute ? ORIGIN + staticRoute[1] : '';
    if (!expectedUrl && /^(tours|blogs)\/.+\.html$/i.test(label)) {
      expectedUrl = canonicalForPage(label);
      expectedSitemap.add(expectedUrl);
    }
    if (!expectedUrl) {
      fail(label + ': public HTML route is not registered for SEO publication');
      continue;
    }
    if (findHref(html, 'canonical') !== expectedUrl) fail(label + ': canonical link must equal ' + expectedUrl);
    const ogUrl = findMeta(html, 'property', 'og:url') || findMeta(html, 'name', 'og:url');
    if (ogUrl !== expectedUrl) fail(label + ': og:url must equal ' + expectedUrl);
    const robots = findMeta(html, 'name', 'robots').toLowerCase().replace(/\s+/g, '');
    if (robots && (robots.includes('noindex') || !robots.includes('index') || !robots.includes('follow'))) {
      fail(label + ': public robots directive must permit indexing and following');
    }
    const ogImage = findMeta(html, 'property', 'og:image');
    const twitterImage = findMeta(html, 'name', 'twitter:image');
    for (const [key, value] of [['og:image', ogImage], ['twitter:image', twitterImage]]) {
      if (value && !/^https:\/\/hotelgarhjaisal\.com\/assets\/images\//i.test(value)) {
        fail(label + ': ' + key + ' must be an absolute canonical HTTPS image URL');
      }
    }
    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try { JSON.parse(match[1]); } catch (error) { fail(label + ': invalid JSON-LD: ' + error.message); }
    }
  }

  const robots = read('robots.txt');
  if (!/^\s*User-agent:\s*\*\s*$/im.test(robots)) fail('robots.txt must define User-agent: *');
  if (!/^\s*Allow:\s*\/\s*$/im.test(robots)) fail('robots.txt must allow crawling on production');
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) fail('robots.txt must not block production crawling');
  if (!robots.split(/\r?\n/).map(line => line.trim()).includes('Sitemap: ' + ORIGIN + '/sitemap.xml')) {
    fail('robots.txt must advertise the canonical sitemap');
  }

  const stagingRobots = read('robots-staging.txt');
  if (!/^\s*User-agent:\s*\*\s*$/im.test(stagingRobots) || !/^\s*Disallow:\s*\/\s*$/im.test(stagingRobots)) {
    fail('robots-staging.txt must block all crawlers');
  }
  if (/^\s*Sitemap\s*:/im.test(stagingRobots)) fail('robots-staging.txt must not advertise a sitemap');
  const stagingSitemap = read('sitemap-staging.xml');
  if (!/<urlset\b/i.test(stagingSitemap) || /<loc\b/i.test(stagingSitemap)) fail('sitemap-staging.xml must be an empty urlset');

  const htaccess = read('.htaccess');
  for (const token of ['robots-staging.txt', 'sitemap-staging.xml', 'NON_CANONICAL_HOST',
    'X-Robots-Tag "noindex, nofollow" env=NON_CANONICAL_HOST',
    'https://hotelgarhjaisal.com%{REQUEST_URI}', 'R=301']) {
    if (!htaccess.includes(token)) fail('.htaccess is missing SEO host policy: ' + token);
  }

  const sitemap = read('sitemap.xml');
  if (!/<urlset\b[^>]*xmlns=["']https?:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(sitemap)) {
    fail('sitemap.xml must use the Sitemaps protocol namespace');
  }
  const locs = sitemapLocs(sitemap);
  const locSet = new Set(locs);
  if (locs.length !== locSet.size) fail('sitemap.xml must not contain duplicate URLs');
  for (const expected of expectedSitemap) if (!locSet.has(expected)) fail('sitemap.xml is missing canonical route URL: ' + expected);
  for (const value of locs) {
    let url;
    try { url = new URL(value); } catch (_) { fail('sitemap.xml contains a non-absolute URL: ' + value); continue; }
    if (url.origin !== ORIGIN) fail('sitemap.xml contains a non-canonical host URL: ' + value);
    if (url.pathname === '/404.html') fail('sitemap.xml must exclude 404.html');
    if (!expectedSitemap.has(value)) fail('sitemap.xml contains a URL that is not a published route: ' + value);
  }

  return { errors, pagesChecked: pages.length };
}

if (require.main === module) {
  const result = auditPublicationSafeguards(path.resolve(__dirname, '..'));
  if (result.errors.length) {
    console.error('FAIL: ' + result.errors.length + ' SEO publication safeguard(s) failed.');
    for (const error of result.errors) console.error(' - ' + error);
    process.exit(1);
  }
  console.log('PASS: canonical metadata, social images, JSON-LD, sitemap completeness and non-canonical host crawl isolation.');
}
module.exports = { auditPublicationSafeguards };
