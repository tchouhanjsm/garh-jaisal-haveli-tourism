#!/usr/bin/env node
'use strict';

/**
 * Verify the production SEO release contract while keeping every non-canonical
 * host non-indexable. This is repository-level validation, not live-host proof.
 */
const fs = require('node:fs');
const path = require('node:path');

const PRODUCTION_ORIGIN = 'https://hotelgarhjaisal.com';
const STATIC_ROUTES = Object.freeze([
  ['index.html', '/'],
  ['rooms.html', '/rooms.html'],
  ['experiences.html', '/experiences.html'],
  ['experience-details.html', '/experience-details.html'],
  ['dining.html', '/dining.html'],
  ['about.html', '/about.html'],
  ['directions.html', '/directions.html'],
  ['gallery.html', '/gallery.html'],
]);

function parseAttributes(tag) {
  const attrs = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
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

function findLinkHref(html, expectedRel) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes(expectedRel)) return attrs.href || '';
  }
  return '';
}

function findMeta(html, attribute, expected) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs[attribute] || '').toLowerCase() === expected) return attrs.content || '';
  }
  return '';
}

function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map(match =>
    match[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}

function sitemapUrlForGeneratedPage(relative) {
  const withoutIndex = relative.replace(/(^|\/)index\.html$/i, '$1');
  return PRODUCTION_ORIGIN + '/' + withoutIndex;
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
  if (!config || !config.site) {
    fail('content/site-config.json must include site publication settings');
  } else {
    if (config.site.canonicalHostApproved !== true) {
      fail('site.canonicalHostApproved must be true for the explicitly requested production SEO publication');
    }
    let configuredOrigin = '';
    try {
      const url = new URL(config.site.newStaticSiteCanonicalHost);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        fail('site.newStaticSiteCanonicalHost must be an HTTPS origin without credentials, path, query or fragment');
      }
      configuredOrigin = url.origin;
    } catch (_) {
      fail('site.newStaticSiteCanonicalHost must be a valid HTTPS origin');
    }
    if (configuredOrigin !== PRODUCTION_ORIGIN) {
      fail('site.newStaticSiteCanonicalHost must match the configured publication origin ' + PRODUCTION_ORIGIN);
    }
  }

  const pages = publicHtmlFiles(root);
  if (!pages.length) fail('no public HTML pages found in root, tours/ or blogs/');

  const expectedSitemap = new Set(STATIC_ROUTES.map(([, route]) => PRODUCTION_ORIGIN + route));
  const expectedCanonicalByPath = new Map(STATIC_ROUTES.map(([file, route]) => [file, PRODUCTION_ORIGIN + route]));

  for (const page of pages) {
    const label = path.relative(root, page).split(path.sep).join('/');
    let html;
    try { html = fs.readFileSync(page, 'utf8'); }
    catch (error) { fail(label + ': could not read public HTML: ' + error.message); continue; }

    if (label === '404.html') {
      if (findLinkHref(html, 'canonical')) fail('404.html must not declare a canonical URL');
      if (findMeta(html, 'property', 'og:url') || findMeta(html, 'name', 'og:url')) fail('404.html must not publish og:url');
      const robots404 = findMeta(html, 'name', 'robots').toLowerCase().replace(/\s+/g, '');
      if (!robots404.includes('noindex') || !robots404.includes('follow')) fail('404.html must remain noindex,follow');
      continue;
    }

    let expected = expectedCanonicalByPath.get(label);
    if (!expected && /^(tours|blogs)\/.+\.html$/i.test(label)) {
      expected = sitemapUrlForGeneratedPage(label);
      expectedSitemap.add(expected);
    }
    if (!expected) {
      fail(label + ': public HTML route is not registered for canonical publication');
      continue;
    }

    const canonical = findLinkHref(html, 'canonical');
    if (canonical !== expected) fail(label + ': canonical link must equal ' + expected);
    const ogUrl = findMeta(html, 'property', 'og:url') || findMeta(html, 'name', 'og:url');
    if (ogUrl !== expected) fail(label + ': og:url must equal ' + expected);

    const robotsMeta = findMeta(html, 'name', 'robots').toLowerCase().replace(/\s+/g, '');
    if (robotsMeta && (robotsMeta.includes('noindex') || !robotsMeta.includes('index') || !robotsMeta.includes('follow'))) {
      fail(label + ': public page robots directive must permit indexing and following links');
    }

    const ogImage = findMeta(html, 'property', 'og:image');
    const twitterImage = findMeta(html, 'name', 'twitter:image');
    for (const [key, value] of [['og:image', ogImage], ['twitter:image', twitterImage]]) {
      if (value && !/^https:\/\/hotelgarhjaisal\.com\//i.test(value)) {
        fail(label + ': ' + key + ' must be an absolute HTTPS image URL on the canonical origin');
      }
    }
    if (expectedCanonicalByPath.has(label)) {
      if (!ogImage) fail(label + ': missing og:image for the public route');
      if (!findMeta(html, 'property', 'og:image:alt')) fail(label + ': missing descriptive og:image:alt');
      if (!twitterImage) fail(label + ': missing twitter:image');
      if (!findMeta(html, 'name', 'twitter:image:alt')) fail(label + ': missing descriptive twitter:image:alt');
    }

    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try { JSON.parse(match[1]); }
      catch (error) { fail(label + ': invalid JSON-LD: ' + error.message); }
    }
  }

  const robots = read('robots.txt');
  if (!/^\s*User-agent:\s*\*\s*$/im.test(robots)) fail('robots.txt must define User-agent: *');
  if (!/^\s*Allow:\s*\/\s*$/im.test(robots)) fail('robots.txt must allow crawling on the approved production host');
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) fail('robots.txt must not block the approved production host');
  const robotLines = robots.split(/\r?\n/).map(line => line.trim());
  if (!robotLines.includes('Sitemap: ' + PRODUCTION_ORIGIN + '/sitemap.xml')) {
    fail('robots.txt must advertise the canonical sitemap URL');
  }

  const stagingRobots = read('robots-staging.txt');
  if (!/^\s*User-agent:\s*\*\s*$/im.test(stagingRobots) || !/^\s*Disallow:\s*\/\s*$/im.test(stagingRobots)) {
    fail('robots-staging.txt must block all crawlers');
  }
  if (/^\s*Sitemap\s*:/im.test(stagingRobots)) fail('robots-staging.txt must not advertise a production sitemap');

  const stagingSitemap = read('sitemap-staging.xml');
  if (!/<urlset\b/i.test(stagingSitemap) || /<loc\b/i.test(stagingSitemap)) {
    fail('sitemap-staging.xml must be a valid empty urlset');
  }

  const htaccess = read('.htaccess');
  for (const token of [
    'robots-staging.txt', 'sitemap-staging.xml', 'NON_CANONICAL_HOST',
    'X-Robots-Tag "noindex, nofollow" env=NON_CANONICAL_HOST',
    'https://hotelgarhjaisal.com%{REQUEST_URI}', 'R=301'
  ]) {
    if (!htaccess.includes(token)) fail('.htaccess is missing host-aware SEO guard: ' + token);
  }
  if (!htaccess.includes('!^hotelgarhjaisal\\.com')) fail('.htaccess must distinguish non-canonical hosts from the production host');

  const sitemap = read('sitemap.xml');
  if (!/<urlset\b[^>]*xmlns=["']https?:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(sitemap)) {
    fail('sitemap.xml must use the Sitemaps protocol urlset namespace');
  }
  const locs = sitemapLocs(sitemap);
  const locSet = new Set(locs);
  if (locs.length !== locSet.size) fail('sitemap.xml must not contain duplicate URL entries');
  for (const expected of expectedSitemap) {
    if (!locSet.has(expected)) fail('sitemap.xml is missing canonical route URL: ' + expected);
  }
  for (const value of locs) {
    let parsed;
    try { parsed = new URL(value); }
    catch (_) { fail('sitemap.xml contains a non-absolute URL: ' + value); continue; }
    if (parsed.origin !== PRODUCTION_ORIGIN) fail('sitemap.xml contains a non-canonical host URL: ' + value);
    if (parsed.pathname === '/404.html') fail('sitemap.xml must not include the 404 recovery page');
    if (!expectedSitemap.has(value)) fail('sitemap.xml contains a URL that is not a published route: ' + value);
  }

  return { errors, pagesChecked: pages.length };
}

if (require.main === module) {
  const result = auditPublicationSafeguards(path.resolve(__dirname, '..'));
  if (result.errors.length) {
    console.error('FAIL: ' + result.errors.length + ' production SEO publication safeguard(s) failed.');
    for (const message of result.errors) console.error(' - ' + message);
    process.exit(1);
  }
  console.log('PASS: canonical metadata, absolute social-image URLs, structured data, production sitemap, and host-aware staging crawl blocks are valid. Live DNS/HTTPS/HTTP-header and Search Console checks remain external release gates.');
}

module.exports = { auditPublicationSafeguards };
