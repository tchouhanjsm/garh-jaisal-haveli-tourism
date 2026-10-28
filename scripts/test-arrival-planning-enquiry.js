#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const directions = fs.readFileSync(path.join(ROOT, 'directions.html'), 'utf8');
const siteJs = fs.readFileSync(path.join(ROOT, 'assets', 'site.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'arrival-wayfinding.css'), 'utf8');
const quality = fs.readFileSync(path.join(ROOT, 'scripts', 'check-pr-quality.sh'), 'utf8');

const formStart = directions.indexOf('<form class="arrival-enquiry-form" data-arrival-planning-form hidden>');
const formEnd = formStart < 0 ? -1 : directions.indexOf('</form>', formStart);
const form = formStart >= 0 && formEnd >= 0
  ? directions.slice(formStart, formEnd + '</form>'.length)
  : '';
assert.ok(form, 'Directions must include one progressively enhanced arrival enquiry form');

assert.match(directions, /<section id="arrival-planning" class="section wrap arrival-enquiry"/,
  'Directions must expose a stable fragment target for arrival planning');
assert.match(directions, /<section id="arrival-planning" class="section wrap arrival-enquiry"[^>]*tabindex="-1"/,
  'Arrival planner fragment target must be programmatically focusable');
assert.match(siteJs, /function focusArrivalPlannerFromFragment\(\)/,
  'Shared runtime must transfer focus when an arrival-planner fragment is opened');
assert.match(siteJs, /target\.focus\(\{ preventScroll: true \}\)/,
  'Fragment focus must be explicit rather than relying on pointer focus');
assert.match(css, /\.arrival-enquiry:focus-visible[\s\S]*?outline:\s*3px solid/,
  'Arrival planner must show a visible focus indicator');
for (const route of ['rooms.html', 'experiences.html', 'experience-details.html', 'dining.html', 'about.html', 'gallery.html']) {
  const html = fs.readFileSync(path.join(ROOT, route), 'utf8');
  const journey = html.match(/<section class="guest-journey" aria-label="Plan your stay">([\s\S]*?)<\/section>/);
  assert.ok(journey, route + ': shared guest journey must remain present');
  assert.match(journey ? journey[1] : '', /href="directions\.html#arrival-planning"/,
    route + ': Arrive step must go directly to the date-specific planner');
}
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const homePanel = home.match(/<section id="plan-stay"[^>]*>([\s\S]*?)<\/section>/);
assert.match(homePanel ? homePanel[1] : '', /href="directions\.html#arrival-planning"/,
  'Home Arrive decision must deep-link to the date-specific planner');
assert.match(directions, /data-arrival-enquiry-fallback/,
  'Visitors without JavaScript or authorized contact configuration must retain a static fallback');
assert.match(form, /type="date" name="arrival-date" required/,
  'Arrival enquiry must require a travel date');
assert.match(form, /name="arrival-window" maxlength="80"/,
  'Arrival window must be optional and bounded');
assert.match(form, /name="arrival-mode" required/,
  'Expected arrival approach must be explicit before a draft is prepared');
assert.match(form, /name="arrival-luggage"/,
  'Guests must be able to ask whether luggage help can be arranged');
assert.match(form, /name="arrival-access"/,
  'Guests must be able to request route/step information without submitting medical details');
assert.doesNotMatch(form, /name="(?:name|email|phone|mobile|notes|address|medical|disability)"/i,
  'Arrival enquiry must not collect personal contact details, open-ended notes or health details');
assert.match(form, /data-arrival-enquiry-status[^>]*role="status"[^>]*aria-live="polite"/,
  'Arrival status must be exposed as a polite live region');
assert.match(form, /data-arrival-enquiry-recovery hidden/,
  'Prepared message fallback must remain hidden before explicit submit');
assert.match(form, /data-arrival-enquiry-draft[^>]*readonly/,
  'Prepared message must be read-only');
assert.match(form, /data-arrival-enquiry-copy disabled/,
  'Copy must remain unavailable until a message exists');
assert.match(directions, /does not save your details, book a transfer or confirm a reservation/i,
  'The visible disclosure must distinguish enquiry from storage, transfer booking and reservation');
assert.match(directions, /Do not enter sensitive personal information/i,
  'The visible disclosure must discourage sensitive data entry');

const handlerStart = siteJs.indexOf('function configureArrivalPlanningForms(whatsappBaseUrl)');
const handlerEnd = siteJs.indexOf('async function configureContactChannels()', handlerStart);
const handler = handlerStart >= 0 && handlerEnd > handlerStart
  ? siteJs.slice(handlerStart, handlerEnd)
  : '';
assert.ok(handler, 'Shared site JavaScript must configure the arrival form through contact policy');
assert.match(siteJs, /const arrivalPlanningForms = Array\.from\(document\.querySelectorAll\('\[data-arrival-planning-form\]'\)\)/,
  'Shared contact loader must discover arrival planning forms');
assert.match(siteJs, /configureArrivalPlanningForms\(whatsappBaseUrl\)/,
  'Arrival form must use the validated centralized WhatsApp destination');
assert.match(handler, /travelDate\.min = today/,
  'Travel date minimum must be recalculated from local today');
assert.match(handler, /window\.open\(target, '_blank', 'noopener,noreferrer'\)/,
  'Only explicit submission may open a protected external WhatsApp draft');
assert.match(handler, /Please confirm the current vehicle drop-off or meeting point and the recommended walking route/,
  'Draft must request current meeting-point and route confirmation');
assert.match(handler, /luggage assistance can be arranged; I understand availability is not guaranteed/,
  'Draft must not guarantee luggage assistance');
assert.match(handler, /This is an enquiry only, not a transfer booking or reservation/,
  'Draft must explicitly remain an enquiry');
assert.match(handler, /recovery\.hidden = false/,
  'A copyable on-page fallback must appear after explicit submit');
assert.match(handler, /Arrival details changed\. Prepare a new draft before copying/,
  'Changing form inputs must invalidate a stale draft');
assert.doesNotMatch(handler, /localStorage|sessionStorage|fetch\(/,
  'Arrival form must not persist form details or introduce a separate data endpoint');
assert.match(handler, /form\.hidden = false/,
  'The interactive form must be revealed only after contact configuration is valid');
assert.match(handler, /form\.hidden = true/,
  'The interactive form must fail closed when contact configuration is unavailable');
assert.match(css, /\.arrival-enquiry-form\[hidden\][\s\S]*?display:\s*none/,
  'The interactive form must stay hidden without JavaScript');
assert.match(css, /@media \(max-width: 900px\)/,
  'Arrival enquiry layout must adapt at tablet widths');
assert.match(css, /@media \(max-width: 620px\)/,
  'Arrival enquiry fields must stack on narrow phones');
assert.match(css, /min-height:\s*44px/,
  'Arrival enquiry actions and checkbox labels must retain usable touch targets');
assert.match(quality, /node scripts\/test-arrival-planning-enquiry\.js/,
  'The arrival-planning contract must run in the main GitHub quality gate');

console.log('PASS: date-specific arrival enquiry contract, accessible fallback, contact gating, data minimization and non-persistent draft behavior.');
