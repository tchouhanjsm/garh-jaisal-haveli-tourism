#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/about-editorial.css'), 'utf8');
const text = html
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function requireMatch(pattern, message, source = html) {
  assert.match(source, pattern, message);
}

assert.equal((html.match(/<h1\b/gi) || []).length, 1, 'About page must have one H1');
assert.ok(text.split(/\s+/).length >= 480, 'About page must retain substantive useful copy');
requireMatch(/assets\/css\/about-editorial\.css/, 'About page must load its scoped editorial stylesheet');
requireMatch(/The fort is part of the stay/i, 'Hero should make the property setting clear', text);
requireMatch(/Cars cannot reach the door/i, 'Arrival constraint must be stated plainly', text);
requireMatch(/not live inventory/i, 'Room photos must not be mistaken for availability', text);
requireMatch(/seven named room pages/i, 'Room decision guidance must reflect the source catalogue', text);
requireMatch(/guide language, timing, inclusions and price/i, 'Experience details must remain date-confirmed', text);
requireMatch(/an enquiry is not a table reservation/i, 'Dining enquiry must not imply a reservation', text);
requireMatch(/not a confirmed reservation/i, 'Booking and WhatsApp handoffs must be explicit', text);
requireMatch(/data-booking-link/, 'External booking action must remain available');
requireMatch(/data-enquiry-link/, 'Guest-reviewed enquiry action must remain available');
requireMatch(/href="directions\.html"/, 'About page must link to arrival guidance');
requireMatch(/href="rooms\.html"/, 'About page must link to the room catalogue');
requireMatch(/href="experiences\.html"/, 'About page must link to experiences');
requireMatch(/href="dining\.html"/, 'About page must link to dining');
requireMatch(/<section class="section section--dark about-plan">[\s\S]*?<\/section>/, 'Four-step planning section must exist');
assert.equal((html.match(/class="about-plan__item"/g) || []).length, 4, 'Planning section must contain four distinct decisions');
requireMatch(/@media\(max-width:1000px\)/, 'Planning layout must adapt to tablet widths', css);
requireMatch(/@media\(max-width:600px\)/, 'Planning layout must adapt to narrow phones', css);
requireMatch(/border-right:0/, 'Mobile layout must remove desktop column dividers', css);
requireMatch(/og:description" content="A heritage stay inside Jaisalmer Fort\. Understand the lived-in setting, compare named rooms and plan the final walk before travelling\."/,
  'Open Graph description must remain source-specific');
requireMatch(/name="twitter:description" content="A heritage stay inside Jaisalmer Fort\. Understand the lived-in setting, compare named rooms and plan the final walk before travelling\."/,
  'Twitter description must match the page description');
assert.doesNotMatch(html, /₹\s?\d|available every day|guaranteed luggage assistance|confirmed room availability/i,
  'About page must not publish unapproved prices or service/availability guarantees');
assert.doesNotMatch(html, /Today, we welcome guests who arrive curious about Rajasthan/i,
  'Generic welcome filler must not return');

console.log('PASS: About page tells a source-backed fort story and guides guests through arrival, rooms, experiences and dining without unconfirmed claims.');
