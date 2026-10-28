#!/usr/bin/env node
'use strict';

/**
 * Guard pre-launch technical SEO publication boundaries.
 *
 * This deliberately fails closed while the owner has not approved the public
 * canonical host. It is not a production SEO publisher or a live-host checker.
 */
const fs = require('node:fs');
const path = require('node:path');

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
    if (entry.isFile() && /\.html$/i.test(entry.name)) {
      files.push(path.join(root, entry.name));
    }
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

function auditPublicationSafeguards(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const errors = [];
  const fail = message => errors.push(message);
  const configPath = path.join(root, 'content', 'site-config.json');
  let config = null;

  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail('content/site-config.json is missing or invalid: ' + error.message);
  }

  if (config) {
    if (!config.site || config.site.canonicalHostApproved !== false) {
      fail('site.canonicalHostApproved must remain exactly false in the pre-launch publication guard; canonical activation requires a separately authorized implementation.');
    }
  }

  const pages = publicHtmlFiles(root);
  if (pages.length === 0) fail('no public HTML pages found in root, tours/ or blogs/');

  for (const page of pages) {
    const label = path.relative(root, page).split(path.sep).join('/');
    let html;
    try {
      html = fs.readFileSync(page, 'utf8');
    } catch (error) {
      fail(label + ': could not read public HTML: ' + error.message);
      continue;
    }

    if (config && config.site && config.site.canonicalHostApproved === false
        && typeof config.site.newStaticSiteCanonicalHost === 'string'
        && html.includes(config.site.newStaticSiteCanonicalHost)) {
      fail(label + ': unapproved canonical origin must not appear in public HTML, including JSON-LD and social metadata');
    }

    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
      const attrs = parseAttributes(match[0]);
      const rel = (attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (rel.includes('canonical')) {
        fail(label + ': canonical link must remain unpublished until owner host approval');
      }
    }

    for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
      const attrs = parseAttributes(match[0]);
      const property = (attrs.property || '').toLowerCase();
      const name = (attrs.name || '').toLowerCase();
      if (property === 'og:url' || name === 'og:url') {
        fail(label + ': og:url must remain unpublished until owner host approval');
      }
    }
  }

  const robotsPath = path.join(root, 'robots.txt');
  let robots = '';
  try {
    robots = fs.readFileSync(robotsPath, 'utf8');
    if (!/^\s*User-agent:\s*\*\s*$/im.test(robots)) {
      fail('robots.txt must retain the wildcard User-agent: * pre-launch policy');
    }
    if (!/^\s*Disallow:\s*\/\s*$/im.test(robots)) {
      fail('robots.txt must retain Disallow: / while the staging copy is pre-launch');
    }
    if (/^\s*Sitemap\s*:/im.test(robots)) {
      fail('robots.txt must not publish a Sitemap directive before canonical host approval');
    }
  } catch (error) {
    fail('robots.txt is missing or unreadable: ' + error.message);
  }

  const sitemapPath = path.join(root, 'sitemap.xml');
  try {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    if (/<\s*(?:[\w.-]+:)?loc\b/i.test(sitemap)) {
      fail('sitemap.xml must not contain URL entries before canonical host approval');
    }
  } catch (error) {
    fail('sitemap.xml is missing or unreadable: ' + error.message);
  }

  return { errors, pagesChecked: pages.length };
}

if (require.main === module) {
  const result = auditPublicationSafeguards(path.resolve(__dirname, '..'));
  if (result.errors.length) {
    console.error('FAIL: ' + result.errors.length + ' technical SEO publication safeguard(s) failed.');
    for (const message of result.errors) console.error(' - ' + message);
    process.exit(1);
  }
  console.log('PASS: ' + result.pagesChecked + ' public HTML page(s) remain unpublished to canonical/sitemap discovery; robots.txt blocks crawling until owner approval. This does not validate a live host or authorize deployment.');
}

module.exports = { auditPublicationSafeguards };
