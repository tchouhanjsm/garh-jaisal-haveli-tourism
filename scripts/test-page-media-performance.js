#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const KIB = 1024;
const DEFAULT_MAX_BYTES = 650 * KIB;
const routeContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'staging-route-contract.json'), 'utf8'));
const PAGES = routeContract.routes.map(route => route.file);
const HERO_BUDGETS = new Map([
  ['index.html', 150 * KIB],
  ['rooms.html', 550 * KIB],
  ['dining.html', 150 * KIB],
  ['about.html', 450 * KIB],
  ['directions.html', 650 * KIB],
]);
const PATH_BUDGETS = new Map([
  ['assets/images/rest3.jpg', 150 * KIB],
  ['assets/images/rooms/haveli-interior.jpg', 550 * KIB],
  ['assets/images/rooms/haveli-sitting-room.webp', 320 * KIB],
  ['assets/images/rooms/sweet-purple.jpg', 550 * KIB],
  ['assets/images/rooms/sweet-purple.webp', 300 * KIB],
  ['assets/images/rooms/rising-sun.jpg', 150 * KIB],
  ['assets/images/scarlet.jpg', 150 * KIB],
  ['assets/images/rooms/opium.jpg', 150 * KIB],
  ['assets/images/rooms/red-maharani.jpg', 150 * KIB],
  ['assets/images/rooms/green.jpg', 150 * KIB],
  ['assets/images/rooms/bluesky.jpg', 150 * KIB],
  ['assets/images/dining/rooftop-candlelit-table.jpg', 100 * KIB],
  ['assets/images/directions/haveli-facade.webp', 600 * KIB],
  ['assets/images/gallery/hotel/fort-from-roof.webp', 400 * KIB],
  ['assets/images/gallery/desert/camp-evening.jpeg', 150 * KIB],
  ['assets/images/gallery/desert/camp-from-above.jpeg', 100 * KIB],
  ['assets/images/legacy/camel-sunset.jpg', 400 * KIB],
  ['assets/images/legacy/camel-day.jpg', 350 * KIB],
  ['assets/images/experiences/cultural-programme.jpg', 300 * KIB],
  ['assets/images/tent.jpg', 150 * KIB],
  ['assets/images/experiences/swiss-tent-exterior.webp', 200 * KIB],
  ['assets/images/experiences/swiss-tent-detail.jpeg', 250 * KIB],
  ['assets/images/legacy/fort-temple-spires.jpg', 500 * KIB],
  ['assets/images/experiences/heritage-architecture.jpg', 300 * KIB],
  ['assets/images/legacy/rooftop-candlelight.webp', 100 * KIB],
  ['assets/images/courtyard.jpg', 650 * KIB],
]);
const errors = [];
const referencedAssets = new Set();
let imageCount = 0;
let largest = { path: '', bytes: 0 };

function fail(message) { errors.push(message); }
function attributes(tag) {
  const result = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return result;
}
function srcsetCandidates(value) {
  return value.split(',').map(candidate => candidate.trim().split(/\s+/)[0]).filter(Boolean);
}
function inspectAsset(reference, page, role, heroBudget = null) {
  const relative = reference.split(/[?#]/, 1)[0];
  if (!relative || /^(?:https?:|\/\/|data:|blob:)/i.test(relative) || path.isAbsolute(relative)) {
    fail(page + ': ' + role + ' must use a local relative image path: ' + reference);
    return;
  }
  const absolute = path.resolve(ROOT, relative);
  if (!absolute.startsWith(ROOT + path.sep)) {
    fail(page + ': ' + role + ' escapes repository root: ' + reference);
    return;
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    fail(page + ': missing ' + role + ': ' + relative);
    return;
  }
  const bytes = fs.statSync(absolute).size;
  const roleBudget = PATH_BUDGETS.get(relative) || DEFAULT_MAX_BYTES;
  const budget = heroBudget === null ? roleBudget : Math.min(roleBudget, heroBudget);
  if (bytes <= 0 || bytes > budget) fail(page + ': ' + role + ' is ' + bytes + ' bytes; budget is ' + budget + ': ' + relative);
  referencedAssets.add(relative);
  if (bytes > largest.bytes) largest = { path: relative, bytes };
}
function findHeroSection(html) {
  return [...html.matchAll(/<section\b[^>]*class=["']([^"']*)["'][^>]*>[\s\S]*?<\/section>/gi)]
    .find(match => match[1].split(/\s+/).some(className => className === 'hero' || className === 'page-hero'));
}

for (const page of PAGES) {
  const pagePath = path.join(ROOT, page);
  if (!fs.existsSync(pagePath)) { fail('Missing public page: ' + page); continue; }
  const html = fs.readFileSync(pagePath, 'utf8');
  const heroMatch = findHeroSection(html);
  const heroHtml = heroMatch ? heroMatch[0] : '';
  const heroClasses = heroMatch ? heroMatch[1].split(/\s+/) : [];
  const heroImageTag = (heroHtml.match(/<img\b[^>]*>/i) || [])[0] || null;
  const plainTextHero = heroClasses.includes('page-hero--plain');
  if (heroHtml && !heroImageTag && !plainTextHero) fail(page + ': image hero section has no image to prioritize');

  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  imageCount += imageTags.length;
  const highPriority = imageTags.filter(tag => (attributes(tag).fetchpriority || '').toLowerCase() === 'high');
  if (heroImageTag) {
    if ((attributes(heroImageTag).fetchpriority || '').toLowerCase() !== 'high') fail(page + ': hero image must use fetchpriority="high"');
    if ((attributes(heroImageTag).loading || '').toLowerCase() === 'lazy') fail(page + ': hero image must not be lazy-loaded');
    if (highPriority.length !== 1 || highPriority[0] !== heroImageTag) fail(page + ': only the primary hero image may use fetchpriority="high"');
  } else if (highPriority.length) {
    fail(page + ': a page without an image hero must not prioritize a supporting image');
  }

  const heroBudget = heroImageTag ? (HERO_BUDGETS.get(page) || DEFAULT_MAX_BYTES) : null;
  for (const tag of imageTags) {
    const attr = attributes(tag);
    const isHero = Boolean(heroImageTag && tag === heroImageTag);
    const src = attr.src || '';
    if (!src) fail(page + ': image has no src attribute');
    else inspectAsset(src, page, isHero ? 'hero image' : 'supporting image', isHero ? heroBudget : null);
    if (!isHero) {
      if ((attr.loading || '').toLowerCase() !== 'lazy') fail(page + ': below-hero image must use loading="lazy": ' + src);
      if ((attr.decoding || '').toLowerCase() !== 'async') fail(page + ': below-hero image must use decoding="async": ' + src);
    }
    if (attr.srcset) {
      for (const candidate of srcsetCandidates(attr.srcset)) {
        inspectAsset(candidate, page, isHero ? 'hero responsive source' : 'responsive source', isHero ? heroBudget : null);
      }
    }
  }

  for (const match of html.matchAll(/<source\b[^>]*>/gi)) {
    const tag = match[0];
    const attr = attributes(tag);
    if (!attr.srcset) continue;
    const inHero = Boolean(heroHtml && heroHtml.includes(tag));
    for (const candidate of srcsetCandidates(attr.srcset)) {
      inspectAsset(candidate, page, inHero ? 'hero responsive source' : 'responsive source',
        inHero ? (HERO_BUDGETS.get(page) || DEFAULT_MAX_BYTES) : null);
    }
  }
}

if (errors.length) {
  console.error('FAIL: page media performance preflight found ' + errors.length + ' issue(s)');
  for (const error of errors) console.error(' - ' + error);
  process.exit(1);
}
console.log('PASS: page-wide image budgets, hero fetch priority, below-fold lazy loading, local responsive sources and actual bytes verified across '
  + PAGES.length + ' pages and ' + referencedAssets.size + ' unique assets (' + imageCount + ' img tags). Largest referenced asset: '
  + largest.path + ' (' + largest.bytes + ' bytes).');
