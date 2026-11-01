#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rooms = fs.readFileSync(path.join(ROOT, 'rooms.html'), 'utf8');
const gallery = fs.readFileSync(path.join(ROOT, 'gallery.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'room-catalogue-composition.css'), 'utf8');
const quality = fs.readFileSync(path.join(ROOT, 'scripts', 'check-pr-quality.sh'), 'utf8');

const roomCards = [...rooms.matchAll(/<article class="room-card room-card--named"[\s\S]*?<\/article>/g)];
const galleryRoomCards = [...gallery.matchAll(/<article class="room-gallery-card" data-room-gallery="([^"]+)"[^>]*>[\s\S]*?<\/article>/g)];

assert.equal(roomCards.length, 7, 'the Rooms catalogue must retain all seven source-listed records');
assert.ok(roomCards[6][0].includes('id="room-bluesky"'), 'BlueSky remains the seventh Rooms catalogue record');
assert.match(roomCards[6][0], /data-room-card-composition="feature"/,
  'the seventh Rooms record must own the editorial feature treatment');
assert.equal((rooms.match(/data-room-card-composition="feature"/g) || []).length, 1,
  'the Rooms catalogue must have exactly one featured final record');

assert.equal(galleryRoomCards.length, 7, 'Gallery must retain exactly seven named-room links');
assert.equal(galleryRoomCards[6][1], 'bluesky', 'BlueSky remains the final named-room Gallery entry');
assert.match(galleryRoomCards[6][0], /data-room-card-composition="feature"/,
  'the final named-room Gallery entry must use the editorial feature treatment');
assert.equal((gallery.match(/data-room-card-composition="feature"/g) || []).length, 1,
  'Gallery named-room feature ownership must be unique');

const mainGalleryStart = gallery.indexOf('<div class="gallery-grid">');
const mainGalleryEnd = gallery.indexOf('</div><div class="gallery-note">', mainGalleryStart);
assert.ok(mainGalleryStart >= 0 && mainGalleryEnd > mainGalleryStart,
  'the primary seven-photo Gallery collection must remain a distinct section from the supplemental strip');
const mainGallery = gallery.slice(mainGalleryStart, mainGalleryEnd);
const photoCards = [...mainGallery.matchAll(/<figure class="gallery-card"[^>]*>/g)];
assert.equal(photoCards.length, 7, 'the primary Gallery photo collection must retain seven subjects');
assert.match(photoCards[6][0], /data-gallery-composition="feature"/,
  'the seventh primary Gallery subject must own the editorial feature treatment');
assert.equal((mainGallery.match(/data-gallery-composition="feature"/g) || []).length, 1,
  'the primary Gallery collection must have exactly one editorial closure');
assert.match(mainGallery, /assets\/images\/legacy\/fort-temple-spires\.jpg/,
  'the final Gallery subject must retain its source-listed photograph');
assert.match(mainGallery, /alt="Carved sandstone temple spires rising above Jaisalmer"/,
  'the final Gallery subject alt text must remain intact');

const supplementalStart = gallery.indexOf('<div class="gallery-grid gallery-grid--source">');
assert.ok(supplementalStart > mainGalleryEnd, 'the supplemental Gallery source strip must remain separate');
assert.doesNotMatch(gallery.slice(supplementalStart), /data-gallery-composition="feature"/,
  'the supplemental source-photo strip must not inherit the primary collection feature style');

for (const page of [rooms, gallery]) {
  assert.match(page, /<link rel="stylesheet" href="assets\/css\/room-catalogue-composition\.css">/,
    'both collection pages must load the shared composition layer');
  assert.ok(page.indexOf('assets/css/premium-guest-journey.css') < page.indexOf('assets/css/room-catalogue-composition.css'),
    'the collection composition layer must load after the shared premium layer');
}

assert.ok(css.includes('.room-card-grid--catalog [data-room-card-composition="feature"] {'));
assert.ok(css.includes('.gallery-grid:not(.gallery-grid--source) [data-gallery-composition="feature"] {'));
assert.ok(css.includes('.room-gallery-grid [data-room-card-composition="feature"] {'));
assert.equal((css.match(/grid-column: 1 \/ -1;/g) || []).length, 3,
  'each final collection card must span the complete parent grid row');
assert.ok(css.includes('@media (max-width: 760px)'), 'room and primary photo features must stack on mobile');
assert.ok(css.includes('@media (max-width: 600px)'), 'the named-room Gallery feature must stack at its actual breakpoint');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'feature imagery must respect reduced-motion preference');
assert.match(quality, /node scripts\/test-collection-composition\.js/);

console.log('PASS: seven-item room and photo collections close with a measured editorial feature; catalogue order, room identity, image mapping and mobile stacking remain source-backed.');
