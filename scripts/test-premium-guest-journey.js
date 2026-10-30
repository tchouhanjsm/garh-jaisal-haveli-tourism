#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES = [
  { file: 'index.html', journey: false, planner: false },
  { file: 'rooms.html', journey: true, current: 'rooms.html' },
  { file: 'experiences.html', journey: true, current: 'experiences.html', planner: false },
  { file: 'experience-details.html', journey: true, planner: false },
  { file: 'dining.html', journey: true, current: 'dining.html', planner: false },
  { file: 'about.html', journey: true },
  { file: 'directions.html', journey: true, current: 'directions.html#arrival-planning', planner: false },
  { file: 'gallery.html', journey: true },
];

const stylesheet = 'assets/css/premium-guest-journey.css';
const cssPath = path.join(ROOT, stylesheet);
const css = fs.readFileSync(cssPath, 'utf8');
const siteCssPath = path.join(ROOT, 'assets/site.css');
const siteCss = fs.readFileSync(siteCssPath, 'utf8');
const siteJs = fs.readFileSync(path.join(ROOT, 'assets/site.js'), 'utf8');
const stayPlannerJs = fs.readFileSync(path.join(ROOT, 'assets/stay-planner.js'), 'utf8');
const stayPlannerCss = fs.readFileSync(path.join(ROOT, 'assets/css/stay-planner.css'), 'utf8');

assert.equal((siteCss.match(/:root\s*\{/g) || []).length, 1,
  'the main stylesheet must own exactly one canonical design-token root');
assert.doesNotMatch(css, /:root\s*\{/,
  'the premium layer must consume canonical design tokens, not redefine the palette');
assert.match(siteCss, /--ink:\s*#1a2821/i, 'the canonical ink token must match the approved premium palette');
assert.match(siteCss, /--paper:\s*#f7f3ea/i, 'the canonical paper token must match the approved premium palette');
assert.match(siteCss, /--gold-dark:\s*#765735/i, 'the canonical accessible gold-ink token must be explicit');
assert.match(siteCss, /--saffron:\s*#b94a0e/i, 'primary actions must use the high-contrast saffron token');
assert.match(siteCss, /--peacock:\s*#1d7472/i, 'functional focus states must use the peacock token');
assert.match(css, /\.button--gold\s*\{[\s\S]*?background:\s*var\(--saffron\)/,
  'primary booking and enquiry actions must use the saffron action colour');
assert.match(css, /#plan-stay\.home-plan-panel\s*\{[\s\S]*?background:[\s\S]*?#17251e/i,
  'homepage planning must be a continuous dark editorial panel, not a white bordered card');
assert.match(css, /\.guest-journey\s*\{[\s\S]*?width:\s*100%[\s\S]*?border:\s*0[\s\S]*?background:/,
  'inner-route decision journey must be a full-bleed band, not a floating bordered card');
assert.match(siteCss, /--container:\s*1280px/i, 'the canonical content rail must be 1280px');
assert.match(siteCss, /--premium-ease:\s*cubic-bezier\(/, 'shared motion easing must be centralized');
assert.match(siteCss, /--premium-shadow:\s*0 18px 52px/, 'shared premium shadow must be centralized');
assert.match(siteCss, /--button-height:\s*52px/, 'primary control height must use a shared token');
assert.match(siteCss, /--control-radius:\s*6px/, 'control geometry must use a shared radius token');
assert.match(siteCss, /--focus-ring:\s*3px solid/, 'keyboard focus ring must be centralized');
assert.ok(siteCss.includes('--type-meta: 11px'), 'canonical CSS must own a compact metadata role');
assert.ok(siteCss.includes('--type-label: 12px'), 'canonical CSS must own an interactive label role');
assert.ok(siteCss.includes('--type-support: 14px'), 'canonical CSS must own a readable support-copy role');
assert.ok(siteCss.includes('--type-body: 16px'), 'canonical CSS must retain a 16px body baseline');
assert.ok(css.includes('.guest-journey__copy small') && css.includes('font-size: var(--type-label)'),
  'guest-journey descriptions must use the shared readable label role');
assert.ok(css.includes('.experience-card p') && css.includes('font-size: var(--type-support)'),
  'experience-card descriptions must use the shared support-copy role');
assert.ok(css.includes('.faq-item > p') && css.includes('font-size: var(--type-support)'),
  'FAQ answers must use the shared support-copy role');
assert.ok(css.includes('.stay-planner__topic') && css.includes('font-size: var(--type-support)'),
  'planner topic choices must use the shared support-copy role');
assert.ok(css.includes('.arrival-quick-card .arrival-quick-list p') && css.includes('font-size: var(--type-support)'),
  'arrival summary copy must use the shared support-copy role');
assert.ok(css.includes('.footer-address .text-link') && css.includes('font-size: var(--type-support)'),
  'the exact hotel-pin footer link must not be reduced by the more-specific legacy footer rule');
assert.ok(css.includes('.experience-detail-actions .text-link') && css.includes('font-size: var(--type-support)'),
  'experience-detail action links must retain the readable support role');


assert.match(css, /\.wrap\s*\{[\s\S]*?width:\s*min\(var\(--container\)/,
  'premium content wrapper must consume the shared canonical container width');
assert.match(css, /\.guest-journey\s*\{[\s\S]*?width:\s*100%/,
  'guest-journey rail must be a full-bleed editorial band rather than a floating card');
assert.match(css, /\.button\s*\{[\s\S]*?min-height:\s*var\(--button-height\)[\s\S]*?border-radius:\s*var\(--control-radius\)/,
  'shared buttons must consume the canonical interaction geometry tokens');
assert.match(css, /\.guest-journey__steps\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  'desktop journey needs four consistently aligned steps');
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.guest-journey__steps\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  'mobile journey must wrap to two columns');
assert.match(css, /\.guest-journey__step\[aria-current="page"\]/,
  'current route must receive a distinct but restrained state');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  'respect reduced-motion preferences');
assert.match(css, /\.guest-journey__step:focus-visible/,
  'journey links must expose keyboard focus styling');
assert.match(css, /@media\s*\(max-width:\s*1080px\)[\s\S]*?\.guest-journey\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
  'tablet layout must stack the journey introduction above its link grid');
assert.match(css, /@media\s*\(max-width:\s*420px\)[\s\S]*?\.guest-journey__number\s*\{[\s\S]*?display:\s*none/,
  'very narrow phones must prioritize action labels over decorative step numbers');
assert.match(css, /\.room-card:hover[\s\S]*?transform:\s*translateY\(-3px\)/,
  'interactive catalogue cards must use a restrained hover affordance');
assert.match(css, /\.guest-enquiry-panel,[\s\S]*?\.guest-enquiry-recovery/,
  'enquiry panels must share the premium form surface treatment');
assert.match(css, /\.direct-enquiry-dock\[hidden\][\s\S]*?display:\s*none\s*!important/,
  'dock must remain absent until safe reveal conditions are satisfied');
assert.match(css, /\.direct-enquiry-dock__dismiss[\s\S]*?min-width:\s*44px/,
  'dock dismissal must provide a 44px touch target');
assert.match(css, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.direct-enquiry-dock\s*\{/,
  'dock must have a narrow-phone layout');
assert.match(siteJs, /querySelector\('\[data-direct-enquiry-dock\]'\)/,
  'shared runtime must initialize the contextual direct-enquiry dock');
assert.match(siteJs, /window\.scrollY > 360/,
  'dock must wait until the visitor has moved past the initial view');
assert.match(siteJs, /IntersectionObserver/,
  'dock visibility must respect actual enquiry forms and footer visibility');
assert.match(siteJs, /directEnquiryDismissed/,
  'dismissal must persist for the current page view');

assert.match(siteJs, /garh-jaisal:contact-ready/,
  'central contact validation must publish the authorized handoff readiness state');
assert.match(stayPlannerJs, /document\.addEventListener\('garh-jaisal:contact-ready'/,
  'the stay planner must consume the central contact readiness state');
assert.match(stayPlannerJs, /searchParams\.set\('text', message\)/,
  'WhatsApp handoff must URL-encode the edited message safely');
assert.match(stayPlannerJs, /whatsappButton\.addEventListener\('click'/,
  'the planner must only launch its external handoff after an explicit click');
assert.match(stayPlannerCss, /\.stay-planner__quick-links a:focus-visible/,
  'quick decision links must have a visible keyboard focus state');

function tokenHex(name) {
  const tokenLine = siteCss.split(/\r?\n/).find(line => line.trim().startsWith('--' + name + ':'));
  const match = tokenLine && tokenLine.match(/#[0-9a-f]{6}/i);
  assert.ok(match, 'expected canonical colour token --' + name);
  return match[0];
}
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
for (const [label, foreground, background] of [
  ['primary saffron action', tokenHex('saffron'), tokenHex('white')],
  ['deep brass text', tokenHex('gold-dark'), tokenHex('paper')],
  ['fort-green body contrast', tokenHex('ink'), tokenHex('paper')],
  ['peacock focus state', tokenHex('peacock'), tokenHex('white')],
]) {
  const ratio = contrastRatio(foreground, background);
  assert.ok(ratio >= 4.5, label + ' must meet WCAG AA normal-text contrast; observed ' + ratio.toFixed(2));
}

const photoHeroContracts = {
  'experiences.html': ['assets/images/experiences/swiss-tent-exterior.webp', 'White Swiss-style tents at a desert camp in warm evening light'],
  'experience-details.html': ['assets/images/gallery/desert/camp-from-above.jpeg', 'Desert camp viewed from above at night, with illuminated tent clusters and the central camp area'],
  'gallery.html': ['assets/images/directions/haveli-facade.webp', 'Carved sandstone facade of Hotel Garh Jaisal, with the hotel name visible beside the entrance'],
  'dining.html': ['assets/images/dining/rooftop-candlelit-table.jpg', 'Candlelit rooftop table with patterned cushions and the illuminated Jaisalmer skyline beyond'],
};
for (const [route, [imagePath, altText]] of Object.entries(photoHeroContracts)) {
  const html = fs.readFileSync(path.join(ROOT, route), 'utf8');
  assert.match(html, /page-hero[^"]*page-hero--photo/,
    route + ': the first-view hero must be photographic rather than a gradient placeholder');
  assert.doesNotMatch(html, /page-hero--plain/,
    route + ': do not regress to the plain gradient hero');
  assert.ok(html.includes('src="' + imagePath + '"'), route + ': hero must use the reviewed source-backed image');
  assert.ok(html.includes('alt="' + altText + '"'), route + ': hero alt text must describe the reviewed image');
  assert.match(html, /fetchpriority="high"/, route + ': hero image must be high priority');
  assert.match(html, /loading="eager"/, route + ': hero image must be eager');
  assert.match(html, /rel="preload" as="image"[^>]*fetchpriority="high"/,
    route + ': hero image must be preloaded');
}

for (const route of ROUTES) {
  const html = fs.readFileSync(path.join(ROOT, route.file), 'utf8');
  const dockMatches = [...html.matchAll(/<aside class="direct-enquiry-dock" data-direct-enquiry-dock[\s\S]*?<\/aside>/g)];
  assert.equal(dockMatches.length, 1, route.file + ': each core route must expose exactly one contextual enquiry dock');
  const dock = dockMatches[0] ? dockMatches[0][0] : '';
  assert.match(dock, /aria-label="Ask the hotel directly"/, route.file + ': dock needs a named landmark');
  assert.match(dock, /\bhidden(?:\s|>)/, route.file + ': dock must start hidden before safe reveal conditions');
  assert.match(dock, /data-enquiry-link/, route.file + ': dock action must use existing contact validation');
  assert.match(dock, /aria-disabled="true" aria-describedby="contact-status"/, route.file + ': dock action must start disabled until contact validation completes');
  assert.match(dock, /data-enquiry-message="[^"]{40,}"/, route.file + ': dock must carry a contextual draft');
  assert.match(dock, /data-direct-enquiry-dismiss aria-label="Dismiss direct enquiry"/,
    route.file + ': visitors must be able to dismiss the dock accessibly');
  assert.match(dock, /Nothing is sent automatically/, route.file + ': draft-only disclosure must be visible');
  assert.equal((html.match(/assets\/css\/premium-guest-journey\.css/g) || []).length, 1,
    route.file + ': the shared visual system must be loaded exactly once');
  const allStyles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
  assert.ok(allStyles.length, route.file + ': expected linked stylesheets');
  assert.ok(allStyles[allStyles.length - 1][0].includes('assets/css/premium-guest-journey.css'),
    route.file + ': premium visual layer must load after route-specific styles');
  if (route.planner === false) {
    assert.equal((html.match(/data-stay-planner/g) || []).length, 0,
      route.file + ': this route must not repeat the generic multi-topic stay planner');
    assert.doesNotMatch(html, /assets\/css\/stay-planner\.css|assets\/stay-planner\.js/,
      route.file + ': do not load unused generic planner assets');
    const contextualContracts = {
      'index.html': /<section id="plan-stay" class="booking-panel wrap home-plan-panel"/,
      'experiences.html': /<form class="guest-enquiry-form" data-guest-enquiry-form>/,
      'experience-details.html': /<form class="guest-enquiry-form" data-guest-enquiry-form>/,
      'dining.html': /data-restaurant-table-form/,
      'directions.html': /data-arrival-planning-form/,
    };
    assert.ok(contextualContracts[route.file], route.file + ': an explicit conversion contract must be defined');
    assert.match(html, contextualContracts[route.file],
      route.file + ': route-specific booking/enquiry path must remain present');
    if (route.file === 'dining.html') {
      assert.equal((html.match(/data-restaurant-table-form/g) || []).length, 1,
        'dining.html: retain one dedicated table enquiry form');
      assert.match(html, /Your table is not reserved until the restaurant replies and confirms it/,
        'dining.html: table enquiry must not be presented as a reservation');
    }
    if (route.file === 'directions.html') {
      assert.match(html, /class="arrival-next-step__panel"/,
        'directions.html: terminal action must return guests to the arrival planner');
    }
  } else {
  const plannerMatch = html.match(/<section class="stay-planner wrap" data-stay-planner[\s\S]*?<\/section>/);
  assert.ok(plannerMatch, route.file + ': each core route must expose the shared stay planner');
  assert.equal((html.match(/<section class="stay-planner wrap" data-stay-planner\b/g) || []).length, 1,
    route.file + ': planner must appear exactly once per route');
  const planner = plannerMatch ? plannerMatch[0] : '';
  assert.match(planner, /<nav class="stay-planner__quick-links" aria-label="Explore stay details">[\s\S]*?<\/nav>/,
    route.file + ': planner must connect room, experience, dining, arrival and gallery decision pages');
  assert.deepEqual([...planner.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(match => match[1]),
    ['rooms.html', 'experiences.html', 'dining.html', 'directions.html#arrival-planning', 'gallery.html'],
    route.file + ': planner decision links must use the expected local route set');
  assert.match(planner, /data-open-stay-plan-whatsapp disabled/,
    route.file + ': WhatsApp handoff must start disabled until configuration and a draft are ready');
  assert.match(planner, /data-copy-stay-plan disabled/,
    route.file + ': copy fallback must start disabled until a draft exists');
  assert.doesNotMatch(planner, /data-stay-plan-draft[^>]*readonly/,
    route.file + ': guests must be able to edit their generated message directly');
  assert.match(planner, /Opening WhatsApp creates a draft for you to review; you must press Send yourself/,
    route.file + ': handoff disclosure must distinguish an enquiry from a sent message or booking');
  }

  if (!route.journey) {
    assert.doesNotMatch(html, /<section class="guest-journey"/,
      route.file + ': homepage must retain its own planning panel instead of duplicating the shared rail');
    const homePanel = html.match(/<section id="plan-stay"[^>]*>([\s\S]*?)<\/section>/);
    assert.ok(homePanel, 'index.html: expected the primary home planning panel');
    const homeLinks = [...homePanel[1].matchAll(/<a class="home-plan-path" href="([^"]+)"/g)];
    assert.equal(homeLinks.length, 4, 'index.html: home planning panel must expose four decision paths');
    assert.deepEqual(homeLinks.map(match => match[1]), ['rooms.html', 'experiences.html', 'dining.html', 'directions.html#arrival-planning'],
      'index.html: home decision paths must use the same predictable Stay / Explore / Dine / Arrive order');
    continue;
  }
  const journeyMatch = html.match(/<section class="guest-journey" aria-label="Plan your stay">([\s\S]*?)<\/section>/);
  assert.ok(journeyMatch, route.file + ': missing shared guest decision path');
  const journey = journeyMatch[1];
  assert.match(journey, /<nav aria-label="Stay planning steps">/,
    route.file + ': decision links must be grouped in a labelled navigation landmark');
  const links = [...journey.matchAll(/<a class="guest-journey__step" href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 4, route.file + ': journey must present four clear next steps');
  assert.deepEqual(links.map(m => m[1]), ['rooms.html', 'experiences.html', 'dining.html', 'directions.html#arrival-planning'],
    route.file + ': the journey route order must stay predictable');
  for (const link of links) {
    assert.match(link[3], /<strong>/, route.file + ': every step needs a visible action label');
    assert.match(link[3], /<small>/, route.file + ': every step needs a supporting description');
    assert.doesNotMatch(link[1], /^(?:https?:|\/\/|javascript:|data:)/i,
      route.file + ': journey must use local site routes');
  }
  const currentLinks = links.filter(m => /\baria-current="page"/.test(m[2]));
  if (route.current) {
    assert.equal(currentLinks.length, 1, route.file + ': expected exactly one current journey step');
    assert.equal(currentLinks[0][1], route.current, route.file + ': current step does not match this route');
  } else {
    assert.equal(currentLinks.length, 0, route.file + ': parent-route link must not be mislabeled as current page');
  }
  assert.match(journey, /Plan the details that matter\./, route.file + ': missing clear guest-facing journey headline');
}

const allDockMessages = ROUTES.map(route => {
  const html = fs.readFileSync(path.join(ROOT, route.file), 'utf8');
  const block = html.match(/<aside class="direct-enquiry-dock" data-direct-enquiry-dock[\s\S]*?<\/aside>/);
  const message = block && block[0].match(/data-enquiry-message="([^"]+)"/);
  assert.ok(message, route.file + ': expected a route-specific enquiry draft');
  return message ? message[1] : '';
});
assert.equal(new Set(allDockMessages).size, ROUTES.length, 'each core route must keep its own contextual draft');

console.log('PASS: premium journey, planner handoff and contextual enquiry contracts cover all eight core routes.');
