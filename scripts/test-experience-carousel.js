#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'experiences.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');
const scriptPath = path.join(ROOT, 'assets', 'experience-carousel.js');
const script = fs.readFileSync(scriptPath, 'utf8');

class FakeElement {
  constructor({ hidden = false, textContent = '', attributes = {} } = {}) {
    this.hidden = hidden;
    this.textContent = textContent;
    this.attributes = { ...attributes };
    this.listeners = {};
    this.classes = new Set();
    this.classList = { add: name => this.classes.add(name), contains: name => this.classes.has(name) };
    this.selectors = {};
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  click() { if (this.listeners.click) this.listeners.click(); }
  querySelectorAll(selector) { return this.selectors[selector] || []; }
  querySelector(selector) { return this.selectors[selector] || null; }
}

function makeCarousel(sources, options = {}) {
  const slides = sources.map((src, index) => {
    const image = new FakeElement({ attributes: { src } });
    const slide = new FakeElement({ hidden: index > 0, attributes: { 'aria-hidden': String(index > 0) } });
    slide.selectors.img = image;
    return slide;
  });
  const controls = new FakeElement({ hidden: true });
  const previous = new FakeElement();
  const next = new FakeElement();
  const status = new FakeElement({ textContent: 'Photo 1 of ' + sources.length });
  const carousel = new FakeElement();
  carousel.selectors['[data-carousel-slide]'] = slides;
  carousel.selectors['[data-carousel-controls]'] = options.missingControls ? null : controls;
  carousel.selectors['[data-carousel-previous]'] = previous;
  carousel.selectors['[data-carousel-next]'] = next;
  carousel.selectors['[data-carousel-status]'] = status;
  return { carousel, slides, controls, previous, next, status };
}

const optionIds = ['sunset-camel', 'cultural-evening', 'open-sky', 'swiss-tent', 'half-day-city', 'full-day-city'];
const articles = [...html.matchAll(/<article class="experience-option" data-option="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.equal(articles.length, 6, 'all six source-listed experience options remain present');
assert.deepEqual(articles.map(match => match[1]), optionIds);
const socialImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
const socialAltMatch = html.match(/<meta property="og:image:alt" content="([^"]+)"/i);
assert.ok(socialImageMatch, 'Experiences page has an Open Graph image');
assert.ok(socialAltMatch && socialAltMatch[1].trim(), 'Experiences social image has descriptive alt text');
const socialImageUrl = new URL(socialImageMatch[1]);
assert.equal(socialImageUrl.origin, 'https://hotelgarhjaisal.com', 'social image uses the approved canonical host');
const localSocialImage = socialImageUrl.pathname.replace(/^\/+/, '');
assert.ok(html.includes('src="' + localSocialImage + '"'), 'social image maps to one of the page\'s locally hosted option images');
const socialImagePath = path.resolve(ROOT, localSocialImage);
assert.ok(socialImagePath.startsWith(ROOT + path.sep) && fs.existsSync(socialImagePath),
  'absolute social preview URL must resolve to an existing local file');

const pageImageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
const pageImageSources = pageImageTags.map(tag => (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1] || '');
assert.ok(pageImageSources.every(Boolean), 'every Experiences image has a source');
assert.equal(new Set(pageImageSources).size, pageImageSources.length, 'Experiences page must not reuse an image source');

for (const match of articles) {
  const imageTags = [...match[2].matchAll(/<img\b[^>]*>/gi)].map(item => item[0]);
  assert.ok(imageTags.length >= 1, match[1] + ' has at least one image');
  for (const tag of imageTags) {
    assert.match(tag, /\balt=["'][^"']+["']/i, 'each experience image has descriptive alt text');
    assert.match(tag, /\bwidth=["']\d+["']/i, 'each experience image declares width');
    assert.match(tag, /\bheight=["']\d+["']/i, 'each experience image declares height');
    assert.match(tag, /\bloading=["']lazy["']/i, 'below-fold experience images are lazy-loaded');
    assert.match(tag, /\bdecoding=["']async["']/i, 'experience images use async decoding');
  }
}

const carouselCards = articles.filter(match => match[2].includes('data-experience-carousel'));
assert.equal(carouselCards.length, 6, 'all six source-listed options have distinct reviewed photos and carousel controls');
for (const match of carouselCards) {
  const card = match[2];
  assert.match(card, /aria-roledescription=["']carousel["']/i, match[1] + ' has carousel semantics');
  assert.match(card, /aria-label=["']Photos for [^"']+["']/i, match[1] + ' has an accessible name');
  assert.match(card, /data-carousel-controls hidden/, match[1] + ' keeps controls hidden until enhancement');
  assert.match(card, /data-carousel-previous[^>]*aria-label=/i, match[1] + ' previous button is named');
  assert.match(card, /data-carousel-next[^>]*aria-label=/i, match[1] + ' next button is named');
  const previousButton = card.match(/<button\b[^>]*data-carousel-previous[^>]*>/i);
  const nextButton = card.match(/<button\b[^>]*data-carousel-next[^>]*>/i);
  assert.ok(previousButton && /\btype=["']button["']/i.test(previousButton[0]), match[1] + ' previous control must be a non-submitting native button');
  assert.ok(nextButton && /\btype=["']button["']/i.test(nextButton[0]), match[1] + ' next control must be a non-submitting native button');
  assert.match(card, /data-carousel-status aria-live=["']polite["'] aria-atomic=["']true["']/, match[1] + ' has a polite live status');
  const slides = [...card.matchAll(/<figure class="experience-carousel__slide" data-carousel-slide[^>]*>/gi)].map(m => m[0]);
  assert.equal(slides.length, 2, match[1] + ' has two distinct slides');
  for (const slide of slides) {
    assert.match(slide, /\brole=["']group["']/i, 'each slide exposes a group role');
    assert.match(slide, /\baria-roledescription=["']slide["']/i, 'each slide exposes slide semantics');
    assert.match(slide, /\baria-label=["']Photo [12] of 2["']/i, 'each slide has an index label');
  }
}
const swiss = articles.find(match => match[1] === 'swiss-tent')[2];
assert.match(swiss, /src=["']assets\/images\/experiences\/swiss-tent-exterior\.webp["']/);
assert.match(swiss, /src=["']assets\/images\/experiences\/swiss-tent-detail\.jpeg["']/);
assert.match(swiss, /data-experience-carousel/, 'Swiss-tent carousel uses a second reviewed tent photograph');
assert.match(swiss, /a visual reference, not a promise/i, 'Swiss-tent secondary photo has a clear availability caveat');
assert.match(css, /a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible\{outline:3px solid/);
assert.match(css, /\.experience-carousel__button:focus-visible/);
assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{scroll-behavior:auto!important;animation-duration:\.01ms!important;animation-iteration-count:1!important;transition-duration:\.01ms!important\}\}/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /\.experience-carousel__controls\[hidden\]/);
assert.match(css, /\.experience-carousel__button\{[^}]*min-height:44px/);
assert.doesNotMatch(script, /setInterval|setTimeout|autoplay/i, 'carousel does not auto-advance');

const working = makeCarousel(['camel-sunset.jpg', 'camel-day.jpg']);
const duplicate = makeCarousel(['same-image.jpg', 'same-image.jpg']);
const incomplete = makeCarousel(['only-one.jpg']);
const missingControls = makeCarousel(['one.jpg', 'two.jpg'], { missingControls: true });
const testCarousels = [working, duplicate, incomplete, missingControls];
global.document = {
  querySelectorAll(selector) {
    assert.equal(selector, '[data-experience-carousel]');
    return testCarousels.map(item => item.carousel);
  }
};
vm.runInThisContext(script, { filename: scriptPath });

assert.ok(working.carousel.classes.has('is-enhanced'), 'valid carousel should be enhanced');
assert.equal(working.controls.hidden, false, 'controls show after enhancement');
assert.equal(working.slides[0].hidden, false);
assert.equal(working.slides[1].hidden, true);
assert.equal(working.slides[0].getAttribute('aria-hidden'), 'false');
assert.equal(working.slides[1].getAttribute('aria-hidden'), 'true');
assert.equal(working.slides[0].getAttribute('aria-label'), 'Photo 1 of 2');
assert.equal(working.slides[0].getAttribute('aria-roledescription'), 'slide');
assert.equal(working.status.textContent, 'Photo 1 of 2');
working.next.click();
assert.equal(working.status.textContent, 'Photo 2 of 2');
assert.equal(working.slides[0].hidden, true);
assert.equal(working.slides[1].hidden, false);
working.next.click();
assert.equal(working.status.textContent, 'Photo 1 of 2', 'Next wraps to first photo');
working.previous.click();
assert.equal(working.status.textContent, 'Photo 2 of 2', 'Previous wraps to last photo');
assert.equal(duplicate.controls.hidden, true, 'duplicate slide sources fail closed');
assert.ok(!duplicate.carousel.classes.has('is-enhanced'));
assert.equal(incomplete.controls.hidden, true, 'single-slide markup keeps controls hidden');
assert.ok(!incomplete.carousel.classes.has('is-enhanced'));
assert.ok(!missingControls.carousel.classes.has('is-enhanced'));
delete global.document;

console.log('PASS: experience image uniqueness, alt/geometry, hero priority, accessible carousel behavior, safe fallback, focus and reduced-motion styling.');
