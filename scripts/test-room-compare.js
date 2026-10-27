#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'rooms.html'), 'utf8');
const script = fs.readFileSync(path.join(ROOT, 'assets', 'room-compare.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets', 'room-compare.css'), 'utf8');
const quality = fs.readFileSync(path.join(ROOT, 'scripts', 'check-pr-quality.sh'), 'utf8');

const expectedIds = [
  'room-sweet-purple', 'room-rising-sun', 'room-scarlet',
  'room-opium', 'room-red-maharani', 'room-green', 'room-bluesky',
];

assert.match(html, /<link rel="stylesheet" href="assets\/room-compare\.css">/,
  'the comparison stylesheet must be loaded only by the room catalogue');
assert.match(html, /<script src="assets\/room-compare\.js" defer><\/script>/,
  'the progressive comparison script must be loaded on the room catalogue');
assert.ok(
  html.indexOf('assets/room-finder.js') < html.indexOf('assets/room-compare.js')
    && html.indexOf('assets/room-compare.js') < html.indexOf('assets/site.js'),
  'room filtering and comparison must initialize before shared contact hydration');
assert.doesNotMatch(html, /data-room-compare-panel|data-room-compare-toggle/,
  'comparison controls must be created only after successful JavaScript initialization');

const cards = [...html.matchAll(/<article class="room-card room-card--named"[^>]*>[\s\S]*?<\/article>/g)];
assert.equal(cards.length, 7, 'the comparison must retain all seven source-listed room cards');
for (const id of expectedIds) {
  const card = cards.find(match => match[0].includes('id="' + id + '"'));
  assert.ok(card, 'missing source-listed room ' + id);
  assert.match(card[0], /<h3>/, id + ' must keep a visible room name');
  assert.match(card[0], /<ul class="room-feature-list">[\s\S]*?<\/ul>/,
    id + ' must retain the visible source-listed feature list');
  assert.match(card[0], /data-enquiry-link data-enquiry-message=/,
    id + ' must keep its centralized enquiry handoff');
}

assert.match(script, /const MAX_SELECTED = 3/,
  'the shortlist must cap comparison at three rooms');
assert.match(script, /aria-live/);
assert.match(script, /aria-pressed/);
assert.match(script, /row\\.dataset\\.roomCompareRow = key/);
assert.match(script, /scope', 'col'/);
assert.match(script, /scope', 'row'/);
assert.match(script, /data-room-compare-remove/);
assert.match(script, /data-room-compare-card-link/);
assert.match(script, /record\.imageSrc/);
assert.match(script, /record\.features/);
assert.match(script, /document\.createElement/);
assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|XMLHttpRequest|fetch\s*\(/,
  'comparison must use safe DOM construction and remain ephemeral with no network or storage');
assert.doesNotMatch(script, /wa\.me\/|asiatech|info@hotelgarhjaisal\.com|\+917727047567/,
  'comparison must not duplicate contact endpoints');

assert.match(css, /\.room-compare\[hidden\]/);
assert.match(css, /overflow-x:\s*auto/);
assert.match(css, /min-width:\s*700px/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.match(quality, /node scripts\/test-room-compare\.js/);

console.log('PASS: room comparison preserves all seven catalogue records, progressive enhancement, accessible side-by-side details, a three-room cap, safe DOM construction, no persistence/network calls and responsive keyboard-accessible scrolling.');
