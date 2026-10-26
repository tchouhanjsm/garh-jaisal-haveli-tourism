#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

class FakeElement {
  constructor({ hidden = false, textContent = '' } = {}) {
    this.hidden = hidden;
    this.textContent = textContent;
    this.attributes = {};
    this.listeners = {};
    this.classes = new Set();
    this.classList = { add: (name) => this.classes.add(name) };
    this.children = [];
    this.selectors = {};
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  click() { if (this.listeners.click) this.listeners.click(); }
  querySelectorAll(selector) { return this.selectors[selector] || []; }
  querySelector(selector) { return this.selectors[selector] || null; }
}

function makeCarousel(slideCount = 2) {
  const slides = Array.from({ length: slideCount }, (_, index) => new FakeElement({ hidden: index > 0 }));
  const controls = new FakeElement({ hidden: true });
  const previous = new FakeElement();
  const next = new FakeElement();
  const status = new FakeElement({ textContent: '1 of ' + slideCount });
  const carousel = new FakeElement();
  carousel.selectors['[data-carousel-slide]'] = slides;
  carousel.selectors['[data-carousel-controls]'] = controls;
  carousel.selectors['[data-carousel-previous]'] = previous;
  carousel.selectors['[data-carousel-next]'] = next;
  carousel.selectors['[data-carousel-status]'] = status;
  return { carousel, slides, controls, previous, next, status };
}

const working = makeCarousel(2);
const incomplete = makeCarousel(1);
global.document = {
  querySelectorAll(selector) {
    assert.equal(selector, '[data-experience-carousel]');
    return [working.carousel, incomplete.carousel];
  },
};

require('../assets/experience-carousel.js');

assert.ok(working.carousel.classes.has('is-enhanced'), 'valid carousel should be enhanced');
assert.equal(working.controls.hidden, false, 'controls should be shown after enhancement');
assert.equal(working.slides[0].hidden, false, 'first image should start visible');
assert.equal(working.slides[1].hidden, true, 'other images should remain hidden');
assert.equal(working.slides[0].attributes['aria-hidden'], 'false');
assert.equal(working.slides[1].attributes['aria-hidden'], 'true');
assert.equal(working.status.textContent, '1 of 2');

working.next.click();
assert.equal(working.status.textContent, '2 of 2', 'Next should advance the gallery');
assert.equal(working.slides[0].hidden, true);
assert.equal(working.slides[1].hidden, false);

working.next.click();
assert.equal(working.status.textContent, '1 of 2', 'Next should wrap to the first image');
working.previous.click();
assert.equal(working.status.textContent, '2 of 2', 'Previous should wrap to the last image');

assert.equal(incomplete.controls.hidden, true, 'incomplete carousel should keep controls hidden');
assert.ok(!incomplete.carousel.classes.has('is-enhanced'), 'incomplete carousel should not be enhanced');
delete global.document;

console.log('PASS: experience carousel next/previous, wraparound, live status, aria-hidden state and incomplete markup fallback.');
