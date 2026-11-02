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
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    async dispatchAsync(type, event = {}) {
      const evt = { ...event, preventDefault() {} };
      for (const listener of listeners.get(type) || []) await listener(evt);
      return evt;
    },
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
  let remainingFailures = fetchFails === true ? Number.POSITIVE_INFINITY : Math.max(0, Number(fetchFails) || 0);
  let fetchCalls = 0;
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
    fetchCalls += 1;
    assert.equal(new URL(url).pathname, '/content/site-config.json');
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      throw new Error('simulated config fetch failure');
    }
    return { ok: true, json: async () => config };
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'site.js'), 'utf8');
  vm.runInNewContext(source, { document, window, Date, URL, encodeURIComponent, fetch, console }, {
    filename: 'assets/site.js'
  });
  await new Promise(resolve => setImmediate(resolve));
  return { window, status, retryButton: status.children.find(child => child.getAttribute('data-contact-config-retry') !== null), fetchCalls: () => fetchCalls, enquiryLink, phoneLink, alternatePhoneLink, emailLink, bookingLink, mapLink, form, arrival, departure, guests, note, submit };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const publicPages = ['index.html', 'rooms.html', 'experiences.html', 'experience-details.html', 'dining.html', 'about.html', 'directions.html', 'gallery.html'];
  const publicConfig = JSON.parse(fs.readFileSync(path.join(root, 'content', 'site-config.json'), 'utf8'));
  const exactHotelMapUrl = publicConfig.propertyNavigation.hotelMapUrl;
  const exactRestaurantMapUrl = publicConfig.restaurant.googleMapsUrl;
  const arrivalRuntime = fs.readFileSync(path.join(root, 'assets', 'js', 'arrival-enhancements.js'), 'utf8');
  const authoredMessages = new Set();
  for (const page of publicPages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/id="contact-status"/g) || []).length, 1, page + ' must have one accessible contact-status fallback');
    assert.match(html, /data-enquiry-link/, page + ' must mark enquiry links for runtime verification');
    assert.match(html, /data-property-map-link/, page + ' must use the central map configuration');
    assert.doesNotMatch(html, /https:\/\/maps\.google\.com\/\?q=Garh\+Jaisal\+Haveli\+Jaisalmer/i,
      page + ' must not hard-code an unapproved Google Maps query destination');
    const shortMapLinks = [...html.matchAll(/https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]+/g)].map(match => match[0]);
    if (page === 'directions.html') {
      assert.deepEqual(shortMapLinks, [exactHotelMapUrl],
        'Directions may hard-code the centrally authorized pin only in the no-JavaScript fallback');
      const driverBase = html.match(/data-arrival-copy-base="([^"]*)"/);
      const driverPayload = html.match(/data-arrival-copy="([^"]*)"/);
      assert.ok(driverBase && driverBase[1].includes('Fort Parking')
        && !driverBase[1].includes(exactHotelMapUrl)
        && driverPayload && driverPayload[1] === '',
        'the static driver note must contain only operational copy and leave the exact pin for validated runtime hydration');
      assert.ok(arrivalRuntime.includes("button.setAttribute('data-arrival-copy', baseNote + '\\nExact hotel map pin: ' + hotelMapUrl);"),
        'the driver payload must receive the exact central hotel pin only after runtime validation');
      const noScriptStart = html.indexOf('<noscript>');
      const noScriptEnd = noScriptStart < 0 ? -1 : html.indexOf('</noscript>', noScriptStart);
      const noScriptFallback = noScriptStart >= 0 && noScriptEnd > noScriptStart
        ? html.slice(noScriptStart, noScriptEnd + '</noscript>'.length)
        : '';
      assert.ok(noScriptFallback && noScriptFallback.includes('href="' + exactHotelMapUrl + '"')
        && noScriptFallback.includes('target="_blank"')
        && noScriptFallback.includes('rel="noopener noreferrer"'),
        'no-JavaScript fallback must open the same exact pin safely in a new tab');
    } else if (page === 'dining.html') {
      assert.deepEqual(shortMapLinks, [exactRestaurantMapUrl],
        'Dining may use only the centrally authorized restaurant map pin');
      const restaurantLinksStart = html.indexOf('<div class="restaurant-source-links">');
      const restaurantLinksEnd = restaurantLinksStart < 0 ? -1 : html.indexOf('</div>', restaurantLinksStart);
      const restaurantLinks = restaurantLinksStart >= 0 && restaurantLinksEnd > restaurantLinksStart
        ? html.slice(restaurantLinksStart, restaurantLinksEnd + '</div>'.length)
        : '';
      assert.ok(restaurantLinks.includes('href="' + exactRestaurantMapUrl + '"')
        && restaurantLinks.includes('target="_blank"')
        && restaurantLinks.includes('rel="noopener noreferrer"'),
        'Dining must expose the restaurant map pin as a safe external link');
    } else {
      assert.equal(shortMapLinks.length, 0, page + ' must not hard-code a property or restaurant map short link');
    }
    assert.doesNotMatch(html, /https:\/\/wa\.me\/\d+|href="tel:\+?\d+|info@hotelgarhjaisal\.com|7727047567|2992253836/i, page + ' must not publish unverified contact endpoints');
    for (const match of html.matchAll(/data-enquiry-message="([^"]*)"/g)) authoredMessages.add(match[1]);
  }
  assert.ok(authoredMessages.size > 10, 'section-specific enquiry messages must be preserved');

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

  const authorizedChannelValues = {
    verified: true,
    whatsapp: 'https://wa.me/15551234567',
    phone: '+15551234567',
    display: '+1 555 123 4567',
    alternatePhone: '+15551234568',
    alternateDisplay: '+1 555 123 4568',
    email: 'hotel@example.com',
    bookingUrl: 'https://asiatech.in/booking_engine/index3?token=test-token'
  };
  const channelIsolationCases = [
    { name: 'WhatsApp', override: { whatsapp: 'https://evil.example/15551234567' }, disabled: 'enquiryLink' },
    { name: 'primary phone', override: { phone: 'not-a-phone' }, disabled: 'phoneLink' },
    { name: 'primary phone display', override: { display: '<script>alert(1)</script>' }, disabled: 'phoneLink' },
    { name: 'alternate phone', override: { alternatePhone: '+0123' }, disabled: 'alternatePhoneLink' },
    { name: 'email', override: { email: 'not-an-email' }, disabled: 'emailLink' },
    { name: 'booking', override: { bookingUrl: 'http://asiatech.in/booking_engine/index3?token=test-token' }, disabled: 'bookingLink' },
    { name: 'hotel map', override: { mapUrl: 'https://maps.app.goo.gl.evil.example/fakePin123' }, disabled: 'mapLink' }
  ];
  for (const testCase of channelIsolationCases) {
    const isolated = await boot(makeConfig({ ...authorizedChannelValues, ...testCase.override }));
    const links = {
      enquiryLink: isolated.enquiryLink,
      phoneLink: isolated.phoneLink,
      alternatePhoneLink: isolated.alternatePhoneLink,
      emailLink: isolated.emailLink,
      bookingLink: isolated.bookingLink,
      mapLink: isolated.mapLink
    };
    for (const [name, link] of Object.entries(links)) {
      const disabled = link.getAttribute('aria-disabled') === 'true';
      assert.equal(disabled, name === testCase.disabled,
        testCase.name + ' validation must disable only its own action; unrelated authorized channels stay usable');
      if (name !== testCase.disabled) {
        assert.notEqual(link.getAttribute('href'), '#contact-status',
          testCase.name + ' failure must not replace an unrelated authorized destination');
      }
    }
    assert.equal(isolated.status.hidden, false,
      testCase.name + ' failure must remain visible in the shared accessible contact status');
  }

  const fetchFailure = await boot(makeConfig({
    verified: true,
    whatsapp: 'https://wa.me/15551234567',
    phone: '+15551234567',
    display: '+1 555 123 4567',
    alternatePhone: '+15551234568',
    alternateDisplay: '+1 555 123 4568',
    email: 'hotel@example.com',
    bookingUrl: 'https://asiatech.in/booking_engine/index3?token=test-token'
  }), 2);
  assert.equal(fetchFailure.enquiryLink.getAttribute('aria-disabled'), 'true');
  assert.equal(fetchFailure.submit.disabled, true);
  assert.equal(fetchFailure.status.hidden, false);
  assert.match(fetchFailure.status.textContent, /no enquiry message was sent/i);
  assert.match(fetchFailure.note.textContent, /travel details have not been sent/i);
  assert.match(fetchFailure.note.textContent, /refresh the page and try again/i);
  assert.ok(fetchFailure.retryButton, 'contact fetch failure must append an in-page retry button');
  assert.equal(fetchFailure.retryButton.hidden, false);
  assert.equal(fetchFailure.retryButton.disabled, false);
  assert.equal(fetchFailure.fetchCalls(), 1);
  await fetchFailure.retryButton.dispatchAsync('click');
  assert.equal(fetchFailure.fetchCalls(), 2, 'the first explicit retry must make exactly one additional config request');
  assert.equal(fetchFailure.retryButton.hidden, false, 'a second temporary outage must leave retry available');
  assert.equal(fetchFailure.retryButton.disabled, false, 'retry must re-enable after the second outage');
  assert.equal(fetchFailure.retryButton.textContent, 'Try again', 'repeat failure must announce the recovery action');
  assert.equal(fetchFailure.status.hidden, false, 'the outage banner must remain visible until a successful response');
  assert.equal(fetchFailure.enquiryLink.getAttribute('aria-disabled'), 'true', 'WhatsApp must remain fail-closed after a repeated outage');
  assert.equal(fetchFailure.submit.disabled, true, 'booking enquiry must remain disabled after a repeated outage');
  assert.match(fetchFailure.note.textContent, /travel details have not been sent/i);
  await fetchFailure.retryButton.dispatchAsync('click');
  assert.equal(fetchFailure.fetchCalls(), 3, 'the successful second retry must make the third and final config request');
  assert.equal(fetchFailure.retryButton.hidden, true,
    'retry action must hide after the authorized configuration is restored');
  assert.equal(fetchFailure.retryButton.disabled, false);
  assert.match(fetchFailure.enquiryLink.getAttribute('href'), /^https:\/\/wa\.me\/15551234567\?text=/);
  assert.equal(fetchFailure.enquiryLink.getAttribute('aria-disabled'), null);
  assert.equal(fetchFailure.bookingLink.getAttribute('aria-disabled'), null);
  assert.equal(fetchFailure.status.hidden, true,
    'the unavailable banner must clear after the in-page retry succeeds');
  assert.match(fetchFailure.note.textContent, /opens WhatsApp to ask about availability/i,
    'successful retry must restore the normal WhatsApp enquiry guidance');
  assert.match(fetchFailure.note.textContent, /this is an enquiry, not a reservation/i,
    'successful retry must retain the no-reservation disclaimer');
  assert.match(fetchFailure.note.textContent, /no payment is taken here/i,
    'successful retry must retain the no-payment disclaimer');
  assert.doesNotMatch(fetchFailure.note.textContent, /contact details supplied directly by the hotel/i,
    'the unavailable-channel fallback must be removed after successful recovery');

  console.log('PASS: source-authorized booking, WhatsApp, telephone, landline, email and exact hotel map pin hydrate safely; invalid or unavailable channels fail closed; date/guest message generation remains an enquiry only.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
