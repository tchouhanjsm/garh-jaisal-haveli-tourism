#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = [
  'index.html',
  'rooms.html',
  'experiences.html',
  'experience-details.html',
  'dining.html',
  'about.html',
  'directions.html',
  'gallery.html',
];

function countMatches(value, expression) {
  return [...value.matchAll(expression)].length;
}

for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  assert.match(html, /<main\b[^>]*id="main"/, page + ': must expose one named main content landmark');
  assert.equal(countMatches(html, /<h1\b/g), 1, page + ': must have exactly one page-level H1');
  assert.match(html, /<nav\b[^>]*id="primary-navigation"/,
    page + ': must retain the shared primary navigation');
  assert.ok(countMatches(html, /data-booking-link/g) >= 1,
    page + ': must expose at least one booking action');
  assert.equal(countMatches(html, /id="contact-status"/g), 1,
    page + ': must retain one accessible contact fallback');

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const fragments = [...html.matchAll(/\bhref="#([^"]*)"/g)].map(match => match[1]).filter(Boolean);
  const broken = [...new Set(fragments.filter(fragment => !ids.has(decodeURIComponent(fragment))))];
  assert.deepEqual(broken, [], page + ': every authored same-page CTA fragment must resolve to a real target');
  assert.doesNotMatch(html, /<a\b[^>]*href="#"|<a\b[^>]*href="javascript:/i,
    page + ': anchors must not use inert or script pseudo-destinations');
}

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site-config.json'), 'utf8'));
assert.equal(config.verificationStatus, 'owner-authorized-source',
  'Booking destination must remain explicitly source-authorized, not presented as live-tested');
assert.equal(config.booking.status, 'source-authorized');
const booking = new URL(config.booking.legacyBookingEngineUrl);
assert.equal(booking.protocol, 'https:');
assert.equal(booking.hostname, 'asiatech.in');
assert.equal(booking.pathname, '/booking_engine/index3');
assert.ok(booking.searchParams.get('token'), 'Authorized booking destination must retain its source token');

console.log('PASS: eight-route guest journey retains one page-level H1, accessible landmarks, valid CTA fragments and a consistent source-authorized booking handoff.');
