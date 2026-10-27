'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'dining.html'), 'utf8');
const cssPath = path.join(ROOT, 'assets', 'css', 'dining-tabs.css');
const jsPath = path.join(ROOT, 'assets', 'dining-tabs.js');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

const tabs = [...html.matchAll(/<button\b(?=[^>]*\brole="tab")(?=[^>]*\bdata-restaurant-tab="([^"]+)")[^>]*>([\s\S]*?)<\/button>/g)];
const panels = [...html.matchAll(/<div\b(?=[^>]*\brole="tabpanel")(?=[^>]*\bdata-restaurant-panel="([^"]+)")[^>]*>/g)];
const expectedNames = ['overview', 'menu', 'table', 'directions'];
assert.deepEqual(tabs.map(match => match[1]), expectedNames, 'Dining exposes exactly four ordered restaurant tabs');
assert.deepEqual(panels.map(match => match[1]), expectedNames, 'Every restaurant tab has one corresponding panel');
assert.equal(new Set(tabs.map(match => match[1])).size, 4, 'Tab names are unique');
for (const [index, match] of tabs.entries()) {
  const panelId = 'restaurant-panel-' + match[1];
  const tabId = 'restaurant-tab-' + match[1];
  assert.match(match[0], new RegExp('id="' + tabId + '"'), match[1] + ' tab has a stable id');
  assert.match(match[0], new RegExp('aria-controls="' + panelId + '"'), match[1] + ' tab points at its panel');
  const panelTag = html.match(new RegExp('<div\\b(?=[^>]*id="' + panelId + '")[^>]*>'))?.[0] || '';
  assert.match(panelTag, new RegExp('aria-labelledby="' + tabId + '"'), match[1] + ' panel is labelled by its tab');
  assert.equal(/aria-selected="true"/.test(match[0]), index === 0, match[1] + ' selected state has a single initial default');
}

const formMatch = html.match(/<form\b(?=[^>]*data-restaurant-table-form)[^>]*>([\s\S]*?)<\/form>/);
assert.ok(formMatch, 'Dining includes a dedicated restaurant table-enquiry form');
const form = formMatch[1];
const fields = [
  ['name', 'text', 'restaurant-guest-name', true],
  ['email', 'email', 'restaurant-guest-email', false],
  ['mobile', 'tel', 'restaurant-guest-mobile', true],
  ['guests', 'number', 'restaurant-guest-count', true],
  ['date', 'date', 'restaurant-table-date', true],
  ['time', 'select', 'restaurant-table-time', true],
];
for (const [name, type, id, required] of fields) {
  assert.match(form, new RegExp('name="' + name + '"'), name + ' field is present');
  assert.match(form, new RegExp('id="' + id + '"'), name + ' field has a stable id');
  assert.match(form, new RegExp('<label[^>]*for="' + id + '"'), name + ' field has an explicit label');
  const tag = form.match(new RegExp('<input(?=[^>]*id="' + id + '")[^>]*>|<select(?=[^>]*id="' + id + '")[^>]*>'))?.[0] || '';
  assert.ok(tag, name + ' field has an input/select element');
  if (required) assert.match(tag, /required/, name + ' field is required');
  else assert.doesNotMatch(tag, /required/, name + ' field must remain optional');
  if (type === 'select') assert.match(tag, /^<select\b/, name + ' uses a native select control');
  else assert.match(tag, new RegExp('type="' + type + '"'), name + ' uses the correct native input type');
}
const timeSelect = form.match(/<select\b(?=[^>]*id="restaurant-table-time")[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
const slotEntries = [...timeSelect.matchAll(/<option\s+value="(\d{2}:\d{2})">([^<]+)<\/option>/g)].map(match => ({value:match[1],label:match[2]}));
const expectedSlots = [];
for (let minutes = 7 * 60; minutes <= 22 * 60 + 30; minutes += 30) {
  expectedSlots.push(String(Math.floor(minutes / 60)).padStart(2,'0') + ':' + String(minutes % 60).padStart(2,'0'));
}
assert.deepEqual(slotEntries.map(entry => entry.value), expectedSlots,
  'The 32 preferred slots run every 30 minutes from 07:00 to 22:30 inclusive');
assert.equal(new Set(slotEntries.map(entry => entry.value)).size, 32, 'Every preferred time slot is unique');
assert.equal(slotEntries[0].label, '7:00 AM', 'Opening preferred slot uses a readable 12-hour label');
assert.equal(slotEntries.at(-1).label, '10:30 PM', 'Final preferred slot uses a readable 12-hour label');
assert.match(form, /preferred enquiry times only, not verified restaurant opening hours/i,
  'Preferred slots must not be represented as verified service hours');
assert.match(js, /allowedSlot/, 'Runtime validates submitted time slots against allowed values');
assert.match(js, /minutes >= 7 \* 60 && minutes <= 22 \* 60 \+ 30/, 'Runtime bounds preferred time slots');
const guestTag = form.match(new RegExp('<input(?=[^>]*id="restaurant-guest-count")[^>]*>'))?.[0] || '';
assert.match(guestTag, /min="1"/, 'Party size has a lower bound');
assert.match(guestTag, /max="20"/, 'Party size uses the source form’s 20-guest input limit');
assert.match(guestTag, /value="2"/, 'Party size defaults to two but remains editable');
assert.match(form, /restaurant-guest-count-help/, 'Party-size guidance requires confirmation of capacity');
assert.equal((form.match(/name="guests"/g) || []).length, 1, 'Dining table form has exactly one party-size field');
assert.doesNotMatch(form, /guest-enquiry-|data-guest-enquiry/, 'Table form must not contain stay-enquiry fields');
assert.match(form, /data-restaurant-table-submit/, 'Table form includes its own submit control');
assert.match(form, /data-restaurant-table-status/, 'Table form includes its own status message');
assert.ok(js.includes("'Guests: ' + guests") && !js.includes('Guests: 2'),
  'Runtime must use the guest-selected party size rather than hard-code two guests');
assert.ok(js.includes("'Guests: ' + guests"), 'The draft must use the guest-selected party size');

assert.ok(html.includes('Current menu items and prices are not displayed because the source menu record is still marked as awaiting owner confirmation.'),
  'Unconfirmed menu values remain unpublished and the approval caveat remains explicit');
assert.match(html, /does not publish dishes or prices as current/i, 'No current dishes/prices are presented as confirmed');
assert.match(html, /not a reservation|not reserved until the restaurant replies and confirms/i,
  'The enquiry form states that it does not create a reservation');
assert.match(html, /No guest data is stored on this website/i, 'No backend persistence is promised');
assert.ok(html.includes('href="https://maps.app.goo.gl/28gGJ6tX8xoanQ9D8"'), 'Restaurant map destination is retained');
assert.ok(html.includes('https://www.instagram.com/garhjaisal/'), 'Owner-provided restaurant Instagram link is retained');
assert.ok(html.includes('src="assets/images/dining/rooftop-candlelit-table.jpg"'), 'The rooftop table image remains locally hosted');
assert.ok(html.includes('src="assets/images/gallery/hotel/fort-from-roof.webp"'), 'The separate fort view remains locally hosted');
assert.ok(html.includes('href="directions.html"'), 'The main Directions journey remains linked');
assert.ok(html.includes('assets/css/dining-tabs.css') && html.includes('assets/dining-tabs.js'),
  'Dining loads the tab/form assets');
assert.ok(css.includes('prefers-reduced-motion') && css.includes(':focus-visible'),
  'Tab/form styling respects reduced-motion and visible focus preferences');
assert.match(js, /ArrowRight/);
assert.match(js, /ArrowLeft/);
assert.match(js, /key === 'Home'/);
assert.match(js, /key === 'End'/);
assert.match(js, /dateField\.min = today/);
assert.match(js, /digits\.length < 8 \|\| digits\.length > 15/);
assert.match(js, /window\.open\(draftUrl, '_blank', 'noopener,noreferrer'\)/,
  'Only explicit form submission opens a draft, in a protected new tab');
assert.match(js, /loadApprovedContact\(\)/);
assert.match(js, /owner-authorized-source/);
assert.match(js, /owner-verified/);
assert.match(js, /not a reservation|not booked until|not reserved/i);
assert.doesNotMatch(js, /localStorage|sessionStorage|fetch\s*\([^)]*POST|method:\s*['"]POST['"]/i,
  'No guest data is persisted or POSTed to a new backend');
assert.doesNotMatch(js, /\+917727047567|77270\s*47567/,
  'The WhatsApp destination stays centralized in site-config.json');

console.log('PASS: Dining tabs, menu-approval guard, accessible date/time table enquiry, contact authorization, and no-reservation/no-storage safeguards.');
