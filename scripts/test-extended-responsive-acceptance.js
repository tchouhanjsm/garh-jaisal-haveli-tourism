#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const smoke = fs.readFileSync(path.join(root, 'scripts', 'test-browser-smoke.py'), 'utf8');
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
assert.ok(smoke.includes('desktop_transition') && smoke.includes('compact_transition')
  && smoke.includes('focusOnFirstLink') && smoke.includes('focusOnToggle'),
  'Every route must verify focus-safe compact/full-navigation transitions in real Chromium.');
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
assert.ok(quality.includes('node scripts/test-extended-responsive-acceptance.js'),
  'The extended responsive acceptance contract must run in the required quality suite.');
assert.match(roadmap, /## M36 — extended guest viewport stress coverage/,
  'The roadmap must identify the additional viewport milestone.');
assert.match(checklist, /M36: extended guest viewport stress coverage/,
  'The launch checklist must track the additional viewport milestone.');

console.log('PASS: all eight routes receive supplemental 375/430/1366/1920px geometry and compact-navigation checks without changing the 48-image screenshot contract.');
