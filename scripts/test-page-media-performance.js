#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(process.env.MEDIA_PERFORMANCE_ROOT || path.join(__dirname, '..'));
const CONTRACT_ROOT = path.resolve(process.env.MEDIA_PERFORMANCE_CONTRACT_ROOT || ROOT);
const KIB = 1024;
const DEFAULT_MAX_BYTES = 650 * KIB;
const routeContract = JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, 'content', 'staging-route-contract.json'), 'utf8'));
const PAGES = routeContract.routes.map(route => route.file);
const HERO_BUDGETS = new Map([
  ['index.html', 150 * KIB],
  ['rooms.html', 550 * KIB],
  ['dining.html', 100 * KIB],
  ['about.html', 750 * KIB],
  ['experiences.html', 200 * KIB],
  ['experience-details.html', 100 * KIB],
  ['gallery.html', 900 * KIB],
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
  ['assets/images/directions/haveli-facade.jpg', 900 * KIB],
  ['assets/images/directions/haveli-facade.webp', 400_000],
  ['assets/images/responsive/directions/haveli-facade-320.webp', 50 * KIB],
  ['assets/images/responsive/directions/haveli-facade-480.webp', 90 * KIB],
  ['assets/images/responsive/directions/haveli-facade-768.webp', 200 * KIB],
  ['assets/images/responsive/directions/haveli-facade-1200.webp', 250_000],
  ['assets/images/gallery/hotel/fort-from-roof.jpg', 750 * KIB],
  ['assets/images/gallery/hotel/fort-from-roof.webp', 400 * KIB],
  ['assets/images/responsive/gallery/hotel/fort-from-roof-320.webp', 20_000],
  ['assets/images/responsive/gallery/hotel/fort-from-roof-480.webp', 35_000],
  ['assets/images/responsive/gallery/hotel/fort-from-roof-768.webp', 80_000],
  ['assets/images/responsive/gallery/hotel/fort-from-roof-1200.webp', 170_000],
  ['assets/images/responsive/gallery/hotel/fort-from-roof-1600.webp', 250_000],
  ['assets/images/gallery/desert/camp-evening.jpeg', 150 * KIB],
  ['assets/images/gallery/desert/camp-from-above.jpeg', 100 * KIB],
  ['assets/images/legacy/camel-sunset.jpg', 400 * KIB],
  ['assets/images/legacy/camel-day.jpg', 350 * KIB],
  ['assets/images/legacy/camel-day.webp', 210_000],
  ['assets/images/responsive/legacy/camel-day-1200.webp', 170_000],
  ['assets/images/experiences/cultural-programme.jpg', 300 * KIB],
  ['assets/images/experiences/open-air-sleeping-setup.jpeg', 150 * KIB],
  ['assets/images/experiences/sleep-under-stars-dusk-camp.jpeg', 150 * KIB],
  ['assets/images/experiences/sleep-under-stars-shelter.jpeg', 150 * KIB],
  ['assets/images/experiences/half-day-jaisalmer-tour.jpg', 250 * KIB],
  ['assets/images/tent.jpg', 150 * KIB],
  ['assets/images/experiences/swiss-tent-exterior.webp', 200 * KIB],
  ['assets/images/experiences/swiss-tent-detail.jpeg', 250 * KIB],
  ['assets/images/legacy/fort-temple-spires.jpg', 500 * KIB],
  ['assets/images/legacy/fort-temple-spires.webp', 120_000],
  ['assets/images/responsive/legacy/fort-temple-spires-1200.webp', 100_000],
  ['assets/images/experiences/heritage-architecture.jpg', 300 * KIB],
  ['assets/images/legacy/rooftop-candlelight.webp', 100 * KIB],
  ['assets/images/courtyard.jpg', 650 * KIB],
  ['assets/images/courtyard.webp', 450_000],
  ['assets/images/responsive/courtyard-1200.webp', 250_000],
  ['assets/images/responsive/courtyard-1600.webp', 250_000],
]);
// The source-tree gate runs before the isolated staging package is generated. Its
// committed WebP files may therefore be pre-optimization inputs. Keep a general
// source-file ceiling here; the package pass (ROOT !== CONTRACT_ROOT) enforces
// the strict derivative budgets against the newly generated, packaged bytes.
const IS_PACKAGED_OUTPUT = ROOT !== CONTRACT_ROOT;
const PACKAGE_GENERATED_DERIVATIVE_PATHS = new Set(
  [...PATH_BUDGETS.keys()].filter(assetPath => assetPath.includes('/responsive/')
    || assetPath === 'assets/images/courtyard.webp'
    || assetPath === 'assets/images/directions/haveli-facade.webp'
    || assetPath === 'assets/images/legacy/camel-day.webp'
    || assetPath === 'assets/images/legacy/fort-temple-spires.webp')
);
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
  const configuredBudget = PATH_BUDGETS.get(relative) || DEFAULT_MAX_BYTES;
  const sourceTreeBudget = PACKAGE_GENERATED_DERIVATIVE_PATHS.has(relative)
    ? DEFAULT_MAX_BYTES
    : configuredBudget;
  const roleBudget = IS_PACKAGED_OUTPUT ? configuredBudget : sourceTreeBudget;
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
    if ((attributes(heroImageTag).loading || '').toLowerCase() !== 'eager') fail(page + ': hero image must explicitly use loading="eager"');
    if ((attributes(heroImageTag).decoding || '').toLowerCase() !== 'async') fail(page + ': hero image must use decoding="async"');
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
    if ((attr['data-responsive-image-fallback'] || '').toLowerCase() === 'true') {
      const fallbackPath = src.split(/[?#]/, 1)[0];
      if (!/\.jpe?g$/i.test(fallbackPath)) fail(page + ': responsive image must retain a JPEG fallback: ' + src);
      if (!/^[1-9]\d*$/.test(attr.width || '') || !/^[1-9]\d*$/.test(attr.height || '')) {
        fail(page + ': responsive image must reserve positive intrinsic width and height: ' + src);
      }
      if ((attr.decoding || '').toLowerCase() !== 'async') {
        fail(page + ': responsive image fallback must use decoding="async": ' + src);
      }
    }
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

  const sourceTags = [...html.matchAll(/<source\b[^>]*>/gi)].map(match => match[0]);
  for (const tag of sourceTags) {
    const attr = attributes(tag);
    if (!attr.srcset) continue;
    const inHero = Boolean(heroHtml && heroHtml.includes(tag));
    if ((attr['data-responsive-image'] || '').toLowerCase() === 'true') {
      if ((attr.type || '').toLowerCase() !== 'image/webp') {
        fail(page + ': responsive picture source must declare type="image/webp"');
      }
      if (!attr.sizes) fail(page + ': responsive picture source must declare sizes');
    }
    for (const candidate of srcsetCandidates(attr.srcset)) {
      inspectAsset(candidate, page, inHero ? 'hero responsive source' : 'responsive source',
        inHero ? (HERO_BUDGETS.get(page) || DEFAULT_MAX_BYTES) : null);
    }
  }

  // A non-responsive image preload must target the actual primary hero image or one of its
  // <picture> candidates. Preloading an unrelated room/supporting photo wastes bandwidth and
  // can compete with the real LCP image even when the asset itself is valid.
  const heroImageCandidates = new Set();
  if (heroImageTag) {
    const heroSrc = (attributes(heroImageTag).src || '').split(/[?#]/, 1)[0];
    if (heroSrc) heroImageCandidates.add(heroSrc);
    for (const sourceTag of sourceTags) {
      if (!heroHtml.includes(sourceTag)) continue;
      for (const candidate of srcsetCandidates(attributes(sourceTag).srcset)) heroImageCandidates.add(candidate);
    }
  }

  const imagePreloadTags = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(match => ({ tag: match[0], attr: attributes(match[0]) }))
    .filter(({ attr }) => (attr.rel || '').toLowerCase() === 'preload'
      && (attr.as || '').toLowerCase() === 'image');
  if (heroImageTag && !imagePreloadTags.some(({ attr }) => {
    const href = (attr.href || '').split(/[?#]/, 1)[0];
    return heroImageCandidates.has(href);
  })) {
    fail(page + ': image hero must have a preload matching the hero image or a picture candidate');
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attr = attributes(match[0]);
    if ((attr.rel || '').toLowerCase() !== 'preload'
      || (attr.as || '').toLowerCase() !== 'image'
      || attr.imagesrcset) continue;
    const href = (attr.href || '').split(/[?#]/, 1)[0];
    if (!heroImageCandidates.has(href)) {
      fail(page + ': image preload must target the primary hero image or its picture candidate: ' + href);
    }
    const type = (attr.type || '').toLowerCase();
    const extension = path.extname(href).toLowerCase();
    const expectedType = ({
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    })[extension] || '';
    if (type && expectedType && type !== expectedType) {
      fail(page + ': image preload type does not match its file extension: ' + href);
    }
  }

  // Responsive preload hints must agree with a real <picture> source. A mismatched
  // candidate list or slot size can trigger duplicate downloads and waste bandwidth.
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const attr = attributes(tag);
    if ((attr.rel || '').toLowerCase() !== 'preload'
      || (attr.as || '').toLowerCase() !== 'image'
      || !attr.imagesrcset) continue;
    if (!attr.imagesizes) fail(page + ': responsive image preload must declare imagesizes');
    if ((attr.type || '').toLowerCase() !== 'image/webp') {
      fail(page + ': responsive image preload must declare type="image/webp"');
    }
    const candidateSourceTag = sourceTags.find(sourceTag => {
      const source = attributes(sourceTag);
      return (source.type || '').toLowerCase() === 'image/webp'
        && source.srcset === attr.imagesrcset;
    });
    if (!candidateSourceTag) {
      fail(page + ': responsive preload imagesrcset must exactly match a picture source');
      continue;
    }
    const candidateSource = attributes(candidateSourceTag);
    if (candidateSource.sizes !== attr.imagesizes) {
      fail(page + ': responsive preload imagesizes must match picture source sizes');
    }
    const candidatePaths = srcsetCandidates(attr.imagesrcset);
    const preloadHref = (attr.href || '').split(/[?#]/, 1)[0];
    if (!preloadHref || !candidatePaths.includes(preloadHref)) {
      fail(page + ': responsive preload href must be one of its imagesrcset candidates');
    }
    const isHeroPreload = Boolean(heroHtml && heroHtml.includes(candidateSourceTag));
    for (const candidate of candidatePaths) {
      inspectAsset(candidate, page, isHeroPreload ? 'hero responsive preload candidate' : 'responsive preload candidate',
        isHeroPreload ? (HERO_BUDGETS.get(page) || DEFAULT_MAX_BYTES) : null);
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
