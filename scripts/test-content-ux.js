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
  { file: 'experience-details.html', minWords: 1000 },
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

function webpChunkIds(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return [];
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) return [];
    chunks.push(id);
    offset += 8 + size + (size % 2);
  }
  return offset === buffer.length ? chunks : [];
}

function webpHasMetadataFlags(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF'
      || buffer.toString('ascii', 8, 12) !== 'WEBP'
      || buffer.toString('ascii', 12, 16) !== 'VP8X'
      || buffer.length < 21) return true;
  return Boolean(buffer[20] & (0x20 | 0x08 | 0x04));
}

function jpegHasExifOrXmp(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01
        || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const payload = buffer.toString('ascii', offset + 2, Math.min(offset + length, offset + 100));
    if (marker === 0xe1 && (payload.startsWith('Exif')
        || payload.includes('http://ns.adobe.com/xap/1.0/'))) return true;
    offset += length;
  }
  return false;
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
  const staleHandoffCopy = [
    /Direct enquiry through this website is disabled while the contact configuration is being verified/i,
    /does not currently transmit booking enquiries or make reservations/i,
    /use your existing booking confirmation/i,
    /verified contact route from your booking confirmation/i,
    /verified booking contact/i,
  ];
  if (staleHandoffCopy.some(pattern => pattern.test(html))) {
    fail(rule.file + ': booking/enquiry copy must describe the source-authorized CTA handoff without claiming live contact verification or directing new guests to an existing booking confirmation');
  }
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


  const socialTitle = readMeta(html, /<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/i);
  const socialDescription = readMeta(html, /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/i);
  const twitterTitle = readMeta(html, /<meta\b[^>]*\bname=["']twitter:title["'][^>]*>/i);
  const twitterDescription = readMeta(html, /<meta\b[^>]*\bname=["']twitter:description["'][^>]*>/i);
  if (!socialTitle || decodeEntities(socialTitle.content || '').trim() !== title) {
    fail(rule.file + ': Open Graph title must match the page title');
  }
  if (!socialDescription || decodeEntities(socialDescription.content || '').trim() !== description) {
    fail(rule.file + ': Open Graph description must match the page meta description');
  }
  if (!twitterTitle || decodeEntities(twitterTitle.content || '').trim() !== title) {
    fail(rule.file + ': Twitter title must match the page title');
  }
  if (!twitterDescription || decodeEntities(twitterDescription.content || '').trim() !== description) {
    fail(rule.file + ': Twitter description must match the page meta description');
  }

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) fail(`${rule.file}: expected exactly one h1, found ${h1Count}`);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const mainText = mainMatch ? stripMarkup(mainMatch[1]) : '';
  const wordCount = mainText ? mainText.split(/\s+/).length : 0;
  if (wordCount < rule.minWords) fail(`${rule.file}: main content is too thin (${wordCount} words; minimum ${rule.minWords})`);

  const ogImage = readMeta(html, /<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i);
  const twitterImage = readMeta(html, /<meta\b[^>]*\bname=["']twitter:image["'][^>]*>/i);
  const ogAlt = readMeta(html, /<meta\b[^>]*\bproperty=["']og:image:alt["'][^>]*>/i);
  const twitterAlt = readMeta(html, /<meta\b[^>]*\bname=["']twitter:image:alt["'][^>]*>/i);
  if (!ogImage || !ogImage.content) fail(`${rule.file}: missing Open Graph image`);
  else if (/^https?:\/\//i.test(ogImage.content)) fail(`${rule.file}: OG image must use a local asset until the canonical host is approved`);
  else localFile(ogImage.content, rule.file, 'Open Graph image');
  if (!ogAlt || !ogAlt.content.trim()) fail(`${rule.file}: missing Open Graph image alt text`);
  if (!twitterImage || !twitterImage.content) fail(`${rule.file}: missing explicit Twitter image`);
  else if (!ogImage || twitterImage.content !== ogImage.content) fail(`${rule.file}: Twitter image must match the Open Graph image`);
  else if (/^https?:\/\//i.test(twitterImage.content)) fail(`${rule.file}: Twitter image must stay local until canonical host approval`);
  else localFile(twitterImage.content, rule.file, 'Twitter image');
  if (!twitterAlt || !twitterAlt.content.trim()) fail(`${rule.file}: missing Twitter image alt text`);
  else if (!ogAlt || decodeEntities(twitterAlt.content).trim() !== decodeEntities(ogAlt.content).trim()) {
    fail(`${rule.file}: Twitter image alt text must match Open Graph image alt text`);
  }

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
      const imageBuffer = fs.readFileSync(resolved);
      const dimensions = imageDimensions(imageBuffer);
      if (!dimensions) fail(`${rule.file}: image format/dimensions could not be verified: ${src}`);
      else if (Number(attr.width) !== dimensions.width || Number(attr.height) !== dimensions.height) {
        fail(`${rule.file}: declared image geometry ${attr.width}×${attr.height} does not match ${dimensions.width}×${dimensions.height}: ${src}`);
      }
      if (src === 'assets/images/dining/rooftop-candlelit-table.jpg') {
        if (fs.statSync(resolved).size > 100 * 1024) fail('dining.html: candlelit-table image exceeds the 100 KiB supporting-image budget');
        if (jpegHasExifOrXmp(imageBuffer)) fail('dining.html: candlelit-table image must not contain EXIF/XMP metadata');
      }
      if (src === 'assets/images/directions/haveli-facade.webp') {
        if (fs.statSync(resolved).size > 600 * 1024) fail('directions.html: facade image exceeds the 600 KiB supporting-image budget');
        const chunks = webpChunkIds(imageBuffer);
        if (!chunks.length) fail('directions.html: facade WebP chunk structure could not be verified');
        if (chunks.some((id) => ['ICCP', 'EXIF', 'XMP '].includes(id))) {
          fail('directions.html: facade WebP must not retain ICCP/EXIF/XMP metadata chunks');
        }
        if (webpHasMetadataFlags(imageBuffer)) fail('directions.html: facade WebP must clear ICCP/EXIF/XMP feature flags');
      }
    }
  }

  if (rule.file === 'index.html') {
    const planningSection = html.match(/<section id="plan-stay"[\s\S]*?<\/section>/i);
    if (!planningSection) {
      fail('index.html: missing the primary guest-planning section');
    } else {
      const planning = planningSection[0];
      if (!/aria-labelledby="planning-title"/i.test(planning)
          || !/<h2 id="planning-title">Choose what you need to plan first\.<\/h2>/i.test(planning)) {
        fail('index.html: planning section needs a clear, programmatically associated heading');
      }
      if (!/class="home-plan-paths" aria-label="Planning routes"/i.test(planning)) {
        fail('index.html: guest-planning links need a named navigation group');
      }
      const cards = [...planning.matchAll(/<a class="home-plan-path" href="([^"]+)">([\s\S]*?)<\/a>/g)];
      const expected = [
        { href: 'rooms.html', title: 'Compare the rooms' },
        { href: 'experiences.html', title: 'Choose your experience' },
        { href: 'dining.html', title: 'Plan a rooftop meal' },
        { href: 'directions.html', title: 'Know the final walk' },
      ];
      if (cards.length !== expected.length) {
        fail('index.html: expected four distinct guest-planning paths, found ' + cards.length);
      }
      for (const route of expected) {
        const card = cards.find((candidate) => candidate[1] === route.href);
        if (!card) {
          fail('index.html: missing planning path to ' + route.href);
          continue;
        }
        if (!stripMarkup(card[2]).toLocaleLowerCase().includes(route.title.toLocaleLowerCase())) {
          fail('index.html: planning path has unclear or missing label for ' + route.href);
        }
      }
      if (/data-booking-form|name="arrival"|name="departure"/i.test(planning)) {
        fail('index.html: unverified booking form must not occupy the primary planning panel');
      }
      if (!/Book Now opens the external booking provider/i.test(planning)
          || !/WhatsApp drafts for you to review and send yourself/i.test(planning)
          || !/does not store your travel details/i.test(planning)) {
        fail('index.html: booking provider, manual WhatsApp draft and no-storage boundaries must be explicit');
      }
      if (!/vehicles cannot reach the hotel door/i.test(planning)) {
        fail('index.html: planning panel must set expectations about fort vehicle access');
      }
    }

    const hero = html.match(/<section class="hero"[\s\S]*?<\/section>/i);
    if (!hero || !/src="assets\/images\/rest3\.jpg"/i.test(hero[0])
        || !/alt="Golden sandstone rooftop terrace overlooking Jaisalmer at dusk"/i.test(hero[0])) {
      fail('index.html: homepage hero must keep its locally hosted, accurately described rooftop image');
    }
    if (!/<meta property="og:image" content="assets\/images\/rest3\.jpg">/i.test(html)
        || !/<meta property="og:image:alt" content="Rooftop terrace overlooking Jaisalmer at dusk">/i.test(html)) {
      fail('index.html: Open Graph image and alt text must stay aligned with the reviewed homepage hero');
    }

    const finalCta = html.match(/<section class="final-cta"[\s\S]*?<\/section>/i);
    if (!finalCta || !/class="home-final-actions"/i.test(finalCta[0])
        || !/data-booking-link/.test(finalCta[0])
        || !/Book Now/.test(finalCta[0])
        || !/does not itself confirm room availability or a reservation/i.test(finalCta[0])) {
      fail('index.html: closing CTA must offer a clear booking route and explain that the external flow does not confirm a reservation');
    }
    if (!/The setting is special\.<br><em>The details matter\.<\/em>/.test(html)
        || !/Vehicles cannot reach the hotel door/i.test(html)
        || !/Seven named rooms/i.test(html)) {
      fail('index.html: fact-led fort-arrival/room editorial content is missing');
    }
    if (/Travel is at its best when you feel part of a place/i.test(html)) {
      fail('index.html: remove generic quote-style filler in favour of useful property-specific content');
    }
    if (html.indexOf('aria-labelledby="home-next-steps"') > html.indexOf('class="final-cta"')) {
      fail('index.html: final CTA must be the final homepage content section, after planning links');
    }

    const css = fs.readFileSync(path.join(ROOT, 'assets/site.css'), 'utf8');
    if (!css.includes('.home-plan-paths')
        || !css.includes('.home-plan-path:focus-visible')
        || !/@media\s*\(\s*max-width:\s*760px\s*\)[\s\S]*?\.home-plan-paths/.test(css)
        || !/prefers-reduced-motion:\s*reduce/.test(css)) {
      fail('index.html: planning paths need responsive, keyboard-visible and reduced-motion styling');
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
      if (room.name === 'Sweet Purple Room'
          && (!/type="image\/webp"\s+srcset="assets\/images\/rooms\/sweet-purple\.webp"/.test(card)
            || !/src="assets\/images\/rooms\/sweet-purple\.jpg"/.test(card))) {
        fail('rooms.html: Sweet Purple must provide a source-backed WebP with the existing JPEG fallback');
      }
      if (room.name === 'Green Room'
          && (!/src="assets\/images\/rooms\/green\.jpg"[^>]*width="900"\s+height="600"/.test(card)
            || !/green curtains beside a bright window/i.test(card))) {
        fail('rooms.html: Green Room must use the source-verified smaller asset and matching alt text');
      }
      if (room.name === 'Green Room' && /width="2000"\s+height="1333"/.test(card)) {
        fail('rooms.html: stale oversized Green Room geometry remains');
      }
      for (const feature of room.features) {
        if (!card.includes('>' + feature + '</li>')) fail('rooms.html: ' + room.name + ' is missing source-listed feature: ' + feature);
      }
      if (!/width="\d+"\s+height="\d+"/.test(card)) fail('rooms.html: ' + room.name + ' image lacks explicit geometry');

      const expectedFloor = ['Sweet Purple Room', 'Rising Sun Room', 'Scarlet Room'].includes(room.name) ? 'ground' : 'first';
      const roomFloor = card.match(/data-room-floor="([^"]+)"/);
      const roomFeatureData = card.match(/data-room-features="([^"]+)"/);
      const visibleFeatureList = card.match(/<ul class="room-feature-list">([\s\S]*?)<\/ul>/);
      if (!roomFloor || roomFloor[1] !== expectedFloor) {
        fail('rooms.html: ' + room.name + ' filter floor must match the owner-maintained catalogue');
      }
      if (!roomFeatureData || !visibleFeatureList) {
        fail('rooms.html: ' + room.name + ' needs filter metadata and a visible source-listed feature list');
      } else {
        const declaredFeatures = roomFeatureData[1].split(/\s+/).sort();
        const visibleFeatures = [...visibleFeatureList[1].matchAll(/<li>([^<]+)<\/li>/g)]
          .map((match) => stripMarkup(match[1]).toLocaleLowerCase().replace(/\s+/g, '-')).sort();
        if (JSON.stringify(declaredFeatures) !== JSON.stringify(visibleFeatures)) {
          fail('rooms.html: ' + room.name + ' filter features must exactly match the visible source-listed feature chips');
        }
      }
    }
    const finder = html.match(/<section class="room-finder"[^>]*>[\s\S]*?<\/section>/i);
    if (!finder || !/data-room-finder hidden/.test(finder[0])
        || !/data-room-floor-filter/.test(finder[0])
        || !/data-room-feature-filter/.test(finder[0])
        || !/data-room-finder-status/.test(finder[0])
        || !/data-room-finder-empty hidden/.test(finder[0])
        || !/href="#room-planning">Ask about room fit/.test(finder[0])
        || !/data-room-reset/.test(finder[0])) {
      fail('rooms.html: room finder must include progressive enhancement, floor/feature controls, live results and a reset/no-results path');
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
      const hasCarousel = /data-experience-carousel/.test(card);
      const carouselImages = [...card.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((image) => image[1]);
      if (!hasCarousel
          || (card.match(/data-carousel-slide/g) || []).length !== 2
          || !/data-carousel-previous/.test(card)
          || !/data-carousel-next/.test(card)
          || !/data-carousel-status/.test(card)
          || !/aria-roledescription="carousel"/.test(card)) {
        fail('experiences.html: ' + option.title + ' must provide an accessible two-photo next/previous gallery');
      }
      if (carouselImages.length !== 2 || new Set(carouselImages).size !== 2) {
        fail('experiences.html: ' + option.title + ' must use two distinct local photos');
      }
      if (carouselImages.some((image) => image.startsWith('http:') || image.startsWith('https:') || image.startsWith('//'))) {
        fail('experiences.html: carousel photos must be locally hosted for ' + option.title);
      }
      if (!/loading="lazy"/.test(card) || !/decoding="async"/.test(card)) {
        fail('experiences.html: every tour photo must be lazy-loaded and asynchronously decoded: ' + option.title);
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

  if (rule.file === 'dining.html') {
    if (!html.includes('src="assets/images/dining/rooftop-candlelit-table.jpg"')) {
      fail('dining.html: candlelight section and Open Graph metadata must use the reviewed night-time table image');
    }
    if (!html.includes('<meta property="og:image" content="assets/images/dining/rooftop-candlelit-table.jpg"><meta property="og:image:alt" content="Candlelit rooftop table with patterned cushions and the illuminated Jaisalmer skyline beyond">')) {
      fail('dining.html: Open Graph image and alt text must match the reviewed night-time table image');
    }
    if (!/not confirmation that a candlelit setup is available for your date/i.test(html)) {
      fail('dining.html: candlelight image must not imply date-specific setup availability');
    }
    if (!html.includes('href="https://maps.app.goo.gl/28gGJ6tX8xoanQ9D8"')) {
      fail('dining.html: missing the owner-confirmed Garh Jaisal Kitchen map destination');
    }
    if (/our team can guide you/i.test(html)) {
      fail('dining.html: arrival or luggage help must not be presented as guaranteed');
    }
    if (!/message or call the hotel using the contact links below to confirm the current approach/i.test(html)) {
      fail('dining.html: arrival guidance should use the centralized contact paths without promising assistance');
    }
    if (!html.includes('Current menu items and prices are not displayed because the source menu record is still marked as awaiting owner confirmation.')) {
      fail('dining.html: unconfirmed legacy menu data must not be published as current prices');
    }
    if (!html.includes('https://www.instagram.com/garhjaisal/')) {
      fail('dining.html: owner-confirmed restaurant Instagram profile is missing');
    }
    if (!html.includes('src="assets/images/dining/rooftop-candlelit-table.jpg"')
        || !html.includes('<div class="story-grid">')
        || !html.includes('src="assets/images/gallery/hotel/fort-from-roof.webp"')) {
      fail('dining.html: editorial page must show distinct local rooftop-table and fort-view photographs');
    }
    if (!/does not publish dishes or prices as current/i.test(html)) {
      fail('dining.html: the unapproved menu must remain clearly unpublished');
    }
    if (!html.includes('Open in Google Maps')) {
      fail('dining.html: source-confirmed restaurant map destination must remain discoverable');
    }
  }

  if (rule.file === 'gallery.html') {
    const catalogue = [
      { slug: 'sweet-purple', title: 'Sweet Purple Room', id: 'room-sweet-purple', image: 'assets/images/rooms/sweet-purple.jpg' },
      { slug: 'rising-sun', title: 'Rising Sun Room', id: 'room-rising-sun', image: 'assets/images/rooms/rising-sun.jpg' },
      { slug: 'scarlet', title: 'Scarlet Room', id: 'room-scarlet', image: 'assets/images/scarlet.jpg' },
      { slug: 'opium', title: 'Opium Room', id: 'room-opium', image: 'assets/images/rooms/opium.jpg' },
      { slug: 'red-maharani', title: 'Red Maharani Room', id: 'room-red-maharani', image: 'assets/images/rooms/red-maharani.jpg' },
      { slug: 'green', title: 'Green Room', id: 'room-green', image: 'assets/images/rooms/green.jpg' },
      { slug: 'bluesky', title: 'BlueSky Room', id: 'room-bluesky', image: 'assets/images/rooms/bluesky.jpg' },
    ];
    const cards = [...html.matchAll(/<article class="room-gallery-card" data-room-gallery="([^"]+)"[\s\S]*?<\/article>/g)];
    if (cards.length !== catalogue.length) fail('gallery.html: expected seven named-room gallery cards, found ' + cards.length);
    for (const room of catalogue) {
      const match = cards.find((candidate) => candidate[1] === room.slug);
      if (!match) { fail('gallery.html: missing named-room gallery card: ' + room.title); continue; }
      const card = match[0];
      if (!card.includes('<h3>' + room.title + '</h3>')) fail('gallery.html: incorrect heading for ' + room.title);
      if (!card.includes('src="' + room.image + '"')) fail('gallery.html: incorrect image map for ' + room.title);
      if (room.slug === 'sweet-purple'
          && (!/type="image\/webp"\s+srcset="assets\/images\/rooms\/sweet-purple\.webp"/.test(card)
            || !/src="assets\/images\/rooms\/sweet-purple\.jpg"/.test(card))) {
        fail('gallery.html: Sweet Purple card must include source-backed WebP and JPEG fallback');
      }
      if (room.slug === 'green'
          && (!/src="assets\/images\/rooms\/green\.jpg"[^>]*width="900"\s+height="600"/.test(card)
            || !/green curtains beside a bright window/i.test(card))) {
        fail('gallery.html: Green Room must use the source-verified smaller image and matching alt text');
      }
      if (!card.includes('href="rooms.html#' + room.id + '"')) fail('gallery.html: room gallery must link to matching detail for ' + room.title);
      if (!/loading="lazy"/.test(card) || !/decoding="async"/.test(card)) fail('gallery.html: named-room image should be lazy-loaded: ' + room.title);
    }
    if (/assets\/images\/legacy\/room-(?:purple|carved)\.jpg/.test(html)) fail('gallery.html: ambiguous legacy bedroom captions remain after named-room curation');
    if (!/not a live room inventory/i.test(html)) fail('gallery.html: gallery must distinguish room photos from live availability');
    if (!/data-booking-link/.test(html) || !/data-enquiry-link/.test(html)) fail('gallery.html: room gallery must expose direct booking and a room-specific enquiry path');
  }

  if (rule.file === 'about.html') {
    if (!html.includes('src="assets/images/gallery/hotel/fort-from-roof.webp"')
        || !html.includes('<meta property="og:image" content="assets/images/gallery/hotel/fort-from-roof.webp">')
        || !html.includes('<meta property="og:image:alt" content="Carved sandstone rooftop terrace looking across Jaisalmer Fort and the surrounding city at dusk">')) {
      fail('about.html: hero and social preview must use the same authentic fort photograph and descriptive alt text');
    }
    const finalCta = html.match(/<section class="final-cta"[\s\S]*?<\/section>/i);
    if (!finalCta || html.indexOf('aria-labelledby="about-next-title"') > html.indexOf('class="final-cta"')) {
      fail('about.html: practical planning links must precede the final conversion CTA');
    }
    if (!/Cars cannot reach the door/i.test(html) || !/not live inventory/i.test(html)) {
      fail('about.html: story page must explain the arrival constraint and distinguish photographs from inventory');
    }
    if (/Today, we welcome guests who arrive curious about Rajasthan/i.test(html)) {
      fail('about.html: replace generic welcome filler with source-specific guest information');
    }
  }

  if (rule.file === 'directions.html') {
    const arrivalVisual = html.match(/<section class="section wrap arrival-visual"[^>]*>[\s\S]*?<\/section>/i);
    if (!arrivalVisual) {
      fail('directions.html: missing the accessible facade reference section');
    } else {
      if (!arrivalVisual[0].includes('src="assets/images/directions/haveli-facade.webp"')) {
        fail('directions.html: facade reference must use the reviewed local asset');
      }
      if (!/not as a guaranteed pickup point or route marker/i.test(arrivalVisual[0])) {
        fail('directions.html: facade photo must not imply a guaranteed pickup point or route');
      }
      if (!/confirm the current meeting point/i.test(arrivalVisual[0])) {
        fail('directions.html: facade reference must remind guests to confirm the current meeting point');
      }
    }
    if (html.includes('We’ll help you plan the final stretch.')) {
      fail('directions.html: do not promise help through unverified contact endpoints');
    }
    if (!/WhatsApp or phone link shown on this page to confirm the current meeting point/i.test(html)) {
      fail('directions.html: final arrival assistance must point to an available enquiry path and require date-specific confirmation');
    }
    if (!/Ask about arrival on WhatsApp/i.test(html) || !/data-contact-phone/.test(html) || !/data-contact-email/.test(html)) {
      fail('directions.html: arrival guidance must expose WhatsApp, telephone and email through centralized contact configuration');
    }
    if (!/SUV and sedan arrangements across Rajasthan and Delhi/i.test(html)) {
      fail('directions.html: source transport context and date-specific availability caveat are missing');
    }
    if (!/class="[^"]*\barrival-overview\b/.test(html)
        || !/The final stretch<br><em>is on foot\.<\/em>/.test(html)
        || !/arrival-overview__facts/.test(html)
        || !/Open the map/.test(html)) {
      fail('directions.html: arrival page must lead with the actual final-walk constraint and a scannable arrival summary');
    }
    if (/Contact options on this page remain unavailable until verified/i.test(html)) {
      fail('directions.html: wording must not contradict the source-authorized central contact configuration');
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

const sharedCss = fs.readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');
if (!/\.primary-nav \.nav-about-group>a\{[^}]*color:#4a4f49/.test(sharedCss)) {
  fail('site.css: About navigation link must have readable dark text on the light header');
}
if (!/\.primary-nav \.nav-dropdown summary\{[^}]*color:#4a4f49/.test(sharedCss)) {
  fail('site.css: dropdown toggle must have readable dark text on the light header');
}
if (!/\.primary-nav \.nav-dropdown__menu a\{[^}]*color:var\(--cream\)/.test(sharedCss)) {
  fail('site.css: dropdown menu items must retain readable light text on the dark panel');
}

if (errors.length) {
  console.error(`FAIL: content/UX regression gate found ${errors.length} issue(s)`);
  for (const message of errors) console.error(` - ${message}`);
  process.exit(1);
}

console.log(`PASS: content/UX regression gate audited ${PAGE_RULES.length} pages for depth, unique metadata, internal discovery, room-reference cards, experience comparisons, dining/arrival image context and metadata budgets, local image paths/alt/geometry, duplicate images and canonical publication gates.`);
