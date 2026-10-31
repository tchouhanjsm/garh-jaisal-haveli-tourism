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
assert.equal(tabs[2][2].trim(), 'Ask about a table', 'The tab describes an enquiry rather than implying a reservation');
assert.match(html, /id="dining-table-title">Ask about a table<\/h3>/, 'The table panel heading describes an enquiry');
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
  ['guests', 'number', 'restaurant-guest-count', true, 'input'],
  ['date', 'date', 'restaurant-table-date', true, 'input'],
  ['time', 'text', 'restaurant-table-time', false, 'input'],
  ['note', null, 'restaurant-table-note', false, 'textarea'],
];
for (const [name, type, id, required, elementName] of fields) {
  assert.match(form, new RegExp('name="' + name + '"'), name + ' field is present');
  assert.match(form, new RegExp('id="' + id + '"'), name + ' field has a stable id');
  assert.match(form, new RegExp('<label[^>]*for="' + id + '"'), name + ' field has an explicit label');
  const tag = form.match(new RegExp('<' + elementName + '(?=[^>]*id="' + id + '")[^>]*>'))?.[0] || '';
  assert.ok(tag, name + ' field has an input/textarea element');
  if (required) assert.match(tag, /required/, name + ' field is required');
  else assert.doesNotMatch(tag, /required/, name + ' field must remain optional');
  if (type) assert.match(tag, new RegExp('type="' + type + '"'), name + ' uses the correct native input type');
}
assert.doesNotMatch(form, /name="(?:name|email|mobile)"/, 'The WhatsApp form must not collect redundant name, email or mobile fields');
const preferredTimeTag = form.match(new RegExp('<input(?=[^>]*id="restaurant-table-time")[^>]*>'))?.[0] || '';
assert.match(preferredTimeTag, /maxlength="40"/, 'Preferred time is bounded to 40 characters');
assert.match(form, /id="restaurant-table-time-help"/, 'Preferred-time guidance has a stable help id');
assert.match(form, /confirm current service hours and availability/i,
  'Preferred time is a request, not a promise about service hours');
assert.doesNotMatch(form, /<option[^>]*value="[0-9]{2}:[0-9]{2}"/,
  'No fixed restaurant time slots are published before owner confirmation');
const guestTag = form.match(new RegExp('<input(?=[^>]*id="restaurant-guest-count")[^>]*>'))?.[0] || '';
assert.match(guestTag, /min="1"/, 'Party size has a lower bound');
assert.match(guestTag, /step="1"/, 'Party size accepts whole-number requests');
assert.doesNotMatch(guestTag, /\bmax="/, 'No unconfirmed maximum party size is imposed');
assert.match(guestTag, /value="2"/, 'Party size defaults to two but remains editable');
assert.match(form, /restaurant-guest-count-help/, 'Party-size guidance requires confirmation of capacity');
assert.match(form, /maxlength="240"/, 'Optional note has a bounded length');
assert.match(form, /id="restaurant-table-note-help"/, 'Optional note has a stable help id');
assert.match(form, /aria-describedby="restaurant-table-note-help"/, 'Optional note help is associated for assistive technology');
assert.match(form, /Avoid payment details or sensitive personal information/i, 'Optional note warns against sensitive data');
assert.equal((form.match(/name="guests"/g) || []).length, 1, 'Dining table form has exactly one party-size field');
assert.doesNotMatch(form, /data-guest-enquiry|id="guest-enquiry-/, 'Table form must not contain stay-enquiry fields; shared recovery styling is allowed');
assert.match(form, /data-restaurant-table-submit/, 'Table form includes its own submit control');
assert.match(form, /data-restaurant-table-status/, 'Table form includes its own status message');
assert.match(form, /data-restaurant-table-recovery[^>]*hidden/, 'The fallback panel stays hidden until an explicit valid submit');
assert.match(form, /data-restaurant-table-draft/, 'The fallback exposes the prepared message');
assert.match(form, /readonly/, 'The prepared message is read-only');
assert.match(form, /data-restaurant-table-copy[^>]*disabled/, 'Copy remains disabled until a draft is prepared');
assert.ok(!js.includes('allowedSlot') && !js.includes('7 * 60') && !js.includes('22 * 60 + 30') && !js.includes('Guests: 2'),
  'Runtime must not invent restaurant hours or hard-code a party size');
assert.ok(js.includes("'Guests: ' + guests"), 'The draft must use the guest-selected party size');
assert.ok(js.includes("'Additional note: ' + note"), 'The draft includes only an optional guest-provided note');
assert.doesNotMatch(js, /nameField|emailField|mobileField|updateMobileConstraint/, 'The table enquiry must not collect or validate redundant personal contact fields');

assert.ok(html.includes('Current menu items and prices are not displayed because the source menu record is still marked as awaiting owner confirmation.'),
  'Unconfirmed menu values remain unpublished and the approval caveat remains explicit');
assert.match(html, /does not publish dishes or prices as current/i, 'No current dishes/prices are presented as confirmed');
assert.match(html, /not a reservation|not reserved until the restaurant replies and confirms/i,
  'The enquiry form states that it does not create a reservation');
assert.match(html, /Nothing is stored on this website/i, 'No backend persistence is promised');
assert.ok(html.includes('href="https://maps.app.goo.gl/28gGJ6tX8xoanQ9D8"'), 'Restaurant map destination is retained');
assert.ok(html.includes('https://www.instagram.com/garhjaisal/'), 'Owner-provided restaurant Instagram link is retained');
assert.ok(html.includes('src="assets/images/dining/rooftop-candlelit-table.jpg"'), 'The rooftop table image remains locally hosted');
assert.ok(html.includes('src="assets/images/gallery/hotel/fort-from-roof.jpg"'), 'The separate fort view retains its source-backed JPEG fallback');
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
assert.doesNotMatch(js, /digits\.length < 8 \|\| digits\.length > 15/, 'No mobile-number collection or validation remains');
assert.match(js, /window\.open\(draftUrl, '_blank', 'noopener,noreferrer'\)/,
  'Only explicit form submission opens a draft, in a protected new tab');
assert.match(js, /draftField\.value = message/, 'The exact message is exposed in the recovery panel');
assert.match(js, /recovery\.hidden = false/, 'The fallback appears only after a valid enquiry');
assert.match(js, /navigator\.clipboard\.writeText/, 'Copy uses the browser clipboard when permitted');
assert.match(js, /document\.execCommand\('copy'\)/, 'Clipboard failure has a selection-based recovery path');
assert.match(js, /Nothing was sent/, 'Recovery copy continues to state that nothing is sent automatically');
assert.match(js, /loadApprovedContact\(\)/);
assert.match(js, /owner-authorized-source/);
assert.match(js, /owner-verified/);
assert.match(js, /not a reservation|not booked until|not reserved/i);
assert.doesNotMatch(js, /localStorage|sessionStorage|fetch\s*\([^)]*POST|method:\s*['"]POST['"]/i,
  'No guest data is persisted or POSTed to a new backend');
assert.doesNotMatch(js, /\+917727047567|77270\s*47567/,
  'The WhatsApp destination stays centralized in site-config.json');

console.log('PASS: Dining tabs and menu guard; minimized table enquiry includes a copyable recovery draft, accessible preferences, authorized contact and no-reservation/no-storage safeguards.');
