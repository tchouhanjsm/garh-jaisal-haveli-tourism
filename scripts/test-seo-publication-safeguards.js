#!/usr/bin/env node
'use strict';

/**
 * Validate static technical SEO publication files and the protected staging
 * model. This is repository evidence, not a live DNS/TLS/header check.
 */
const fs = require('node:fs');
const path = require('node:path');
const CANONICAL = 'https://hotelgarhjaisal.com';
const CORE_ROUTES = [
  ['index.html', '/'], ['rooms.html', '/rooms.html'],
  ['experiences.html', '/experiences.html'], ['experience-details.html', '/experience-details.html'],
  ['dining.html', '/dining.html'], ['about.html', '/about.html'],
  ['directions.html', '/directions.html'], ['gallery.html', '/gallery.html'],
];
function attrs(tag) {
  const out = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
function read(root, relative, errors) {
  try { return fs.readFileSync(path.join(root, relative), 'utf8'); }
  catch (e) { errors.push(relative + ' missing/unreadable: ' + e.message); return ''; }
}
function htmlFiles(root) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && /\.html$/i.test(entry.name)) found.push(path.join(root, entry.name));
  }
  for (const dirname of ['tours', 'blogs']) {
    const base = path.join(root, dirname);
    let stat;
    try { stat = fs.lstatSync(base); } catch (_) { continue; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    const walk = current => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile() && /\.html$/i.test(entry.name)) found.push(absolute);
      }
    };
    walk(base);
  }
  return [...new Set(found)].sort();
}
function auditPublicationSafeguards(rootDirectory, options = {}) {
  const root = path.resolve(rootDirectory), mode = options.mode || 'repository', errors = [];
  const fail = message => errors.push(message);
  let config = null;
  try { config = JSON.parse(read(root, 'content/site-config.json', errors)); }
  catch (e) { fail('content/site-config.json contains invalid JSON: ' + e.message); }
  if (!config?.site || config.site.newStaticSiteCanonicalHost !== CANONICAL) fail('canonical host config must equal ' + CANONICAL);
  if (!config?.site || config.site.canonicalHostApproved !== false) fail('canonicalHostApproved must remain false until separate owner release approval');
  if (!['repository', 'production', 'staging'].includes(mode)) fail('unsupported mode: ' + mode);

  const files = htmlFiles(root), core = new Map(CORE_ROUTES);
  if (!files.length) fail('no public HTML pages found');
  for (const absolute of files) {
    const label = path.relative(root, absolute).split(path.sep).join('/');
    const html = read(root, label, errors);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => attrs(m[0]));
    const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0]));
    const canonical = links.filter(a => (a.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
    const ogUrl = metas.filter(a => (a.property || a.name || '').toLowerCase() === 'og:url');
    if (label === '404.html') {
      const robotsMeta = metas.find(a => (a.name || '').toLowerCase() === 'robots');
      if (!robotsMeta || (robotsMeta.content || '').replace(/\s+/g, '').toLowerCase() !== 'noindex,follow') fail('404.html must remain noindex,follow');
      if (canonical.length || ogUrl.length) fail('404.html must not carry canonical or og:url');
      const mapFile = mode === 'staging' ? 'sitemap-empty.xml' : 'sitemap.xml';
      if (/<loc>[^<]*404\.html/i.test(read(root, mapFile, errors))) fail('404.html must be excluded from sitemap');
      continue;
    }
    if (mode === 'staging') {
      if (canonical.length || ogUrl.length) fail(label + ': canonical and og:url must be absent from staging HTML');
      continue;
    }
    if (core.has(label)) {
      const expected = CANONICAL + core.get(label);
      if (canonical.length !== 1 || canonical[0].href !== expected) fail(label + ': expected exactly one canonical ' + expected);
      if (ogUrl.length !== 1 || ogUrl[0].content !== expected) fail(label + ': expected exactly one matching og:url ' + expected);
    }
    for (const meta of metas) {
      const key = (meta.property || meta.name || '').toLowerCase();
      if (key !== 'og:image' && key !== 'twitter:image') continue;
      let imageUrl = null;
      try { imageUrl = new URL(meta.content || ''); } catch (_) {}
      if (!imageUrl || imageUrl.origin !== CANONICAL) fail(label + ': ' + key + ' must be absolute on ' + CANONICAL);
      const altKey = key === 'og:image' ? 'og:image:alt' : 'twitter:image:alt';
      if (!metas.some(item => (item.property || item.name || '').toLowerCase() === altKey && (item.content || '').trim())) fail(label + ': ' + key + ' needs meaningful alt text');
    }
  }

  const robots = read(root, mode === 'staging' ? 'robots-staging.txt' : 'robots.txt', errors);
  const sitemap = read(root, mode === 'staging' ? 'sitemap-empty.xml' : 'sitemap.xml', errors);
  const htaccess = read(root, '.htaccess', errors);
  if (mode === 'staging') {
    if (!/^\s*User-agent:\s*\*\s*$/im.test(robots) || !/^\s*Disallow:\s*\/\s*$/im.test(robots)) fail('staging robots must disallow crawling');
    if (/<loc>\s*https?:\/\//i.test(sitemap)) fail('staging sitemap must remain URL-empty');
    if (!/X-Robots-Tag\s+"noindex, nofollow"\s+env=STAGING_HOST/i.test(htaccess)) fail('staging host must receive X-Robots-Tag noindex,nofollow');
  } else {
    if (!/^\s*User-agent:\s*\*\s*$/im.test(robots) || !/^\s*Allow:\s*\/\s*$/im.test(robots)) fail('production robots must allow crawling');
    if (!/^\s*Sitemap:\s*https:\/\/hotelgarhjaisal\.com\/sitemap\.xml\s*$/im.test(robots)) fail('production robots must advertise the candidate canonical sitemap');
    for (const [, route] of CORE_ROUTES) if (!sitemap.includes('<loc>' + CANONICAL + route + '</loc>')) fail('production sitemap missing core URL ' + CANONICAL + route);
    if (/<loc>[^<]*404\.html/i.test(sitemap)) fail('production sitemap must exclude 404');
  }
  if (!/RewriteEngine\s+On/i.test(htaccess) || !/hotelgarhjaisal\.com/i.test(htaccess) || !/REQUEST_URI/i.test(htaccess)) fail('.htaccess requires host-aware path/query-preserving redirects');
  if (!/RewriteRule\s+\^robots\\\.txt\$\s+robots-staging\.txt/i.test(htaccess)) fail('.htaccess must provide staging robots');
  if (!/RewriteRule\s+\^sitemap\\\.xml\$\s+sitemap-empty\.xml/i.test(htaccess)) fail('.htaccess must provide the empty staging sitemap');
  return { errors, pagesChecked: files.length };
}
if (require.main === module) {
  const mode = process.argv[2] || 'repository';
  const result = auditPublicationSafeguards(path.resolve(__dirname, '..'), { mode });
  if (result.errors.length) {
    console.error('FAIL: ' + result.errors.length + ' SEO publication checks failed (' + mode + ').');
    result.errors.forEach(error => console.error(' - ' + error));
    process.exit(1);
  }
  console.log('PASS: ' + result.pagesChecked + ' HTML pages checked in ' + mode + ' mode; no live host behavior is implied.');
}
module.exports = { auditPublicationSafeguards, CORE_ROUTES, CANONICAL };
