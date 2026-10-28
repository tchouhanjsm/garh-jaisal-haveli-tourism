#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const experiences = fs.readFileSync(path.join(ROOT, 'experiences.html'), 'utf8');
const details = fs.readFileSync(path.join(ROOT, 'experience-details.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'experience-discovery.css'), 'utf8');
const plain = text => text.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tagContent = (html, tag, attr, value) => {
  const open = html.indexOf(attr + '="' + value + '"');
  assert.ok(open >= 0, 'Missing ' + value);
  const start = html.lastIndexOf('<' + tag, open);
  const end = html.indexOf('</' + tag + '>', open) + tag.length + 3;
  assert.ok(start >= 0 && end >= start, 'Could not isolate ' + value);
  return html.slice(start, end);
};

assert.match(experiences, /class="page-hero page-hero--plain experience-discovery-hero"/, 'Experiences has a dedicated hero style');
assert.match(experiences, /<h1>Jaisalmer, at your own <em>pace\.<\/em><\/h1>/, 'Experiences uses the editorial headline');
assert.match(experiences, /assets\/css\/experience-discovery\.css/, 'Experiences loads the page-specific discovery styling');
assert.match(experiences, /Explore the desert, the Fort and the road beyond\./, 'Catalogue heading covers the broader guest journey');
const metaValue = (html, pattern) => (html.match(pattern) || [null, null])[1] || null;
for (const [label, html] of [['Experiences', experiences], ['Experience details', details]]) {
  const title = metaValue(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaValue(html, /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i);
  assert.ok(title && description, label + ' has title and description metadata');
  assert.equal(metaValue(html, /<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i), title,
    label + ' Open Graph title matches its page title');
  assert.equal(metaValue(html, /<meta\b[^>]*\bname=["']twitter:title["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i), title,
    label + ' Twitter title matches its page title');
  assert.equal(metaValue(html, /<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i), description,
    label + ' Open Graph description matches its meta description');
  assert.equal(metaValue(html, /<meta\b[^>]*\bname=["']twitter:description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i), description,
    label + ' Twitter description matches its meta description');
}
assert.match(experiences, /planned Fort heritage walk, car and road arrangements, and route ideas to discuss/, 'Catalogue explains the additional enquiry paths');
assert.doesNotMatch(details, /Compare the six options/i, 'Detail CTA must not frame the catalogue as only six choices');

const navMatch = experiences.match(/<nav class="experience-discovery-nav__links" aria-label="Browse by experience type">([\s\S]*?)<\/nav>/);
assert.ok(navMatch, 'Accessible experience-type navigation must be present');
const navLinks = [...navMatch[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
assert.deepEqual(navLinks.map(match => match[1]), ['#desert', '#open-sky', '#city-tours', '#experience-more-title'],
  'The four navigation links target real, useful page sections');
for (const [, href] of navLinks) {
  const target = href.slice(1);
  assert.equal([...experiences.matchAll(new RegExp('id="' + target + '"', 'g'))].length, 1,
    'Navigation target must exist exactly once: ' + target);
}
assert.match(experiences, /href="experience-details\.html#other-routes"/, 'Other route ideas remain one click away from the page');
assert.match(experiences, /href="experience-details\.html#fort-heritage-walk-detail"/, 'Fort walk links to full details');
assert.match(experiences, /href="experience-details\.html#car-and-road-travel-detail"/, 'Road arrangements link to full details');

const packageCards = [...experiences.matchAll(/<article class="experience-option" data-option="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.equal(packageCards.length, 6, 'The six source-listed package cards remain intact');
for (const match of packageCards) {
  const card = match[0];
  const detailLink = card.match(/<a\b[^>]*href="(experience-details\.html#[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(detailLink, match[1] + ' retains an in-site itinerary/details link');
  assert.match(plain(detailLink[2]), /View itinerary and details/i, match[1] + ' primary journey opens the detail page');
  const enquiryLink = card.match(/<a\b[^>]*data-enquiry-link[^>]*>/);
  assert.ok(enquiryLink, match[1] + ' keeps its separate contextual enquiry');
  assert.ok(card.indexOf(detailLink[0]) < card.indexOf(enquiryLink[0]),
    match[1] + ' must offer the information page before the enquiry action');
}
const extraGrid = experiences.match(/<div class="content-depth__grid experience-more-paths__grid">([\s\S]*?)<\/div>\s*<\/section>/);
assert.ok(extraGrid, 'More route types have their own separate section');
assert.equal((extraGrid[1].match(/<article class="content-depth__card"/g) || []).length, 3,
  'Fort walk, road arrangements and other route ideas remain separate from the package cards');

assert.match(details, /<h1 id="experience-detail-page-title">The route\. The details\. Before you <em>decide\.<\/em><\/h1>/,
  'Detail page has its own strong editorial headline');
assert.match(details, /Explore all experiences and route ideas/, 'Detail page CTA returns to the broader experience catalogue');
assert.match(details, /href="experiences\.html#experience-options"/, 'Detail CTA remains an internal navigation, not WhatsApp');
assert.match(details, /<nav class="experience-detail-jump" aria-label="Experience detail sections">/, 'Detail page has named, keyboard-accessible section jumps');
for (const id of ['sunset-camel-safari-detail','cultural-safari-detail','sleep-under-the-stars-detail','swiss-tent-safari-detail',
  'half-day-jaisalmer-tour-detail','full-day-jaisalmer-tour-detail','fort-heritage-walk-detail','car-and-road-travel-detail','other-routes']) {
  assert.equal([...details.matchAll(new RegExp('id="' + id + '"', 'g'))].length, 1, 'Detail route is unique: ' + id);
}
assert.match(details, /Ideas to discuss · not confirmed packages/, 'Unapproved routes stay enquiry-only');
assert.match(details, /assets\/css\/experience-discovery\.css/, 'Detail page loads the common editorial styling');
assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, 'Desktop navigation is structured as four clear route families');
assert.match(css, /@media \(max-width: 760px\)/, 'Small screens have a dedicated layout');
assert.match(css, /:focus-visible/, 'Discovery navigation retains visible keyboard focus');
assert.match(css, /prefers-reduced-motion: reduce/, 'Navigation respects reduced-motion settings');


const expectedResearchIdeas = [
  ['havelis-architecture', 'Havelis &amp; sandstone architecture — enquiry only', 'route-idea-havelis'],
  ['jain-temples-fort', 'Jain temples &amp; Fort architecture — enquiry only', 'route-idea-jain-temples'],
  ['gadisar-bada-bagh-photography', 'Gadisar Lake / Bada Bagh / Vyas Chhatri photography — enquiry only', 'route-idea-photography'],
  ['kuldhara-heritage', 'Kuldhara heritage &amp; desert landscape — enquiry only', 'route-idea-kuldhara'],
  ['akal-fossil-desert-national-park', 'Akal Wood Fossil Park or Desert National Park — enquiry only', 'route-idea-natural-history'],
  ['longewala-memorial', 'Longewala War Memorial history excursion — enquiry only', 'route-idea-longewala'],
];
const researchSection = experiences.match(/<section class="section wrap experience-research-ideas"[\s\S]*?<\/section>/);
assert.ok(researchSection, 'Research-led route ideas have a dedicated section on the Experiences hub');
assert.match(plain(researchSection[0]), /not ready-made tours/i, 'The hub explicitly distinguishes ideas from bookable packages');
const routeCards = [...researchSection[0].matchAll(/<article class="content-depth__card experience-research-idea" data-route-idea="([^"]+)"[\s\S]*?<\/article>/g)];
assert.deepEqual(routeCards.map(match => match[1]), expectedResearchIdeas.map(idea => idea[0]), 'The six research-led themes remain in the approved research order');
const formMatch = experiences.match(/<form class="guest-enquiry-form" data-guest-enquiry-form>[\s\S]*?<\/form>/);
assert.ok(formMatch, 'Experiences route enquiry form exists');
const detailsFormMatch = details.match(/<form class="guest-enquiry-form" data-guest-enquiry-form>[\s\S]*?<\/form>/);
assert.ok(detailsFormMatch, 'Experience details route enquiry form exists');
for (const [key, optionLabel, detailId] of expectedResearchIdeas) {
  const card = routeCards.find(match => match[1] === key)?.[0] || '';
  assert.ok(card.includes('href="experience-details.html#' + detailId + '"'), key + ' links to its planning notes');
  assert.match(card, /data-enquiry-link/, key + ' has a contextual enquiry action');
  assert.match(card, /enquiry only, not a reservation/i, key + ' must not imply a confirmed offering');
  assert.ok(formMatch[0].includes('<option>' + optionLabel + '</option>'), key + ' is available in the Experiences enquiry form');
  assert.ok(detailsFormMatch[0].includes('<option>' + optionLabel + '</option>'), key + ' is available in the details enquiry form');
}
assert.match(researchSection[0], /aria-labelledby="experience-research-ideas-title"/, 'The route idea section has an accessible heading association');
assert.match(css, /\.experience-research-ideas__grid/, 'Research idea cards have scoped layout styling');
assert.match(css, /\.experience-research-idea__actions a:focus-visible/, 'Research idea actions retain visible keyboard focus');

console.log('PASS: experience discovery navigation, package/detail separation, extra route paths, editorial headline and enquiry-only route guardrails.');
