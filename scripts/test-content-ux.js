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
    const referenceCards = [...html.matchAll(/<figure\b[^>]*class=["'][^"']*\broom-reference-card\b[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi)];
    if (referenceCards.length !== 2) fail('rooms.html: expected two distinct image-led room reference cards');
    const roomGrid = html.match(/<div\b[^>]*class=["'][^"']*\broom-reference-grid\b[^"']*["'][^>]*>/i);
    if (!roomGrid || !/\brole=["']group["']/.test(roomGrid[0]) || !/\baria-label=["']Room photo references["']/.test(roomGrid[0])) {
      fail('rooms.html: room reference grid needs an accessible group role and name');
    }
    for (const [index, match] of referenceCards.entries()) {
      if (!/<img\b/i.test(match[0]) || !/<figcaption\b/i.test(match[0])) {
        fail(`rooms.html: room reference card ${index + 1} needs an image and visible caption`);
      }
    }
    if (!/<article\b[^>]*class=["'][^"']*\broom-reference-guide\b[^"']*["'][^>]*>[\s\S]*?<\/article>/i.test(html)) {
      fail('rooms.html: missing the room-details checklist beside the photo references');
    }
    if (/class=["'][^"']*\broom-card-grid\b/.test(html)
        || /<h3>\s*(?:Haveli Rooms|Your Jaisalmer Base)\s*<\/h3>/i.test(html)) {
      fail('rooms.html: generic text-only room placeholder cards remain');
    }
    if (!/not live inventory/i.test(html)) {
      fail('rooms.html: photo references must be clearly distinguished from live room inventory');
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
