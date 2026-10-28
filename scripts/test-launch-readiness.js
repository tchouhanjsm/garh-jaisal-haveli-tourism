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
const routeContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'staging-route-contract.json'), 'utf8'));
assert.equal(routeContract.schemaVersion, 1, 'Staging route contract schema must be supported');
const PAGE_NAMES = routeContract.routes.map(route => route.file);
assert.equal(PAGE_NAMES.length, 8, 'Launch wiring must cover all eight core public HTML routes');
assert.equal(new Set(PAGE_NAMES).size, PAGE_NAMES.length, 'Public route filenames must be unique');
assert.deepEqual(routeContract.viewports.map(viewport => viewport.width), [360, 768, 1440],
  'Staging visual evidence must cover mobile, tablet and desktop widths');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site-config.json'), 'utf8'));
const launchDoc = fs.readFileSync(path.join(ROOT, 'docs', 'LAUNCH-READINESS-CHECKLIST.md'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
const siteCss = fs.readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');

assert.equal(config.verificationStatus, 'owner-authorized-source',
  'Source-derived contact endpoints must be marked source-authorized, not live-tested');
assert.equal(config.contact.status, 'source-authorized');
assert.equal(config.booking.status, 'source-authorized');
assert.equal(config.site.canonicalHostApproved, false,
  'Metadata publication must not imply owner approval of the live host');
assert.equal(config.site.newStaticSiteCanonicalHost, 'https://hotelgarhjaisal.com');
assert.equal(config.site.canonicalPublicationMode, 'candidate-configured-owner-release-required');
assert.match(config.contact.whatsappBaseUrl || '', /^https:\/\/wa\.me\/\d{8,15}$/);
assert.match(config.contact.primaryPhoneE164 || '', /^\+[1-9]\d{7,14}$/);
assert.match(config.contact.alternatePhoneE164 || '', /^\+[1-9]\d{7,14}$/);
assert.match(config.contact.email || '', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
assert.equal(config.propertyNavigation.status, 'source-authorized',
  'The hotel map pin must be source-authorized, not live-tested');
const hotelMap = new URL(config.propertyNavigation.hotelMapUrl);
assert.equal(hotelMap.protocol, 'https:');
assert.equal(hotelMap.hostname, 'maps.app.goo.gl');
assert.match(hotelMap.pathname, /^\/[A-Za-z0-9_-]{6,}$/);
assert.equal(hotelMap.port, '');
assert.equal(hotelMap.search, '');
assert.equal(hotelMap.hash, '');


const booking = new URL(config.booking.legacyBookingEngineUrl);
assert.equal(booking.protocol, 'https:');
assert.equal(booking.hostname, 'asiatech.in');
assert.equal(booking.pathname, '/booking_engine/index3');
assert.ok(booking.searchParams.has('token'), 'Legacy booking endpoint must retain its provider query token');

for (const file of PAGE_NAMES) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.equal((html.match(/id="contact-status"/g) || []).length, 1, file + ': expected one accessible contact fallback');
  assert.ok(html.includes('data-property-map-link'), file + ': map links must hydrate from the central source config');
  assert.doesNotMatch(html, /https:\/\/maps\.google\.com\/\?q=Garh\+Jaisal\+Haveli\+Jaisalmer|https:\/\/maps\.app\.goo\.gl\/nAbRiZhv78FSbju48/i,
    file + ': map destinations must not be duplicated in public HTML');

  for (const marker of ['data-booking-link', 'data-enquiry-link', 'data-contact-phone', 'data-contact-alt-phone', 'data-contact-email']) {
    assert.ok(html.includes(marker), file + ': missing centralized channel marker ' + marker);
  }
  assert.doesNotMatch(html, /href="(?:tel:\+?\d+|mailto:[^"]+)|https:\/\/wa\.me\/\d{8,15}/i,
    file + ': direct contact endpoints must not be hard-coded into public HTML');
  const routes = {
    'index.html': '/', 'rooms.html': '/rooms.html', 'experiences.html': '/experiences.html',
    'experience-details.html': '/experience-details.html', 'dining.html': '/dining.html',
    'about.html': '/about.html', 'directions.html': '/directions.html', 'gallery.html': '/gallery.html'
  };
  const expectedUrl = 'https://hotelgarhjaisal.com' + routes[file];
  assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1, file + ': must have exactly one canonical');
  assert.ok(html.includes('<link rel="canonical" href="' + expectedUrl + '">'), file + ': canonical mismatch');
  assert.ok(html.includes('<meta property="og:url" content="' + expectedUrl + '">'), file + ': og:url mismatch');
  assert.match(html, /<meta property="og:image" content="https:\/\/hotelgarhjaisal\.com\/assets\//, file + ': OG image must use absolute canonical asset URL');
  assert.match(html, /<meta name="twitter:image" content="https:\/\/hotelgarhjaisal\.com\/assets\//, file + ': Twitter image must use absolute canonical asset URL');
}

const recoveryPage = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
assert.match(recoveryPage, /<meta name="robots" content="noindex,follow">/,
  '404 recovery page must remain out of search results while allowing recovery links to be followed');
assert.match(recoveryPage, /<h1\b/i, '404 recovery page must have a primary heading');
assert.doesNotMatch(recoveryPage, /<link\b[^>]*\brel=["']canonical["']|property=["']og:url["']/i,
  '404 recovery page stays canonical-free so it is not promoted as a public landing route');
assert.equal((recoveryPage.match(/id="contact-status"/g) || []).length, 1,
  '404 recovery page must provide one accessible contact fallback');
for (const route of ['index.html', 'rooms.html', 'experiences.html', 'dining.html', 'directions.html', 'gallery.html']) {
  assert.ok(recoveryPage.includes('href="/' + route + '"'), '404 recovery page must link to ' + route);
}
for (const marker of ['data-booking-link', 'data-enquiry-link', 'data-contact-phone', 'data-contact-alt-phone', 'data-contact-email']) {
  assert.ok(recoveryPage.includes(marker), '404 recovery page must use centralized channel marker ' + marker);
}
assert.doesNotMatch(recoveryPage, /href="(?:tel:\+?\d+|mailto:[^"]+)|https:\/\/wa\.me\/\d{8,15}/i,
  '404 recovery page must not hard-code contact endpoints');
assert.doesNotMatch(recoveryPage, /\sstyle=["']/i, '404 recovery page must use shared responsive CSS, not inline styles');
assert.match(recoveryPage, /<script src="\/assets\/site\.js" defer><\/script>/,
  '404 recovery page must hydrate centrally configured contact actions');
assert.match(recoveryPage, /<link rel="stylesheet" href="\/assets\/site\.css">/,
  '404 recovery stylesheet must resolve from the site root at arbitrary missing paths');
assert.match(siteCss, /\.not-found-page__routes[\s\S]*?@media\(max-width:600px\)/,
  '404 recovery routes must have a responsive mobile layout');
assert.match(siteCss, /\.not-found-page__route:focus-visible|a:focus-visible/,
  '404 recovery links must retain a visible keyboard focus indicator');

const dining = fs.readFileSync(path.join(ROOT, 'dining.html'), 'utf8');
assert.match(dining, /source menu record is still marked as awaiting owner confirmation/i,
  'Dining page must not imply that unconfirmed legacy menu items/prices are current');
for (const route of ['/', '/rooms.html', '/experiences.html', '/experience-details.html', '/dining.html', '/about.html', '/directions.html', '/gallery.html']) {
  assert.ok(sitemap.includes('<loc>https://hotelgarhjaisal.com' + route + '</loc>'), 'Missing core sitemap route ' + route);
}
assert.match(robots, /^User-agent:\s*\*\s*$/im);
assert.match(robots, /^Allow:\s*\/$/im);
assert.match(robots, /^Sitemap:\s*https:\/\/hotelgarhjaisal\.com\/sitemap\.xml$/im);
assert.match(fs.readFileSync(path.join(ROOT, 'robots-staging.txt'), 'utf8'), /^Disallow:\s*\/$/im);
assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'sitemap-empty.xml'), 'utf8'), /<loc>/i);
assert.match(fs.readFileSync(path.join(ROOT, '.htaccess'), 'utf8'), /X-Robots-Tag "noindex, nofollow" env=STAGING_HOST/);

assert.match(launchDoc, /MANUAL RELEASE GATES/i, 'Launch checklist must distinguish manual release gates');
assert.match(launchDoc, /HTTP 403/i, 'Launch checklist must record the external booking-provider probe result');
assert.match(launchDoc, /not proof that the hotel’s live phone is answered/i,
  'Launch checklist must state that live integrations are not automatically verified');
assert.match(siteCss, /a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible\{outline:3px solid/,
  'Keyboard focus must remain visible for links, buttons, inputs, selects and summaries');
assert.match(siteCss, /@media\(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{scroll-behavior:auto!important;animation-duration:\.01ms!important;animation-iteration-count:1!important;transition-duration:\.01ms!important\}\}/,
  'Reduced-motion preferences must disable smooth scrolling and reduce animation/transition duration');

const stagingRows = launchDoc.split(/\r?\n/).filter(line => /^\|\s*STG-\d{2}\b/.test(line));
assert.ok(stagingRows.length >= 17, 'Staging UAT must include the core journey and visual/keyboard/reduced-motion checks');
for (const id of ['STG-14', 'STG-15', 'STG-16', 'STG-17']) {
  assert.ok(stagingRows.some(line => line.startsWith('| ' + id)), 'Missing staging UAT row ' + id);
}
for (const row of stagingRows) {
  const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
  assert.equal(cells.length, 8, 'Each staging UAT row must include URL, date/time, operator, device, result, evidence and follow-up owner');
  const id = (cells[0].match(/^STG-\d{2}/) || [])[0] || 'unknown staging check';
  const [check, url, dateTime, operator, browser, result, evidence, followUpOwner] = cells;
  assert.match(result, /^(PASS|FAIL|BLOCKED|NOT RUN)$/, id + ' must use an allowed result');
  if (result !== 'NOT RUN') {
    for (const [field, value] of [['exact staging URL', url], ['date/time', dateTime], ['operator', operator], ['browser/device/viewport', browser], ['evidence/notes', evidence]]) {
      assert.ok(value, id + ' marked ' + result + ' must record ' + field);
    }
  }
  if (result === 'FAIL' || result === 'BLOCKED') assert.ok(followUpOwner, id + ' failures/blocks must identify a follow-up owner');
}

console.log('PASS: launch wiring, publication safeguards, keyboard/reduced-motion contracts and evidence-bearing staging UAT structure. MANUAL RELEASE GATES remain outstanding: real-browser booking, staffed contact channels, owner fact/menu approval, staging UAT and canonical-host approval.');
