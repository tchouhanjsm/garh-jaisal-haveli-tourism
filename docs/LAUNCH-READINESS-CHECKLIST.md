# Garh Jaisal Haveli — Launch Readiness Checklist

**Status as of 27 October 2026: automated implementation checks pass on main; production release remains blocked pending manual owner/UAT gates.**

Baseline main at the start of the current staging-preflight phase: 22f40dd1f070077057856cab7db9e8b54c28314a. Post-merge Site quality gates run [#40437441543](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40437441543) passed after PR #29 merged. The site is a static HTML/CSS/vanilla-JavaScript deployment intended for GoDaddy/cPanel. This checklist distinguishes repository/automation checks from live operating checks.

## What automated checks can currently prove

- The eight core HTML pages expose the shared Book Now, WhatsApp, primary phone, alternate landline and email markers.
- Contact and booking destinations are centrally configured in content/site-config.json, marked owner-authorized-source / source-authorized, and pass format/host validation in the client runtime.
- If the central config cannot load, or a channel is malformed, the JavaScript keeps that action disabled instead of guessing a destination.
- The shared guest-enquiry form on Experiences, Experience details and Dining enforces a non-past arrival date and a departure after arrival. Chromium smoke tests cover date-error recovery, encoded draft content, and the authorized WhatsApp host while intercepting `window.open`; no external message is sent and no booking is created.
- The named-room gallery uses locally hosted assets mapped to the legacy room catalogue, and the media manifest checks source/target blob SHA, bytes, dimensions, page-specific alt text and content role.
- The dining page explicitly withholds current menu items/prices while the legacy menu file still says owner_confirmed=false.
- Canonical URL/OG URL publication and sitemap URL publishing remain gated until the owner approves the actual production hostname.

- The branded 404 recovery page is included in static link/anchor integrity checks, uses `noindex,follow`, and hydrates booking/contact actions from `content/site-config.json` rather than hard-coded endpoints.

A passing automated suite is not proof that the hotel’s live phone is answered, the booking provider accepts guests, the current menu is correct, or staging/production renders correctly. The offline screenshot renderer also rejects contradictory report metadata, unsafe-action flags, inconsistent failure counts and any release status other than `BLOCKED_PENDING_MANUAL_UAT`.

## Automated media performance contracts

The quality suite checks actual bytes for every local image and responsive `srcset` candidate referenced by the eight core pages, not only the curated manifest. Current role budgets are:

| Role | Maximum | Current measured reference |
|---|---:|---|
| Homepage / dining hero | 150 KiB | `assets/images/rest3.jpg` — 75,390 bytes |
| Rooms hero JPEG fallback | 550 KiB | `assets/images/rooms/haveli-interior.jpg` — 519,598 bytes |
| Rooms hero WebP | 320 KiB | `assets/images/rooms/haveli-sitting-room.webp` — 307,548 bytes |
| Largest named-room JPEG | 550 KiB | Sweet Purple — 537,837 bytes |
| Named-room WebP alternate | 300 KiB | Sweet Purple — 275,778 bytes |
| Dining candlelit-table reference | 100 KiB | 92,506 bytes |
| Fort/rooftop supporting image | 400 KiB | `assets/images/gallery/hotel/fort-from-roof.webp` — 388,404 bytes |
| Directions facade reference | 600 KiB | 587,056 bytes |
| Other referenced supporting images | 650 KiB | Largest current file: `assets/images/courtyard.jpg` — 619,209 bytes |

The test also requires a single high-priority non-lazy image in pages with a visual hero and lazy/async loading for below-hero images. These are byte/markup checks, not a substitute for measuring Core Web Vitals or visually checking crop/layout on a real browser/device. The courtyard WebP in the legacy source was visually reviewed and is a different photograph from the current courtyard JPEG, so it is not used as a replacement.



## MANUAL RELEASE GATES

Complete and record these checks against the intended staging site first. Do not complete a real reservation or payment simply to test the link.

### P0 — Restaurant table-enquiry journey

- [ ] On staging at desktop and mobile widths, use keyboard and pointer input to switch Overview, Menu, Book a Table and Directions; verify active state, panel labels, visible focus and ArrowLeft/ArrowRight/Home/End behavior.
- [ ] Verify the Menu tab clearly says owner confirmation is pending and contains no current dishes or prices until the owner approves the source menu.
- [ ] Submit a dummy table enquiry using a future date and party size. Email and preferred time are optional. Confirm the WhatsApp draft reflects the guest-selected group size and only supplied optional fields, then close it without sending; never use a guest's real details or submit a real reservation.
- [ ] Verify preferred time is free text, not a fixed list of assumed hours. The restaurant must confirm current service hours, capacity and availability for the requested date.
- [ ] Confirm malformed mobile numbers, malformed optional email when supplied, invalid party sizes and past dates are rejected. A missing/unauthorized contact configuration must keep submission disabled and no data is sent.
- [ ] Confirm the separate stay/experience enquiry remains available and does not claim a reservation. No reservation backend or guest-data persistence is introduced. Automated checks do not mark manual gates complete.

### P0 — Booking provider and contact channels

- [ ] **AsiaTech Book Now, desktop:** open the link in a normal browser (not a crawler); confirm the correct property/booking portal loads, HTTPS is valid, and arrival/departure/guest controls work.
- [ ] **AsiaTech Book Now, mobile:** repeat on a phone and check layout, scrolling, date selection and return navigation.
- [ ] **External booking probe warning:** on 26 October 2026, a read-only automated web request to the configured AsiaTech route returned **HTTP 403**. This is not enough evidence to conclude normal visitors are blocked because the tool may be restricted, but it is a launch blocker until a human verifies the link in a standard browser. If a normal browser also receives 403, have the provider/operator fix it before release.
- [ ] **WhatsApp:** open a room, safari, dining and arrival enquiry; verify they target the correct hotel business account and prefill the expected message. Confirm the team receives and responds to a test enquiry. The automated web tool could not independently verify the WhatsApp endpoint.
- [ ] **Primary mobile:** call the configured mobile number and confirm the intended hotel contact answers.
- [ ] **Alternate landline:** call the configured landline and verify that it reaches the intended property/operator.
- [ ] **Email:** send a harmless test email to the configured hotel address from an external mailbox, check delivery/no bounce, and confirm the team can reply.
- [ ] Record the date, device/browser, result and operator who verified each channel. Do not label source-authorized values live-verified until these tests pass.
- [ ] **Exact hotel map pin:** from Directions and the shared footer, open the configured pin in a normal browser and verify it resolves to Garh Jaisal Haveli, not merely a broad place search. The authoritative legacy `direction.php` records a Google Maps short link; automated tests verify central configuration and URL hydration only, not geographic accuracy or live availability.

### P0 — Experience discovery and route-detail journey

- [ ] At desktop and mobile widths, use the Experiences page's four category shortcuts (desert evenings, overnight stays, Fort/city tours, road/route ideas). Confirm each link lands at its intended section and the heading typography remains readable without clipping.
- [ ] Open each package's “View itinerary and details” link and confirm it loads the relevant section on the separate detail page before any WhatsApp enquiry. The contextual enquiry is a separate action; do not make a package's primary information link open WhatsApp.
- [ ] Confirm the page presents source-listed desert/city experiences together with the Fort heritage walk, car/road arrangements and other route ideas, without describing the entire catalogue as only six options.
- [ ] Confirm “other routes” and research-led ideas are labelled as enquiry topics, not bookable packages. Do not publish unapproved rates, timings, routes, access guarantees or availability. Verify the owner-approval gates remain open where facts are missing.
- [ ] Verify the route-detail page can return to the broader Experiences catalogue with its prominent CTA and preserves the separate contextual enquiry action. Automated checks do not mark human UAT complete.

### P0 — Actual hotel/room facts

- [ ] Confirm the seven named rooms shown on the site are still offered and each image depicts the named room.
- [ ] Confirm current room inventory, occupancy/capacity, room-specific amenities, bed configuration, rates/taxes and cancellation/payment terms. The site deliberately does not claim live availability or publish room rates.
- [ ] Use the Rooms finder on staging at narrow-mobile and desktop widths: floor selection, combined-feature filtering, live result status, no-results recovery and Clear filters must work with keyboard and pointer. With JavaScript disabled, all seven room cards must remain visible and inert filter controls must stay hidden. Automated CI is not human visual UAT.
- [ ] Confirm check-in/check-out, reception/late-arrival process, and how guests should arrange the final walk through the fort lanes.
- [ ] Confirm whether luggage assistance, airport/station pickup or local transfers can be arranged. Do not rely on a general statement as a guarantee.
- [ ] Confirm which desert safari, open-sky overnight, Swiss-tent, cultural programme and guided-city tours are operating on sale dates. Validate route/stops, duration, vehicle, guide-language availability, fees, inclusions/exclusions, current price and seasonal timing.
- [ ] Confirm the current restaurant menu, item names/prices, service hours, closed days, dietary options and candlelit-table availability. Until menu approval is recorded in the source repository, keep dishes/prices unpublished.
- [ ] Confirm the map link and Instagram profile still point to the intended restaurant/property account.

### P0 — Domain, hosting and production routing

- [ ] Confirm whether the approved public hostname is https://www.hotelgarhjaisal.com, the apex hostname or another intended host. The repository’s candidate canonical host is still explicitly unapproved.
- [ ] Verify DNS resolution, SSL certificate/chain, HTTP-to-HTTPS redirect, www/apex preference, no redirect loops, and GoDaddy/cPanel document root for the intended site.
- [ ] Confirm all referenced image assets and the central JSON config return successfully on the staging hostname; use a browser network panel to verify no 404s or mixed-content errors.
- [ ] Only after owner approval, implement the canonical host consistently in canonical/OG metadata, sitemap and robots directives; then rerun crawler/link integrity checks.
- [ ] Take a known-good website backup and document rollback steps before production deployment.

### P1 — Final release/SEO smoke test

- [ ] Run the GitHub-hosted quality suite on the exact PR head and again on the resulting main SHA; confirm current-head conclusions, not stale runs.
- [ ] Check 320, 360, 390, 768, 1280 and 1440 CSS-pixel breakpoints; keyboard navigation, focus visibility, Escape/expanded state, reduced-motion behavior, image cropping and CTA tap targets.
- [ ] Run Lighthouse/performance inspection and accessibility checks on staging. The Green Room image is now a source-verified 114,126-byte alternate (the prior asset was 799,571 bytes); inspect its crop/layout on desktop and mobile and review the remaining 537,837-byte Sweet Purple JPEG fallback and 519,598-byte sitting-room JPEG fallback.
- [ ] Confirm page titles/meta descriptions, social preview images/alt text, internal links, image status codes, privacy/terms links and owner-approved analytics/measurement configuration.
- [ ] After deployment, test Book Now and contact links once more on the production hostname; monitor for failed redirects, broken assets, enquiries not received and email bounces.

## Staging verification record — fill in during operator UAT

Use the intended staging host only. Replace `NOT RUN` with a result only after the named operator performs the check in a normal browser/device and records evidence. A CI pass is not evidence for these rows. Do not enter guest personal data, booking tokens or payment details in this table.

| Check | Exact staging URL | Date/time (Asia/Kolkata) | Operator | Browser / device / viewport | Result | Evidence / notes | Follow-up owner |
|---|---|---|---|---|---|---|---|
| STG-01 Desktop guest journey: Home → Rooms → Experiences → Dining → Directions |  |  |  |  | NOT RUN |  |  |
| STG-02 Mobile guest journey and tap targets |  |  |  |  | NOT RUN |  |  |
| STG-03 Images, config and styles: no 404 or mixed content |  |  |  |  | NOT RUN |  |  |
| STG-04 Keyboard focus, Escape/menu state and reduced motion |  |  |  |  | NOT RUN |  |  |
| STG-05 Page title, meta description and social preview consistency |  |  |  |  | NOT RUN |  |  |
| STG-06 AsiaTech booking flow in desktop browser (no booking/payment) |  |  |  |  | NOT RUN |  |  |
| STG-07 AsiaTech booking flow on mobile browser (no booking/payment) |  |  |  |  | NOT RUN |  |  |
| STG-08 WhatsApp account and prefilled message reachability |  |  |  |  | NOT RUN |  |  |
| STG-09 Primary mobile call answered by intended operator |  |  |  |  | NOT RUN |  |  |
| STG-10 Alternate landline answered by intended operator |  |  |  |  | NOT RUN |  |  |
| STG-11 Email delivery, no bounce and reply capability |  |  |  |  | NOT RUN |  |  |
| STG-12 Owner review of current room, tour, dining and arrival facts |  |  |  |  | NOT RUN |  |  |
| STG-13 Backup and rollback procedure reviewed |  |  |  |  | NOT RUN |  |  |
| STG-14 Responsive image rendering/crop at 320, 360, 390, 768, 1280 and 1440 CSS-pixel viewports |  |  |  |  | NOT RUN |  |  |
| STG-15 Keyboard-only navigation through all six experience galleries, including visible focus and Enter/Space |  |  |  |  | NOT RUN |  |  |
| STG-16 Reduced-motion preference, carousel no-autoplay behavior and stable layout |  |  |  |  | NOT RUN |  |  |
| STG-17 Social preview image, title, description and image-alt consistency on staging |  |  |  |  | NOT RUN |  |  |
| STG-18 Unknown-route response and 404 recovery links (no hard-coded contact endpoints) |  |  |  |  | NOT RUN |  |  |

Allowed results: `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. Record the reason and follow-up owner for every failure or blocked row. Keep canonical-host approval, menu publication and deployment decisions in their separate owner-approval gates.


### Responsive and technical-SEO acceptance evidence

The automated responsive audit checks each of the eight core routes at **320, 360, 390, 768, 1280 and 1440 CSS pixels** for same-origin HTTP 200 responses and horizontal overflow. The branded unknown-route recovery page must return a genuine HTTP 404 and pass its recovery/contact-hydration checks at all six widths. The retained visual bundle intentionally stays at 24 full-page screenshots (eight routes at 360, 768 and 1440 CSS pixels) so screenshot evidence stays useful and bounded; successful layout automation does not replace human crop/typography review.

Before canonical-host approval, staging must remain non-indexable: robots.txt must include User-agent: * and Disallow: /, must not advertise a sitemap, sitemap.xml must not publish absolute public URL locations, and content/site-config.json must keep site.canonicalHostApproved set to false. Page-level title/description and Open Graph/Twitter preview consistency are covered by the browser quality suite. Do not activate canonical URLs, og:url, public sitemap locations or a less restrictive robots policy until the owner records the canonical-host decision. All these checks are automated safety evidence; STG-01–STG-18 remain human-operated and must not be auto-marked complete.

## Owner decisions required before production launch

1. Confirm the production domain/canonical hostname.
2. Confirm the current room/rate/facility data and operating tour options.
3. Approve the current restaurant menu/prices and service hours.
4. Perform and record the browser/contact-channel checks above.
5. Approve the staging UAT result and production deployment window/rollback plan.

**Release rule:** source-repository presence and green CI are necessary, but insufficient. Do not deploy or represent the new site as fully launch-ready while any P0 release gate remains unchecked.


### Experience gallery and editorial smoke check
- [ ] On desktop and mobile, try Next and Previous on all six experience galleries, including wraparound. Confirm there is no autoplay, the counter updates, keyboard focus is visible and the image/caption match the option shown.
- [ ] With JavaScript disabled, confirm the first photo remains visible and hidden carousel controls do not claim to work.
- [ ] Verify that all six photo pairs load from the local site, with no 404s; captions describing visual references must not be read as a promise that the site shown is an itinerary stop.
- [ ] Check the About hero/social preview and Dining rooftop-table/fort-view image pairing at a social-preview aspect ratio; verify text remains readable over the real photographs and the arrival page surfaces the final walk before other details.


## Automated local-browser smoke coverage — not staging UAT

The full quality suite now includes `scripts/test-browser-smoke.py`, using the pinned Playwright dependency in `requirements-test.txt` and Chromium on the existing standard GitHub-hosted runner. It starts a temporary local HTTP server and checks all eight pages at 360, 768 and 1440 CSS-pixel viewports, local image decoding/HTTP responses, page metadata, active navigation, mobile booking-bar bounds, skip-link and Escape/focus behavior, reduced motion, and all six manual experience galleries including wraparound and no-JavaScript fallback.

The browser suite only inspects the configured AsiaTech, WhatsApp, telephone, landline and email destinations; it does not navigate to third-party endpoints, create reservations, submit guest data or send messages. It cannot prove that the staging host is correct or that a human operator answers a channel.

Local command sequence:

```bash
python3 -m pip install -r requirements-test.txt
python3 -m playwright install chromium
bash scripts/check-pr-quality.sh
```

The 18 `STG-01`–`STG-18` rows below remain human-operated checks and must stay `NOT RUN` until an operator records evidence for the exact staging URL, date/time, browser/device/viewport and result. Browser CI does not mark those rows complete.


## Read-only staging browser preflight

The same Chromium smoke suite can be pointed at an owner-approved staging origin to validate the deployed static files without following third-party links or submitting guest data. It refuses the configured production hosts (legacyProductionUrl and newStaticSiteCanonicalHost) even if someone accidentally supplies them.

Set these variables locally to the real staging origin, operator name, JSON report path and an **empty screenshot directory**. Both output paths must be outside the repository checkout so evidence cannot be committed accidentally. The runner refuses a non-empty screenshot directory to prevent mixing runs. If the staging subdomain uses HTTP Basic Auth, set STAGING_BASIC_AUTH_USERNAME and STAGING_BASIC_AUTH_PASSWORD in the local shell. The runner scopes these credentials to the staging origin and never writes them to the JSON report; do not put credentials in the URL.

~~~bash
python3 scripts/test-browser-smoke.py \
  --base-url "$STAGING_URL" \
  --operator "$STAGING_OPERATOR" \
  --report "$STAGING_REPORT" \
  --screenshots-dir "$STAGING_SCREENSHOTS"
~~~

STAGING_URL must be an HTTPS origin only: no path, query, fragment, URL credentials, IP address or local hostname. Cross-origin top-level/frame navigation is blocked, and the robots/sitemap/config requests do not follow redirects. The runner checks all eight page routes, unique titles, description ranges, one main/H1, social image/alt parity, canonical-host withholding, local image decoding, same-origin HTTP/request failures, mixed-content requests, responsive overflow at 360/768/1440 CSS pixels, mobile navigation/skip-link focus, reduced motion, keyboard Enter/Space activation and wraparound for all six photo galleries, no autoplay, and the no-JavaScript gallery fallback. It also fetches the deployed robots.txt, sitemap.xml and content/site-config.json to verify that staging remains blocked from indexing and the canonical host is still unapproved.

The schema-version 4 JSON evidence report records the exact origin, Asia/Kolkata timestamp, operator, Chromium version, route/viewport coverage, sanitized failures and 24 full-page PNG records with filename, viewport, actual pixel geometry, byte size and SHA-256. It captures every public route at 360, 768 and 1440 CSS pixels after requesting font readiness and image decoding. Only screenshot filenames—not local filesystem paths—are stored in the report. Query and fragment values are stripped from request URLs before they are written to the report. It always leaves STG-01 through STG-18 as NOT RUN, because those rows require human browser/device, contact-channel, owner-fact, backup/rollback and social-preview evidence. The standard local/CI Chromium smoke run exercises the same capture path in a temporary directory, validates the screenshot records, and removes those images after the run; explicit staging mode retains the operator's bundle. The script never navigates to the AsiaTech provider, opens WhatsApp, dials a number, sends email, submits guest data, creates a reservation or makes a payment. The provider's previously observed automated HTTP 403 still requires normal-browser verification by the owner/operator.

This tool is not a production deploy, canonical approval, sitemap/robots activation or a substitute for formal accessibility/Lighthouse testing.

## Staging evidence integrity — 27 October 2026

The operator preflight report uses schema version 4 and includes an explicit unknown-route recovery evidence object. A report may show automated `PASS` only when it records the complete planned route sequence, HTTP 200 on the requested staging origin for every planned route, all responsive viewport checks at 360, 768 and 1440 CSS pixels, the branded unknown-route HTTP 404 contract at each of those widths, and all 24 full-page PNG screenshots with validated geometry, non-zero byte sizes and SHA-256 hashes. Empty or partial evidence is an automated failure even if no individual assertion failed. Check `evidenceCoverage`, `visualEvidence` and the recorded page/viewport arrays, not only the failure count.

The same report now records the deterministic unknown-route probe at all three viewport widths. It requires an HTTP 404 response on the requested origin, the branded recovery page with one H1, `noindex,follow` and no canonical/`og:url`, root-relative stylesheet and script loading, all six root-relative recovery links, configured booking/contact link hydration and no horizontal overflow. Local CI uses a small test server that simulates Apache's `ErrorDocument 404`; staging mode tests the actual intended host. The offline renderer rejects missing or contradictory `unknownRouteEvidence` and displays its per-viewport results. This automated evidence does not mark the human STG-18 row complete.

The automated result is not a release approval. `releaseStatus` remains `BLOCKED_PENDING_MANUAL_UAT`, and STG-01 through STG-18 remain `NOT RUN` until an operator records real staging evidence. The report and screenshot directory must be outside the repository checkout; the screenshot directory must be empty at the start of a run.


## Offline staging screenshot review index — 26 October 2026

After the browser preflight creates its schema-version 4 JSON report and 24 PNG files, render a local review page beside the screenshot directory:

~~~bash
python3 scripts/render-staging-visual-review.py --report "$STAGING_REPORT" --screenshots-dir "$STAGING_SCREENSHOTS" --output "$STAGING_VISUAL_REVIEW"
~~~

The HTML output must be outside the repository checkout and in the same parent directory as the screenshot directory. It reads local files only; it does not contact staging, navigate external links, or submit data. It displays eight page sections with mobile/tablet/desktop screenshots, measured PNG dimensions, byte counts and SHA-256 values. The renderer rechecks each file against the saved report and shows missing or tampered images as unverified.

The output includes no absolute filesystem paths, escapes operator/report text, redacts URLs in failure diagnostics, and loads no external scripts, fonts or images. Keep the JSON, PNGs and HTML review local until they have been reviewed for environment details. If a new browser capture is needed, create a new empty screenshot directory as required by the preflight runner.

A successful visual review is evidence integrity only. It never changes the result of STG-01 through STG-18 and cannot clear manual UAT, booking/contact reachability, owner fact approval, canonical/DNS/SSL approval, backup/rollback or deployment gates.


## Public image identity audit — 27 October 2026

The quality runner now executes `scripts/test-public-image-uniqueness-contract.js` and `scripts/test-public-image-uniqueness.js`. The contract tests prove that identical bytes under different referenced paths are detected, reuse of the same path across pages is allowed, and missing or repository-escaping local image paths fail closed. The repository audit hashes locally referenced `img` and responsive `source` assets across root HTML plus generated `tours/` and `blogs/` HTML. Exact-byte duplicates at different paths fail CI.

This does **not** detect visually similar photographs encoded or cropped differently. Human visual review remains required for subject accuracy, repeated-looking scenes, room-to-image mapping and tour-photo context. The test does not contact staging or external hosts and does not change the canonical-host, sitemap, robots, menu or deployment gates. Staging acceptance remains blocked until an owner-approved HTTPS staging origin and operator evidence are available.

## Technical SEO publication safeguard — 27 October 2026

- [x] Automated pre-launch publication guard added in `scripts/test-seo-publication-safeguards.js` and wired into `scripts/check-pr-quality.sh`.
- [x] The guard scans root HTML plus generated `tours/` and `blogs/` HTML. While `content/site-config.json` keeps `site.canonicalHostApproved: false`, it rejects canonical link tags and Open Graph `og:url` metadata anywhere in that public HTML surface.
- [x] The guard rejects sitemap `<loc>` entries and a `Sitemap:` directive in `robots.txt`, and requires the pre-launch wildcard `Disallow: /` policy to remain present.
- [x] Fixture contract coverage includes accidental canonical/OG URL publication, sitemap URL entries, robots sitemap directives, removed crawl blocking, missing/malformed config and the explicitly approved state. The approved state intentionally fails this pre-launch gate; activating publication requires a separately authorized implementation and review.
- [ ] On staging, verify the page's hero and below-fold photographs at desktop and mobile widths, including the correct subject, crop, alt text and no missing/placeholder frames. Automated image decoding is not a human visual approval.
- [ ] Manual SEO review on an owner-approved staging hostname remains NOT RUN. CI cannot approve the public hostname, validate DNS/SSL, prove search crawler behavior or authorize production publication.

**Baseline:** main `22f40dd1f070077057856cab7db9e8b54c28314a`; post-merge quality run [#40437441543](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40437441543) passed. This phase does not change `robots.txt`, `sitemap.xml`, canonical approval, production deployment or guest-data handling.


## Static accessibility source contract — 27 October 2026

- [x] Added `scripts/test-static-accessibility.py` to inspect every root public HTML page and all HTML under `tours/` and `blogs/` for accessible names, label and ARIA ID references, duplicate IDs, `main#main` plus skip-link landmarks, explicit button types, valid boolean ARIA values, non-positive tab order, focusable content inside `aria-hidden`, image alt attributes and `rel=noopener` on `_blank` links.
- [x] Added `scripts/test-static-accessibility-contract.py` with temporary fixtures that prove the valid patterns pass and intentionally unlabeled controls, missing references, positive tabindex, duplicate IDs, hidden focusable actions, missing alt text and unsafe new-tab links fail.
- [x] Integrated both checks into `scripts/check-pr-quality.sh` before the Chromium guest-journey smoke suite.
- [ ] Real assistive-technology testing, color-contrast measurement, staging keyboard UAT, reduced-motion visual review and Lighthouse remain NOT RUN. The source-level contract is not a WCAG conformance certificate.

**Phase baseline:** main `dcb6e2dd824b0b629b4983b115c311ac04ea3380`; post-merge quality run [#40442760559](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40442760559) passed before this feature branch was created. This change does not modify public page copy, property facts, assets, canonical approval, robots/sitemap, contact channels, menu publication or deployment settings.


## 27 October 2026 — Recursive static route integrity

- [x] Expanded \`scripts/check-site.py\` to discover root HTML and recursively walk all HTML beneath \`tours/\` and \`blogs/\`, without following symlinked directories or files.
- [x] Local path checks now parse URLs before resolving paths, support query strings and URL-encoded local paths, handle same-page fragments and check cross-page anchors after root-relative or page-relative resolution.
- [x] Added \`scripts/test-site-integrity-contract.py\` with temporary nested route fixtures and negative cases for missing files, missing anchors and repository traversal; the fixture is wired into \`scripts/check-site.sh\`.
- [ ] Exact-head GitHub CI is required before merge. Local \`bash scripts/check-pr-quality.sh\`, staging browser/device UAT, formal accessibility testing and Lighthouse remain NOT RUN in this connector environment.
- [ ] STG-01–STG-18 remain NOT RUN. Canonical-host approval, owner confirmation of property/menu/tour/arrival facts, booking-provider browser verification, live contact reachability and production deployment authorization remain separate release gates.

**Phase baseline:** main \`2aa27db3a34c883322096c148075cc8c047129fc\`; post-merge quality run [#40448685596](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40448685596) passed. This phase does not modify public copy, assets, contact endpoints, menu approval, canonical/robots/sitemap settings or deployment configuration.


## Recursive SEO publication and social-preview parity — 27 October 2026

- [x] Extended `scripts/test-seo-publication-safeguards.js` to recursively inspect root HTML and nested `tours/` and `blogs/` HTML without following symlinks.
- [x] Added nested route fixtures proving canonical links and `og:url` remain blocked at arbitrary generated-route depth while `canonicalHostApproved` is false.
- [x] Generated tour/blog pages now emit Twitter image and image-alt metadata matching their Open Graph image and alt text. The schemas define `seo.ogAlt`; the repository policy validator and live renderer require meaningful alt text whenever `seo.ogImage` is supplied.
- [x] Added contract tests for schema/policy rejection and generated markup parity; the existing full quality runner already executes the publication, content contract and renderer suites.
- [ ] Manual social-preview inspection on an owner-approved HTTPS staging origin remains NOT RUN. No canonical-host, sitemap, robots or deployment setting was changed.

**Baseline:** main `4fbd67d78aa99c4b601da84e59ac08bdc11809d0`; post-merge Site quality gates run [#40457135825](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40457135825) passed before this feature branch. STG-01–STG-18 and owner-dependent release gates remain unchanged.

## 27 October 2026 — experience detail route and responsive coverage

- [x] Added `experience-details.html` as the destination for all six itinerary links and the Fort-walk, car/road and other-route detail links from `experiences.html`.
- [x] Kept route descriptions source-backed and caveated; no rates, fixed clock times, current operation or availability are promised.
- [x] Added a deterministic contract test for all nine anchors, metadata parity, local social-preview assets, central-config contact hydration and canonical-host publication guards.
- [x] Added the detail route to content/UX and media-performance checks, Chromium smoke coverage, and staging visual-review coverage.
- [x] Expanded the staging visual evidence contract from seven routes / 21 screenshots to eight routes / 24 screenshots at 360, 768 and 1440 CSS pixels.
- [ ] Actual HTTPS staging inspection and STG-01–STG-18 remain NOT RUN. This code and CI coverage does not complete manual UAT, owner confirmation, contact-channel reachability or production authorization.



## Shared staging route and viewport contract — 27 October 2026

- [x] Added `content/staging-route-contract.json` as the QA source of truth for the eight core public HTML routes and the mobile/tablet/desktop viewport matrix. It is deliberately separate from the production sitemap and does not authorize indexing.
- [x] Chromium smoke, launch wiring checks and the offline screenshot reviewer now consume the shared route contract. The screenshot count is derived from route count × viewport count (currently 8 × 3 = 24) rather than maintained independently in each runner.
- [x] Added `scripts/test-public-route-contract.py` to the full quality suite. It validates route order, unique names, safe root-level files, the viewport matrix, consumer wiring and documentation parity.
- [x] Removed stale seven-route and 21-image descriptions and fixed the screenshot reviewer’s completion message to report the computed evidence count.
- [ ] Owner-approved HTTPS staging execution, visual inspection of the retained 24 screenshots, STG-01–STG-18, Lighthouse/formal accessibility evaluation, booking/contact verification and owner fact approvals remain NOT RUN. Automated route coverage is not staging acceptance.


## Room comparison shortlist — 27 October 2026

- [x] Add a progressive, page-local shortlist for two or three rooms using the existing source-mapped photos, catalogue floor, visible description and visible feature list.
- [x] Enforce the three-room limit, support removing one room and clearing the shortlist, and recover a shortlisted room hidden by an active finder filter.
- [x] Keep controls absent when JavaScript is disabled; retain all seven room cards and existing enquiry handoffs.
- [x] Add a semantic comparison table, live status messages, descriptive thumbnail alt text, visible keyboard focus and horizontal scrolling for narrow screens.
- [x] Add deterministic contract coverage and Chromium interaction checks for selection, the limit, removal, filter recovery and no-JavaScript fallback.
- [ ] On an owner-approved HTTPS staging origin, manually verify the comparison layout and keyboard operation at mobile and desktop sizes. This remains NOT RUN; automated browser CI is not human UAT.
- [ ] Owner must confirm current room assignment, bed arrangements, occupancy, amenities and total rates for the guest's dates. The comparison uses the source catalogue only and is not live inventory.

### P1 — About / story route

- [ ] Read the About page at mobile and desktop widths. Confirm the story describes a lived-in fort setting rather than generic hotel copy or invented family history.
- [ ] Confirm the four planning steps link to the correct arrival, rooms, experiences and dining pages; keyboard focus remains visible and no content overflows at narrow widths.
- [ ] Verify the arrival constraint is clear, room photographs are not presented as live inventory, and current rates, menu, service hours, tours and assistance are explicitly left for confirmation.
- [ ] Verify Book Now opens the external booking flow and the WhatsApp action creates a guest-reviewed draft only. Do not send a message or create a reservation as part of this check.
- [ ] Record operator, exact staging URL, Asia/Kolkata date/time, browser/device/viewport, result, evidence and follow-up. Automated tests do not complete this gate.

## 27 October 2026 — Cross-page arrival wayfinding

- [x] Added source-listed distances to Directions: about 300 metres from Fort Parking and about 200 metres from the fort entrance. The source lists 5–6 minutes from parking; the 3–4 minute entrance figure is a provisional owner-provided estimate, not present in the current source page. All walking-time guidance still requires owner confirmation before release.
- [x] Added a general rickshaw-access enquiry prompt. Time-specific hours are omitted until the owner confirms current local rules; the page directs guests to confirm the drop-off/meeting point.
- [x] Linked the same arrival facts from Home, Rooms, Experiences, Experience details, Dining, About and Gallery to reduce inconsistencies between planning contexts.
- [x] Added a scoped responsive stylesheet, a static source-fact/link contract and Chromium checks for the seven cross-page links, distance cards and responsive widths.
- [ ] Owner must confirm the approximate walking estimates and current local vehicle-access rules before guests rely on them. Do not publish the legacy 8:00 AM–8:00 PM rickshaw window unless the owner reconfirms it.
- [ ] On an owner-approved HTTPS staging origin, manually verify the Directions card layout and the linked anchor at mobile and desktop widths; inspect image crop and keyboard operation. No staging URL is approved or assumed by this change.
- [ ] Verify the exact map pin and contact-channel reachability through an operator-controlled check. Source authorization is not proof of live reachability, and no external link/message is opened or sent by the browser test.
- [ ] STG-01–STG-18 remain NOT RUN until an operator records actual evidence. Canonical activation, public sitemap, robots-policy changes, production deployment and guest-data collection remain separately gated.


## 28 October 2026 — Dining enquiry data minimization

- [x] Rename the table tab and heading to “Ask about a table” so the action is clearly an enquiry, not a reservation.
- [x] Remove redundant name, email and mobile fields from the WhatsApp-only table enquiry. Keep only required date and party size, optional free-text time and a bounded optional context note.
- [x] Keep the form fail-closed on invalid/unavailable contact configuration; only an explicit submit prepares a protected WhatsApp draft. No guest details are stored or sent automatically.
- [x] Add static and Chromium regression coverage for field minimization, optional preferences, bounds, draft content and absence of personal-contact labels.
- [ ] Human staging review remains NOT RUN: verify the shorter form, keyboard focus, mobile layout and optional note on an owner-approved HTTPS staging origin.
- [ ] Do not send the draft or contact the restaurant as part of automated tests. Owner must still confirm current service hours, menu/prices and table availability. A table enquiry is not a reservation.

- [x] Removed the inherited 20-guest form ceiling because restaurant capacity is not owner-confirmed; larger groups may enquire, with capacity and availability confirmed by the restaurant.


## 28 October 2026 — Experience enquiry dates by intent

- [x] Require a requested date for every guest enquiry, but require departure only for overnight options and room-availability requests.
- [x] Keep departure optional for same-day camel, cultural-evening, guided-city, Fort-walk, dining and travel-arrangement enquiries; if a departure is supplied, it must follow the requested date.
- [x] Include the departure line in the WhatsApp draft only when the guest provided it. The guest still reviews and sends the draft; no message or reservation is created automatically.
- [x] Add static form-contract checks, deterministic JavaScript tests and Chromium coverage for overnight-required and day-only single-date flows.
- [ ] On an owner-approved HTTPS staging origin, manually verify the labels, required-state announcement, date validation and WhatsApp draft preview on mobile and desktop. Automated CI is not human UAT.
- [ ] Confirm actual tour operating status, routes, inclusions, prices, guide availability and current room inventory with the owner. The form does not imply any option is available or bookable.
- [ ] STG-01–STG-18 remain NOT RUN until an operator records real browser/device evidence. No staging hostname may be guessed.


## 28 October 2026 — Guest-enquiry recovery and intent clarity

- [x] Change the visible departure label and helper text when the selected interest changes; keep stay/room requirements explicit and day-only departure optional.
- [x] After explicit submit, reveal the exact WhatsApp draft text in a read-only textarea with an accessible copy control. Clipboard failure falls back to selecting the text for manual copy.
- [x] Exercise copy/recovery in deterministic tests and Chromium while intercepting the external-tab request; automated tests send no message and create no reservation.
- [ ] On the owner-approved HTTPS staging origin, test the copy action on iOS/Android and desktop browsers, including denied clipboard permission and pop-up blocking; manually verify focus visibility, status announcement and the textarea at narrow widths.
- [ ] Manual staging UAT and STG-01–STG-18 remain NOT RUN. Do not infer live contact reachability from the static configuration or the browser mock.
