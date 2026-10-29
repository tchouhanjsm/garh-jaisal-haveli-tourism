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
      return Promise.all((listeners.get(type) || []).map(callback => callback({ type })));
    },
    focusCount: 0,
    focus() { this.focusCount += 1; },
  };
}

function bootFinder(
  roomData = EXPECTED_ROOMS,
  initialUrl = 'https://example.test/rooms.html',
  clipboardFails = false,
) {
  const currentUrl = { value: new URL(initialUrl) };
  const clipboardWrites = [];
  const windowListeners = new Map();
  const window = {
    get location() {
      return {
        href: currentUrl.value.toString(),
        hash: currentUrl.value.hash,
        pathname: currentUrl.value.pathname,
        search: currentUrl.value.search,
      };
    },
    history: {
      replaceState(_state, _title, nextUrl) {
        currentUrl.value = new URL(nextUrl, currentUrl.value);
      },
    },
    addEventListener(type, callback) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(callback);
    },
    dispatch(type) {
      return Promise.all((windowListeners.get(type) || []).map(callback => callback()));
    },
  };
  const navigator = {
    clipboard: {
      async writeText(value) {
        clipboardWrites.push(String(value));
        if (clipboardFails) throw new Error('clipboard unavailable');
      },
    },
  };
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
  const shareButton = eventTarget({ disabled: true });
  const shareFallback = { hidden: true };
  const shareUrlField = eventTarget({
    value: '',
    selected: false,
    select() { this.selected = true; },
  });
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
        '[data-room-share]': shareButton,
        '[data-room-share-fallback]': shareFallback,
        '[data-room-share-url]': shareUrlField,
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
  vm.runInNewContext(script, {
    document, console, window, navigator, URL, URLSearchParams,
  }, { filename: 'assets/room-finder.js' });
  return {
    cards, finder, floorSelect, featureInputs, status, emptyState, resetButton,
    shareButton, shareFallback, shareUrlField, clipboardWrites,
    currentUrl: () => currentUrl.value.toString(),
  };
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
  assert.match(html, /href="#room-planning">Ask about room fit →<\/a>/,
    'the no-results state must retain a useful path to ask about a room');
  assert.match(html, /data-room-share disabled/,
    'share controls must be disabled until the guest chooses a catalogue filter');
  assert.match(html, /data-room-share-fallback hidden/,
    'manual copy fallback must stay hidden until clipboard access fails');
  assert.match(html, /data-room-share-url readonly/,
    'manual copy fallback must expose a read-only share URL');
  assert.match(script, /#room-finder\?/,
    'shareable filter state must use a non-indexable URL fragment');
  assert.doesNotMatch(script, /localStorage|sessionStorage|fetch\s*\(/,
    'room filter sharing must not persist guest data or make network requests');

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

async function testShareableFilters() {
  const featureData = {
    'room-sweet-purple': 'carved-bed second-bed city-view',
    'room-rising-sun': 'city-view window-seat',
    'room-scarlet': 'city-view window-seat',
    'room-opium': 'city-view',
    'room-red-maharani': 'king-bed city-view window-seat',
    'room-green': 'king-bed window-seat',
    'room-bluesky': 'city-view window-seat',
  };
  const rooms = EXPECTED_ROOMS.map(room => ({ ...room, features: featureData[room.id] }));

  const restored = bootFinder(
    rooms,
    'https://example.test/rooms.html#room-finder?floor=first&feature=king-bed',
  );
  assert.equal(restored.floorSelect.value, 'first',
    'a shared URL must restore the source-listed floor filter');
  assert.equal(restored.featureInputs.find(input => input.value === 'king-bed').checked, true,
    'a shared URL must restore source-listed feature filters');
  assert.deepEqual(visibleIds(restored.cards), ['room-red-maharani', 'room-green']);
  assert.equal(restored.shareButton.disabled, false);

  const state = bootFinder(rooms);
  state.floorSelect.value = 'first';
  await state.floorSelect.dispatch('change');
  const kingBed = state.featureInputs.find(input => input.value === 'king-bed');
  kingBed.checked = true;
  await kingBed.dispatch('change');
  await state.shareButton.dispatch('click');

  assert.equal(state.clipboardWrites.length, 1, 'sharing should copy exactly one filter URL');
  const copiedUrl = state.clipboardWrites[0];
  assert.equal(copiedUrl, state.currentUrl(), 'the copied URL must match the address-bar URL');
  const parsed = new URL(copiedUrl);
  assert.match(parsed.hash, /^#room-finder\?/);
  const params = new URLSearchParams(parsed.hash.slice('#room-finder?'.length));
  assert.equal(params.get('floor'), 'first');
  assert.deepEqual(params.getAll('feature'), ['king-bed']);
  assert.doesNotMatch(parsed.hash, /guest|name|email|phone|date|note/i,
    'the share fragment must contain only catalogue filters, never guest-entered details');

  const reopened = bootFinder(rooms, copiedUrl);
  assert.equal(reopened.floorSelect.value, 'first');
  assert.equal(reopened.featureInputs.find(input => input.value === 'king-bed').checked, true);
  assert.deepEqual(visibleIds(reopened.cards), ['room-red-maharani', 'room-green']);

  const invalid = bootFinder(
    rooms,
    'https://example.test/rooms.html#room-finder?floor=unknown&feature=king-bed&feature=untrusted-value',
  );
  assert.equal(invalid.floorSelect.value, 'all',
    'unrecognized floor values must fail closed to the full catalogue');
  assert.equal(invalid.featureInputs.find(input => input.value === 'king-bed').checked, true);
  assert.deepEqual(visibleIds(invalid.cards), ['room-red-maharani', 'room-green'],
    'unknown feature tokens must be ignored');

  const fallback = bootFinder(rooms, 'https://example.test/rooms.html', true);
  fallback.floorSelect.value = 'ground';
  await fallback.floorSelect.dispatch('change');
  await fallback.shareButton.dispatch('click');
  assert.equal(fallback.shareFallback.hidden, false,
    'clipboard failure must reveal a manual-copy fallback');
  assert.equal(fallback.shareUrlField.value, fallback.currentUrl());
  assert.equal(fallback.shareUrlField.focusCount, 1,
    'manual-copy fallback must receive focus');
  assert.equal(fallback.shareUrlField.selected, true,
    'manual-copy fallback must select the share URL');
  assert.match(fallback.status.textContent, /Copy the selected link below/);
}

testStaticCatalogueContract();
testFilterInteractions();
testShareableFilters()
  .then(() => {
    console.log('PASS: room finder preserves the seven source-listed records, filters accessibly, and shares privacy-safe floor/feature fragments with clipboard fallback.');
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
