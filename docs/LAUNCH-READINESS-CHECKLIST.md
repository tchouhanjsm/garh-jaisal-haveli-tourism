# Garh Jaisal Haveli — Launch Readiness Checklist

**Status as of 26 October 2026: implementation checks pass; production release is blocked pending manual owner/UAT gates.**

Baseline main at the start of this delivery phase: 476dd625fce29cdc524da33214c4f260885d4e18. The exact-main Site quality gates run #40325052513 passed after PR #19 merged. The site is a static HTML/CSS/vanilla-JavaScript deployment intended for GoDaddy/cPanel. This checklist distinguishes repository/automation checks from live operating checks.

## What automated checks can currently prove

- The seven core HTML pages expose the shared Book Now, WhatsApp, primary phone, alternate landline and email markers.
- Contact and booking destinations are centrally configured in content/site-config.json, marked owner-authorized-source / source-authorized, and pass format/host validation in the client runtime.
- If the central config cannot load, or a channel is malformed, the JavaScript keeps that action disabled instead of guessing a destination.
- The named-room gallery uses locally hosted assets mapped to the legacy room catalogue, and the media manifest checks source/target blob SHA, bytes, dimensions, page-specific alt text and content role.
- The dining page explicitly withholds current menu items/prices while the legacy menu file still says owner_confirmed=false.
- Canonical URL/OG URL publication and sitemap URL publishing remain gated until the owner approves the actual production hostname.

A passing automated suite is not proof that the hotel’s live phone is answered, the booking provider accepts guests, the current menu is correct, or staging/production renders correctly.

## Automated media performance contracts

The quality suite checks actual bytes for every local image and responsive `srcset` candidate referenced by the seven core pages, not only the curated manifest. Current role budgets are:

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

### P0 — Booking provider and contact channels

- [ ] **AsiaTech Book Now, desktop:** open the link in a normal browser (not a crawler); confirm the correct property/booking portal loads, HTTPS is valid, and arrival/departure/guest controls work.
- [ ] **AsiaTech Book Now, mobile:** repeat on a phone and check layout, scrolling, date selection and return navigation.
- [ ] **External booking probe warning:** on 26 October 2026, a read-only automated web request to the configured AsiaTech route returned **HTTP 403**. This is not enough evidence to conclude normal visitors are blocked because the tool may be restricted, but it is a launch blocker until a human verifies the link in a standard browser. If a normal browser also receives 403, have the provider/operator fix it before release.
- [ ] **WhatsApp:** open a room, safari, dining and arrival enquiry; verify they target the correct hotel business account and prefill the expected message. Confirm the team receives and responds to a test enquiry. The automated web tool could not independently verify the WhatsApp endpoint.
- [ ] **Primary mobile:** call the configured mobile number and confirm the intended hotel contact answers.
- [ ] **Alternate landline:** call the configured landline and verify that it reaches the intended property/operator.
- [ ] **Email:** send a harmless test email to the configured hotel address from an external mailbox, check delivery/no bounce, and confirm the team can reply.
- [ ] Record the date, device/browser, result and operator who verified each channel. Do not label source-authorized values live-verified until these tests pass.

### P0 — Actual hotel/room facts

- [ ] Confirm the seven named rooms shown on the site are still offered and each image depicts the named room.
- [ ] Confirm current room inventory, occupancy/capacity, room-specific amenities, bed configuration, rates/taxes and cancellation/payment terms. The site deliberately does not claim live availability or publish room rates.
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
- [ ] Check desktop, tablet and mobile breakpoints; keyboard navigation, focus visibility, Escape/expanded state, reduced-motion behavior, image cropping and CTA tap targets.
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
| STG-14 Responsive image rendering/crop at 360, 768 and 1440 CSS-pixel viewports |  |  |  |  | NOT RUN |  |  |
| STG-15 Keyboard-only navigation through all six experience galleries, including visible focus and Enter/Space |  |  |  |  | NOT RUN |  |  |
| STG-16 Reduced-motion preference, carousel no-autoplay behavior and stable layout |  |  |  |  | NOT RUN |  |  |
| STG-17 Social preview image, title, description and image-alt consistency on staging |  |  |  |  | NOT RUN |  |  |

Allowed results: `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. Record the reason and follow-up owner for every failure or blocked row. Keep canonical-host approval, menu publication and deployment decisions in their separate owner-approval gates.

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

The full quality suite now includes `scripts/test-browser-smoke.py`, using the pinned Playwright dependency in `requirements-test.txt` and Chromium on the existing standard GitHub-hosted runner. It starts a temporary local HTTP server and checks all seven pages at 360, 768 and 1440 CSS-pixel viewports, local image decoding/HTTP responses, page metadata, active navigation, mobile booking-bar bounds, skip-link and Escape/focus behavior, reduced motion, and all six manual experience galleries including wraparound and no-JavaScript fallback.

The browser suite only inspects the configured AsiaTech, WhatsApp, telephone, landline and email destinations; it does not navigate to third-party endpoints, create reservations, submit guest data or send messages. It cannot prove that the staging host is correct or that a human operator answers a channel.

Local command sequence:

```bash
python3 -m pip install -r requirements-test.txt
python3 -m playwright install chromium
bash scripts/check-pr-quality.sh
```

The 17 `STG-01`–`STG-17` rows below remain human-operated checks and must stay `NOT RUN` until an operator records evidence for the exact staging URL, date/time, browser/device/viewport and result. Browser CI does not mark those rows complete.


## Read-only staging browser preflight

The same Chromium smoke suite can be pointed at an owner-approved staging origin to validate the deployed static files without following third-party links or submitting guest data. It refuses the configured production hosts (legacyProductionUrl and newStaticSiteCanonicalHost) even if someone accidentally supplies them.

Set these variables locally to the real staging origin, operator name and an output file path; do not commit the resulting evidence file unless it has been reviewed for environment details.

~~~bash
python3 scripts/test-browser-smoke.py \
  --base-url "$STAGING_URL" \
  --operator "$STAGING_OPERATOR" \
  --report "$STAGING_REPORT"
~~~

STAGING_URL must be an HTTPS origin only: no path, query, fragment, URL credentials, IP address or local hostname. The runner checks all seven page routes, unique titles, description ranges, one main/H1, social image/alt parity, canonical-host withholding, local image decoding, same-origin HTTP/request failures, mixed-content requests, responsive overflow at 360/768/1440 CSS pixels, mobile navigation/skip-link focus, reduced motion, keyboard Enter/Space activation and wraparound for all six photo galleries, no autoplay, and the no-JavaScript gallery fallback. It also fetches the deployed robots.txt, sitemap.xml and content/site-config.json to verify that staging remains blocked from indexing and the canonical host is still unapproved.

The JSON evidence report records the exact origin, Asia/Kolkata timestamp, operator, Chromium version, viewport widths and automated failures. It always leaves STG-01 through STG-17 as NOT RUN, because those rows require human browser/device, contact-channel, owner-fact, backup/rollback and social-preview evidence. The script never navigates to the AsiaTech provider, opens WhatsApp, dials a number, sends email, submits guest data, creates a reservation or makes a payment. The provider's previously observed automated HTTP 403 still requires normal-browser verification by the owner/operator.

This tool is not a production deploy, canonical approval, sitemap/robots activation or a substitute for formal accessibility/Lighthouse testing.
