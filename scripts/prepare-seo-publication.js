#!/usr/bin/env node
'use strict';

/**
 * Creates the canonical metadata and crawl artifacts only after a separate,
 * explicit owner release approval. Default execution is read-only.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BEGIN = '<!-- BEGIN generated content URLs: scripts/build-content-pages.js -->';
const END = '<!-- END generated content URLs -->';
const EXPECTED_MODE = 'candidate-configured-owner-release-required';

function fail(message) {
  throw new Error(message);
}

function parseAttributes(tag) {
  const attrs = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(path.relative(ROOT, file) + ' is missing or invalid: ' + error.message);
  }
}

function canonicalOrigin(site) {
  if (!site || site.canonicalHostApproved !== true) {
    fail('SEO publication is blocked: site.canonicalHostApproved must be explicitly true in an owner-authorized release change.');
  }
  if (site.canonicalPublicationMode !== EXPECTED_MODE) {
    fail('SEO publication is blocked: the candidate publication mode is missing or unexpected.');
  }
  let url;
  try {
    url = new URL(site.newStaticSiteCanonicalHost);
  } catch (_) {
    fail('SEO publication is blocked: the candidate canonical host must be a valid HTTPS origin.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    fail('SEO publication is blocked: the candidate canonical host must be an HTTPS origin without credentials, path, query or fragment.');
  }
  if (url.hostname.toLowerCase() !== 'hotelgarhjaisal.com') {
    fail('SEO publication is blocked: the configured host differs from the reviewed candidate hotelgarhjaisal.com.');
  }
  return url.origin;
}

function findMeta(html, attributeName, expectedValue) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs[attributeName] || '').toLowerCase() === expectedValue.toLowerCase()) {
      return attrs.content || '';
    }
  }
  return '';
}

function upsertMeta(html, attributeName, key, content) {
  let seen = false;
  const replacement = html.replace(/<meta\b[^>]*>/gi, tag => {
    const attrs = parseAttributes(tag);
    if ((attrs[attributeName] || '').toLowerCase() !== key.toLowerCase()) return tag;
    if (seen) return '';
    seen = true;
    if (/\bcontent\s*=/i.test(tag)) {
      return tag.replace(/(\bcontent\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
        (_whole, prefix) => prefix + '"' + escapeAttribute(content) + '"');
    }
    return tag.replace(/\s*\/?\s*>$/, end => ' content="' + escapeAttribute(content) + '"' + end);
  });
  if (seen) return replacement;
  return insertIntoHead(replacement, '<meta ' + attributeName + '="' + escapeAttribute(key) +
    '" content="' + escapeAttribute(content) + '">');
}

function insertIntoHead(html, markup) {
  if (!/<\/head\s*>/i.test(html)) fail('Cannot publish SEO metadata into a document without </head>.');
  return html.replace(/<\/head\s*>/i, markup + '\n</head>');
}

function upsertCanonical(html, canonicalUrl) {
  let seen = false;
  const replacement = html.replace(/<link\b[^>]*>/gi, tag => {
    const attrs = parseAttributes(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('canonical')) return tag;
    if (seen) return '';
    seen = true;
    return '<link rel="canonical" href="' + escapeAttribute(canonicalUrl) + '">';
  });
  return seen
    ? replacement
    : insertIntoHead(replacement, '<link rel="canonical" href="' + escapeAttribute(canonicalUrl) + '">');
}
function pageTitle(html, file) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = match && match[1].replace(/<[^>]+>/g, '').trim();
  if (!title) fail(file + ' must have a non-empty <title> before publication.');
  return title;
}

function socialImageUrl(root, rawValue, origin, file) {
  if (!rawValue) fail(file + ' is missing og:image; publication needs an explicit share image.');
  let image;
  try {
    image = new URL(rawValue, origin + '/');
  } catch (_) {
    fail(file + ' has an invalid og:image URL.');
  }
  if (image.protocol !== 'https:' && image.protocol !== 'http:') fail(file + ' has an unsupported og:image protocol.');
  const localHosts = new Set([new URL(origin).hostname.toLowerCase(), 'www.hotelgarhjaisal.com']);
  if (!localHosts.has(image.hostname.toLowerCase())) return image.href;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(image.pathname);
  } catch (_) {
    fail(file + ' has an invalid percent-encoded og:image path.');
  }
  const target = path.resolve(root, '.' + decodedPath);
  if (!target.startsWith(path.resolve(root) + path.sep)) fail(file + ' og:image resolves outside the site root.');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    fail(file + ' local og:image asset does not exist: ' + decodedPath);
  }
  return origin + (decodedPath.startsWith('/') ? decodedPath : '/' + decodedPath);
}

function routeEntries(root) {
  const contractPath = path.join(root, 'content', 'staging-route-contract.json');
  const contract = readJson(contractPath);
  if (!Array.isArray(contract.routes) || contract.routes.length !== 8) {
    fail('content/staging-route-contract.json must define exactly eight core public routes.');
  }
  const files = new Set();
  return contract.routes.map(route => {
    if (!route || typeof route.file !== 'string' || !/^[a-z0-9-]+\.html$|^index\.html$/.test(route.file)) {
      fail('The core route contract contains an unsafe or invalid filename.');
    }
    if (files.has(route.file)) fail('The core route contract contains duplicate route ' + route.file + '.');
    files.add(route.file);
    return { file: route.file, path: route.file === 'index.html' ? '/' : '/' + route.file };
  });
}

function renderSitemap(original, origin, routes) {
  if (original.split(BEGIN).length !== 2 || original.split(END).length !== 2) {
    fail('sitemap.xml must contain exactly one deterministic generated-content marker pair.');
  }
  const start = original.indexOf(BEGIN);
  const lineStart = original.lastIndexOf('\n', start) + 1;
  const prefix = original.slice(0, lineStart);
  const suffix = original.slice(lineStart);
  if (!/<urlset\b[^>]*>/i.test(original) || !/<\/urlset\s*>/i.test(original)) {
    fail('sitemap.xml must have a valid urlset root.');
  }

  const coreUrls = new Set(routes.map(route => origin + route.path));
  const cleanPrefix = prefix.replace(/<url\b[^>]*>[\s\S]*?<\/url\s*>/gi, entry => {
    const loc = entry.match(/<loc\b[^>]*>\s*([\s\S]*?)\s*<\/loc\s*>/i);
    return loc && coreUrls.has(loc[1].trim()) ? '' : entry;
  }).trimEnd();
  const entries = routes.map(route => '  <url><loc>' + origin + xmlPath(route.path) + '</loc></url>');
  return cleanPrefix + '\n' + entries.join('\n') + '\n' + suffix;
}

function xmlPath(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function publicationChanges(root = ROOT) {
  root = path.resolve(root);
  const config = readJson(path.join(root, 'content', 'site-config.json'));
  const origin = canonicalOrigin(config.site);
  const routes = routeEntries(root);
  const changes = new Map();

  for (const route of routes) {
    const filePath = path.join(root, route.file);
    let html;
    try {
      html = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      fail(route.file + ' is missing or unreadable: ' + error.message);
    }
    const title = pageTitle(html, route.file);
    const description = findMeta(html, 'name', 'description');
    if (!description.trim()) fail(route.file + ' must have a non-empty meta description before publication.');
    const imageAlt = findMeta(html, 'property', 'og:image:alt');
    if (!imageAlt.trim()) fail(route.file + ' must have a reviewed og:image:alt before publication.');
    const image = socialImageUrl(root, findMeta(html, 'property', 'og:image'), origin, route.file);
    const canonical = origin + route.path;

    html = upsertCanonical(html, canonical);
    html = upsertMeta(html, 'property', 'og:url', canonical);
    html = upsertMeta(html, 'property', 'og:image', image);
    html = upsertMeta(html, 'name', 'twitter:image', image);
    html = upsertMeta(html, 'name', 'twitter:image:alt', imageAlt);
    // Ensure existing pages still have usable social titles and descriptions.
    if (!findMeta(html, 'property', 'og:title')) html = upsertMeta(html, 'property', 'og:title', title);
    if (!findMeta(html, 'property', 'og:description')) html = upsertMeta(html, 'property', 'og:description', description);
    if (!findMeta(html, 'name', 'twitter:title')) html = upsertMeta(html, 'name', 'twitter:title', title);
    if (!findMeta(html, 'name', 'twitter:description')) html = upsertMeta(html, 'name', 'twitter:description', description);
    changes.set(route.file, html);
  }

  const robots = [
    '# Public crawling is enabled only after the owner-approved canonical release.',
    'User-agent: *',
    'Allow: /',
    '',
    'Sitemap: ' + origin + '/sitemap.xml',
    '',
  ].join('\n');
  changes.set('robots.txt', robots);

  const sitemapPath = path.join(root, 'sitemap.xml');
  let sitemap;
  try {
    sitemap = fs.readFileSync(sitemapPath, 'utf8');
  } catch (error) {
    fail('sitemap.xml is missing or unreadable: ' + error.message);
  }
  changes.set('sitemap.xml', renderSitemap(sitemap, origin, routes));
  return changes;
}

function applySeoPublication(root = ROOT) {
  root = path.resolve(root);
  // All validation and rendering happen in memory first. No partial writes on
  // missing route data, unsafe image paths or malformed sitemap markers.
  const changes = publicationChanges(root);
  for (const [relative, content] of changes) {
    const destination = path.join(root, relative);
    fs.writeFileSync(destination, content, 'utf8');
  }
  return { filesChanged: changes.size, origin: canonicalOrigin(readJson(path.join(root, 'content', 'site-config.json')).site) };
}

function main(args) {
  const apply = args.includes('--apply');
  const check = args.includes('--check') || !apply;
  const rootFlag = args.indexOf('--root');
  const root = rootFlag >= 0 && args[rootFlag + 1] ? path.resolve(args[rootFlag + 1]) : ROOT;
  const config = readJson(path.join(root, 'content', 'site-config.json'));
  if (config.site && config.site.canonicalHostApproved !== true) {
    if (apply) fail('Refusing to publish SEO artifacts: canonicalHostApproved is false. Obtain separate owner approval first.');
    console.log('BLOCKED (expected): canonical host is not owner-approved; no files were changed. Keep robots.txt disallowing crawl and sitemap.xml empty.');
    return;
  }
  if (!check && !apply) fail('Use --apply to write publication artifacts.');
  const changes = publicationChanges(root);
  const differing = [...changes].filter(([relative, value]) =>
    !fs.existsSync(path.join(root, relative)) || fs.readFileSync(path.join(root, relative), 'utf8') !== value
  ).map(([relative]) => relative);
  if (apply) {
    const result = applySeoPublication(root);
    console.log('PASS: prepared ' + result.filesChanged + ' approved SEO publication artifact(s) for ' + result.origin + '. Review the exact diff and run the full quality suite before deployment.');
  } else if (differing.length) {
    fail('Owner-approved SEO output is not prepared. Run with --apply and review changes: ' + differing.join(', '));
  } else {
    console.log('PASS: owner-approved canonical metadata, social preview URLs, robots policy and core sitemap are prepared deterministically.');
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  applySeoPublication,
  canonicalOrigin,
  publicationChanges,
  renderSitemap,
};
