#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rooms = fs.readFileSync(path.join(ROOT, 'rooms.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/homepage-room-discovery.css'), 'utf8');
const mediaManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/MEDIA-MIGRATION-MANIFEST.json'), 'utf8'));

const records = [
  {
    id: 'room-sweet-purple',
    name: 'Sweet Purple Room',
    image: 'assets/images/rooms/sweet-purple.webp',
    alt: 'Sweet Purple Room with a carved wooden bed, magenta curtains and a second bed',
    floor: 'Ground floor',
  },
  {
    id: 'room-rising-sun',
    name: 'Rising Sun Room',
    image: 'assets/images/rooms/rising-sun.jpg',
    alt: 'Rising Sun Room with a carved wooden bed, purple bedspread and blue-curtained window',
    floor: 'Ground floor',
  },
  {
    id: 'room-red-maharani',
    name: 'Red Maharani Room',
    image: 'assets/images/rooms/red-maharani.jpg',
    alt: 'Red Maharani Room with red textiles, a carved bed and a bright window seat',
    floor: 'First floor',
  },
];

const sectionMatch = home.match(/<section class="section section--rooms wrap home-room-discovery"[\s\S]*?<\/section>/);
assert.ok(sectionMatch, 'homepage must expose the dedicated catalogue-backed room discovery section');
const section = sectionMatch[0];

assert.match(home, /href="assets\/css\/homepage-room-discovery\.css"/,
  'homepage must load its scoped room discovery presentation layer');
assert.match(section, /Seven rooms\.<br><em>Each with a story\.<\/em>/,
  'the section must communicate the seven-room collection without implying all rooms are previewed');
assert.match(section, /Room photographs and catalogue details are references, not live inventory/,
  'the preview must clearly distinguish catalogue information from live availability');
assert.match(section, /Confirm the exact room, current amenities, occupancy and total rate for your dates/,
  'the preview must preserve the confirmation boundary for commercial room details');

const cardMatches = [...section.matchAll(/<a class="home-room-card"[\s\S]*?<\/a>/g)];
assert.equal(cardMatches.length, records.length, 'homepage must preview exactly the three selected catalogue rooms');

for (const record of records) {
  const card = cardMatches.map(match => match[0]).find(markup =>
    markup.includes('href="rooms.html#' + record.id + '"'));
  assert.ok(card, record.name + ' must link to its exact room-card anchor');
  assert.ok(card.includes('<h3>' + record.name + '</h3>'), record.name + ' title must match the catalogue');
  assert.ok(card.includes('src="' + record.image + '"'), record.name + ' must use its reviewed local image asset');
  assert.ok(card.includes('alt="' + record.alt + '"'), record.name + ' must have descriptive image alternative text');
  assert.ok(card.includes('<span class="home-room-card__floor">' + record.floor + '</span>'),
    record.name + ' floor label must match the room catalogue');
  assert.equal((card.match(/data-deferred-media/g) || []).length, 1,
    record.name + ' image payload must remain deferred');
  assert.equal((card.match(/<template data-deferred-picture-template>/g) || []).length, 1,
    record.name + ' must retain an inert image template');
  assert.equal((card.match(/<noscript data-deferred-picture-fallback>/g) || []).length, 1,
    record.name + ' must retain its no-JavaScript image fallback');
  assert.ok(fs.existsSync(path.join(ROOT, record.image)), record.name + ' local image asset must exist');
  const mediaEntry = mediaManifest.entries.find(entry => entry.targetPath === record.image);
  assert.ok(mediaEntry, record.name + ' image must have an exact curated source-manifest entry');
  assert.equal(mediaEntry.sourceBlobSha, mediaEntry.targetBlobSha,
    record.name + ' homepage image must retain verified source-byte provenance');
  assert.equal(mediaEntry.altText, record.alt,
    record.name + ' homepage alternative text must match the reviewed media manifest');
  assert.ok(mediaEntry.verificationPage === 'index.html' || mediaEntry.additionalVerificationPages?.includes('index.html'),
    record.name + ' media manifest must include the homepage in its page-specific verification set');

  const catalogueCard = rooms.match(new RegExp('<article class="room-card room-card--named"[^>]*id="' + record.id + '"[\\s\\S]*?<\\/article>'));
  assert.ok(catalogueCard, record.name + ' exact destination must exist in the seven-room catalogue');
}

assert.equal((section.match(/data-deferred-media/g) || []).length, 3,
  'the room preview must defer all three supporting photographs');
assert.match(css, /\.home-room-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  'desktop must compose the three room stories as an aligned editorial grid');
assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.home-room-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  'tablet layout must rebalance the room previews into two columns');
assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.home-room-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  'phone layout must keep each room preview readable in a single column');
assert.match(css, /\.home-room-card:focus-visible\s*\{[\s\S]*?outline:\s*var\(--focus-ring\)/,
  'room cards must remain keyboard-visible');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  'room image interaction must respect reduced-motion preferences');

console.log('PASS: homepage room discovery maps three deferred photo previews to exact source-catalogue records without implying live inventory.');
