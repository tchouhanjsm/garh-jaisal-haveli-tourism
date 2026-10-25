#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function classList() {
  const values = new Set();
  return {
    add(...items) { items.forEach(item => values.add(item)); },
    remove(...items) { items.forEach(item => values.delete(item)); },
    toggle(item, force) {
      const next = force === undefined ? !values.has(item) : Boolean(force);
      if (next) values.add(item); else values.delete(item);
      return next;
    },
    contains(item) { return values.has(item); }
  };
}

function element(name, initialAttributes = {}, text = '') {
  const attrs = new Map(Object.entries(initialAttributes));
  const listeners = new Map();
  const el = {
    name,
    classList: classList(),
    textContent: text,
    hidden: false,
    disabled: false,
    value: '',
    min: '',
    selectedOptions: [],
    setAttribute(key, value) { attrs.set(key, String(value)); },
    getAttribute(key) { return attrs.has(key) ? attrs.get(key) : null; },
    removeAttribute(key) { attrs.delete(key); },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      let prevented = false;
      const evt = {
        ...event,
        preventDefault() { prevented = true; if (event.preventDefault) event.preventDefault(); }
      };
      for (const listener of listeners.get(type) || []) listener(evt);
      evt.defaultPrevented = prevented;
      return evt;
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    focus() {}
  };
  Object.defineProperty(el, 'href', {
    get() { return attrs.get('href') || ''; },
    set(value) { attrs.set('href', String(value)); }
  });
  return el;
}

function makeConfig({ verified = false, whatsapp = '', phone = '', display = '' } = {}) {
  return {
    verificationStatus: verified ? 'owner-verified' : 'legacy-source-unverified',
    contact: {
      status: verified ? 'verified' : 'owner-verification-required',
      whatsappBaseUrl: whatsapp,
      primaryPhoneE164: phone,
      primaryPhoneDisplay: display,
      email: ''
    }
  };
}

async function boot(config, fetchFails = false) {
  const header = element('header');
  const menuToggle = element('button', { 'aria-expanded': 'false', 'aria-label': 'Open navigation' });
  const nav = element('nav');
  const status = element('div', {}, 'Contact channels are awaiting verification.');
  const enquiryLink = element('a', {
    href: '#contact-status',
    'data-enquiry-link': '',
    'data-enquiry-message': 'Namaste, please share room availability.',
    'aria-disabled': 'true',
    'aria-describedby': 'contact-status'
  }, 'Enquire to book');
  const phoneLink = element('a', {
    href: '#contact-status',
    'data-contact-phone': '',
    'data-contact-prefix': 'Call',
    'aria-disabled': 'true',
    'aria-describedby': 'contact-status'
  }, 'Phone contact pending verification');
  const arrival = element('input');
  arrival.value = '2026-11-01';
  const departure = element('input');
  departure.value = '2026-11-03';
  const guests = element('select');
  guests.value = '2';
  guests.selectedOptions = [{ textContent: '2 guests' }];
  const note = element('p', {}, 'Direct enquiry is temporarily unavailable while contact details are being verified.');
  const submit = element('button', { 'data-booking-submit': '' }, 'Check availability');
  const form = element('form', { 'data-booking-form': '' });
  form.elements = { namedItem(name) { return ({ arrival, departure, guests })[name] || null; } };
  form.querySelector = selector => ({
    '[data-booking-note]': note,
    '[data-booking-submit]': submit
  })[selector] || null;
  form.reportValidity = () => true;
  nav.querySelectorAll = () => [];
  const body = { classList: classList(), appendChild() {} };
  const documentListeners = new Map();
  const document = {
    body,
    currentScript: { src: 'https://example.test/assets/site.js' },
    querySelector(selector) {
      return ({
        '[data-header]': header,
        '.menu-toggle': menuToggle,
        '#primary-navigation': nav,
        '#contact-status': status
      })[selector] || null;
    },
    querySelectorAll(selector) {
      return ({
        '[data-current-year]': [],
        '[data-booking-form]': [form],
        '[data-accordion]': [],
        '[data-reveal]': [],
        '[data-enquiry-link]': [enquiryLink],
        '[data-contact-phone]': [phoneLink]
      })[selector] || [];
    },
    createElement(name) { return element(name); },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of documentListeners.get(type) || []) listener(event);
    }
  };
  const window = {
    scrollY: 0,
    location: { href: 'https://example.test/rooms.html' },
    addEventListener() {},
    clearTimeout() {},
    setTimeout() { return 1; }
  };
  const fetch = async url => {
    assert.equal(new URL(url).pathname, '/content/site-config.json');
    if (fetchFails) throw new Error('simulated config fetch failure');
    return { ok: true, json: async () => config };
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'site.js'), 'utf8');
  vm.runInNewContext(source, { document, window, Date, URL, encodeURIComponent, fetch, console }, {
    filename: 'assets/site.js'
  });
  await new Promise(resolve => setImmediate(resolve));
  return { window, status, enquiryLink, phoneLink, form, arrival, departure, guests, note, submit };
}

async function main() {
  const unverified = await boot(makeConfig());
  assert.equal(unverified.enquiryLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.enquiryLink.getAttribute('aria-disabled'), 'true');
  assert.equal(unverified.phoneLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.submit.disabled, true);
  assert.equal(unverified.status.hidden, false);
  const blockedSubmit = unverified.form.dispatch('submit');
  assert.equal(blockedSubmit.defaultPrevented, true);
  assert.equal(unverified.window.location.href, 'https://example.test/rooms.html');
  assert.match(unverified.note.textContent, /not been sent/i);

  const verified = await boot(makeConfig({
    verified: true,
    whatsapp: 'https://wa.me/15551234567',
    phone: '+15551234567',
    display: '+1 555 123 4567'
  }));
  assert.match(verified.enquiryLink.getAttribute('href'), /^https:\/\/wa\.me\/15551234567\?text=/);
  assert.equal(verified.enquiryLink.getAttribute('target'), '_blank');
  assert.equal(verified.enquiryLink.getAttribute('rel'), 'noopener');
  assert.equal(new URL(verified.enquiryLink.getAttribute('href')).searchParams.get('text'), 'Namaste, please share room availability.');
  assert.equal(verified.enquiryLink.getAttribute('aria-disabled'), null);
  assert.equal(verified.phoneLink.getAttribute('href'), 'tel:+15551234567');
  assert.equal(verified.phoneLink.textContent, 'Call +1 555 123 4567');
  assert.equal(verified.submit.disabled, false);
  assert.equal(verified.status.hidden, true);
  verified.form.dispatch('submit');
  assert.match(verified.window.location.href, /^https:\/\/wa\.me\/15551234567\?text=/);
  const sentMessage = new URL(verified.window.location.href).searchParams.get('text');
  assert.match(sentMessage, /Arrival: 2026-11-01/);
  assert.match(sentMessage, /Departure: 2026-11-03/);
  assert.match(sentMessage, /Guests: 2 guests/);

  const invalid = await boot(makeConfig({
    verified: true,
    whatsapp: 'https://evil.example/15551234567',
    phone: '+15551234567',
    display: '+1 555 123 4567'
  }));
  assert.equal(invalid.enquiryLink.getAttribute('aria-disabled'), 'true');
  assert.equal(invalid.submit.disabled, true);
  assert.equal(invalid.status.hidden, false);
  invalid.form.dispatch('submit');
  assert.equal(invalid.window.location.href, 'https://example.test/rooms.html');

  const fetchFailure = await boot(makeConfig(), true);
  assert.equal(fetchFailure.enquiryLink.getAttribute('aria-disabled'), 'true');
  assert.equal(fetchFailure.submit.disabled, true);
  assert.equal(fetchFailure.status.hidden, false);

  console.log('PASS: enquiry links and booking form fail closed until owner verification; verified WhatsApp/phone channels and date/guest message generation work.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
