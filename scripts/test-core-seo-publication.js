#!/usr/bin/env node
'use strict';

/**
 * Validates canonical metadata and structured data shipped in the eight core
 * HTML routes. It validates source files only; it does not fetch production.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL = 'https://hotelgarhjaisal.com';
const ROUTES = [
  { file: 'index.html', path: '/', title: 'Garh Jaisal Haveli' },
  { file: 'rooms.html', path: '/rooms.html', title: 'Rooms' },
  { file: 'experiences.html', path: '/experiences.html', title: 'Experiences' },
  { file: 'experience-details.html', path: '/experience-details.html', title: 'Experience Details' },
  { file: 'dining.html', path: '/dining.html', title: 'Dining' },
  { file: 'about.html', path: '/about.html', title: 'About' },
  { file: 'directions.html', path: '/directions.html', title: 'Directions' },
  { file: 'gallery.html', path: '/gallery.html', title: 'Gallery' },
];

function attrs(tag) {
  const values = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return values;
}
function valuesFor(html, selector) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attrs(match[0])).filter(selector);
}
function structuredData(html, filename) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return scripts.map(match => {
    try { return JSON.parse(match[1]); }
    catch (error) { throw new Error(filename + ': malformed JSON-LD: ' + error.message); }
  });
}
function graphNodes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(graphNodes);
  return [value, ...(Array.isArray(value['@graph']) ? value['@graph'].flatMap(graphNodes) : [])];
}

for (const route of ROUTES) {
  const html = fs.readFileSync(path.join(ROOT, route.file), 'utf8');
  const expected = CANONICAL + route.path;
  const canonicals = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attrs(match[0]))
    .filter(item => (item.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
  assert.equal(canonicals.length, 1, route.file + ': exactly one canonical link expected');
  assert.equal(canonicals[0].href, expected, route.file + ': canonical path must match route');
  assert.equal(valuesFor(html, item => (item.property || '').toLowerCase() === 'og:url').length, 1,
    route.file + ': exactly one og:url expected');
  assert.equal(valuesFor(html, item => (item.property || '').toLowerCase() === 'og:url')[0].content, expected,
    route.file + ': og:url must match canonical');

  for (const [key, altKey] of [['og:image', 'og:image:alt'], ['twitter:image', 'twitter:image:alt']]) {
    const image = valuesFor(html, item => (item.property || item.name || '').toLowerCase() === key);
    assert.equal(image.length, 1, route.file + ': exactly one ' + key + ' expected');
    const parsed = new URL(image[0].content);
    assert.equal(parsed.origin, CANONICAL, route.file + ': ' + key + ' must use canonical host');
    const imagePath = parsed.pathname.replace(/^\//, '');
    assert.ok(fs.statSync(path.join(ROOT, imagePath)).isFile(), route.file + ': social asset must exist locally: ' + imagePath);
    const alt = valuesFor(html, item => (item.property || item.name || '').toLowerCase() === altKey);
    assert.equal(alt.length, 1, route.file + ': exactly one ' + altKey + ' expected');
    assert.ok(alt[0].content.trim().length >= 12, route.file + ': social image alt text must be meaningful');
  }

  const crumbs = graphNodes(structuredData(html, route.file)).filter(node => node['@type'] === 'BreadcrumbList');
  assert.equal(crumbs.length, 1, route.file + ': exactly one BreadcrumbList expected');
  const elements = crumbs[0].itemListElement;
  assert.ok(Array.isArray(elements) && elements.length >= 1, route.file + ': breadcrumb items required');
  assert.equal(elements[0].item, CANONICAL + '/', route.file + ': breadcrumb starts at canonical home');
  assert.equal(elements[elements.length - 1].item, expected, route.file + ': breadcrumb ends at canonical route');

  if (route.file === 'index.html') {
    const nodes = graphNodes(structuredData(html, route.file));
    assert.ok(nodes.some(node => node['@type'] === 'Hotel' && node.name === 'Garh Jaisal Haveli'),
      'Home must retain hotel identity structured data');
    assert.ok(nodes.some(node => node['@type'] === 'WebSite' && node.url === CANONICAL + '/'),
      'Home must publish WebSite identity structured data');
  }
  if (route.file === 'dining.html') {
    const nodes = graphNodes(structuredData(html, route.file));
    const restaurant = nodes.find(node => node['@type'] === 'Restaurant' && node.name === "Garh Jaisal's Kitchen");
    assert.ok(restaurant, 'Dining must publish Restaurant schema with source-backed identity');
    assert.equal(restaurant.address.addressLocality, 'Jaisalmer');
    assert.equal(restaurant.address.addressCountry, 'IN');
    assert.equal(Object.hasOwn(restaurant, 'openingHours'), false, 'Unconfirmed opening hours must not be fabricated');
    assert.equal(Object.hasOwn(restaurant, 'aggregateRating'), false, 'Ratings must not be fabricated');
    assert.equal(Object.hasOwn(restaurant, 'priceRange'), false, 'Prices must not be fabricated');
  }
}
const notFound = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
assert.match(notFound, /<meta name="robots" content="noindex,follow">/);
assert.doesNotMatch(notFound, /<link\b[^>]*rel=["']canonical["']|property=["']og:url["']/i);
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.deepEqual(sitemapLocs, ROUTES.map(route => CANONICAL + route.path),
  'sitemap must contain all eight ordered core URLs and no draft/404 entries');
assert.equal(sitemap.split('<!-- BEGIN generated content URLs: scripts/build-content-pages.js -->').length - 1, 1,
  'generated-content marker must occur exactly once');
assert.equal(sitemap.split('<!-- END generated content URLs -->').length - 1, 1,
  'generated-content end marker must occur exactly once');
assert.match(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), /Sitemap:\s*https:\/\/hotelgarhjaisal\.com\/sitemap\.xml/);
console.log('PASS: eight core routes have matching canonical/OG URLs, local absolute OG/Twitter assets and alt text, breadcrumbs, Hotel/WebSite/Restaurant JSON-LD; sitemap and 404 policy agree.');
