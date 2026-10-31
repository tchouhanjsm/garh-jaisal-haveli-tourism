# Premium Visual Refinement, Directions and Journal Roadmap

**Repository:** `tchouhanjsm/garh-jaisal-haveli-tourism`  
**Source/reference repository:** `tchouhanjsm/garh-jaisal-website`  
**Baseline reviewed:** tourism `main` at `7604d4fe52c5f0fbd9bb5df5832a777d5dfc232b`; PR #64 is already merged.  
**Status:** execution framework and design specification. This file is not a claim of a visual sign-off, publication approval, or production release.

## Delivery log

- **M1 — shared typographic legibility pass added to PR #66:** introduced canonical micro/label/support/body/lede roles; increased actual navigation/action, card descriptions, guest-journey descriptors, form instructions, arrival facts, itinerary details, FAQ answers and footer copy; retained compact decorative folios/overlines. Static and rendered Chromium assertions now check computed type sizes across the responsive audit widths. Exact-head CI and screenshot review are required before M1 is marked verified.


- **M2 — Directions/arrival visual refinement:** the route now has an immediate hero summary, six-width-tested section navigation, qualified parking-distance facts, four-step access guidance, distinct rail/air/road choices and exact-pin/address orientation. Screenshot review exposed an underfilled map-side panel; it is replaced with a deliberate three-step arrival schematic that is explicitly not a scaled map or turn-by-turn directions. The duplicate generic stay enquiry builder is removed from Directions; its focused arrival form and a single contextual terminal CTA remain. Exact-head CI and human visual/staging acceptance are required before M2 is called release-ready.
- **Regression coverage:** static contracts and rendered Chromium checks include the hero summary, unique section targets, four-step route, differentiated transport options, source-qualified map guidance and responsive layout across the six audit widths. The mobile fixed Book Now bar yields when it would obscure the hero summary and restores when clear, with visible/accessible state checked in Chromium.
- **CI contract correction:** retained a dedicated accessible facade-reference section, descriptive hero image alt text, and explicit contextual WhatsApp/phone arrival-confirmation copy required by the repository’s existing content/UX gate.
- **Exact-head CI:** all quality gates passed on `079a98a4091260f4854c451e2fe161f436f8faa3`, including source/content quality, the guarded staging package, packaged responsive-image budgets and the packaged Chromium preview. PR #66 remains open; no deployment was performed.
- **M0 visual evidence capture:** the standard browser smoke now preserves its existing 24 full-page PNG captures (eight core routes at 390, 1280 and 1440 CSS px) plus a JSON integrity/evidence report as a short-lived GitHub Actions artifact. Responsive behavior remains exercised at 320, 360, 390, 768, 1280 and 1440 px. Human review of the artifact and owner-approved staging UAT are still required before assigning the final visual score or marking the release ready.
- **M4 — contextual conversion hierarchy:** the homepage retains its four-path planning panel instead of repeating the generic planner; Experiences and Experience Details use their purpose-built date/guest enquiry; Dining keeps its table-request form and a separate stay/experience enquiry; Directions keeps its arrival-specific planner. The generic multi-topic planner remains only on Rooms, About and Gallery, where it adds a useful general path. Unused planner CSS/JS are not loaded on the other routes.
- **M4 regression coverage:** the Node conversion contract, premium route contract and Chromium smoke assert planner placement, route-specific forms, honest “enquiry not reservation” copy, and absence of unused planner assets. Chromium continues to exercise date validation, editable drafts, safe WhatsApp handoff, copy recovery and no-JavaScript privacy on retained planner routes.
- **M3 — Journal preview Chromium QA:** the local-only prototype is exercised for 12-record loading, no-match/clear recovery, topic/text filter intersection, keyboard opening/back with focus restoration, live TOC navigation, safe HTTPS source links, related-draft navigation and horizontal-overflow checks across 320/360/390/768/1280/1440px. Full-page archive and article screenshots at 390 and 1280px plus a JSON integrity manifest are uploaded as a separate short-lived CI artifact; they are not committed into the repository.
- **M3 publication isolation:** preview evidence is captured only in the local CI path. The staging/production route contract, guarded archive and public sitemap do not include the preview or draft records; all 12 article records remain drafts.
- **CI regression repair:** the live-article hero-caption guard remains fail-closed; its test contract now matches the renderer's current error message rather than a stale string.
- No blog content is published and canonical/robots/sitemap release gates remain unchanged.

## Latest verified execution — 30 October 2026

**Exact tested head:** `31cea722b6c5f566de44f26e18531988b94a3cdf`  
**Workflow:** [Site Quality Gates run #40999330111](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40999330111) — **PASS**.

- **M0 — automated visual baseline:** all eight core routes returned HTTP 200 on the local browser target; 24/24 full-page captures completed at 360, 768 and 1440 CSS px. The six-width responsive matrix (320, 360, 390, 768, 1280 and 1440 px), unknown-route 404 recovery, and evidence-integrity checks passed with zero automated failures. The evidence report deliberately remains `PENDING_OWNER_REVIEW`; no owner visual approval is inferred.
- **M2 — Directions:** source-qualified arrival facts, hero summary, route steps, travel choices, section navigation, map/address guidance and arrival enquiry passed the static and Chromium contracts. Responsive section navigation and sticky-booking-bar obstruction behavior passed across the six-width matrix. The 360px and 1440px page captures are available in the visual artifact. Human visual/staging UAT remains pending.
- **M3 — local Journal preview:** all 12 draft records loaded. Archive, article and media workbench rendered and passed overflow/interaction checks at all six viewport widths. Six complete full-page archive/article/media captures were produced at 390 and 1280 px. Search/topic intersection, no-match recovery, Enter/Space article activation, Back/focus restoration, live TOC targets, safe HTTPS source links and related-draft navigation passed.
- **M3 — Journal DOM defect resolved:** the article panel was a descendant of the archive element that the UI hides when an article opens. The panel was moved to a sibling of the hideable archive and a source-level contract now protects that ownership boundary. This resolves the previous keyboard/TOC visibility failure; it was a markup hierarchy defect, not a missing key handler.
- **M4 — contextual conversion:** the existing route-specific conversion hierarchy and browser checks passed. Enquiry controls remain user-controlled; no booking or message is silently submitted.
- **Guarded staging package:** package build, responsive-image manifest validation and packaged Chromium verification all passed. The package manifest reports 124 payload files and 65.36% of the 18 MiB budget; 63 WebP files/45 responsive variants were generated, responsive markup validated 39 picture elements and 138 `srcset` candidates, and packaged Chromium selection checks passed.
- **Release isolation:** `RELEASE-MANIFEST.json` reports `deploymentPerformed=false`, `releaseStatus=BLOCKED_PENDING_MANUAL_UAT`, `publicIndexingEnabled=false`, `canonicalHostApproved=false`, `robotsPolicy=DISALLOW_ALL`, and `sitemapUrlCount=0`. Editorial isolation is PASS: all draft source records and Journal preview assets/directories are excluded and zero public blog HTML routes are generated.
- **Artifacts:** [24-page visual baseline](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40999330111/artifacts/12953011242) · [Journal preview evidence](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40999330111/artifacts/12952707589) · [Guarded staging preview package](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40999330111/artifacts/12952418223).

**Still outstanding:** owner review of the screenshot artifact, manual owner-approved staging UAT, final visual score and explicit release approval. No production deployment or merge was performed.

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

## M14 — responsive-image delivery evidence

- Keep M11–M13 intact: source-backed WebP art direction, responsive candidates and the byte-budget quality ladder remain unchanged.
- The guarded package records exact candidate sizes separately from browser resource measurements.
- Packaged Chromium records selected WebP candidate, route, viewport, DPR, HTTP status, encoded body bytes, transfer bytes and request count across the existing six-width / DPR 1x–2x matrix.
- Do not infer percentage savings versus JPEG fallbacks from candidate metadata; browser transfer observations remain local laboratory diagnostics.
- Exact-head CI and reviewed package evidence remain required. No deployment, canonical/indexing activation or public release is implied.


### M14 — exact-head verification

Exact-head Site Quality Gates run [#41055514368](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/41055514368) passed all 13 workflow steps on `4b4a945b01337e401133c565808bf616615a280c`. The guarded staging archive was 14,207,108 bytes (77.34% of the 18 MiB uncompressed payload budget). Packaged Chromium verified 576 picture instances across eight routes, six viewport widths and DPR 1x/2x, with 576 selected-resource observations, an average encoded body of 55,409 bytes and maximum selected/required pixel ratio of 1.66x. These are package-only laboratory observations; owner visual review and manual staging UAT remain pending.

## M15 — durable per-picture responsive-image evidence

- Persist every packaged Chromium selection observation in a versioned JSON report rather than leaving the detailed evidence only in transient workflow logs.
- Bind the report to the exact commit SHA, workflow run ID and Chromium version; record route, picture index, viewport, DPR, selected WebP path/width, required physical pixel width, selection ratio, HTTP status, request count, and encoded/transfer/decoded body bytes.
- Require complete route × responsive picture × six viewport × DPR 1x/2x coverage, unique observations, HTTP 200, one request per selected candidate, positive encoded body bytes and the existing 1.9x pixel-demand ceiling.
- Keep laboratory measurements, packaged file sizes and field Core Web Vitals distinct. Never infer JPEG fallback savings or real-user performance.
- Validate the evidence schema and measurement labels in the quality suite, write partial reports on failed browser checks when possible, and upload the JSON report as a seven-day GitHub Actions artifact.
- No page content, public indexing, canonical host, production or staging deployment, or release approval changes.


## M16 — premium art direction, palette and first-view conversion

**Audit finding:** the existing rendered screenshots showed a coherent but over-repeated template. Experiences, Experience Details and Gallery were text-only green-gradient heroes; the homepage first-screen mobile crop gave too much space to empty sky; white outlined planning panels and brass-filled actions weakened action hierarchy.

**Bulk implementation:**
- refine the existing canonical palette: limestone/ivory page surfaces, fort pine/olive brand surfaces, brass as a controlled architectural accent, saffron/copper for primary actions and peacock for functional focus;
- replace the floating-card treatment of homepage planning paths and shared inner-route journey with full-width editorial decision bands;
- art-direct the mobile homepage rooftop crop and move the headline/primary action higher in the viewport;
- introduce source-backed photography to Experiences, Experience Details, Gallery and Dining using the approved media manifest and existing runtime asset set;
- retain the responsive-image rewrite pipeline and page-specific byte budgets; do not commit generated variants or duplicate image binaries;
- expand regression coverage for palette roles, photo-first hero subject/alt text, preload/fetch priority and per-route hero payload budgets.

**Acceptance:** compare exact-head desktop/mobile first views for all eight routes; confirm a clear primary action, route-appropriate image crops, accurate alt text, responsive picture/preload parity, legible overlays and no text/fixed-control obstruction. Automated evidence is necessary but not owner visual sign-off. No prices, hours, availability, room features, tour inclusions or operational promises change. No public SEO, canonical, robots, sitemap, staging or production release setting changes.


## 6. Immediate next execution batch

**M16 — premium visual system — now has a coordinated first-view and palette implementation. Next: M17 — rendered screenshot QA and visual calibration. Review all eight route first views at 390 and 1280px, plus the six-width suite; inspect heading placement, photo crops, saffron/ivory contrast, full-bleed planner rhythm, touch targets and fixed-control overlap. Owner review and staging UAT remain mandatory before any design score or release sign-off. Keep editorial card art text-only until article-specific media is individually approved.

The M0 screenshot artifact exists, but final human visual scoring and owner-approved staging UAT are still outstanding. The separate Journal artifact is for human review only; it does not authorize publication or change the public route/package. Keep all 12 records as drafts, canonical approval false, robots blocking and sitemap empty. Do not merge or deploy automatically.

## 7. Source references

- Authoritative legacy Direction page: `garh-jaisal-website/direction.php`
- Legacy page styling: `garh-jaisal-website/css/arrival.css`
- Legacy rendered-layout/E2E contract: `garh-jaisal-website/tests/e2e/directions-arrival-design.spec.js`
- Legacy arrival-contact E2E: `garh-jaisal-website/tests/e2e/arrival-contact-journey.spec.js`
- Legacy design constitution: `garh-jaisal-website/docs/DESIGN-SYSTEM.md`
- Legacy owner facts and blockers: `garh-jaisal-website/docs/OWNER-FACTS.md`
- Tourism target arrival contracts: `scripts/test-arrival-wayfinding.js`, `scripts/test-arrival-planning-enquiry.js`
- Tourism target editorial schema/renderer/contracts: `content/paths.json`, `content/schemas/blog.schema.json`, `scripts/build-content-pages.js`, `scripts/test-editorial-content-cluster.js`, `scripts/test-editorial-readiness.js`, `scripts/test-editorial-media-readiness.js`


## M17 — premium brand chrome and first-view action hierarchy

Refine masthead wordmark/monogram scale, active-navigation contrast, typography and saffron action styling while retaining the owner-authorized AsiaTech booking destination. Rooms, Experiences, Dining, About and Gallery gain one route-specific first-view action; Home, Experience Details and Directions retain their existing primary actions.

## M18 — editorial image and section composition

Reduce repetitive boxed-card emphasis using larger photographic surfaces, open fact rails, consistent image proportions and restrained elevation. Rebalance the homepage four-fact proof strip. Preserve source-backed images, alt text, content caveats and responsive image budgets.

## M19 — responsive conversion and visual regression gate

Suppress the floating enquiry dock whenever the persistent mobile booking bar is active, including after viewport resize. Extend Chromium's six-width/eight-route matrix with a unique H1, one prominent hero action, masthead clearance, in-viewport CTA geometry and decoded cover-fit image checks. Keep full-page screenshots and performance evidence. This does not replace visual review or owner-approved staging UAT. No public indexing or deployment is authorized.



## M20 — tablet masthead and navigation breakpoint

The 768px visual review exposed a 34px horizontal overflow in the desktop masthead. The navigation now changes to the same accessible hamburger pattern from 761–820px rather than compressing or clipping the primary links. The 820px boundary is covered by Chromium: toggle visible, navigation collapsed by default, explicit open, and Escape-to-close. Horizontal overflow remains a hard failure.


## M21 — tablet planner composition and overflow repair

The 768px Chromium capture exposed that the full-width homepage planner retained the old booking-panel CSS grid. The inherited two-column form geometry compressed its four decisions and overflowed the viewport. The planner now resets that legacy grid at all widths and switches to a deliberate 2×2 path layout from 761–900px. Existing six-width Chromium checks remain the hard acceptance gate.

## M22 — measurable heritage palette contrast

Add executable WCAG AA contrast sentinels for primary saffron/white actions, deep brass/limestone text, muted/limestone copy, peacock/ivory focus, inverse fort-green text and antique brass on the dark editorial band. The checker documents that these are representative pairs; rendered colour combinations and screenshots still require review.

**Next milestone (M23):** validate screenshot and layout quality at all six responsive widths for all eight routes, inspect the captured 320/360/390/768/1280/1440 composition, and calibrate hero text/photo crops, primary-action prominence, section rhythm, mobile fixed-action clearance and tablet navigation. Do not accept the design on CSS-only checks or a single desktop view.
