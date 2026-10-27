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

function makeConfig({
  verified = false, whatsapp = '', phone = '', display = '',
  alternatePhone = '', alternateDisplay = '', email = '', bookingUrl = '',
  mapUrl = 'https://maps.app.goo.gl/nAbRiZhv78FSbju48'
} = {}) {
  return {
    verificationStatus: verified ? 'owner-verified' : 'legacy-source-unverified',
    booking: {
      status: verified ? 'verified' : 'owner-verification-required',
      legacyBookingEngineUrl: bookingUrl
    },
    contact: {
      status: verified ? 'verified' : 'owner-verification-required',
      whatsappBaseUrl: whatsapp,
      primaryPhoneE164: phone,
      primaryPhoneDisplay: display,
      alternatePhoneE164: alternatePhone,
      alternatePhoneDisplay: alternateDisplay,
      email
    },
    propertyNavigation: {
      status: verified ? 'verified' : 'owner-verification-required',
      hotelMapUrl: mapUrl
    }
  };
}

async function boot(config, fetchFails = false) {
  const header = element('header');
  const menuToggle = element('button', { 'aria-expanded': 'false', 'aria-label': 'Open navigation' });
  const nav = element('nav');
  const status = element('div', {}, 'Some contact options need attention. One or more configured contact channels could not load. This website does not itself confirm a reservation; refresh this page and try again. No enquiry message was sent and no reservation was created. If you need help now, use contact details already supplied directly by the hotel.');
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
  }, 'Phone unavailable');
  const alternatePhoneLink = element('a', {
    href: '#contact-status',
    'data-contact-alt-phone': '',
    'data-contact-prefix': 'Landline',
    'aria-disabled': 'true',
    'aria-describedby': 'contact-status'
  }, 'Landline unavailable');
  const emailLink = element('a', {
    href: '#contact-status',
    'data-contact-email': '',
    'data-contact-prefix': 'Email',
    'aria-disabled': 'true',
    'aria-describedby': 'contact-status'
  }, 'Email unavailable');
  const bookingLink = element('a', {
    href: '#contact-status',
    'data-booking-link': '',
    'aria-disabled': 'true',
    'aria-describedby': 'contact-status'
  }, 'Book Now');
  const mapLink = element('a', {
    href: '#contact-status',
    'data-property-map-link': '',
    'aria-disabled': 'true',
    'aria-describedby': 'contact-status'
  }, 'Open exact hotel pin');
  const arrival = element('input');
  arrival.value = '2026-11-01';
  const departure = element('input');
  departure.value = '2026-11-03';
  const guests = element('select');
  guests.value = '2';
  guests.selectedOptions = [{ textContent: '2 guests' }];
  const note = element('p', {}, 'The enquiry form cannot open an authorized WhatsApp destination right now. Your travel details have not been sent. Refresh the page and try again, or use contact details supplied directly by the hotel.');
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
        '[data-contact-phone]': [phoneLink],
        '[data-contact-alt-phone]': [alternatePhoneLink],
        '[data-contact-email]': [emailLink],
        '[data-booking-link]': [bookingLink],
        '[data-property-map-link]': [mapLink]
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
  return { window, status, enquiryLink, phoneLink, alternatePhoneLink, emailLink, bookingLink, mapLink, form, arrival, departure, guests, note, submit };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const publicPages = ['index.html', 'rooms.html', 'experiences.html', 'experience-details.html', 'dining.html', 'about.html', 'directions.html', 'gallery.html'];
  const authoredMessages = new Set();
  for (const page of publicPages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/id="contact-status"/g) || []).length, 1, page + ' must have one accessible contact-status fallback');
    assert.match(html, /data-enquiry-link/, page + ' must mark enquiry links for runtime verification');
    assert.match(html, /data-property-map-link/, page + ' must use the central map configuration');
    assert.doesNotMatch(html, /https:\/\/maps\.google\.com\/\?q=Garh\+Jaisal\+Haveli\+Jaisalmer|https:\/\/maps\.app\.goo\.gl\/nAbRiZhv78FSbju48/i,
      page + ' must not hard-code the map destination');
    assert.doesNotMatch(html, /https:\/\/wa\.me\/\d+|href="tel:\+?\d+|info@hotelgarhjaisal\.com|7727047567|2992253836/i, page + ' must not publish unverified contact endpoints');
    for (const match of html.matchAll(/data-enquiry-message="([^"]*)"/g)) authoredMessages.add(match[1]);
  }
  assert.ok(authoredMessages.size > 10, 'section-specific enquiry messages must be preserved');

  const publicConfig = JSON.parse(fs.readFileSync(path.join(root, 'content', 'site-config.json'), 'utf8'));
  assert.equal(publicConfig.verificationStatus, 'owner-authorized-source',
    'source-derived endpoints must be marked owner-authorized, not live-tested');
  assert.equal(publicConfig.site.canonicalHostApproved, false,
    'source contact authorization must not approve the canonical host');
  assert.equal(publicConfig.contact.status, 'source-authorized');
  assert.match(publicConfig.contact.whatsappBaseUrl, /^https:\/\/wa\.me\/\d{8,15}$/);
  assert.match(publicConfig.contact.primaryPhoneE164, /^\+[1-9]\d{7,14}$/);
  assert.match(publicConfig.contact.alternatePhoneE164, /^\+[1-9]\d{7,14}$/);
  assert.match(publicConfig.contact.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  assert.equal(publicConfig.booking.status, 'source-authorized');
  assert.equal(publicConfig.propertyNavigation.status, 'source-authorized');
  assert.equal(publicConfig.propertyNavigation.hotelMapUrl, 'https://maps.app.goo.gl/nAbRiZhv78FSbju48');

  const bookingUrl = new URL(publicConfig.booking.legacyBookingEngineUrl);
  assert.equal(bookingUrl.protocol, 'https:');
  assert.equal(bookingUrl.hostname, 'asiatech.in');
  assert.equal(bookingUrl.pathname, '/booking_engine/index3');
  assert.ok(bookingUrl.searchParams.has('token'), 'source booking endpoint must retain its provider token');
  const unverified = await boot(makeConfig());
  assert.equal(unverified.enquiryLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.enquiryLink.getAttribute('aria-disabled'), 'true');
  assert.equal(unverified.phoneLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.alternatePhoneLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.emailLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.bookingLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.mapLink.getAttribute('href'), '#contact-status');
  assert.equal(unverified.mapLink.getAttribute('aria-disabled'), 'true');

  assert.equal(unverified.submit.disabled, true);
  assert.equal(unverified.status.hidden, false);
  const blockedSubmit = unverified.form.dispatch('submit');
  assert.equal(blockedSubmit.defaultPrevented, true);
  assert.equal(unverified.window.location.href, 'https://example.test/rooms.html');
  assert.match(unverified.note.textContent, /not been sent/i);
  assert.match(unverified.note.textContent, /refresh the page and try again/i);
  assert.match(unverified.note.textContent, /contact details supplied directly by the hotel/i);
  assert.match(unverified.status.textContent, /no enquiry message was sent/i);
  assert.match(unverified.status.textContent, /refresh this page and try again/i);

  const verified = await boot(makeConfig({
    verified: true,
    whatsapp: 'https://wa.me/15551234567',
    phone: '+15551234567',
    display: '+1 555 123 4567',
    alternatePhone: '+15551234568',
    alternateDisplay: '+1 555 123 4568',
    email: 'hotel@example.com',
    bookingUrl: 'https://asiatech.in/booking_engine/index3?token=test-token'
  }));
  assert.match(verified.enquiryLink.getAttribute('href'), /^https:\/\/wa\.me\/15551234567\?text=/);
  assert.equal(verified.enquiryLink.getAttribute('target'), '_blank');
  assert.equal(verified.enquiryLink.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(new URL(verified.enquiryLink.getAttribute('href')).searchParams.get('text'), 'Namaste, please share room availability.');
  assert.equal(verified.enquiryLink.getAttribute('aria-disabled'), null);
  assert.equal(verified.phoneLink.getAttribute('href'), 'tel:+15551234567');
  assert.equal(verified.phoneLink.textContent, 'Call +1 555 123 4567');
  assert.equal(verified.alternatePhoneLink.getAttribute('href'), 'tel:+15551234568');
  assert.equal(verified.alternatePhoneLink.textContent, 'Landline +1 555 123 4568');
  assert.equal(verified.emailLink.getAttribute('href'), 'mailto:hotel@example.com');
  assert.equal(verified.emailLink.textContent, 'Email hotel@example.com');
  assert.equal(verified.bookingLink.getAttribute('href'), 'https://asiatech.in/booking_engine/index3?token=test-token');
  assert.equal(verified.bookingLink.getAttribute('target'), '_blank');
  assert.equal(verified.bookingLink.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(verified.mapLink.getAttribute('href'), 'https://maps.app.goo.gl/nAbRiZhv78FSbju48');
  assert.equal(verified.mapLink.getAttribute('target'), '_blank');
  assert.equal(verified.mapLink.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(verified.mapLink.getAttribute('aria-disabled'), null);

  assert.equal(verified.submit.disabled, false);
  assert.equal(verified.status.hidden, true);
  verified.form.dispatch('submit');
  assert.match(verified.window.location.href, /^https:\/\/wa\.me\/15551234567\?text=/);
  const sentMessage = new URL(verified.window.location.href).searchParams.get('text');
  assert.match(sentMessage, /Arrival: 2026-11-01/);
  assert.match(sentMessage, /Departure: 2026-11-03/);
  assert.match(sentMessage, /Guests: 2 guests/);

  const invalidMap = await boot(makeConfig({
    verified: true,
    whatsapp: 'https://wa.me/15551234567',
    phone: '+15551234567',
    display: '+1 555 123 4567',
    alternatePhone: '+15551234568',
    alternateDisplay: '+1 555 123 4568',
    email: 'hotel@example.com',
    bookingUrl: 'https://asiatech.in/booking_engine/index3?token=test-token',
    mapUrl: 'https://maps.app.goo.gl.evil.example/fakePin123'
  }));
  assert.equal(invalidMap.mapLink.getAttribute('href'), '#contact-status');
  assert.equal(invalidMap.mapLink.getAttribute('aria-disabled'), 'true');
  assert.equal(invalidMap.mapLink.textContent, 'Map link unavailable');
  assert.equal(invalidMap.status.hidden, false);
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

  const invalidPort = await boot(makeConfig({
    verified: true,
    whatsapp: 'https://wa.me:444/15551234567',
    phone: '+15551234567',
    display: '+1 555 123 4567'
  }));
  assert.equal(invalidPort.enquiryLink.getAttribute('aria-disabled'), 'true');
  assert.equal(invalidPort.submit.disabled, true);
  assert.equal(invalidPort.status.hidden, false);
  invalidPort.form.dispatch('submit');
  assert.equal(invalidPort.window.location.href, 'https://example.test/rooms.html');

  const fetchFailure = await boot(makeConfig(), true);
  assert.equal(fetchFailure.enquiryLink.getAttribute('aria-disabled'), 'true');
  assert.equal(fetchFailure.submit.disabled, true);
  assert.equal(fetchFailure.status.hidden, false);
  assert.match(fetchFailure.status.textContent, /no enquiry message was sent/i);
  assert.match(fetchFailure.note.textContent, /no message has been sent/i);

  console.log('PASS: source-authorized booking, WhatsApp, telephone, landline, email and exact hotel map pin hydrate safely; invalid or unavailable channels fail closed; date/guest message generation remains an enquiry only.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
