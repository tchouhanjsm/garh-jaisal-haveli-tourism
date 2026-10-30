#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES = {
  'index.html': { planner: false, css: false, js: false },
  'rooms.html': { planner: true, css: true, js: true },
  'experiences.html': { planner: false, css: false, js: false },
  'experience-details.html': { planner: false, css: false, js: false },
  'dining.html': { planner: false, css: false, js: false },
  'about.html': { planner: true, css: true, js: true },
  'directions.html': { planner: false, css: false, js: false },
  'gallery.html': { planner: true, css: true, js: true },
};

function count(source, expression) { return [...source.matchAll(expression)].length; }
const pages = new Map(Object.entries(ROUTES).map(([route, policy]) => {
  const html = fs.readFileSync(path.join(ROOT, route), 'utf8');
  assert.equal(count(html, /<section class="stay-planner wrap" data-stay-planner\b/g), policy.planner ? 1 : 0,
    route + ': generic planner presence must match the conversion hierarchy');
  assert.equal(count(html, /assets\/css\/stay-planner\.css/g), policy.css ? 1 : 0,
    route + ': load planner styling only when the component exists');
  assert.equal(count(html, /assets\/stay-planner\.js/g), policy.js ? 1 : 0,
    route + ': load planner behavior only when the component exists');
  return [route, html];
}));

const home = pages.get('index.html');
assert.match(home, /<section id="plan-stay" class="booking-panel wrap home-plan-panel"/,
  'Home must retain its dedicated planning panel');
const homePlan = home.match(/<section id="plan-stay"[^>]*>([\s\S]*?)<\/section>/);
assert.ok(homePlan, 'Home planning panel must be present');
assert.equal(count(homePlan[1], /class="home-plan-path"/g), 4,
  'Home must expose one four-path Stay / Explore / Dine / Arrive decision surface');
assert.match(home, /<section class="final-cta"/,
  'Home must retain a clear terminal conversion action');

const rooms = pages.get('rooms.html');
assert.match(rooms, /data-room-finder/,
  'Rooms must retain the room finder alongside its general stay planner');
for (const route of ['experiences.html', 'experience-details.html']) {
  const html = pages.get(route);
  assert.equal(count(html, /data-guest-enquiry-form/g), 1,
    route + ': preserve exactly one purpose-built date/guest enquiry form');
  assert.match(html, /data-enquiry-message="[^"]*(?:route|inclusions|current price|total price)[^"]*"/i,
    route + ': ask the hotel to confirm live operational details');
  assert.doesNotMatch(html, /data-stay-planner/,
    route + ': avoid a second generic planner after the contextual experience enquiry');
}

const dining = pages.get('dining.html');
assert.equal(count(dining, /data-restaurant-table-form/g), 1,
  'Dining must have exactly one dedicated table-request form');
assert.equal(count(dining, /data-guest-enquiry-form/g), 1,
  'Dining must keep the separate stay/experience enquiry as a different intent');
assert.match(dining, /A request, not a reservation/,
  'Dining must set honest expectations before a guest starts a table request');
assert.match(dining, /Your table is not reserved until the restaurant replies and confirms it/,
  'Dining must not imply that form completion reserves a table');
assert.doesNotMatch(dining, /data-stay-planner/,
  'Dining should not repeat the multi-topic planner below its purpose-built forms');

const about = pages.get('about.html');
const gallery = pages.get('gallery.html');
assert.match(about, /data-stay-planner/,
  'About retains a general stay-planning option where no dedicated enquiry form exists');
assert.match(gallery, /data-stay-planner/,
  'Gallery retains a next step from visual inspiration to stay planning');

const directions = pages.get('directions.html');
assert.equal(count(directions, /data-arrival-planning-form/g), 1,
  'Directions must retain exactly one date-specific arrival enquiry');
assert.doesNotMatch(directions, /data-stay-planner/,
  'Directions must keep arrival-specific enquiry separate from the generic planner');

console.log('PASS: conversion hierarchy keeps purpose-built enquiry flows, avoids redundant planners and skips unused planner assets.');
