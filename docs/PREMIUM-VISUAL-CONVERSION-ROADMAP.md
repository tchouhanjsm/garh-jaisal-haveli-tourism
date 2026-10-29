# Premium Visual Refinement, Directions and Journal Roadmap

**Repository:** `tchouhanjsm/garh-jaisal-haveli-tourism`  
**Source/reference repository:** `tchouhanjsm/garh-jaisal-website`  
**Baseline reviewed:** tourism `main` at `7604d4fe52c5f0fbd9bb5df5832a777d5dfc232b`; PR #64 is already merged.  
**Status:** execution framework and design specification. This file is not a claim of a visual sign-off, publication approval, or production release.

## Delivery log

- **M2 — Directions vertical slice in progress:** the current PR adds section navigation, qualified walking-distance facts, four-step arrival guidance, travel-choice cards and an exact-pin orientation panel. This refinement adds a prioritized hero summary, makes the map orientation visual, separates railway/airport/road decisions, and removes repeated lower-page contact/photo/checklist sections.
- **Regression coverage:** static contracts and rendered Chromium checks include the hero summary, unique section targets, four-step route, differentiated transport options, source-qualified map guidance and responsive layout across the six audit widths. The mobile fixed Book Now bar yields when it would obscure the hero summary and restores when clear, with visible/accessible state checked in Chromium.
- **CI contract correction:** retained a dedicated accessible facade-reference section, descriptive hero image alt text, and explicit contextual WhatsApp/phone arrival-confirmation copy required by the repository’s existing content/UX gate.
- **Evidence state:** exact-head CI, screenshot inspection and human staging UAT are required before the milestone is marked verified. No blog content is published and canonical/robots/sitemap release gates remain unchanged.

## 1. Objective and bar

Move Garh Jaisal Haveli from a coherent, well-structured static site to a distinctive, art-directed heritage-hospitality experience that can credibly compete with a high-budget custom website on visual craft, guest confidence, direct-enquiry clarity and operational quality.

“$10,000 quality” is an internal bar, not a price guarantee or a claim about commercial valuation. Feature count is not the score. Each milestone must improve a visible guest decision and be evidenced at real viewport sizes.

### Design constitution

- **Brand idea:** a living fort, a family home. Architectural, intimate, locally grounded and photo-led; never generic palace luxury.
- **Palette:** retain warm ivory, deep fort green/charcoal, sandstone and restrained antique-gold accents. Maintain strong text contrast on photography and coloured surfaces.
- **Type:** expressive editorial serif for headlines; clear, highly readable sans-serif for body and controls. Headlines may be dramatic; practical information must not become tiny or low contrast.
- **Composition:** deliberate whitespace, varied but consistent section rhythm, clear hierarchy, asymmetrical editorial layouts where the content warrants it, restrained borders and purposeful image cropping.
- **Photography:** the property’s real photos are a primary design asset. Review their actual pixels, crop, focal subject and accuracy against the adjacent copy. Never treat a filename, caption, or image of a similar room as proof that the pictured room/product is available.
- **Interaction:** one obvious primary action per section; secondary actions stay secondary. No fake urgency, fabricated reviews, invented prices, false availability or unconfirmed service promises.
- **Motion:** restrained, optional, and respectful of reduced-motion preferences.
- **Implementation:** keep semantic HTML, existing CSS and vanilla JavaScript. Reuse canonical shared styles/components; avoid adding another competing visual layer unless a measured reason exists.

## 2. Baseline: what exists and what does not

### Existing tourism-site routes

The eight established core pages are `index.html`, `rooms.html`, `experiences.html`, `experience-details.html`, `dining.html`, `about.html`, `directions.html`, and `gallery.html`. The branded `404.html` is a recovery route.

### Blog/Journal status

There is **no public Blog/Journal archive page or public article template yet** in the tourism site. The repository does already have:
- `content/blogs/*.json`: 12 structured article records (one pillar plus 11 supporting ideas).
- `content/schemas/blog.schema.json`: record contract.
- `content/paths.json`: intended output route pattern `/blogs/{slug}.html`.
- `scripts/build-content-pages.js`: a guarded content renderer.
- editorial content, media-readiness and draft-only tests.

The records are intentionally drafts. The current renderer/test contract expects zero public blog HTML pages until the necessary editorial, owner-fact, media-rights/visual and release approvals pass. Do not bypass that gate just to make the Journal look populated. Build the archive and article template in a local/preview mode first, with all draft-only records excluded from public navigation, sitemap and indexability.

### Existing Directions status

`directions.html` already communicates the fort’s pedestrian final approach, source-listed approximate distances, vehicle-access caveats, map/contact options, FAQs and a contextual enquiry. It also includes the shared guest journey.

The authoritative legacy implementation in `garh-jaisal-website/direction.php` has a richer information hierarchy and useful interaction ideas:
- photo-led arrival hero with direct Call/WhatsApp actions and a high-visibility “Plan for the final walk” summary;
- named section navigation for quick directions, travel options, walking/mobility, map and FAQs;
- compact arrival facts;
- four numbered parking-to-door steps;
- travel options for railway station, airport and fort access;
- walking-surface/access needs;
- embedded map plus exact external hotel pin;
- arrival-specific contact card and address;
- contextual FAQs and next-step links.

Reuse this structure and the lessons from `tests/e2e/directions-arrival-design.spec.js` and `tests/e2e/arrival-contact-journey.spec.js`, **not** legacy PHP code or unverified operational statements. In particular, do not copy a fixed rickshaw-hours promise from the legacy page. Current tourism-source contracts explicitly reject the 8 AM–8 PM claim and require access to be described as variable and confirmed for the date. The source-listed 200 m/3–4 min entrance estimate also remains provisional until owner confirmation. Never imply live routing, guaranteed luggage assistance, a guaranteed meeting point, or a confirmed transfer.

### Current constraints that must remain intact

- Canonical host approval is a separate owner decision; it must remain unapproved until explicitly authorized.
- Current production `robots.txt` and empty sitemap policy are intentional pre-launch safeguards.
- Booking engine and contact details are source-authorized values, not independently live-tested endpoints.
- Booking is external; a click or enquiry is not a confirmed booking.
- No current menu, rates, reception/check-in times, transfer costs, vehicle access hours, tour inclusions or assistance promises may be inferred from legacy copy.
- No staging/production deployment or release decision is implied by a green local/CI test.

## 3. Visual design scorecard

Score each category 0–10 from **rendered screenshot/browser evidence**, not source inspection alone.

| Dimension | Weight | Evidence required for a 9–10 |
|---|---:|---|
| Art direction and brand distinctiveness | 15% | Distinctive fort/heritage identity, authentic photo focal points, disciplined palette/type and no generic-template feel |
| Typography and readability | 10% | Excellent hierarchy and line breaks; legible body, labels and controls at actual size; correct contrast |
| Layout rhythm and composition | 15% | Deliberate pacing, balanced whitespace, varied storytelling, aligned grids, no repetitive section treadmill |
| Photography and image delivery | 15% | Correct subject/caption, art-directed crop, consistent tone, responsive candidate chosen correctly, measured payload |
| Navigation and responsive craft | 10% | Predictable route hierarchy, accessible menus, no overflow/overlap, mobile controls never obscure content |
| Conversion and guest confidence | 15% | One clear primary action per decision, relevant CTAs, truthful booking/enquiry states, complete recovery paths |
| Accessibility and interaction quality | 10% | Keyboard, visible focus, semantic regions, labels/error recovery, reduced motion and touch targets |
| Technical/content integrity | 10% | Valid routes/assets, unique metadata, safe schema, guarded publication, contact/booking link contracts |
| **Total** | **100%** | **Target: 90/100 or higher after human screenshot review and exact-head QA** |

A category cannot receive more than 7/10 until rendered screenshots are reviewed at desktop and mobile. Missing evidence is “not yet scored,” not an assumed pass. The weighted target is a design/QA gate, not a market-price valuation.

## 4. Milestones and release gates

Deliver one meaningful vertical slice per phase. Batch markup, canonical styles, behaviour, tests and screenshot evidence together; do not scatter isolated polish commits. Do not merge or deploy automatically.

### M0 — Evidence baseline and design audit

**Goal:** establish an objective before-state before further redesign.

Deliverables:
- full-page and first-viewport screenshot sheet for every current route;
- viewports 320, 360, 390, 768, 1280 and 1440 CSS px;
- key states: navigation open, room filtering/compare, enquiry form, planner disclosure, FAQ, error/fallback;
- image map: actual subject, intended role, crop, byte size, loading priority and references;
- design scorecard, top 15 severity-ranked issues and route-by-route conversion map;
- current exact-head CI status recorded.

Acceptance:
- no scoring claimed from full-page captures alone;
- every high-severity finding links to route/viewport evidence;
- baseline preserves all public route names, contact destinations and SEO/release gates.

### M1 — Premium design-system consolidation

**Goal:** make the existing site feel deliberately art-directed, not merely consistent.

Deliverables:
- map stylesheet load order and ownership before edits;
- one canonical scale for type, spacing, content width, buttons, forms, image ratios, border/shadow and responsive gutters;
- strengthen hero focal point, contrast overlay, kicker/headline/lede balance and CTA hierarchy;
- normalize room/experience/editorial cards without forcing identical layouts on different content;
- replace over-repeated section patterns with a planned rhythm: feature story, fact strip, editorial split, grid only when comparison helps, then focused CTA;
- preserve reduced-motion and visible-focus behavior.

Acceptance:
- compare before/after screenshots for all eight routes at 390 and 1280 px;
- no clipping, overflow, duplicate CSS ownership introduced or unexplained new dependencies;
- no route-specific visual regression hidden by a homepage-only approval.

### M2 — Directions/arrival redesign from the authoritative reference

**Goal:** make the final arrival easy to understand before booking/travel, with the most important fact surfaced immediately.

**Proposed section sequence**
1. Photo-led hero: “Arrive inside Jaisalmer Fort.” One concise paragraph explains that vehicles cannot reach the hotel door; primary actions are Call and WhatsApp/enquiry after authorized config loads.
2. Quick-arrival summary card: Fort Parking, final walk, uneven/narrow lanes and steps, and a prominent exact hotel pin.
3. Sticky/scrollable section navigation to Quick directions, Travel options, Walking & mobility, Map, FAQs. It must not obscure headings or fixed controls.
4. Practical fact cards: source-backed parking and fort-entrance estimates, clearly marked approximate and not live route measurements.
5. Four-step arrival process: share ETA → confirm drop-off/parking → confirm help if required → complete final walk.
6. Travel options: train, airport and local vehicle approach; ask guests to confirm pickup point, provider, fare and availability for the date, not publish guessed time/cost.
7. Access and mobility: uneven surfaces/steps, luggage and mobility questions; make no promise of assistance or step-free access.
8. Map panel: embedded map only if the exact map endpoint is approved and usable, plus a separate external exact-pin link and a plain-text address fallback.
9. Arrival enquiry: contextual date/ETA/transport/mobility draft using existing authorized contact runtime; minimal fields, explicit “enquiry only,” user-controlled send, copy fallback, no page-side storage or network submission.
10. FAQs and related links: rooms, booking guide, dining and experiences.
11. One terminal CTA, not multiple repeated full-width promos.

Design behavior:
- desktop: readable hero copy and quick summary side-by-side if the image/viewport supports it;
- mobile: stack the essentials card near the hero, keep phone/map actions reachable, and suppress any fixed dock when it overlaps the card or inputs;
- section-nav links scroll to visible, correctly named headings and preserve keyboard focus;
- lazy-load the embedded map and below-fold imagery; do not preload the map;
- use the local, source-reviewed hotel facade image only for the appropriate purpose and verify the actual pixels before use.

Acceptance:
- reuse/extend `scripts/test-arrival-wayfinding.js` and `scripts/test-arrival-planning-enquiry.js`, plus Chromium checks for route rendering, section nav, map link and CTA behavior;
- no horizontal overflow, sticky/fixed overlap, invalid hash target or keyboard focus loss at the six responsive widths;
- test mobile viewport with the quick-arrival card intersecting the bottom CTA;
- validate every claim against `docs/OWNER-FACTS.md` in the source repository and current tourism contracts. No unverified 8 AM–8 PM claim or guaranteed assistance.
- preserve existing Directions route and working local links; if the exact hotel map pin is unavailable, show an honest fallback rather than a fake/guessed URL.

### M3 — Build a real Journal/Blog experience (preview-only first)

**Goal:** add the missing archive UX and article presentation without prematurely publishing the draft records.

Deliverables:
- add a real `journal.html` or `blog.html` archive route (choose one canonical local path; use “Journal” consistently in visible navigation and page titles);
- featured Fort guide area, an editorial featured story, clear topic browse controls, searchable article grid, article card with approved image/alt, topic and reading context only where computable;
- article template route under the existing proposed `/blogs/{slug}.html` pattern;
- article reading layout: breadcrumb, H1, lede, optional article-specific hero after media approval, table of contents with real anchors, structured sections, source links, reviewed-date display only after real review, related guides, relevant stay/explore CTA;
- no false author/review date, no invented reading time, no broken TOC/related links, no generic repeated stock photography;
- responsive typography, quiet table-of-contents treatment, strong readable measure and article-specific art direction.

Publication architecture:
- use `content/paths.json`, `content/schemas/blog.schema.json`, and `scripts/build-content-pages.js`;
- output is preview-only unless a record is individually eligible under the current content status policy;
- keep all 12 current records as drafts until editorial/source/fact/media approvals are documented;
- don't add draft article routes to public nav, sitemap or indexable output;
- canonicalHostApproved stays false, robots stays blocking and sitemap stays empty;
- test preview rendering into a temporary output directory; don't write generated pages into the repo as a side effect of read-only tests;
- a later owner-approved publishing milestone can separately render eligible `approved_for_release`/live records and approve canonical SEO changes. Never bundle that release decision with the visual implementation.

Acceptance:
- one genuine archive route and at least one complete preview article rendered from the schema, with the remaining draft cards clearly isolated in preview/editor-only output;
- all TOC targets, related links and local assets verified;
- unique title/description, Article/BlogPosting schema only in eligible output, breadcrumb schema parity and safe escaped content;
- article media has recorded pixel review, creator/rights evidence, correct image alt/caption and role-specific size budget before publication;
- no public absolute canonical URLs, no live blog pages from drafts, no sitemap or robots change.

### M4 — Cross-page conversion optimization

**Goal:** remove friction without adding more repeated CTAs.

Route-specific primary goals:
- Home → check rooms/rates or choose a clear planning path.
- Rooms → compare meaningful differences, ask about exact room/dates, then move to the existing booking gateway.
- Experiences → choose category/detail and prepare a contextual enquiry with inclusions/current price/date confirmation.
- Dining → ask about current menu/service hours/table availability; no assumed reservation.
- Directions → confirm exact pin/drop-off/final walk and ask about needed assistance.
- About/Gallery → support trust and discovery, with one contextual next step.
- Journal/article → answer question first, then a relevant room/experience/arrival CTA.

Deliverables:
- map every CTA to user intent, target, label, event/data contract and fallback state;
- remove duplicate/promotional CTAs where they compete, retain actions that solve distinct needs;
- reduce fields to what the hotel needs for the first reply;
- contextualize guest message drafts by page intent; never treat opening WhatsApp as sending or booking;
- use current analytics IDs only after verifying event consent/configuration and never send message contents or guest notes to analytics.

Acceptance:
- every page has one dominant action per decision section;
- no dead-end CTA, false availability label, form navigation leakage or stored guest details;
- Playwright flow tests each route's main conversion path, fallback and error state.

### M5 — SEO/content graph and Journal discovery

**Goal:** connect useful travel guides to the correct product/arrival questions rather than publish thin content for volume.

Initial topic architecture:
- **Fort & heritage:** Fort guide, living-fort stay guide, Jain temples and havelis.
- **Trip planning:** how to reach Jaisalmer, best time to visit, booking checklist, photography.
- **Itineraries:** two-day plan, three-day plan once source record exists/approved.
- **Desert planning:** safari comparison/planning, packing checklist when approved.
- **Food & crafts:** food guide, markets/crafts, beyond-the-fort places.

The source repository has a separate legacy editorial registry with 12 live PHP guide entries, while this target repo has 12 JSON draft records. They are not interchangeable; source copy must be reviewed and mapped into the target schema. Do not wholesale-copy legacy text or assume old routes/assets/claims are current.

Acceptance:
- primary query and intent unique per article; no keyword cannibalization by a near-duplicate page;
- internal graph is connected and no self-links/dangling/unpublished links;
- preserve existing public routes and route contract; add explicit internal links from relevant product/arrival pages;
- public metadata, sitemap, robots and canonicals change only in a separate owner-authorized publication phase.

### M6 — Performance, accessibility and operational hardening

Deliverables:
- real image byte map from rendered network traffic and responsive source selection;
- hero LCP/priority audit, below-fold lazy loading, image width/height, correct responsive `srcset/sizes`, font loading and layout-shift review;
- tests for keyboard-only use, reduced motion, focus restoration, form errors, 320px overflow, touch targets, map loading and external-link rel safety;
- verify titles/descriptions, alt/captions, headings, anchors, no broken assets/links, JSON-LD visible-content alignment;
- no paid dependency requirement and no database/framework migration for the sake of fashion.

Acceptance:
- record reproducible desktop/mobile performance results from local/staging environments separately;
- no invented field-data claims; use lab measurements only when that is what was measured;
- route checks, content contracts, image budgets, Chromium E2E and staging package preflight all pass on exact final head.

### M7 — Visual sign-off and controlled release

- exact-head tests pass;
- before/after full-page and first-viewport screenshot sheet reviewed at 390 and 1280 px plus the full six-width suite;
- mobile sticky controls, interactions and real image crops personally inspected;
- map, booking engine, phone, WhatsApp, email and form paths smoke-tested without sending a real enquiry;
- owner reviews article content/media and any operational facts;
- canonical-host, robots, sitemap and publication decisions made separately and explicitly;
- staging approval recorded; deployment and rollback remain owner-authorized.

## 5. Definition of done for every milestone

A milestone does not count as complete because code was pushed.

1. **User value:** the visible guest problem and page section that improved are named.
2. **Complete slice:** markup, owned CSS, behavior, content/data contract and automated tests land together as needed.
3. **Source truth:** every operational claim has approved evidence or is presented as a question to confirm.
4. **Responsive evidence:** screenshots for at minimum 390 and 1280 px; full audit matrix on the phase acceptance gate.
5. **Regression:** existing route, booking/contact, SEO/publication and image/media checks remain green.
6. **Visual grade:** scorecard updated from rendered evidence; aim ≥90/100 with no critical accessibility/conversion defects.
7. **Release boundary:** PR open/merged status, exact head SHA and CI recorded; no deploy/merge claim without evidence.

## 6. Immediate next execution batch

**First engineering PR after this roadmap: M0 + M2 Directions vertical slice**, because guest arrival is a high-risk, high-intent decision and the owner specifically asked to deepen it. Bundle:
- Directions markup/content order;
- arrival-only styling in `assets/css/arrival-wayfinding.css` (extend this owner; don't create a second generic layer);
- only necessary small JS for section navigation/map and fixed CTA overlap;
- expanded source contract and browser test coverage at all six widths;
- updated route-level screenshot evidence;
- a short visual scorecard and exact-head test log.

Keep the Journal implementation as the next slice after M0 confirms shared visual tokens and article-layout needs, or include its source/schema test preparation in a parallel **draft-only** content slice if CI capacity permits. Do not merge small documentation-only/cosmetic PRs in lieu of the complete slice. Do not alter canonical host/robots/sitemap in this phase.

## 7. Source references

- Authoritative legacy Direction page: `garh-jaisal-website/direction.php`
- Legacy page styling: `garh-jaisal-website/css/arrival.css`
- Legacy rendered-layout/E2E contract: `garh-jaisal-website/tests/e2e/directions-arrival-design.spec.js`
- Legacy arrival-contact E2E: `garh-jaisal-website/tests/e2e/arrival-contact-journey.spec.js`
- Legacy design constitution: `garh-jaisal-website/docs/DESIGN-SYSTEM.md`
- Legacy owner facts and blockers: `garh-jaisal-website/docs/OWNER-FACTS.md`
- Tourism target arrival contracts: `scripts/test-arrival-wayfinding.js`, `scripts/test-arrival-planning-enquiry.js`
- Tourism target editorial schema/renderer/contracts: `content/paths.json`, `content/schemas/blog.schema.json`, `scripts/build-content-pages.js`, `scripts/test-editorial-content-cluster.js`, `scripts/test-editorial-readiness.js`, `scripts/test-editorial-media-readiness.js`
