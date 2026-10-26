#!/usr/bin/env node
'use strict';

/**
 * Content/UX regression gate for the static public routes.
 * No third-party parser or image package is required.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PAGE_RULES = [
  { file: 'index.html', minWords: 650 },
  { file: 'rooms.html', minWords: 400 },
  { file: 'experiences.html', minWords: 500 },
  { file: 'dining.html', minWords: 480 },
  { file: 'about.html', minWords: 480 },
  { file: 'directions.html', minWords: 520 },
  { file: 'gallery.html', minWords: 300 },
];
const errors = [];
const titles = new Map();
const descriptions = new Map();
const inbound = new Map(PAGE_RULES.map(({ file }) => [file, 0]));

function fail(message) {
  errors.push(message);
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'");
}

function stripMarkup(value) {
  return decodeEntities(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function attributes(tag) {
  const result = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) {
    const key = match[1].toLowerCase();
    result[key] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function readMeta(html, selector) {
  const tag = html.match(selector);
  return tag ? attributes(tag[0]) : null;
}

function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
        format: 'webp',
      };
    }
    if (chunk === 'VP8 ' && buffer.length >= 30 && buffer.toString('hex', 23, 26) === '9d012a') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        format: 'webp',
      };
    }
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01
        || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (sofMarkers.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
        format: 'jpeg',
      };
    }
    offset += segmentLength;
  }
  return null;
}

function localFile(relativePath, pageLabel, purpose) {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT + path.sep)) {
    fail(`${pageLabel}: ${purpose} escapes repository root: ${relativePath}`);
    return null;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`${pageLabel}: missing local ${purpose}: ${relativePath}`);
    return null;
  }
  return resolved;
}

for (const rule of PAGE_RULES) {
  const pagePath = path.join(ROOT, rule.file);
  if (!fs.existsSync(pagePath)) {
    fail(`missing required public page: ${rule.file}`);
    continue;
  }
  const html = fs.readFileSync(pagePath, 'utf8');
  const titleTag = html.match(/<title\b[^>]*>[\s\S]*?<\/title>/i);
  const title = titleTag ? stripMarkup(titleTag[0].replace(/^<title\b[^>]*>/i, '').replace(/<\/title>$/i, '')) : '';
  if (title.length < 30 || title.length > 65) fail(`${rule.file}: title length must be 30–65 characters (found ${title.length})`);
  const normalizedTitle = title.toLocaleLowerCase();
  if (titles.has(normalizedTitle)) fail(`${rule.file}: duplicate title also used by ${titles.get(normalizedTitle)}`);
  else titles.set(normalizedTitle, rule.file);

  const descriptionTag = readMeta(html, /<meta\b[^>]*\bname=["']description["'][^>]*>/i);
  const description = descriptionTag ? decodeEntities(descriptionTag.content || '').trim() : '';
  if (description.length < 110 || description.length > 165) {
    fail(`${rule.file}: meta description length must be 110–165 characters (found ${description.length})`);
  }
  const normalizedDescription = description.toLocaleLowerCase().replace(/\s+/g, ' ');
  if (descriptions.has(normalizedDescription)) fail(`${rule.file}: duplicate description also used by ${descriptions.get(normalizedDescription)}`);
  else descriptions.set(normalizedDescription, rule.file);

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) fail(`${rule.file}: expected exactly one h1, found ${h1Count}`);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const mainText = mainMatch ? stripMarkup(mainMatch[1]) : '';
  const wordCount = mainText ? mainText.split(/\s+/).length : 0;
  if (wordCount < rule.minWords) fail(`${rule.file}: main content is too thin (${wordCount} words; minimum ${rule.minWords})`);

  const ogImage = readMeta(html, /<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i);
  const ogAlt = readMeta(html, /<meta\b[^>]*\bproperty=["']og:image:alt["'][^>]*>/i);
  if (!ogImage || !ogImage.content) fail(`${rule.file}: missing Open Graph image`);
  else if (/^https?:\/\//i.test(ogImage.content)) fail(`${rule.file}: OG image must use a local asset until the canonical host is approved`);
  else localFile(ogImage.content, rule.file, 'Open Graph image');
  if (!ogAlt || !ogAlt.content.trim()) fail(`${rule.file}: missing Open Graph image alt text`);

  if (/raw\.githubusercontent\.com/i.test(html)) fail(`${rule.file}: public page still references a raw GitHub asset host`);
  if (/\bfamily-run\b|\bour family\b|family story|our roots are here|rooted in the Golden City|since 2005/i.test(html)) {
    fail(rule.file + ': unapproved family-history or start-year claim remains in public HTML');
  }

  const seenImages = new Set();
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attr = attributes(match[0]);
    const src = attr.src || '';
    const alt = (attr.alt || '').trim();
    if (!src || /^https?:\/\//i.test(src) || src.startsWith('//')) {
      fail(`${rule.file}: image must be locally hosted: ${src || '(missing src)'}`);
      continue;
    }
    if (!alt || /^(image|photo|picture|img)\s*\d*$/i.test(alt)) fail(`${rule.file}: missing or generic alt text for ${src}`);
    if (seenImages.has(src)) fail(`${rule.file}: repeated image source on the same page: ${src}`);
    seenImages.add(src);
    if (!attr.width || !attr.height || Number(attr.width) <= 0 || Number(attr.height) <= 0) {
      fail(`${rule.file}: image needs explicit positive width and height: ${src}`);
    }
    const resolved = localFile(src, rule.file, 'image');
    if (resolved) {
      const dimensions = imageDimensions(fs.readFileSync(resolved));
      if (!dimensions) fail(`${rule.file}: image format/dimensions could not be verified: ${src}`);
      else if (Number(attr.width) !== dimensions.width || Number(attr.height) !== dimensions.height) {
        fail(`${rule.file}: declared image geometry ${attr.width}×${attr.height} does not match ${dimensions.width}×${dimensions.height}: ${src}`);
      }
    }
  }

  if (rule.file === 'rooms.html') {
    const catalogue = [
      { name: 'Sweet Purple Room', image: 'assets/images/rooms/sweet-purple.jpg', features: ['Carved bed', 'Second bed', 'Air conditioning', 'Private bathroom', 'City view'] },
      { name: 'Rising Sun Room', image: 'assets/images/rooms/rising-sun.jpg', features: ['Comfortable room', 'City view', 'Private bathroom', 'Window seat'] },
      { name: 'Scarlet Room', image: 'assets/images/scarlet.jpg', features: ['Window seat', 'City view', 'Private bathroom', 'Air conditioning'] },
      { name: 'Opium Room', image: 'assets/images/rooms/opium.jpg', features: ['City view', 'Private bathroom', 'Ceiling fan'] },
      { name: 'Red Maharani Room', image: 'assets/images/rooms/red-maharani.jpg', features: ['King bed', 'Window seat', 'City view', 'Private bathroom'] },
      { name: 'Green Room', image: 'assets/images/rooms/green.jpg', features: ['King bed', 'Window seat', 'Private bathroom', 'Air conditioning'] },
      { name: 'BlueSky Room', image: 'assets/images/rooms/bluesky.jpg', features: ['Window seat', 'City view', 'Private bathroom', 'Ceiling fan'] },
    ];
    const cards = [...html.matchAll(/<article class="room-card room-card--named"[^>]*>[\s\S]*?<\/article>/g)].map((match) => match[0]);
    if (cards.length !== catalogue.length) {
      fail('rooms.html: expected ' + catalogue.length + ' named room cards, found ' + cards.length);
    }
    for (const room of catalogue) {
      const card = cards.find((candidate) => candidate.includes('<h3>' + room.name + '</h3>'));
      if (!card) {
        fail('rooms.html: missing named room card: ' + room.name);
        continue;
      }
      if (!card.includes('src="' + room.image + '"')) fail('rooms.html: ' + room.name + ' has an incorrect local image mapping');
      for (const feature of room.features) {
        if (!card.includes('>' + feature + '</li>')) fail('rooms.html: ' + room.name + ' is missing source-listed feature: ' + feature);
      }
      if (!/width="\d+"\s+height="\d+"/.test(card)) fail('rooms.html: ' + room.name + ' image lacks explicit geometry');
    }
    if (/class=["'][^"']*\broom-reference-grid\b/.test(html)) fail('rooms.html: old generic room-reference grid remains');
    if (!/not live inventory/i.test(html)) fail('rooms.html: source-listing must be distinguished from live inventory');
  }


  if (rule.file === 'experiences.html') {
    const catalogue = [
      { id: 'sunset-camel', title: 'Sunset camel safari', image: 'assets/images/legacy/camel-sunset.jpg' },
      { id: 'cultural-evening', title: 'Cultural desert evening', image: 'assets/images/experiences/cultural-programme.jpg' },
      { id: 'open-sky', title: 'Sleep under the stars', image: 'assets/images/tent.jpg' },
      { id: 'swiss-tent', title: 'Swiss tent overnight', image: 'assets/images/experiences/swiss-tent-exterior.webp' },
      { id: 'half-day-city', title: 'Half-day guided Jaisalmer tour', image: 'assets/images/legacy/fort-temple-spires.jpg' },
      { id: 'full-day-city', title: 'Full-day guided Jaisalmer tour', image: 'assets/images/experiences/heritage-architecture.jpg' },
    ];
    const cards = [...html.matchAll(/<article class="experience-option" data-option="([^"]+)"[^>]*>[\s\S]*?<\/article>/g)];
    if (cards.length !== catalogue.length) {
      fail('experiences.html: expected six source-listed experience option cards, found ' + cards.length);
    }
    if (!/data-option="sunset-camel" id="desert"/.test(html)) {
      fail('experiences.html: homepage desert deep link must target the sunset camel option');
    }
    if (!/data-option="half-day-city" id="city-tours"/.test(html)) {
      fail('experiences.html: homepage city-tours deep link must target the guided city options');
    }
    const expectedSources = catalogue.map((option) => option.image);
    if (new Set(expectedSources).size !== catalogue.length) {
      fail('experiences.html: experience options must use six distinct image paths');
    }
    for (const option of catalogue) {
      const match = cards.find((candidate) => candidate[1] === option.id);
      if (!match) {
        fail('experiences.html: missing source-listed option: ' + option.title);
        continue;
      }
      const card = match[0];
      if (!card.includes('<h2 id="experience-' + option.id + '-title">' + option.title + '</h2>')) {
        fail('experiences.html: option heading is missing or mismatched: ' + option.title);
      }
      if (!card.includes('src="' + option.image + '"')) {
        fail('experiences.html: incorrect local image mapping for ' + option.title);
      }
      if (!/loading="lazy"/.test(card) || !/decoding="async"/.test(card)) {
        fail('experiences.html: option images must be lazy-loaded and asynchronously decoded: ' + option.title);
      }
      if (!/class="experience-confirmation"/.test(card)) {
        fail('experiences.html: missing confirmation prompts for ' + option.title);
      }
      const cardText = stripMarkup(card).toLocaleLowerCase();
      for (const term of ['duration', 'transport', 'access', 'inclusions', 'exclusions']) {
        if (!cardText.includes(term)) fail('experiences.html: ' + option.title + ' is missing the ' + term + ' confirmation prompt');
      }
      if (!/data-enquiry-link/.test(card) || !/aria-disabled="true"/.test(card)) {
        fail('experiences.html: enquiry action must remain disabled until endpoint verification: ' + option.title);
      }
    }
    if (!/not confirmation that each option is currently operated/i.test(html)) {
      fail('experiences.html: source-listed concepts need an explicit non-live-offer disclaimer');
    }
    if (/garh-jaisal-website|raw\.githubusercontent\.com/i.test(html)) {
      fail('experiences.html: public page must not hotlink legacy repository assets');
    }
    if (/class="service-list"/.test(html)) {
      fail('experiences.html: old unstructured service list remains beside the six-option comparison');
    }
  }

  const navMatch = html.match(/<nav id=["']primary-navigation["'][^>]*>[\s\S]*?<\/nav>/i);
  if (!navMatch) fail(rule.file + ': missing primary navigation');
  else {
    const nav = navMatch[0];
    const aboutGroup = nav.match(/<div class=["']nav-about-group["'][^>]*>[\s\S]*?<\/div>/i);
    const dropdown = nav.match(/<details\b[^>]*class=["']nav-dropdown["'][^>]*>[\s\S]*?<\/details>/i);
    if (!aboutGroup || !/href=["']about\.html["']/.test(aboutGroup[0])) {
      fail(rule.file + ': About must remain a real link in the About navigation group');
    }
    if (!dropdown || !/href=["']gallery\.html["']/.test(dropdown[0])) {
      fail(rule.file + ': Gallery must be discoverable inside the About dropdown');
    }
    const navOutsideDropdown = nav.replace(/<details\b[^>]*class=["']nav-dropdown["'][^>]*>[\s\S]*?<\/details>/i, '');
    if (/href=["']gallery\.html["']/.test(navOutsideDropdown)) {
      fail(rule.file + ': Gallery should not be a top-level navigation item');
    }
  }

  const anchors = html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi);
  for (const match of anchors) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(href)) continue;
    const pathPart = href.split('#')[0].split('?')[0];
    if (!pathPart || !pathPart.endsWith('.html')) continue;
    const target = path.normalize(path.join(path.dirname(rule.file), pathPart));
    if (inbound.has(target) && target !== rule.file) inbound.set(target, inbound.get(target) + 1);
  }

  if (/<link\b[^>]*\brel=["']canonical["']/i.test(html)) fail(`${rule.file}: canonical URL must remain unset until the host is approved`);
  if (/<meta\b[^>]*\bproperty=["']og:url["']/i.test(html)) fail(`${rule.file}: OG URL must remain unset until the host is approved`);
  if (/https:\/\/hotelgarhjaisal\.com/i.test(html)) fail(`${rule.file}: unapproved canonical host appears in public HTML`);
}

for (const [file, count] of inbound) {
  if (file !== 'index.html' && count === 0) fail(`${file}: orphaned public page has no incoming internal link`);
}

const configPath = path.join(ROOT, 'content', 'site-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.site && config.site.canonicalHostApproved !== true) {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  if (/<loc>\s*https?:\/\//i.test(sitemap)) fail('sitemap.xml publishes URLs before canonical host approval');
  if (/^\s*Sitemap\s*:/im.test(robots)) fail('robots.txt advertises a sitemap before canonical host approval');
}

for (const type of ['tours', 'blogs']) {
  const directory = path.join(ROOT, 'content', type);
  if (!fs.existsSync(directory)) continue;
  for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.json'))) {
    const record = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    if (record.status !== 'live' && record.slug && fs.existsSync(path.join(ROOT, type, `${record.slug}.html`))) {
      fail(`${type}/${record.slug}.html: non-live content must not have a public generated page`);
    }
  }
}

if (errors.length) {
  console.error(`FAIL: content/UX regression gate found ${errors.length} issue(s)`);
  for (const message of errors) console.error(` - ${message}`);
  process.exit(1);
}

console.log(`PASS: content/UX regression gate audited ${PAGE_RULES.length} pages for depth, unique metadata, internal discovery, room-reference cards, local image paths/alt/geometry, duplicate images and canonical publication gates.`);
