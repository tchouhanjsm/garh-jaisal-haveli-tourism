#!/usr/bin/env node
'use strict';

/**
 * Automated launch-safety checks. These verify wiring and publication guards;
 * they cannot verify live third-party response or booking completion.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PAGE_NAMES = ['index.html', 'rooms.html', 'experiences.html', 'dining.html', 'about.html', 'directions.html', 'gallery.html'];
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site-config.json'), 'utf8'));
const launchDoc = fs.readFileSync(path.join(ROOT, 'docs', 'LAUNCH-READINESS-CHECKLIST.md'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');

assert.equal(config.verificationStatus, 'owner-authorized-source',
  'Source-derived contact endpoints must be marked source-authorized, not live-tested');
assert.equal(config.contact.status, 'source-authorized');
assert.equal(config.booking.status, 'source-authorized');
assert.equal(config.site.canonicalHostApproved, false,
  'Do not approve a canonical host as part of contact/content delivery');
assert.match(config.contact.whatsappBaseUrl || '', /^https:\/\/wa\.me\/\d{8,15}$/);
assert.match(config.contact.primaryPhoneE164 || '', /^\+[1-9]\d{7,14}$/);
assert.match(config.contact.alternatePhoneE164 || '', /^\+[1-9]\d{7,14}$/);
assert.match(config.contact.email || '', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);

const booking = new URL(config.booking.legacyBookingEngineUrl);
assert.equal(booking.protocol, 'https:');
assert.equal(booking.hostname, 'asiatech.in');
assert.equal(booking.pathname, '/booking_engine/index3');
assert.ok(booking.searchParams.has('token'), 'Legacy booking endpoint must retain its provider query token');

for (const file of PAGE_NAMES) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.equal((html.match(/id="contact-status"/g) || []).length, 1, file + ': expected one accessible contact fallback');
  for (const marker of ['data-booking-link', 'data-enquiry-link', 'data-contact-phone', 'data-contact-alt-phone', 'data-contact-email']) {
    assert.ok(html.includes(marker), file + ': missing centralized channel marker ' + marker);
  }
  assert.doesNotMatch(html, /href="(?:tel:\+?\d+|mailto:[^"]+)|https:\/\/wa\.me\/\d{8,15}/i,
    file + ': direct contact endpoints must not be hard-coded into public HTML');
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']canonical["']|property=["']og:url["']/i,
    file + ': canonical URL remains gated until owner host approval');
}

const dining = fs.readFileSync(path.join(ROOT, 'dining.html'), 'utf8');
assert.match(dining, /source menu record is still marked as awaiting owner confirmation/i,
  'Dining page must not imply that unconfirmed legacy menu items/prices are current');
assert.doesNotMatch(sitemap, /<loc>\s*https?:\/\//i, 'Sitemap must stay URL-empty before canonical host approval');
assert.doesNotMatch(robots, /^\s*Sitemap\s*:/im, 'Robots must not publish a sitemap URL before canonical host approval');

assert.match(launchDoc, /MANUAL RELEASE GATES/i, 'Launch checklist must distinguish manual release gates');
assert.match(launchDoc, /HTTP 403/i, 'Launch checklist must record the external booking-provider probe result');
assert.match(launchDoc, /not proof that the hotel’s live phone is answered/i,
  'Launch checklist must state that live integrations are not automatically verified');

console.log('PASS: launch wiring and publication safeguards. MANUAL RELEASE GATES remain outstanding: real-browser booking, staffed contact channels, owner fact/menu approval, staging UAT and canonical-host approval.');
