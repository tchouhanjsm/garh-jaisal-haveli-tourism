# Garh Jaisal Haveli — Tourism Website

A mobile-first, conversion-focused website for Garh Jaisal Haveli in Jaisalmer, Rajasthan. Built with semantic HTML, custom CSS, and vanilla JavaScript so it can be hosted on GoDaddy/cPanel without a framework, build step, paid dependency, or database.

## Pages

- `index.html` — homepage and guest decision journey, with direct Book Now, room and experience paths, FAQs and primary CTA
- `rooms.html` — source-backed room finder and side-by-side comparison shortlist, with direct availability enquiry
- `experiences.html` — Thar Desert safari/camping and guided city tour service pages
- `dining.html` — restaurant overview, approval-gated menu, privacy-minimized table-enquiry draft and arrival directions in accessible tabs
- `about.html` — an editorial introduction to the lived-in fort setting, with four practical decisions for arrival, room choice, experiences and dining
- `directions.html` — arrival planning, access expectations and route questions to confirm
- `gallery.html` — locally hosted, source-reviewed room, fort, rooftop and desert references
- `404.html` — branded recovery route with useful page links and centrally configured booking/contact actions

The branded `404.html` recovery page is included in static link/anchor integrity checks. It is `noindex,follow`, routes guests to the main content pages, and uses `assets/site.js` plus `content/site-config.json` for all booking/contact actions; it does not embed contact endpoints directly.

## Stack

- HTML5 and semantic page structure
- CSS with responsive desktop/tablet/mobile layouts; no CSS framework
- Vanilla JavaScript for responsive navigation, centralized Book Now / WhatsApp / telephone / landline / email links, enquiry-message generation and accessible accordions
- Google Fonts (Playfair Display + DM Sans) with system fallbacks
- Local images can be hydrated from the existing public repository `tchouhanjsm/garh-jaisal-website` by running the asset script below

## Run locally

From this directory:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. A local HTTP server is recommended because browsers can treat some assets differently when opened as `file://` URLs.

## Images

The site uses locally hosted images in `assets/images/`, mapped to page subject and role. New source-backed gallery assets are tracked in `docs/MEDIA-MIGRATION-MANIFEST.json`. To prepare the assets for a standalone deployment, run:

```bash
./scripts/localize-images.sh
```

The script preserves non-empty JPGs already in the checkout and downloads only missing originals from the public source repository `tchouhanjsm/garh-jaisal-website`. If Pillow is installed, it creates and verifies WebP derivatives and updates the site's local image references (including Open Graph image metadata) to WebP. If Pillow is unavailable or conversion fails, it keeps the JPG references. It also migrates legacy raw-image URLs if any remain.

The operation is safe to repeat: existing originals are not overwritten, and HTML references are changed only when needed. It requires `curl` and `python3`; an internet connection is needed only when one or more source JPGs are missing. Run `./scripts/check-site.sh` after localization to validate the site and the image-reference rewrite regression tests.

## Create a new GitHub repository

To create and push a new **private** repository from your machine, install GitHub CLI and sign in with `gh auth login`, then run:

```bash
./scripts/create-github-repo.sh garh-jaisal-haveli-tourism --private
```

For a public repository, use `--public`. The script initializes Git if needed, creates the first commit if needed, creates the new remote repository, adds `origin`, and pushes `main`. It does not change or write to `tchouhanjsm/garh-jaisal-website`.

If `gh` is not installed, create an empty repo at https://github.com/new, then run the following from this project directory after replacing `<OWNER>` with your GitHub username:

```bash
git init -b main
git add .
git commit -m "feat: launch Garh Jaisal Haveli tourism website"
git remote add origin https://github.com/<OWNER>/garh-jaisal-haveli-tourism.git
git push -u origin main
```

Do not check passwords, API tokens, `.env` files or any private guest data into Git.

## Deploy to GoDaddy/cPanel

1. Review the current site copy and property claims with the on-site team.
2. Keep the pre-launch `robots.txt` blocking crawlers on staging; change it to `Allow: /` only after the owner approves the canonical production host.
3. Run `./scripts/localize-images.sh` so photos are served from the new site, not hotlinked from the old repository.
4. Check mobile layouts and links on a real phone; test WhatsApp on both Android and iOS.
5. Upload the HTML files plus the `assets/` directory to a **staging subdomain** first.
6. Update canonical URLs, Open Graph URLs and `sitemap.xml` to the final domain only after the owner approves the canonical host and verifies the production origin.
7. Verify HTTPS, image sizes, 404 behaviour, contact details, enquiry messages and all page routes.
8. Switch production only after a rollback copy of the existing site has been saved.

## Conversion and trust guardrails

- “Book Now” opens the external booking-engine URL stored in the source configuration; the static website does not itself create or confirm a reservation. WhatsApp buttons prefill an enquiry message but do not confirm availability or payment.
- It is explicit that the hotel is inside the fort and vehicles cannot reach the door.
- No fabricated testimonials or current online rating have been added. Collect approved, attributed review excerpts before adding a testimonial carousel.
- Calls to action say “enquire”, “check availability” or “ask about options” where the answer depends on current inventory.
- Read the explicit launch gates in docs/LAUNCH-READINESS-CHECKLIST.md. Source-authorized contact values are not proof of live reachability; the AsiaTech destination returned HTTP 403 to an automated read-only probe on 26 October 2026, so a standard-browser check is required before production launch.

## Project documentation

- `docs/CONTENT-AND-CONVERSION.md` — message hierarchy, sections and service-page copy
- `docs/LAUNCH-CHECKLIST.md` — original QA, SEO, accessibility, speed and deployment checklist
- `docs/LAUNCH-READINESS-CHECKLIST.md` — current P0/P1 manual gates, including the booking provider 403 probe, contact verification, property fact approval, DNS/canonical decision, staging UAT and rollback.
- `docs/MEDIA-MIGRATION-MANIFEST.json` — curated source/target photo provenance, byte-identical source hashes, roles, dimensions, byte budgets and page-specific alt-text contracts.
- `scripts/test-media-manifest.js`, `scripts/test-page-media-performance.js` and `scripts/test-launch-readiness.js` — source provenance, role-based image byte/loading budgets and automated release-safeguard checks included in the quality runner.
- `docs/TESTIMONIAL-COLLECTION.md` — how to add authentic guest proof without inventing quotes


## Tours, articles, galleries and Content Studio

The first architecture and marketing plan is in [Tour and Blog Content Strategy](docs/TOUR-BLOG-CONTENT-STRATEGY.md); the migration and Studio integration contract is in [Content Migration and Studio Plan](docs/CONTENT-MIGRATION-AND-STUDIO-PLAN.md).

- `content/paths.json` is the planned single source of truth for allowed content types, output routes, image folders, SEO rules and sitemap behavior.
- `content/site-config.json` centralizes the external booking-engine URL, WhatsApp, primary phone, alternate landline, email, restaurant source links and the source-authorized exact hotel map pin. These values are not live-tested; the map pin must be checked by an operator before release. They were migrated from the designated legacy repository under the owner's explicit instruction and are marked `owner-authorized-source` / `source-authorized`; they have not been independently smoke-tested. The JavaScript validates endpoint formats and fails closed if configuration cannot load. Canonical-host approval remains separate and false until the owner records the launch decision.
- `content/schemas/` defines the initial tour, blog and curated-gallery record shapes.
- `content/tours/sunset-camel-safari.json` and `content/blogs/jaisalmer-fort-guide.json` are draft-only migrations demonstrating the new record shapes. `assets/images/tours/<slug>/`, `assets/images/blogs/<slug>/` and `assets/images/gallery/<category>/` are the intended media destinations. Shared design stays in `assets/site.css`; page-specific CSS/JS can live in `assets/css/` and `assets/js/`.

**Static renderer implemented:** `node scripts/build-content-pages.js --write` generates tour/blog detail pages, listing hubs and sitemap URLs only for records with `status: "live"` that pass schema validation, tour fact-source/date gates, canonical-host approval and verified enquiry-endpoint gates. `node scripts/build-content-pages.js --check` verifies the generated files are current without modifying them. Draft, hidden and `approved_for_release` records never enter public HTML or the sitemap. Generated pages carry a marker; the renderer only overwrites/removes its own marked pages and refuses to overwrite unowned HTML. The current sample tour/article remain drafts because canonical/contact/booking details are not yet owner-approved.

**Static-site content packs:** `node scripts/import-content-pack.js /path/to/pack.zip` validates a registry-bound pack and prints the exact file plan without writing. Add `--apply` only after reviewing the dry-run output. The importer accepts only tour/blog/gallery JSON records and their registered per-record images; imported records must remain drafts. It rejects stale hashes, traversal, symlinks, unapproved paths, malformed archives and unsafe image files. It never writes HTML pages or `sitemap.xml`. See [Content Pack Format](docs/CONTENT-PACK-FORMAT.md).

## Branch, PR and local validation workflow

Use the branch-first process in [Development Workflow](docs/DEVELOPMENT-WORKFLOW.md): inspect the open PR, work on its branch, make coherent commits, run available checks locally, inspect the final diff, and leave the PR open for owner review. Do not open a second PR while any earlier PR is open and unmerged.

The `Site quality gates` GitHub Actions workflow runs `scripts/check-pr-quality.sh` on pull requests to `main` and pushes to `main` and supported implementation branches. It uses standard GitHub-hosted runners, pinned actions and read-only repository permissions; standard runners are free for public repositories ([GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)). Run the same command locally before opening a PR. A missing check is not a pass. The workflow does not deploy or publish content; current tour/blog records stay unpublished until the owner-approved content gates pass.


### Premium design and media performance
- The homepage uses one primary Book Now CTA, quieter room/arrival links, specific fort-arrival facts and a closing CTA that explains the external flow.
- The media manifest records source-verified Green Room replacement bytes and WebP/JPEG source pairs. Do not change image-to-room mapping or describe photos as live room inventory without confirming the actual subject/source facts.
- `scripts/test-public-image-uniqueness.js` checks referenced local image files across public root, tour and blog HTML for exact-byte duplicates at different paths; `scripts/test-public-image-uniqueness-contract.js` covers duplicate detection and path-safety behavior. The check is byte-exact, not perceptual, so screenshot review is still required for visually similar photos.
- Run `bash scripts/check-pr-quality.sh` before opening/merging a PR. The media test checks file bytes, source blob SHA, dimensions, role budgets and page-specific references/alt text. Passing automation does not replace staging visual inspection.


### Guest-journey editorial and experience photography
- All six source-listed experience options have two distinct, locally hosted, source-reviewed photographs with manual next/previous controls. The Swiss-tent secondary image is tracked in `docs/MEDIA-MIGRATION-MANIFEST.json`. Galleries do not autoplay; captions are visual context, not guaranteed itinerary stops.
- Dining uses a real rooftop table image and a distinct fort view. About and Directions are differentiated around the fort panorama and practical final-walk information, avoiding generic filler and duplicated hero images.
- Run `node scripts/test-experience-carousel.js` for previous/next/wraparound behavior, live slide status and incomplete-markup fallback. The full quality runner invokes this test and the expanded static UX gates.
- Current menu approval, booking-provider browser verification, live contact-channel reachability, canonical-host approval and staging UAT remain manual release gates.
- `scripts/test-seo-publication-safeguards.js` audits root, `tours/` and `blogs/` HTML to keep canonical/`og:url` tags, sitemap URL entries and a sitemap directive in `robots.txt` unpublished while `canonicalHostApproved` is false. Its fixture contract test covers the pre-launch state and accidental publication regressions.


### Real-browser guest-journey smoke coverage
- The full quality gate now runs `scripts/test-browser-smoke.py` in Chromium against a temporary local HTTP server. It checks all eight pages, title uniqueness, main/H1 and current-navigation contracts, Open Graph/Twitter image-alt parity, local image decoding, local 404s, and responsive overflow at 320, 360, 390, 768, 1280 and 1440 CSS pixels; full-page evidence remains captured at 360, 768 and 1440 CSS pixels.
- It also exercises the mobile skip link, menu Escape/focus return, reduced-motion preference, all six experience galleries (next/previous/wraparound/no autoplay), the no-JavaScript gallery fallback, and centralized booking/contact-link hydration. It inspects the external destinations but never opens the provider or submits guest data.
- For local browser QA, install `python3 -m pip install -r requirements-test.txt` and `python3 -m playwright install chromium`, then run `bash scripts/check-pr-quality.sh`. On Linux, install the required Chromium OS dependencies if they are not already present.
- CI installs the pinned Playwright dependency and Chromium inside the existing quality job on the standard `ubuntu-latest` runner; no additional workflow job or paid runner is introduced.
- This is a local-browser smoke test, not staging UAT, a formal accessibility audit, Lighthouse/Core Web Vitals evidence or proof that booking/contact endpoints are live.

- The browser smoke suite also requests a deterministic unknown route and requires the branded 404.html to be served with HTTP 404 (not a soft 200), same-origin navigation, root-relative CSS/JavaScript, noindex,follow, no canonical/og:url, all six recovery routes, centralized booking/contact hydration and no horizontal overflow at 320, 360, 390, 768, 1280 and 1440 CSS pixels. The local smoke server simulates Apache's ErrorDocument 404 while preserving the status. The schema-version 4 report records each viewport result in unknownRouteEvidence; the offline review rejects contradictory evidence. STG-18 remains a human acceptance gate and stays NOT RUN until the intended staging host is checked by an operator.


### Operator-run staging preflight
- The command `python3 scripts/test-browser-smoke.py` runs the real Chromium smoke suite against a temporary local server. For an operator-run staging check, set STAGING_URL to the exact owner-approved **HTTPS staging origin** (not a production hostname), STAGING_OPERATOR to the operator's name, STAGING_REPORT to a local .json output path, and STAGING_SCREENSHOTS to an empty output directory. Both output paths must be outside the repository checkout; the runner refuses a non-empty screenshot directory so evidence from separate runs cannot be mixed. Then run:

  ~~~bash
  python3 scripts/test-browser-smoke.py --base-url "$STAGING_URL" --operator "$STAGING_OPERATOR" --report "$STAGING_REPORT" --screenshots-dir "$STAGING_SCREENSHOTS"
  ~~~

- Staging mode refuses HTTP, URL credentials, paths, queries, fragments, IP/local hostnames, and the production hostnames recorded in content/site-config.json. Report and screenshot output must stay outside the checkout. Cross-origin top-level/frame navigations are blocked and publication-guard requests do not follow redirects. If the staging subdomain uses HTTP Basic Auth, set STAGING_BASIC_AUTH_USERNAME and STAGING_BASIC_AUTH_PASSWORD in the local shell; the credentials are scoped to the staging origin and are never written to the report. It does not navigate to Book Now/WhatsApp/phone/email destinations, submit forms, send messages or create a reservation/payment.
- The schema-version 4 JSON report records the staging origin, Asia/Kolkata timestamp, operator, Chromium version, eight-route/viewport coverage, explicit unknown-route HTTP 404 recovery evidence at 320/360/390/768/1280/1440 CSS pixels, sanitized failures and 24 full-page PNG records with filenames, actual pixel geometry, byte size and SHA-256. Screenshots are captured for all eight routes at 360, 768 and 1440 CSS pixels after requesting font readiness and image decoding. Only screenshot filenames—not local filesystem paths—are stored in the report. All 18 manual staging checks remain NOT RUN. A green browser result does not clear those manual release gates or authorize deployment. The standard local/CI Chromium smoke run exercises the same capture path in a temporary directory, validates the 24 screenshot records, then removes the temporary images; only explicit staging mode retains the operator's screenshot bundle.

## Staging evidence report semantics

The read-only staging preflight writes report schema version 4. `automatedResult` is `PASS` only when the report contains complete evidence for all eight planned page routes, target-origin HTTP 200 responses for those routes, all six planned responsive-audit widths (320, 360, 390, 768, 1280 and 1440 CSS pixels), the branded unknown-route HTTP 404 contract at all three widths, and all 24 full-page screenshot files with validated PNG geometry, non-zero byte sizes and SHA-256 hashes. Missing or partial evidence fails closed. Review `evidenceCoverage`, `unknownRouteEvidence` and `visualEvidence` rather than treating an empty failure list alone as success.

Automated PASS never clears manual release gates: the report keeps `releaseStatus` as `BLOCKED_PENDING_MANUAL_UAT` and STG-01 through STG-18 as `NOT RUN` until an operator records actual staging evidence.


### Offline staging screenshot review

After a staging preflight finishes, the 24 PNGs can be reviewed together in a local HTML page. This renderer reads the saved JSON and files only; it does not contact the staging host or follow any guest-facing link.

~~~bash
python3 scripts/render-staging-visual-review.py --report "$STAGING_REPORT" --screenshots-dir "$STAGING_SCREENSHOTS" --output "$STAGING_VISUAL_REVIEW"
~~~

- **STAGING_VISUAL_REVIEW** must be an **.html** path outside the repository checkout and in the same parent directory as **STAGING_SCREENSHOTS**.
- The renderer accepts schema-version 4 staging reports only, verifies all eight route/HTTP records, all six responsive-audit widths and the three screenshot widths, and checks each PNG's actual header geometry, byte count and SHA-256 against the JSON manifest before showing it as verified.
- The HTML compares Home, Rooms, Experiences, Experience details, Dining, About, Directions and Gallery at 360, 768 and 1440 CSS pixels. It uses local relative image links, inline CSS only, escaped report text and redacted failure URLs; it embeds no remote scripts, fonts or images and does not include absolute filesystem paths.
- `content/staging-route-contract.json` is the single source of truth for the eight core public HTML routes, three full-page screenshot viewports and six responsive-audit breakpoints. Chromium smoke and 404 recovery exercise all six widths; the offline visual review keeps a smaller 24-image bundle at 360/768/1440. The inventory remains QA-only and is not an indexing or publication authorization. This contract is not a production sitemap or indexing authorization.
- A missing, duplicated, tampered or malformed screenshot is shown as unverified and makes the renderer exit non-zero. A browser report marked FAIL remains visibly failed even if the image bundle itself is intact.
- The page always states that release is blocked pending manual UAT. It cannot mark STG-01–STG-18 passed, verify live DNS/TLS or redirects, publish the unapproved menu, or authorize deployment. Keep the JSON, PNG directory and HTML review local and review them before sharing.


The offline visual-review renderer also validates report consistency before presenting evidence: the failure count must match the diagnostic list; PASS/FAIL must agree with that count; the Asia/Kolkata timestamp, operator and browser metadata must be present; all four read-only safety assertions and all five evidence-coverage flags, including unknown-route recovery must be explicitly false/true as appropriate; the screenshot contract must remain 24 full-page PNGs; and `releaseStatus` must remain `BLOCKED_PENDING_MANUAL_UAT`. Contradictions are shown as an invalid report, and incomplete bundle evidence cannot retain a top-line PASS. The renderer exits non-zero. This validates internal consistency, not cryptographic authenticity or live staging behavior.


### Static accessibility regression gate

The full quality runner executes `scripts/test-static-accessibility-contract.py` and `scripts/test-static-accessibility.py` across root public HTML and generated `tours/`/`blogs/` pages. The source-level contract checks accessible names, label/ARIA references, focus safety, unique IDs, skip-link/main landmarks, explicit button types, image alt attributes and safe new-tab links. See [`docs/STATIC-ACCESSIBILITY-CONTRACT.md`](docs/STATIC-ACCESSIBILITY-CONTRACT.md). It supplements Chromium and human UAT; it is not a WCAG certification or a replacement for staging verification.


### Recursive static route integrity

- \`scripts/check-site.py\` audits every root HTML page and recursively discovers generated pages under \`tours/\` and \`blogs/\`. It validates local \`href\`/\`src\` files, same-page and cross-page anchors, query-bearing URLs, URL-encoded paths, root-relative references and repository-boundary safety.
- \`scripts/test-site-integrity-contract.py\` exercises nested tour/blog routes and verifies that missing files, missing anchors and path traversal fail. See [Static Route Integrity](docs/STATIC-ROUTE-INTEGRITY.md).
- These checks are offline repository tests; they do not contact staging or third-party endpoints and do not replace STG-01–STG-18 or owner approval.


### Generated-page social preview safety

- Generated tour/blog pages emit matching Open Graph and Twitter card image URLs and image alt text whenever a preview image is present.
- A content record that sets `seo.ogImage` must also provide meaningful `seo.ogAlt`; the schemas define the field, while the repository validator and live renderer enforce the requirement so an explicit social image cannot ship with a missing description.
- The pre-launch canonical/OG URL safeguard recursively checks root HTML and every nested HTML page under `tours/` and `blogs/`, while ignoring symlinked routes. This closes the gap where a deeply nested generated page could bypass publication protection.
- These are offline source and renderer checks. They do not activate canonical URLs, change robots/sitemap publication, or replace staging social-preview review.

### Experience detail route

`experiences.html` now starts with a category-led discovery path for desert evenings, overnight stays, Fort/city tours and road/route ideas. Its six source-listed package cards keep a dedicated itinerary/details link before a separate enquiry action; Fort walking, car/road arrangements and other route ideas remain distinct and clearly unconfirmed. `experience-details.html` contains the detailed source-backed outlines, all nine stable route anchors and the questions guests should settle before travel. Neither page publishes unapproved prices, fixed operating hours or live availability. Booking and enquiry links continue to hydrate from `content/site-config.json`; canonical metadata points to the configured production origin, while DNS/TLS/redirect behavior and live publication remain deployment checks.


### Visual capture and header navigation QA

The Chromium screenshot path now fails closed if any document image cannot decode or has zero intrinsic dimensions. Previously, the capture path swallowed image decode errors and could save a screenshot containing empty image frames without flagging the cause. This remains an automated asset-readiness check, not a human image-subject/crop approval. The shared navigation contract also checks the About/Gallery dropdown's light-header contrast, visible open state and hidden closed state in Chromium.

### Source-backed room discovery

The Rooms page adds a progressive finder for the seven source-listed named rooms. Guests can filter by the floor recorded in the owner-maintained catalogue and by explicitly listed features (king bed, second bed, city view, window seat and carved bed). Selecting multiple features requires every selected feature to be listed for a room. A live result count, no-match explanation and clear-filters action are provided. The filter controls stay hidden when JavaScript is unavailable, leaving all seven room cards readable.

The feature list is not a live inventory or an exhaustive guarantee: a feature not listed for a room is not proof that it is absent. Room assignment, current amenities, occupancy, rates/taxes and booking terms still require direct confirmation. `scripts/test-room-finder.js` guards the catalogue metadata and filter/reset behavior; Chromium smoke also checks floor/feature combinations, keyboard Space activation, reset/focus recovery and the no-JavaScript fallback.



## Guest enquiry conversion

The Experiences, experience-detail and Dining pages share a date-aware enquiry form. It prepares a WhatsApp draft only when the central public contact configuration authorizes a valid WhatsApp endpoint; the visitor must review and send the message in WhatsApp. Book Now opens the source-listed external booking provider and does not itself confirm availability or a reservation. A requested date is required for every enquiry; a departure date is required for overnight stays and room-availability enquiries, but optional for day experiences. If a departure is supplied, it must follow the requested date and is included in the draft only when present. The form provides an accessible status and does not store enquiry details in a website backend. Source-authorized contact values are not proof of live reachability. If configuration fails, the site keeps actions disabled and tells visitors that no message was sent, to refresh, or to use contact details already supplied directly by the hotel. `scripts/test-guest-enquiry-conversion.js` covers intent-aware date requirements, authorized and malformed contact configuration, encoded draft content, and recovery after correcting arrival alone. The Chromium browser smoke suite exercises overnight and single-date enquiry drafts on Experiences, Experience details and Dining while intercepting `window.open`; it never opens WhatsApp or sends guest data.


### Room comparison shortlist

The Rooms catalogue provides a progressive shortlist for comparing up to three of the seven source-listed rooms. It reuses each room card's local photograph, listed floor, description and visible feature list; it does not infer live inventory, missing amenities, occupancy or rates. Selection exists only in the current page session and is not written to browser storage or sent to a server. With JavaScript disabled, all room cards remain available and comparison controls are not shown. On narrow screens, the comparison table scrolls horizontally and remains keyboard-focusable.

### Arrival wayfinding and cross-page planning

The Directions page shows the owner-maintained legacy source distances for the last walk: about 300 metres from Fort Parking and about 200 metres from the fort entrance. The current source page also gives a 5–6 minute estimate from Fort Parking; the 3–4 minute figure from the entrance is a provisional owner-provided planning estimate, not stated in the current source page. All walking-time guidance is approximate and must be reconfirmed by the owner before guests rely on it. The same contextual deep link is available from Home, Rooms, Experiences, Experience details, Dining, About and Gallery so guests can check the final approach while choosing what to do. Time-specific rickshaw hours are deliberately omitted until the owner confirms current local rules; guests are directed to confirm access and the meeting point for their date. CI covers the distance copy, page links and responsive layout; it does not replace owner confirmation, contact reachability checks or manual staging UAT.


### Guest-enquiry fallback and intent guidance

The shared enquiry form updates the visible departure requirement and helper text when the guest switches between overnight/room enquiries and day experiences. A valid submit prepares the same guest-reviewed WhatsApp draft as before, and now reveals a read-only, copyable version beneath the form in case the browser blocks or fails to open the WhatsApp tab. Copying is an explicit guest action. The site never sends the message automatically and does not persist these details to a backend or browser storage. Deterministic tests and Chromium smoke cover the dynamic help, exact draft fallback, and clipboard path without navigating away from the site or sending guest data.


### Room shortlist and enquiry recovery

On Rooms, the guest can add up to three catalogue entries to the comparison shortlist and prepare one enquiry listing the selected room names. The action only becomes available after the selected room set is non-empty and the centralized, authorized WhatsApp configuration is ready. The draft asks the team to confirm room assignment, availability, inclusions, rates/taxes and terms; it does not imply live inventory or reserve a room. The exact message remains visible in a read-only copy fallback if the WhatsApp tab is blocked. Changing the shortlist clears that old draft so a guest cannot accidentally copy an outdated room selection.

The Dining table enquiry now has the same recovery principle: after a valid explicit submit, the exact guest-reviewed draft is shown on-page with a copy control. Both clipboard routes are opt-in; failed clipboard access leaves the message selected for manual copy. No message is sent automatically, and these changes introduce no backend storage or production/staging configuration changes.
