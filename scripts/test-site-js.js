#!/usr/bin/env node
'use strict';

// Dependency-free behavior tests for the site's mobile navigation keyboard controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    }
  };
}

function createElement(name) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    name,
    classList: createClassList(),
    textContent: '',
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.has(key) ? attributes.get(key) : null; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener({ preventDefault() {}, ...event });
      }
    },
    querySelectorAll() { return []; },
    focus() { document.activeElement = this; }
  };
}

let document;
const header = createElement('header');
const menuToggle = createElement('button');
menuToggle.setAttribute('aria-expanded', 'false');
menuToggle.setAttribute('aria-label', 'Open navigation');
const nav = createElement('nav');
const navLink = createElement('a');
nav.querySelectorAll = selector => selector === 'a' || selector === 'a[href]' ? [navLink] : [];
nav.contains = element => element === navLink;
const documentListeners = new Map();
const body = { classList: createClassList(), appendChild() {} };

document = {
  body,
  activeElement: null,
  querySelector(selector) {
    return ({
      '[data-header]': header,
      '.menu-toggle': menuToggle,
      '#primary-navigation': nav
    })[selector] || null;
  },
  querySelectorAll() { return []; },
  createElement(name) { return createElement(name); },
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(listener);
  },
  dispatch(type, event = {}) {
    for (const listener of documentListeners.get(type) || []) {
      listener({ preventDefault() {}, ...event });
    }
  }
};

const windowListeners = new Map();
const window = {
  scrollY: 0,
  innerWidth: 390,
  addEventListener(type, listener) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(listener);
  },
  dispatch(type, event = {}) {
    for (const listener of windowListeners.get(type) || []) listener(event);
  },
  clearTimeout() {},
  setTimeout() { return 1; }
};

const sourcePath = path.join(__dirname, '..', 'assets', 'site.js');
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), {
  document, window, Date, encodeURIComponent, console
}, { filename: sourcePath });

menuToggle.dispatch('click');
assert.equal(menuToggle.getAttribute('aria-expanded'), 'true');
assert.equal(nav.classList.contains('is-open'), true);
assert.equal(body.classList.contains('menu-open'), true);

document.dispatch('keydown', { key: 'Escape' });
assert.equal(menuToggle.getAttribute('aria-expanded'), 'false');
assert.equal(menuToggle.getAttribute('aria-label'), 'Open navigation');
assert.equal(nav.classList.contains('is-open'), false);
assert.equal(body.classList.contains('menu-open'), false);
assert.equal(document.activeElement, menuToggle);

document.activeElement = navLink;
document.dispatch('keydown', { key: 'Escape' });
assert.equal(document.activeElement, navLink, 'Escape on a closed menu should not steal focus');

// Opening the compact menu and crossing into desktop width must close it,
// restore the full-navigation state and move focus off the now-hidden toggle.
menuToggle.dispatch('click');
assert.equal(menuToggle.getAttribute('aria-expanded'), 'true');
document.activeElement = menuToggle;
window.innerWidth = 768;
window.dispatch('resize');
assert.equal(menuToggle.getAttribute('aria-expanded'), 'false');
assert.equal(menuToggle.getAttribute('aria-label'), 'Open navigation');
assert.equal(nav.classList.contains('is-open'), false);
assert.equal(body.classList.contains('menu-open'), false);
assert.equal(document.activeElement, navLink, 'desktop resize must move focus from the hidden toggle to the visible navigation');

// Returning to compact width while focus is in the full navigation must focus
// the visible toggle rather than leave focus inside the hidden, closed panel.
window.innerWidth = 390;
window.dispatch('resize');
assert.equal(document.activeElement, menuToggle, 'compact resize must restore focus to the visible menu toggle');
assert.equal(menuToggle.getAttribute('aria-expanded'), 'false');
assert.equal(nav.classList.contains('is-open'), false);
assert.equal(body.classList.contains('menu-open'), false);

menuToggle.dispatch('click');
navLink.dispatch('click');
assert.equal(menuToggle.getAttribute('aria-expanded'), 'false');
assert.equal(nav.classList.contains('is-open'), false);
assert.equal(body.classList.contains('menu-open'), false);

console.log('PASS: mobile navigation opens, Escape closes and restores focus, and link activation clears menu state.');
