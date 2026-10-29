#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const directions = fs.readFileSync(path.join(ROOT, 'directions.html'), 'utf8');
const stylesheet = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'arrival-wayfinding.css'), 'utf8');

const publicPages = [
  'index.html',
  'rooms.html',
  'experiences.html',
  'experience-details.html',
  'dining.html',
  'about.html',
  'gallery.html',
];

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

assert.match(directions, /assets\/css\/arrival-wayfinding\.css/,
  'Directions must load its page-scoped responsive arrival styles');
assert.match(directions, /id="arrival-walk-distances"[\s\S]*?aria-labelledby="arrival-walk-distances-title"/,
  'Directions needs one named arrival distance section');
assert.match(directions, /id="arrival-walk-distances-title"/,
  'Context links must target a real visible section heading');
assert.equal(count(directions, /class="arrival-distance-card(?: arrival-distance-card--access)?"/g), 3,
  'Directions must show exactly three arrival fact cards');

const parking = directions.match(/<article class="arrival-distance-card">[\s\S]*?<\/article>/)?.[0] || '';
const entrance = directions.match(/<article class="arrival-distance-card">[\s\S]*?<\/article>/g)?.[1] || '';
const rickshaw = directions.match(/<article class="arrival-distance-card arrival-distance-card--access">[\s\S]*?<\/article>/)?.[0] || '';

assert.match(parking, /Fort Parking[\s\S]*?300 metres[\s\S]*?5–6 minutes/i,
  'Fort Parking estimate must match the source-listed approximate 300 m / 5–6 minute walk');
assert.match(entrance, /fort entrance[\s\S]*?200 metres[\s\S]*?3–4 minutes/i,
  'Fort entrance distance must match the source-listed approximate 200 m; the separate 3–4 minute planning estimate remains provisional and requires owner confirmation');
assert.match(rickshaw, /Rickshaw access rules and drop-off points can vary/i,
  'Rickshaw access must direct guests to confirm current local rules');
assert.doesNotMatch(directions, /8:00 AM|Outside those times/i,
  'Unconfirmed time-specific rickshaw hours must not be published');
assert.match(rickshaw, /access rules and drop-off points can vary/i,
  'Local vehicle access must remain explicitly date-dependent');
assert.match(directions, /approximate figures from the owner-maintained legacy arrival page/i,
  'The page must distinguish catalogue source guidance from live route measurements');
assert.match(directions, /Vehicles cannot reach the hotel door/i,
  'The non-vehicle access limitation must remain clear');
assert.doesNotMatch(directions, /guaranteed luggage assistance|guaranteed meet-and-assist|live walking directions/i,
  'Arrival guidance must not promise assistance or imply live routing');

for (const file of publicPages) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(html, /href="directions\.html#arrival-walk-distances-title"/,
    file + ' must link guests directly to the practical arrival facts');
}
assert.match(stylesheet, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
  'Arrival cards should align as a three-column desktop decision aid');
assert.match(stylesheet, /@media \(max-width: 900px\)/,
  'Arrival cards must adapt at tablet widths');
assert.match(stylesheet, /@media \(max-width: 620px\)/,
  'Arrival cards must stack on narrow phones');
assert.match(stylesheet, /minmax\(0, 1fr\)/,
  'Responsive grid tracks must be allowed to shrink without forced overflow');


/* Directions M2: section navigation, arrival options and accessibility safeguards. */
assert.match(directions, /<nav class="arrival-section-nav wrap" aria-label="Directions page sections">/,
  'Directions must expose a named, keyboard-accessible section navigation');
for (const [label, target] of [
  ['Quick directions', 'arrival-overview-title'],
  ['Travel options', 'travel-options-title'],
  ['Walking &amp; mobility', 'walking-access-title'],
  ['Map &amp; navigation', 'arrival-map-title'],
  ['FAQs', 'arrival-faq-title'],
]) {
  assert.ok(directions.includes('href="#' + target + '">' + label + '</a>'),
    'Directions section navigation must target the visible ' + target + ' heading');
  assert.equal(count(directions, new RegExp('id="' + target + '"', 'g')), 1,
    target + ' must exist exactly once');
}
const travel = directions.match(/<section id="travel-options"[\s\S]*?<\/section>/)?.[0] || '';
assert.equal(count(travel, /class="arrival-travel-card"/g), 3,
  'Travel options must present three differentiated planning choices');
assert.match(travel, /SUV and sedan arrangements across Rajasthan and Delhi/,
  'Road-transport source context must remain qualified as a possible enquiry');
assert.match(travel, /no vehicle, driver, fare or availability is guaranteed/i,
  'Travel cards must not imply a confirmed transfer');
const mobility = directions.match(/<section id="walking-access"[\s\S]*?<\/section>/)?.[0] || '';
assert.equal(count(mobility, /class="arrival-step"/g), 4,
  'The arrival approach must be a four-step, scannable sequence');
assert.match(mobility, /cannot confirm step-free access or assistance/i,
  'Mobility content must not promise access or assistance');
const map = directions.match(/<section id="arrival-map"[\s\S]*?<\/section>/)?.[0] || '';
assert.match(map, /data-property-map-link/,
  'Map panel must use the centrally authorized exact hotel pin');
assert.match(map, /Kotari Para, inside Jaisalmer Fort/,
  'Map panel must provide a plain-text property address');
assert.match(map, /not as live walking directions/i,
  'Map panel must not imply that the map pin supplies live final-walk navigation');
assert.match(stylesheet, /\.arrival-section-nav[\s\S]*?overflow-x:\s*auto/,
  'Section navigation must remain usable on narrow screens without forcing page overflow');
assert.match(stylesheet, /\.arrival-travel__grid[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/,
  'Travel choices must form a deliberate three-column desktop grid');
assert.match(stylesheet, /\.arrival-map__layout[\s\S]*?grid-template-columns/,
  'Map and orientation content must have a responsive layout');

console.log('PASS: source-backed distances, accessible Directions navigation, qualified travel options, mobility safeguards and exact-pin orientation are present.');
