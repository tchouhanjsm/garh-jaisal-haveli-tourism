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
const roomCompareJs = fs.readFileSync(path.join(ROOT, 'assets/room-compare.js'), 'utf8');
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

const CORE_PUBLIC_ROUTES = [
  'index.html', 'rooms.html', 'experiences.html', 'experience-details.html',
  'dining.html', 'about.html', 'directions.html', 'gallery.html',
];
for (const route of CORE_PUBLIC_ROUTES) {
  const html = fs.readFileSync(path.join(ROOT, route), 'utf8');
  const fontStylesheets = [...html.matchAll(/<link\b[^>]*href=["']https:\/\/fonts\.googleapis\.com\/css2\?[^"']*["'][^>]*>/gi)];
  assert.equal(fontStylesheets.length, 1, route + ': exactly one Google Fonts stylesheet must be declared');
  assert.match(fontStylesheets[0][0], /display=optional/,
    route + ': font loading must not swap a late webfont into the first-view layout');
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/,
    route + ': warm the Google Fonts stylesheet connection');
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/,
    route + ': warm the cross-origin font-file connection');
}
assert.match(css, /#plan-stay \.home-plan-paths\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;/,
  'homepage planning links must not inherit the legacy pale parent surface beneath white text');
assert.match(css, /#plan-stay \.home-plan-path>strong\s*\{[^}]*color:\s*var\(--white\)/,
  'homepage planning link titles must retain the high-contrast white-on-fort-green treatment');

const roomsHtml = fs.readFileSync(path.join(ROOT, 'rooms.html'), 'utf8');
assert.match(roomsHtml, /class="page-hero page-hero--rooms"/,
  'Rooms hero must expose a route-specific class for responsive line-box reservation');
assert.match(css, /\.page-hero--rooms h1\s*\{[^}]*min-block-size:\s*2\.1em/s,
  'Rooms desktop hero must reserve its two-line headline footprint');
assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.page-hero--rooms h1\s*\{[^}]*min-block-size:\s*4\.2em/s,
  'Rooms phone hero must reserve four headline lines before font settlement');
assert.match(css, /@media \(max-width: 360px\)\s*\{[\s\S]*?\.page-hero--rooms h1\s*\{[^}]*min-block-size:\s*5\.2em/s,
  'Very narrow Rooms layouts must reserve the fifth headline line');

const photoHeroContracts = {
  'experiences.html': ['assets/images/experiences/half-day-jaisalmer-tour.jpg', 'Ornately carved sandstone havelis overlooking the historic lanes of Jaisalmer'],
  'experience-details.html': ['assets/images/gallery/desert/camp-from-above.jpeg', 'Desert camp viewed from above at night, with illuminated tent clusters and the central camp area'],
  'gallery.html': ['assets/images/directions/haveli-facade.jpg', 'Carved sandstone facade of Hotel Garh Jaisal, with the hotel name visible beside the entrance'],
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

const homeHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const experiencesHtml = fs.readFileSync(path.join(ROOT, 'experiences.html'), 'utf8');
const experienceCarouselJs = fs.readFileSync(path.join(ROOT, 'assets/experience-carousel.js'), 'utf8');
const galleryHeroHtml = fs.readFileSync(path.join(ROOT, 'gallery.html'), 'utf8');
const experienceDetailsHtml = fs.readFileSync(path.join(ROOT, 'experience-details.html'), 'utf8');
const experienceDetailsCss = fs.readFileSync(path.join(ROOT, 'assets/css/experience-details.css'), 'utf8');
assert.ok(galleryHeroHtml.includes('<picture class="page-hero__picture">'),
  'gallery.html: the source-backed hero must use the shared page-hero picture wrapper');
assert.ok(galleryHeroHtml.includes('<source type="image/webp" srcset="assets/images/directions/haveli-facade.webp 1333w" sizes="100vw">'),
  'gallery.html: source HTML must retain only the verified full-size WebP; packaging generates the responsive candidates');
assert.ok(galleryHeroHtml.includes('href="assets/images/directions/haveli-facade.webp"'),
  'gallery.html: hero preload must retain the original source-backed WebP');
assert.doesNotMatch(galleryHeroHtml, /imagesrcset=/,
  'gallery.html: generated preload candidates must not reference files before the staging pipeline creates them');
assert.equal((homeHtml.match(/data-deferred-media(?:\s|>)/g) || []).length, 7,
  'index.html: all seven supporting home-page images must defer their image payload');
assert.equal((homeHtml.match(/<template data-deferred-picture-template>/g) || []).length, 7,
  'index.html: every deferred home-page image must retain an inert responsive-image template');
assert.equal((homeHtml.match(/<noscript data-deferred-picture-fallback>/g) || []).length, 7,
  'index.html: every deferred home-page image must retain a no-JavaScript fallback');
const homeHeroSection = homeHtml.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0] || '';
assert.ok(homeHeroSection, 'index.html: the primary hero section must remain present');
assert.doesNotMatch(homeHeroSection, /data-deferred-media/,
  'index.html: the primary hero must not be placed inside deferred supporting media');
assert.match(homeHeroSection, /<img class="hero__image"[^>]*fetchpriority="high"[^>]*loading="eager"/,
  'index.html: the primary hero must remain eager and high priority');

assert.equal((galleryHeroHtml.match(/data-deferred-media(?:\s|>)/g) || []).length, 7,
  'gallery.html: all seven supporting Gallery cards must defer their image payload');
assert.equal((galleryHeroHtml.match(/<template data-deferred-picture-template>/g) || []).length, 7,
  'gallery.html: every deferred Gallery card must retain an inert responsive-image template');
assert.equal((galleryHeroHtml.match(/<noscript data-deferred-picture-fallback>/g) || []).length, 7,
  'gallery.html: every deferred Gallery card must retain a no-JavaScript image fallback');
assert.equal((experiencesHtml.match(/<figure class="experience-carousel__slide"[^>]*aria-label="Photo 1 of 2"[^>]*data-deferred-media>/g) || []).length, 6,
  'experiences.html: all six lead carousel slides must defer their supporting image payloads');
assert.equal((experiencesHtml.match(/<template data-deferred-picture-template>/g) || []).length, 6,
  'experiences.html: each deferred lead slide must retain an inert responsive-image template');
assert.equal((experiencesHtml.match(/<noscript data-deferred-picture-fallback>/g) || []).length, 6,
  'experiences.html: each deferred lead slide must retain a no-JavaScript image fallback');
const experiencesHeroStart = experiencesHtml.indexOf('<section class="page-hero page-hero--photo page-hero--experiences experience-discovery-hero">');
const experiencesHeroEnd = experiencesHtml.indexOf('</section>', experiencesHeroStart);
const experiencesHero = experiencesHeroStart >= 0 && experiencesHeroEnd >= 0
  ? experiencesHtml.slice(experiencesHeroStart, experiencesHeroEnd + '</section>'.length)
  : '';
assert.ok(experiencesHero, 'experiences.html: the first-view hero section must remain present');
assert.doesNotMatch(experiencesHero, /data-deferred-media/,
  'experiences.html: the first-view hero must never be deferred');
assert.match(experiencesHero, /fetchpriority="high"[^>]*loading="eager"/,
  'experiences.html: the first-view hero must remain eager and high priority');
assert.ok(experienceCarouselJs.includes('function getSlideImage(slide)'),
  'experience carousels must resolve the lead image from its active node or inert template');
assert.ok(experienceCarouselJs.includes("template && template.content ? template.content.querySelector('img') : null;"),
  'experience carousel validation must read the image inside the deferred template');
assert.ok(experienceCarouselJs.includes('const image = getSlideImage(slide);'),
  'experience carousel source uniqueness must use the deferred-aware image resolver');
assert.equal((roomsHtml.match(/<div class="room-card__image" data-deferred-media>/g) || []).length, 7,
  'rooms.html: all seven named-room cards must defer their supporting image payloads');
assert.equal((roomsHtml.match(/<template data-deferred-picture-template>/g) || []).length, 7,
  'rooms.html: every deferred room card must retain an inert responsive-image template');
assert.equal((roomsHtml.match(/<noscript data-deferred-picture-fallback>/g) || []).length, 7,
  'rooms.html: every deferred room card must retain a no-JavaScript image fallback');

assert.equal((experienceDetailsHtml.match(/<div class="experience-detail-media__frame" data-deferred-media>/g) || []).length, 7,
  'experience-details.html: all seven itinerary photo frames must defer their supporting image payloads');
assert.equal((experienceDetailsHtml.match(/<template data-deferred-picture-template>/g) || []).length, 7,
  'experience-details.html: every deferred itinerary photo must retain an inert responsive-image template');
assert.equal((experienceDetailsHtml.match(/<noscript data-deferred-picture-fallback>/g) || []).length, 7,
  'experience-details.html: every deferred itinerary photo must retain a no-JavaScript image fallback');
const experienceDetailsHeroStart = experienceDetailsHtml.indexOf('<section class="page-hero page-hero--photo page-hero--experience-details experience-detail-hero"');
const experienceDetailsHeroEnd = experienceDetailsHtml.indexOf('</section>', experienceDetailsHeroStart);
const experienceDetailsHero = experienceDetailsHeroStart >= 0 && experienceDetailsHeroEnd >= 0
  ? experienceDetailsHtml.slice(experienceDetailsHeroStart, experienceDetailsHeroEnd + '</section>'.length)
  : '';
assert.ok(experienceDetailsHero, 'experience-details.html: the first-view hero section must remain present');
assert.doesNotMatch(experienceDetailsHero, /data-deferred-media/,
  'experience-details.html: the first-view hero must never be deferred');
assert.match(experienceDetailsHero, /fetchpriority="high"[^>]*loading="eager"/,
  'experience-details.html: the first-view hero must remain eager and high priority');
assert.match(experienceDetailsCss, /\.experience-detail-media__frame\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/,
  'experience-details.css: deferred photo frames must reserve the existing wide-media geometry');
assert.ok(roomCompareJs.includes('function getRoomCardImage(card)')
  && roomCompareJs.includes("template.content.querySelector('img')"),
  'room comparison must resolve photographs from active DOM or inert deferred templates');
assert.equal(roomCompareJs.split('const image = getRoomCardImage(card);').length - 1, 2,
  'room comparison validation and comparison records must share the deferred-aware image resolver');
assert.match(siteJs, /function initDeferredSupportingMedia\(/,
  'shared runtime must initialize deferred supporting media');
assert.match(siteJs, /rootMargin:\s*'256px 0px'/,
  'deferred supporting media must activate only within the bounded near-viewport margin');
assert.match(siteJs, /data-deferred-media-activated/,
  'deferred supporting-media activation must expose a verifiable runtime state');
assert.match(siteJs, /function scheduleFallbackScan\(/,
  'deferred supporting-media activation must retain a bounded scroll/resize recovery scan');
assert.match(siteJs, /getBoundingClientRect\(\)/,
  'deferred supporting-media recovery scan must measure real media-container geometry');
assert.match(siteJs, /addEventListener\('scroll', scheduleFallbackScan/,
  'deferred supporting-media recovery scan must respond to visitor scrolling');
assert.match(siteJs, /addEventListener\('resize', scheduleFallbackScan/,
  'deferred supporting-media recovery scan must respond to viewport changes');

for (const route of ROUTES) {
  const html = fs.readFileSync(path.join(ROOT, route.file), 'utf8');
  const pageImages = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  assert.ok(pageImages.length > 0, route.file + ': each core route must expose its hero image');
  assert.match(pageImages[0], /\bloading="eager"/, route.file + ': the first-view hero must load eagerly');
  assert.match(pageImages[0], /\bfetchpriority="high"/, route.file + ': the first-view hero must retain high fetch priority');
  for (const [imageIndex, image] of pageImages.entries()) {
    if (imageIndex === 0) continue;
    assert.match(image, /\bloading="lazy"/, route.file + ': non-hero images must remain lazy');
    assert.match(image, /\bfetchpriority="low"/, route.file + ': non-hero images must not compete with the first-view hero');
  }
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



// M17–M19: retain configured provider handoff and enforce first-view action hierarchy.
for (const route of ROUTES) {
  const html = fs.readFileSync(path.join(ROOT, route.file), 'utf8');
  const nav = html.match(/<a class="nav-book"[^>]*data-booking-link[^>]*>[\s\S]*?<\/a>/);
  assert.ok(nav, route.file + ': masthead must preserve the source-authorized booking action');
  assert.match(nav[0], /Book Now/);
  const mobile = html.match(/<div class="mobile-booking-bar"[\s\S]*?<\/div>/);
  assert.ok(mobile && mobile[0].includes('data-booking-link'),
    route.file + ': mobile booking bar must preserve the external provider handoff');
  const hero = html.match(/<section\b[^>]*class="[^"]*(?:hero|page-hero)[^"]*"[^>]*>[\s\S]*?<\/section>/);
  assert.ok(hero, route.file + ': first-view hero must exist');
  assert.equal((hero[0].match(/class="button button--gold"/g) || []).length, 1,
    route.file + ': exactly one visually dominant hero action is required');
}
assert.match(siteJs, /mobilePrimaryActionVisible/);
assert.match(siteJs, /const guestJourneyPanel = document\.querySelector\('\.guest-journey'\)/,
  'the mobile fixed-action obstruction model must include the shared inner-page journey rail');
assert.match(siteJs, /is-suppressed-by-guest-journey/,
  'the fixed booking action must expose an explicit guest-journey suppression state');
assert.match(css, /\.mobile-booking-bar\.is-suppressed-by-guest-journey\s*\{[\s\S]*?display:\s*none\s*!important/,
  'the shared premium layer must visually remove the booking bar while it obstructs guest-journey navigation');
assert.match(css, /\.mobile-booking-bar\.is-suppressed-by-arrival-card\s*,/,
  'the shared premium layer must also own the existing Directions overlap state');
assert.match(siteJs, /!mobilePrimaryActionVisible/);
assert.match(siteJs, /addEventListener\('resize', updateDirectEnquiryDock/);
assert.match(css, /\.proof-strip\s*\{[\s\S]*?grid-template-columns:/);
assert.match(css, /#plan-stay\.home-plan-panel\s*\{[\s\S]*?display:\s*block/,
  'homepage editorial planner must not inherit the legacy booking form two-column grid');
assert.match(css, /#plan-stay\.home-plan-panel\s*\{[\s\S]*?grid-template-columns:\s*none/,
  'homepage planner must explicitly reset the legacy booking-form grid columns');
assert.match(css, /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*900px\)[\s\S]*?#plan-stay\s+\.home-plan-paths\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  'tablet homepage planner must use a balanced two-by-two decision layout');
assert.match(css, /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*900px\)[\s\S]*?\.section--intro\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.05fr\)\s+minmax\(0,\s*\.95fr\)/,
  'homepage editorial intro must use shrink-safe two-column tracks on compact tablets');
assert.match(css, /\.section--intro\s+\.intro__image\s*\{[\s\S]*?min-width:\s*0[\s\S]*?width:\s*100%/,
  'homepage intro image must be allowed to shrink within its assigned tablet grid track');
assert.match(css, /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*820px\)[\s\S]*?\.menu-toggle\s*\{[\s\S]*?display:\s*flex\s*;?[\s\S]*?\.primary-nav\.is-open\s*\{\s*display:\s*flex\s*;?\s*\}/,
  'tablet navigation must collapse the desktop link row and retain the accessible toggle/open state');



/* M22 — representative WCAG AA contrast checks for the canonical design tokens.
   These pairs are regression sentinels, not a scan of every rendered CSS combination. */
function canonicalTokenColour(name) {
  const match = siteCss.match(new RegExp('--' + name + ':\\s*(#[0-9a-f]{6})', 'i'));
  assert.ok(match, 'canonical design token must expose a six-digit hex colour: --' + name);
  return match ? match[1] : '#000000';
}
function channelLuminance(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
  return 0.2126 * channelLuminance(channels[0])
    + 0.7152 * channelLuminance(channels[1])
    + 0.0722 * channelLuminance(channels[2]);
}
function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const contrastContracts = [
  ['saffron', 'white', 4.5, 'primary action label on warm ivory'],
  ['saffron-hover', 'white', 4.5, 'primary action label in hover/focus state'],
  ['gold-dark', 'paper', 4.5, 'brass-toned text on limestone'],
  ['muted', 'paper', 4.5, 'secondary body copy on limestone'],
  ['peacock', 'white', 4.5, 'functional focus colour against warm ivory'],
  ['ink', 'paper', 4.5, 'primary text on limestone'],
  ['white', 'ink', 4.5, 'inverse text on fort pine'],
];
for (const [foregroundName, backgroundName, minimum, description] of contrastContracts) {
  const ratio = contrastRatio(
    canonicalTokenColour(foregroundName),
    canonicalTokenColour(backgroundName),
  );
  assert.ok(ratio >= minimum,
    description + ' must meet WCAG AA 4.5:1 contrast; found ' + ratio.toFixed(2) + ':1');
}
assert.ok(contrastRatio(canonicalTokenColour('gold'), '#17251e') >= 4.5,
  'antique brass accent on the fort-green editorial band must meet 4.5:1');
assert.match(css, /\.button--gold\s*\{[\s\S]*?background:\s*var\(--saffron\)/,
  'the primary hero/button treatment must consume the AA-tested saffron token');
assert.match(css, /\.mobile-booking-bar>a\s*\{[\s\S]*?background:\s*var\(--saffron\)/,
  'the persistent mobile booking action must consume the AA-tested saffron token');

console.log('PASS: premium journey, planner handoff and contextual enquiry contracts cover all eight core routes.');
