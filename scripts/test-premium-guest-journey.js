#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES = [
  { file: 'index.html', journey: false },
  { file: 'rooms.html', journey: true, current: 'rooms.html' },
  { file: 'experiences.html', journey: true, current: 'experiences.html' },
  { file: 'experience-details.html', journey: true },
  { file: 'dining.html', journey: true, current: 'dining.html' },
  { file: 'about.html', journey: true },
  { file: 'directions.html', journey: true, current: 'directions.html' },
  { file: 'gallery.html', journey: true },
];

const stylesheet = 'assets/css/premium-guest-journey.css';
const cssPath = path.join(ROOT, stylesheet);
const css = fs.readFileSync(cssPath, 'utf8');
assert.match(css, /--premium-ease:\s*cubic-bezier\(/, 'premium motion tokens must be centralized');
assert.match(css, /\.guest-journey__steps\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  'desktop journey needs four consistently aligned steps');
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.guest-journey__steps\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  'mobile journey must wrap to two columns');
assert.match(css, /\.guest-journey__step\[aria-current="page"\]/,
  'current route must receive a distinct but restrained state');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  'respect reduced-motion preferences');
assert.match(css, /\.guest-journey__step:focus-visible/,
  'journey links must expose keyboard focus styling');
assert.match(css, /\.room-card:hover[\s\S]*?transform:\s*translateY\(-3px\)/,
  'interactive catalogue cards must use a restrained hover affordance');
assert.match(css, /\.guest-enquiry-panel,[\s\S]*?\.guest-enquiry-recovery/,
  'enquiry panels must share the premium form surface treatment');

for (const route of ROUTES) {
  const html = fs.readFileSync(path.join(ROOT, route.file), 'utf8');
  assert.equal((html.match(/assets\/css\/premium-guest-journey\.css/g) || []).length, 1,
    route.file + ': the shared visual system must be loaded exactly once');
  const allStyles = [...html.matchAll(/<link\\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
  assert.ok(allStyles.length, route.file + ': expected linked stylesheets');
  assert.match(allStyles[allStyles.length - 1][0], /assets\\/css\\/premium-guest-journey\\.css/,
    route.file + ': premium visual layer must load after route-specific styles');

  if (!route.journey) continue;
  const journeyMatch = html.match(/<section class="guest-journey" aria-label="Plan your stay">([\s\S]*?)<\/section>/);
  assert.ok(journeyMatch, route.file + ': missing shared guest decision path');
  const journey = journeyMatch[1];
  assert.match(journey, /<nav aria-label="Stay planning steps">/,
    route.file + ': decision links must be grouped in a labelled navigation landmark');
  const links = [...journey.matchAll(/<a class="guest-journey__step" href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 4, route.file + ': journey must present four clear next steps');
  assert.deepEqual(links.map(m => m[1]), ['rooms.html', 'experiences.html', 'dining.html', 'directions.html'],
    route.file + ': the journey route order must stay predictable');
  for (const link of links) {
    assert.match(link[3], /<strong>/, route.file + ': every step needs a visible action label');
    assert.match(link[3], /<small>/, route.file + ': every step needs a supporting description');
    assert.doesNotMatch(link[1], /^(?:https?:|\/\/|javascript:|data:)/i,
      route.file + ': journey must use local site routes');
  }
  const currentLinks = links.filter(m => /\baria-current="page"/.test(m[2]));
  if (route.current) {
    assert.equal(currentLinks.length, 1, route.file + ': expected exactly one current journey step');
    assert.equal(currentLinks[0][1], route.current, route.file + ': current step does not match this route');
  } else {
    assert.equal(currentLinks.length, 0, route.file + ': parent-route link must not be mislabeled as current page');
  }
  assert.match(journey, /Plan the details that matter\./, route.file + ': missing clear guest-facing journey headline');
}

console.log('PASS: premium visual system is last-loaded across all eight core routes; seven inner routes expose a responsive, accessible four-step guest journey.');
