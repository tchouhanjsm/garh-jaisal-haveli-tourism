#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const directions = fs.readFileSync(path.join(ROOT, 'directions.html'), 'utf8');
const about = fs.readFileSync(path.join(ROOT, 'about.html'), 'utf8');
const stylesheet = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'arrival-wayfinding.css'), 'utf8');
const premiumStylesheet = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'premium-guest-journey.css'), 'utf8');
const siteRuntime = fs.readFileSync(path.join(ROOT, 'assets', 'site.js'), 'utf8');

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
assert.match(directions, /data-arrival-distance-comparison[^>]*aria-label="Approximate walking distances"/,
  'Walking estimates must be grouped as one named comparison');
assert.match(directions, /data-arrival-distance-comparison[^>]*role="group"/,
  'The named comparison must use a semantic group role for its accessible name');
assert.match(directions, /data-arrival-distance="fort-parking"[\s\S]*?data-arrival-distance="fort-entrance"/,
  'The two pedestrian estimates must appear in a deliberate, ordered comparison');
assert.match(directions, /data-arrival-access/,
  'Vehicle access caveats must remain distinct from the measured walking estimates');
assert.match(stylesheet, /\.arrival-distance-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  'The two walking estimates must share a paired responsive comparison layout');
assert.match(stylesheet, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.arrival-distance-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/,
  'The two walking estimates must stack at readable full width on narrow mobile screens');
assert.match(stylesheet, /\.arrival-distance-card:nth-child\(2\)\s*\{\s*padding-inline-start:\s*0;\s*border-inline-start:\s*0;/,
  'The stacked mobile estimate must not retain a desktop inset divider');
assert.match(stylesheet, /\.arrival-distance-card--access\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
  'Date-dependent vehicle access must occupy a separate full-width band');

const distanceArticles = [...directions.matchAll(/<article\b[^>]*class="arrival-distance-card"[^>]*>[\s\S]*?<\/article>/g)]
  .map(([article]) => article);
const parking = distanceArticles[0] || '';
const entrance = distanceArticles[1] || '';
const rickshaw = directions.match(/<article\b[^>]*class="arrival-distance-card arrival-distance-card--access"[^>]*>[\s\S]*?<\/article>/)?.[0] || '';

assert.match(parking, /Fort Parking[\s\S]*?300 metres[\s\S]*?5–6 minutes/i,
  'Fort Parking estimate must match the source-listed approximate 300 m / 5–6 minute walk');
assert.match(entrance, /fort entrance[\s\S]*?200 metres[\s\S]*?3–4 minutes on foot/i,
  'Fort entrance guidance must preserve the source-listed approximate 200 m / 3–4 minute walk');
const arrivalFactPages = [
  'index.html',
  'rooms.html',
  'experiences.html',
  'experience-details.html',
  'dining.html',
  'about.html',
  'directions.html',
  'gallery.html',
];
for (const file of arrivalFactPages) {
  const html = file === 'directions.html' ? directions
    : file === 'about.html' ? about
      : fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(html, /300 metres/i, file + ' must retain the source-listed Fort Parking distance');
  assert.match(html, /5[–-]6 minutes/i, file + ' must retain the source-listed Fort Parking walking time');
  assert.match(html, /200 metres/i, file + ' must retain the source-listed fort-entrance distance');
  assert.match(html, /3[–-]4 minutes/i, file + ' must retain the source-listed fort-entrance walking time');
}
assert.match(about, /From Fort Parking, allow about 300 metres \(around 5–6 minutes on foot\)/,
  'About page must preserve the source-backed Fort Parking estimate');
assert.match(about, /confirm your meeting point and current access before travelling/i,
  'About page must direct guests to confirm the current meeting point and access');
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
assert.match(directions, /class="page-hero arrival-hero(?:\s|")/,
  'Directions should use the arrival-specific photo hero treatment');
assert.equal(count(directions, /data-arrival-quick-card/g), 1,
  'Directions must prioritize a single quick-arrival summary card in the hero');
assert.match(directions, /class="arrival-quick-card"[^>]*aria-labelledby="arrival-overview-title"/,
  'The quick-arrival card must have a stable accessible heading relationship');
assert.match(directions, /id="arrival-overview-title"/,
  'Quick-directions navigation must land on the hero arrival summary');
assert.match(directions, /300 metres[\s\S]*?5–6 minutes/,
  'The hero summary must surface the approximate source-listed parking-walk estimate');
assert.match(directions, /not live navigation/i,
  'The hero summary must not imply live route measurements');
assert.match(directions, /alt="Golden sandstone passages reflect the character of the historic fort"/,
  'The hero photograph must have descriptive non-generic alternative text');
assert.match(directions, /<section class="section wrap arrival-visual"[^>]*>[\s\S]*?not as a guaranteed pickup point or route marker/i,
  'The facade photograph must have its own accessible reference section and clear caveat');
assert.match(directions, /WhatsApp or phone link shown on this page to confirm the current meeting point/i,
  'Arrival help must point guests to centralized contact routes and date-specific confirmation');
assert.match(directions, /Ask about arrival on WhatsApp/i,
  'Directions must expose a contextual WhatsApp enquiry action');

assert.match(directions, /<nav class="arrival-section-nav wrap" aria-label="Directions page sections">/,
  'Directions must expose a named, keyboard-accessible section navigation');
for (const [label, target] of [
  ['Quick directions', 'arrival-overview-title'],
  ['Travel options', 'travel-options-title'],
  ['Walking &amp; mobility', 'walking-access-title'],
  ['Map &amp; navigation', 'arrival-map-title'],
  ['Plan arrival', 'arrival-enquiry-title'],
  ['FAQs', 'arrival-faq-title'],
]) {
  assert.ok(directions.includes('href="#' + target + '">' + label + '</a>'),
    'Directions section navigation must target the visible ' + target + ' heading');
  assert.equal(count(directions, new RegExp('id="' + target + '"', 'g')), 1,
    target + ' must exist exactly once');
}
assert.match(siteRuntime, /function initArrivalSectionNavigation\(\)/,
  'Directions section navigation must progressively enhance its active section state');
assert.match(siteRuntime, /setAttribute\('aria-current', 'location'\)/,
  'the active Directions section link must expose aria-current=location');
assert.match(siteRuntime, /const revealCurrentLink = link =>/,
  'the active mobile section link must be revealed when it moves outside the horizontal rail');
assert.match(siteRuntime, /items\[0\]\.link === link[\s\S]*?sectionNav\.scrollTo\(\{ left: 0, behavior: 'auto' \}\)/,
  'returning to Quick directions must reset the mobile section rail without an in-flight animation');
assert.match(directions, /<h2 class="display-title" id="arrival-enquiry-title" tabindex="-1">/,
  'the arrival-enquiry heading must be programmatically focusable without entering the normal tab order');
assert.match(siteRuntime, /const targetId = window\.location\.hash === '#arrival-enquiry-title'[\s\S]*?document\.getElementById\(targetId\)/,
  'the Plan arrival fragment must focus its actual heading rather than the surrounding section');
assert.match(siteRuntime, /item\.target\.id === 'arrival-enquiry-title'[\s\S]*?requestAnimationFrame\(focusArrivalPlannerFromFragment\)/,
  'clicking Plan arrival must schedule focus after native fragment navigation updates the URL');
assert.match(stylesheet, /#arrival-enquiry-title:focus-visible[\s\S]*?outline: 3px solid var\(--focus-ring/,
  'the programmatically focused arrival heading must retain a visible keyboard focus indicator');
assert.match(siteRuntime, /sectionNav\.scrollTo\(\{ left: nextLeft, behavior: reduceMotion \? 'auto' : 'smooth' \}\)/,
  'section-link auto-reveal must respect reduced-motion preferences');
assert.match(siteRuntime, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/,
  'section-link auto-reveal must detect reduced-motion preferences');
assert.match(siteRuntime, /sectionNav\.scrollWidth <= sectionNav\.clientWidth/,
  'section-link auto-reveal must avoid unnecessary scrolling when the rail fits');
assert.match(siteRuntime, /addEventListener\('scroll', scheduleUpdate, \{ passive: true \}\)/,
  'section state must follow scroll position without blocking scrolling');
assert.match(siteRuntime, /let currentTop = Number\.NEGATIVE_INFINITY/,
  'active-section selection must track the nearest heading above the reading line, independent of navigation order');
assert.match(siteRuntime, /targetTop <= activationLine && targetTop > currentTop/,
  'active-section selection must use heading geometry rather than navigation link order');
assert.match(siteRuntime, /Math\.max\(168, sectionNav\.getBoundingClientRect\(\)\.bottom \+ 32\)/,
  'the active-section reading line must remain below the sticky rail and align with heading scroll margins');
assert.ok(stylesheet.includes('#arrival-overview-title,\n#travel-options-title,\n#walking-access-title,\n#arrival-map-title,\n#arrival-enquiry-title,\n#arrival-faq-title {\n  scroll-margin-top: 50px;\n}'),
  'desktop and tablet headings must add only the clearance needed beyond global scroll padding');
const mobileOffsetRule = stylesheet.indexOf('scroll-margin-top: 78px;');
assert.ok(mobileOffsetRule > stylesheet.lastIndexOf('@media (max-width: 760px)'),
  'mobile headings must account for the smaller global scroll padding while clearing the sticky rail');
assert.ok(stylesheet.slice(stylesheet.lastIndexOf('@media (max-width: 760px)')).includes('#arrival-enquiry-title'),
  'the arrival-enquiry heading must clear the sticky rail at mobile widths');
assert.match(siteRuntime, /addEventListener\('hashchange', scheduleUpdate\)/,
  'deep-link changes must refresh the active section state');
assert.match(siteRuntime, /addEventListener\('pageshow', scheduleUpdate\)/,
  'browser scroll restoration must refresh the active section state');
assert.match(stylesheet, /\.arrival-section-nav a\[aria-current="location"\]/,
  'the current section link must have a visible visual state');
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
assert.match(map, /not as a turn-by-turn route/i,
  'Map panel must not imply that the map pin supplies live final-walk navigation');

const orientation = map.match(/<aside class="arrival-map__orientation"[\s\S]*?<\/aside>/)?.[0] || '';
assert.equal(count(orientation, /class="arrival-map__route-stop"/g), 3,
  'Map orientation must show a complete three-step arrival sequence');
assert.match(orientation, /Confirm your vehicle stop[\s\S]*?Continue on foot[\s\S]*?Reach Garh Jaisal Haveli/,
  'The orientation graphic must present a truthful, ordered arrival sequence');
assert.match(orientation, /~300 m[\s\S]*?From Fort Parking[\s\S]*?5–6 minutes on foot/,
  'The orientation card must preserve the source-listed estimate only for the parking approach');
assert.match(orientation, /not a scaled map or turn-by-turn route/i,
  'The orientation graphic must not be mistaken for a measured route map');
assert.match(stylesheet, /\.arrival-map__route-stop:not\(\:last-child\)::after/,
  'The orientation diagram must connect its numbered steps visually');
assert.match(directions, /class="arrival-next-step__panel"/,
  'Directions must end with one concise, contextual arrival CTA');
assert.match(directions, /href="#arrival-planning"[^>]*>Prepare arrival enquiry/,
  'The terminal CTA must lead back to the dedicated arrival planner');
assert.doesNotMatch(directions, /data-stay-planner|assets\/stay-planner\.js|assets\/css\/stay-planner\.css/,
  'Directions must not duplicate the dedicated arrival form with the generic stay enquiry builder');
assert.match(directions, /data-arrival-planning-form/,
  'Directions must retain its purpose-built arrival enquiry form');

assert.match(stylesheet, /\.arrival-section-nav[\s\S]*?overflow-x:\s*auto/,
  'Section navigation must remain usable on narrow screens without forcing page overflow');
assert.match(stylesheet, /\.arrival-travel__grid[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/,
  'Travel choices must form a deliberate three-column desktop grid');
assert.match(directions, /<section id="travel-options" class="section wrap arrival-travel"/,
  'Directions travel options must own a page-specific layout rather than inherit the unrelated two-column transport component');
assert.match(stylesheet, /\.arrival-travel\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  'Directions travel section must use a single-column section shell');
assert.match(stylesheet, /\.arrival-travel__intro\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, \.9fr\) minmax\(0, 1\.1fr\)/,
  'Directions travel heading and explanatory copy must form a deliberate editorial split on wide screens');
assert.match(stylesheet, /\.arrival-travel__actions\s*\{[\s\S]*?background:\s*transparent/,
  'Directions travel actions must not inherit the generic boxed side-panel treatment');
assert.match(stylesheet, /\.arrival-map__layout[\s\S]*?grid-template-columns/,
  'Map and orientation content must have a responsive layout');
assert.match(siteRuntime, /function updateMobileBookingBar\(\)/,
  'Shared runtime must suppress the fixed mobile booking action when it covers the arrival hero card');
assert.match(siteRuntime, /is-suppressed-by-arrival-card/,
  'Mobile booking suppression must use an explicit, page-scoped state');
assert.match(premiumStylesheet,
  /\.mobile-booking-bar\.is-suppressed-by-arrival-card\s*,\s*\.mobile-booking-bar\.is-suppressed-by-guest-journey\s*\{\s*display:\s*none\s*!important/s,
  'Shared premium CSS must hide the fixed booking action while it overlaps either protected in-flow decision surface');
assert.doesNotMatch(stylesheet, /\.mobile-booking-bar\.is-suppressed-by-arrival-card/,
  'Directions-specific CSS must not own shared fixed-action suppression presentation');

console.log('PASS: source-backed distances, accessible Directions navigation, qualified travel options, mobility safeguards and exact-pin orientation are present.');
