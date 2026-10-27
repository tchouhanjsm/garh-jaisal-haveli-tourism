#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'rooms.html'), 'utf8');
const script = fs.readFileSync(path.join(ROOT, 'assets', 'room-finder.js'), 'utf8');

const EXPECTED_ROOMS = [
  { id: 'room-sweet-purple', floor: 'ground' },
  { id: 'room-rising-sun', floor: 'ground' },
  { id: 'room-scarlet', floor: 'ground' },
  { id: 'room-opium', floor: 'first' },
  { id: 'room-red-maharani', floor: 'first' },
  { id: 'room-green', floor: 'first' },
  { id: 'room-bluesky', floor: 'first' },
];

function eventTarget(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatch(type) {
      for (const callback of listeners.get(type) || []) callback({ type });
    },
    focusCount: 0,
    focus() { this.focusCount += 1; },
  };
}

function bootFinder(roomData = EXPECTED_ROOMS) {
  const cards = roomData.map(room => ({
    id: room.id,
    dataset: { roomFloor: room.floor, roomFeatures: room.features },
    hidden: false,
  }));
  const floorSelect = eventTarget({ value: 'all' });
  const featureInputs = ['king-bed', 'second-bed', 'city-view', 'window-seat', 'carved-bed']
    .map(value => eventTarget({ value, checked: false }));
  const status = { textContent: '' };
  const emptyState = { hidden: true };
  const resetButton = eventTarget({ disabled: true });
  const grid = {
    querySelectorAll(selector) {
      assert.equal(selector, '.room-card--named[data-room-floor][data-room-features]');
      return cards;
    },
  };
  const finder = {
    hidden: true,
    querySelector(selector) {
      return ({
        '[data-room-floor-filter]': floorSelect,
        '[data-room-finder-status]': status,
        '[data-room-finder-empty]': emptyState,
        '[data-room-reset]': resetButton,
      })[selector] || null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-room-feature-filter]');
      return featureInputs;
    },
  };
  const document = {
    querySelector(selector) {
      return ({
        '[data-room-finder]': finder,
        '#room-card-grid': grid,
      })[selector] || null;
    },
  };
  vm.runInNewContext(script, { document, console }, { filename: 'assets/room-finder.js' });
  return { cards, finder, floorSelect, featureInputs, status, emptyState, resetButton };
}

function visibleIds(cards) {
  return cards.filter(card => !card.hidden).map(card => card.id);
}

function slugifyFeature(label) {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

function testStaticCatalogueContract() {
  assert.match(html, /<section class="room-finder" data-room-finder hidden/i,
    'filter controls must start hidden so they do not imply functionality when JavaScript is unavailable');
  assert.match(html, /<script src="assets\/room-finder\.js" defer><\/script>/,
    'the progressive room finder script must be loaded on the room page');
  assert.match(html, /<link rel="stylesheet" href="assets\/room-finder\.css">/,
    'room finder styling must be scoped to the room page');

  const cardMatches = [...html.matchAll(/<article class="room-card room-card--named"[^>]*>[\s\S]*?<\/article>/g)];
  assert.equal(cardMatches.length, EXPECTED_ROOMS.length, 'all seven source-listed room cards must stay in the catalogue');

  for (const room of EXPECTED_ROOMS) {
    const cardMatch = cardMatches.find(match => match[0].includes('id="' + room.id + '"'));
    assert.ok(cardMatch, 'missing room card ' + room.id);
    const card = cardMatch[0];
    assert.match(card, new RegExp('data-room-floor="' + room.floor + '"'),
      room.id + ' must use the floor in the owner-maintained catalogue');
    assert.doesNotMatch(card, /\shidden(?:\s|>)/i, room.id + ' must remain visible without JavaScript');

    const declared = card.match(/data-room-features="([^"]+)"/);
    const listed = card.match(/<ul class="room-feature-list">([\s\S]*?)<\/ul>/);
    assert.ok(declared, room.id + ' needs filter metadata');
    assert.ok(listed, room.id + ' needs the visible source feature list');
    const declaredFeatures = declared[1].split(/\s+/).sort();
    const visibleFeatures = [...listed[1].matchAll(/<li>([^<]+)<\/li>/g)]
      .map(match => slugifyFeature(match[1]))
      .sort();
    assert.deepEqual(declaredFeatures, visibleFeatures,
      room.id + ' filter data must exactly match the visible source-listed feature chips');
  }
}

function testFilterInteractions() {
  const state = bootFinder(EXPECTED_ROOMS.map(room => {
    const features = {
      'room-sweet-purple': 'carved-bed second-bed air-conditioning ceiling-fan private-bathroom city-view',
      'room-rising-sun': 'comfortable-room private-bathroom ceiling-fan air-conditioning city-view window-seat',
      'room-scarlet': 'comfortable-room ceiling-fan private-bathroom air-conditioning city-view window-seat',
      'room-opium': 'air-conditioning ceiling-fan private-bathroom city-view',
      'room-red-maharani': 'king-bed air-conditioning ceiling-fan private-bathroom city-view window-seat',
      'room-green': 'king-bed window-seat air-conditioning ceiling-fan private-bathroom',
      'room-bluesky': 'comfortable-room ceiling-fan private-bathroom air-conditioning city-view window-seat',
    };
    return { ...room, features: features[room.id] };
  }));

  assert.equal(state.finder.hidden, false, 'filters should appear after successful initialization');
  assert.equal(visibleIds(state.cards).length, 7);
  assert.equal(state.status.textContent, 'Showing all seven listed rooms.');
  assert.equal(state.emptyState.hidden, true);
  assert.equal(state.resetButton.disabled, true);

  state.floorSelect.value = 'ground';
  state.floorSelect.dispatch('change');
  assert.deepEqual(visibleIds(state.cards), ['room-sweet-purple', 'room-rising-sun', 'room-scarlet']);
  assert.match(state.status.textContent, /Showing 3 of seven listed rooms/);
  assert.equal(state.resetButton.disabled, false);

  state.floorSelect.value = 'first';
  const king = state.featureInputs.find(input => input.value === 'king-bed');
  king.checked = true;
  king.dispatch('change');
  assert.deepEqual(visibleIds(state.cards), ['room-red-maharani', 'room-green']);
  assert.match(state.status.textContent, /Showing 2 of seven listed rooms/);

  const secondBed = state.featureInputs.find(input => input.value === 'second-bed');
  secondBed.checked = true;
  secondBed.dispatch('change');
  assert.deepEqual(visibleIds(state.cards), []);
  assert.equal(state.emptyState.hidden, false);
  assert.match(state.status.textContent, /No rooms match every selected source-listed feature and floor/);
  assert.equal(state.resetButton.disabled, false);

  state.resetButton.dispatch('click');
  assert.equal(state.floorSelect.value, 'all');
  assert.ok(state.featureInputs.every(input => !input.checked));
  assert.deepEqual(visibleIds(state.cards), EXPECTED_ROOMS.map(room => room.id));
  assert.equal(state.emptyState.hidden, true);
  assert.equal(state.resetButton.disabled, true);
  assert.equal(state.status.textContent, 'Showing all seven listed rooms.');
  assert.equal(state.floorSelect.focusCount, 1, 'clearing filters should return focus to the floor selector');

  const malformed = bootFinder(EXPECTED_ROOMS.slice(0, 6));
  assert.equal(malformed.finder.hidden, true,
    'fail closed if the catalogue no longer has the expected seven cards; controls must not claim filtering works');
}

testStaticCatalogueContract();
testFilterInteractions();
console.log('PASS: seven room mappings/floors/features match the visible source catalogue; filtering, result status, no-results recovery, keyboard focus and non-JavaScript fallback are guarded.');
