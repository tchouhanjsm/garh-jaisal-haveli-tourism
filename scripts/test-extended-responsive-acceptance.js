#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const smoke = fs.readFileSync(path.join(root, 'scripts', 'test-browser-smoke.py'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'assets', 'site.js'), 'utf8');
const premiumCss = fs.readFileSync(path.join(root, 'assets', 'css', 'premium-guest-journey.css'), 'utf8');
const quality = fs.readFileSync(path.join(root, 'scripts', 'check-pr-quality.sh'), 'utf8');
const roadmap = fs.readFileSync(path.join(root, 'docs', 'PREMIUM-VISUAL-CONVERSION-ROADMAP.md'), 'utf8');
const checklist = fs.readFileSync(path.join(root, 'docs', 'LAUNCH-READINESS-CHECKLIST.md'), 'utf8');

const required = [
  [375, 812, 'common mobile'],
  [430, 932, 'large mobile'],
  [1366, 768, 'laptop'],
  [1920, 1080, 'large desktop'],
];

for (const [width, height, label] of required) {
  const expected = '(' + width + ', ' + height + ', "' + label + '")';
  assert.ok(smoke.includes(expected), 'The extended browser matrix must include ' + label + ' at ' + width + '×' + height + '.');
}
assert.match(smoke, /def check_extended_guest_viewports\(page, page_name: str\)/,
  'The Chromium runner must implement the extended viewport geometry/navigation pass.');
assert.match(smoke, /check_extended_guest_viewports\(page, page_name\)/,
  'The extended viewport pass must run on every core route.');
assert.ok(smoke.includes('tablet_transition') && smoke.includes('desktop_transition') && smoke.includes('compact_transition')
  && smoke.includes('focusOnFirstLink') && smoke.includes('focusOnToggle')
  && smoke.includes('{"width": 768') && smoke.includes('{"width": 821'),
  'Every route must verify focus-safe tablet, desktop and compact navigation transitions in real Chromium.');
assert.match(runtime, /const compactNavigation = window\.innerWidth <= 820;/,
  'The runtime compact-navigation threshold must match the tablet masthead CSS breakpoint.');
assert.ok(runtime.includes('let lastFocusedNavigationControl = null;')
  && runtime.includes("document.addEventListener('focusin'")
  && runtime.includes('lastFocusedNavigationControl === menuToggle')
  && runtime.includes('nav.contains(lastFocusedNavigationControl)'),
  'The runtime must preserve focus when CSS hides the previously focused navigation control.');
assert.match(premiumCss, /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*820px\)/,
  'The tablet compact-navigation CSS boundary must remain explicit and covered.');
assert.match(smoke, /finally:\s+page\.set_viewport_size\(original_viewport\)/,
  'The supplementary viewport pass must restore the original viewport even after an assertion.');
assert.ok(smoke.includes('journeyOverlap')
  && smoke.includes('arrivalOverlap')
  && smoke.includes('expectedJourneySuppression')
  && smoke.includes('is-suppressed-by-guest-journey')
  && smoke.includes('is-suppressed-by-arrival-card')
  && smoke.includes('ariaHidden')
  && smoke.includes('inert'),
  'Supplemental mobile viewports must verify fixed booking CTA obstruction and keyboard-access parity.');
assert.ok(smoke.includes('(375, 812), (390, 844), (430, 932)'),
  'Arrival enquiry form geometry must include both supplemental mobile widths.');

const firstViewRouteLabels = [
  ['index.html', 'Home'],
  ['rooms.html', 'Rooms'],
  ['experiences.html', 'Experiences'],
  ['experience-details.html', 'Experience details'],
  ['dining.html', 'Dining'],
  ['about.html', 'About'],
  ['directions.html', 'Directions'],
  ['gallery.html', 'Gallery'],
];
for (const [route, label] of firstViewRouteLabels) {
  const gate = '"' + route + '": {"max_requested": 1, "max_offscreen": 0, "label": "' + label + '"}';
  assert.ok(smoke.includes(gate),
    route + ': packaged first-view audit must allow only its hero and zero offscreen requests.');
}
assert.match(smoke, /if gate:\s+if requested_count > gate\["max_requested"\]/,
  'The one-hero/zero-offscreen contract must apply to every route and viewport, not only 768px.');
assert.doesNotMatch(smoke, /if gate and viewport_width == 768/,
  'First-view image budgets must not be restricted to a single breakpoint.');
assert.match(smoke, /\("dining\.html", 1\)[\s\S]*\("about\.html", 1\)/,
  'Dining and About no-JavaScript media fallbacks must be decoded by Chromium.');
assert.ok(quality.includes('node scripts/test-extended-responsive-acceptance.js'),
  'The extended responsive acceptance contract must run in the required quality suite.');
assert.match(roadmap, /## M36 — extended guest viewport stress coverage/,
  'The roadmap must identify the additional viewport milestone.');
assert.match(checklist, /M36: extended guest viewport stress coverage/,
  'The launch checklist must track the additional viewport milestone.');

console.log('PASS: all eight routes receive supplemental 375/430/1366/1920px geometry and compact-navigation checks without changing the 48-image screenshot contract.');
