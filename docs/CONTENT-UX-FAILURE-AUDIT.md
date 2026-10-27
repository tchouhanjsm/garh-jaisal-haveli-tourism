# Content and UX Failure Audit

**Baseline reviewed for this recovery phase:** main at 002a0c83765a3b6623512f7ee775b722acd7dc27 (26 October 2026; PR #13 merged). This cumulative audit now tracks the homepage guest-decision journey; older entries remain historical.
**Scope:** public static HTML/CSS/vanilla-JS routes. Content Studio pack import and adapter work are explicitly out of scope for this recovery phase.

## Evidence from the pre-change pages

The initial content pass measured main-region text (navigation and footer excluded) at approximately:

| Route | Main-region words | Observed issue |
|---|---:|---|
| `index.html` | 898 | Useful overview, but the same rooftop and sandstone images repeat in multiple sections; a generic Google search was presented as a current guest-review link. |
| `rooms.html` | 244 | Too little decision support; the same Scarlet photograph repeated and generic rooftop/corridor images were used as room cards. |
| `experiences.html` | 359 | The open-sky photograph was repeated and a bedroom image was used for a general trip-planning card; owner-confirmed facts were not easy to discover. |
| `dining.html` | 359 | The rooftop image appeared three times and a corridor image was used to illustrate a candlelit dinner. |
| `about.html` | 386 | The corridor photograph repeated; the public page stated a 2005 hospitality start date and unverified family-history claims the legacy Owner Facts file does not list a decided family story or start year and explicitly instructs readers not to guess blank facts. |
| `directions.html` | 503 | The corridor photograph repeated; copy implied luggage assistance, transfers and a fixed one-day advance-notice rule despite those operational details not being approved. |

The six root pages used the same rooftop photograph for Open Graph metadata and contained canonical/OG URL values pointing at `https://hotelgarhjaisal.com`, while `content/site-config.json` explicitly says `canonicalHostApproved: false`. The pre-launch `robots.txt` blocked indexing but still advertised a sitemap containing six absolute URLs on that unapproved host.

These observations came from the checked-in HTML/configuration and legacy `docs/OWNER-FACTS.md` / `docs/SITE-ARCHITECTURE.md`; the Owner Facts file says blank facts must not be guessed and contains no decided family story/start year. These are source-level findings, not browser or analytics measurements.

## Addressed in this recovery batch

- Added `gallery.html`, linked from the primary navigation and footer, with four existing target-repository photographs that were fetched as actual image bytes and visually reviewed:
  - `rest3.jpg` — rooftop terrace over Jaisalmer at dusk (900×600).
  - `courtyard.jpg` — sandstone passage/interior details (2200×1467).
  - `scarlet.jpg` — red-toned bedroom and carved wooden bed (900×600).
  - `tent.jpg` — open-sky sleeping scene beneath stars (750×750); captions/alt text do not mislabel it as a tent.
- Added explicit width/height attributes, below-the-fold lazy loading and decoding hints to retained photographs. Removed repeated or contextually misleading images rather than reusing a photo as proof of a room, meal or package.
- Expanded Rooms with a factual checklist of details to confirm rather than asserting unverified room amenities, availability or rates.
- In the follow-on room-reference phase, moved two visually reviewed local interior photos into an image-led comparison grid beside a room-details checklist. Removed the generic text-only `Haveli Rooms` / `Your Jaisalmer Base` placeholders and the duplicated lower photo section. The two reference images are not assigned room names or operational features; current inventory, room details and rates remain unverified.
- Expanded Experiences with facts expressly recorded in legacy Owner Facts: Swiss-tent facilities, the planned Fort-walk focus, recorded guide languages, and the conditional nature of SUV/sedan arrangements. Date-dependent route, language, availability and package details remain confirmation items.
- Expanded Dining with a useful enquiry checklist while keeping menu, prices, hours and table availability unconfirmed.
- Expanded About and homepage discovery links. Removed the unapproved “Since 2005” proof claim and replaced the generic Google search link presented as current guest reviews.
- Rewrote Directions language to remove the fixed one-day notice rule and avoid promising luggage help, a transfer, a fixed pickup point or late-arrival accommodation.
- Removed canonical and `og:url` values from public HTML while the configured canonical host is unapproved. Withheld sitemap URL entries and the robots sitemap directive; `Disallow: /` remains in place. No drafts were published.
- Added `scripts/test-content-ux.js` to check page depth, unique/ranged titles and descriptions, internal discoverability/orphans, local image paths and alt text, duplicate per-page images, actual image geometry, and the canonical/sitemap publication gate. It is wired into `scripts/check-pr-quality.sh`.

## Open owner / publication blockers

1. Approve the final canonical host and production URL policy. Until then, canonical/OG URL tags and sitemap URLs remain withheld and robots remains blocked.
2. Verify the exact staffed booking/contact channels before populating `content/site-config.json` or enabling any enquiry CTA.
3. Confirm room names/details, inventory, bed arrangements, amenities, rates, taxes, cancellation terms and check-in/out policy.
4. Confirm current dining menu, prices, service hours, dietary handling and candlelit setup/availability.
5. Confirm each tour's current route, timing, vehicle, guide/language availability, inclusions, exclusions, fees and cancellation terms.
6. Confirm whether the family hospitality start date may be published.
7. Family ownership/story and the hospitality start year remain owner-confirmation gates; no public claim should be restored until the owner approves the wording and evidence.
8. Only six selected legacy images were localized after retrieval and visual review; no full-library import was attempted. Any additional image requires the same byte-level retrieval, visual review, local hosting, meaningful alt text and geometry validation.
9. The Journal/blog archive remains deferred until at least one article passes source review, fact/date checks, local-link validation and the publication/canonical gates.

## Validation evidence for this checkpoint

- Source-level inspection: completed through connected GitHub file reads; the six legacy source images added by PR #8 were retrieved as actual bytes and visually reviewed, along with the existing target-repository room photographs.
- Local full-suite commands for the room-reference phase: **not run**. The current execution environment has no complete checkout and DNS lookup / `git ls-remote` failed with `Could not resolve host: github.com`.
- PR #8 exact head `48e58ff965d07999bcf4cfa89e043fee4c9ed604` passed `Site quality gates / quality` in [run #40264880774](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40264880774), then merged as `bc7e4c5d3bc5a87c88c06eb95dedcddfc027de8b`. This is historical evidence for PR #8 only, not for the room-reference changes.
- PR #9 room-reference changes passed `Site quality gates / quality` on exact head `93bad10605597c0ad224f43c2a02fa968c5cc596` in [run #40265927443](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40265927443) and merged as `f92374e04f34213ce83c17254bb75defd773350b`. This historical result does not cover the new seven-room catalogue batch.
- Browser/device, Lighthouse, visual regression and production/staging tests: **not run**.
- No deployment or production changes were made.

## Next bulk phases

1. Improve Experiences with six source-listed desert/heritage concepts, distinct locally hosted imagery, comparison-oriented prompts and clear non-live-offer language.
2. Improve relevant Dining and Directions imagery only where the source files are retrieved, visually reviewed and context-matched.
3. Prepare a source-reviewed Journal article only after source/date review, internal-link validation and publication/canonical gates.
4. Reconsider the legacy Content Studio adapter only after website content/UX recovery is accepted. Studio/pack integration remains out of scope.


## Follow-up recovery — seven-room catalogue and authentic room photography (2026-10-26)

The post-PR #9 review found that Rooms still did not answer the basic question “Which named room am I considering?” The owner-maintained legacy source lists seven rooms with distinct images.

### Addressed in this batch

- Restores Sweet Purple, Rising Sun, Scarlet, Opium, Red Maharani, Green and BlueSky as seven named cards.
- Retrieves six mapped photos as actual binary content from the legacy repository, visually reviews them, and hosts them locally under assets/images/rooms/. Scarlet reuses the existing local source-matched photo. The hero uses a separately reviewed source-library sitting area.
- Adds room-specific source descriptions, floor labels and source-listed feature tags. These are not live inventory claims.
- Adds explicit image dimensions, useful alt text, lazy loading/decoding and responsive card layout.
- Extends the content/UX regression gate to require all seven names, local image mappings and key features. Existing global checks continue to validate geometry, alt text, internal links, page depth and canonical/sitemap publication gates.
- Leaves contact/booking endpoints, canonical host, robots/sitemap policy and drafts unchanged.

### Validation truth and next phases

Source image bytes and JPEG geometry were reviewed before creating this patch. The first exact-head quality run caught a test expectation mismatch: “Fort-entrance outlook” was checked as a feature tag even though the source stores that detail in the Scarlet room description; the source-listed “City view” and “Window seat” are the correct feature tags. The regression expectation is corrected in the follow-up commit. The source preflight checks seven cards, SEO title/description ranges, main-content depth and unique image paths. GitHub Actions must pass on the updated exact PR head before the batch is treated as validated. Local full-suite, browser/device, Lighthouse and production/staging checks were not run in this connector-only execution.

Next: improve Experiences with subject-matched locally hosted photos and clearer comparison of desert/heritage options, keeping operation and rates enquiry-only until confirmed. Then address relevant Dining/Directions imagery and a researched Journal article if source-reviewed and publishable. Studio integration remains deferred.


## Experience comparison recovery — six source-listed options (2026-10-26)

Baseline: PR #10 is confirmed merged as 2c501f868e51f0baa1eb34d35ab90e0f39d274d8. This phase changes the existing static experiences.html route only; no new public tour detail pages are created.

### Addressed in this batch

- Reorganizes the six source-recorded concepts that the legacy data lists as published: sunset camel safari, cultural desert evening, Sleep Under the Stars, Swiss tent overnight, half-day guided Jaisalmer tour and full-day guided Jaisalmer tour.
- Each concept has a distinct image, source-context caption, plain-language explanation and three confirmation prompts covering duration/timing, transport/access and inclusions/exclusions.
- Reuses reviewed local images for the sunset camel, open-sky sleeping and Fort-temple references. Retrieved and visually reviewed three additional legacy source images before localizing them:
  - img/Desert_Camp/Prog.jpeg → assets/images/experiences/cultural-programme.jpg (1280×1600; musicians and seated guests at a night-time camp performance).
  - img/v2/swiss-tent.webp → assets/images/experiences/swiss-tent-exterior.webp (1800×1200; white Swiss-style tents in evening light; 180,750 bytes, about 45% smaller than the earlier interior JPEG, with no EXIF/XMP chunks detected).
  - img/j2.jpg → assets/images/experiences/heritage-architecture.jpg (1366×768; ornate sandstone pavilion). Its caption explicitly says it is a heritage reference, not a promised stop. EXIF/XMP APP1 metadata segments were removed before committing the local copy; pixel dimensions were preserved.
- Uses explicit image geometry, meaningful alt text, lazy loading and async decoding for all six option images. The layout collapses from three columns to two and then one.
- Adds regression checks for exactly six named options, expected local image mappings, unique image paths, confirmation prompts, lazy loading and disabled enquiry actions.
- Connector-side source preflight (not the full suite): six option cards, six distinct image paths, 53-character title, 141-character meta description and 1,076 main-content words. The three new image byte streams were checked for geometry matching 1280×1600, 1800×1200 and 1366×768 respectively.
- Keeps booking/contact endpoints empty, canonical/OG URL and sitemap publication withheld, robots blocked from indexing, and all current content drafts unpublished.

### Open blockers and validation truth

- Legacy record status is treated as source inventory only, not proof of current operation. No current availability, price, exact route, duration, transport, access permission, meal, fee, inclusion or exclusion is promised by the comparison cards.
- Owner Facts dated 14 October 2026 is used only for the recorded Swiss-tent facility list and planned Fort-walk focus; the current offer and date-specific details still require confirmation.
- Local bash scripts/check-pr-quality.sh and bash scripts/check-site.sh: NOT RUN in this connector-only execution. The environment has no complete checkout and cannot resolve/connect to GitHub from the shell. Browser/device and Lighthouse checks are also not run.
- The existing Site quality gates workflow is unchanged. The final PR head must have a successful exact-head quality run; absent, stale, pending, cancelled or failed runs are not passes.

### Next bulk phases

1. Address Dining/Directions imagery where actual source assets can be retrieved, visually reviewed and matched to the content.
2. Consider one researched Journal article only after source/date verification and the canonical/publication prerequisites.
3. Keep Content Studio/pack integration deferred until the website content/UX recovery is accepted.


### Regression discovered during exact-head CI — fixed on this branch

- The first Site quality gates run for PR #11, run 40273347840, failed in the static website integrity step. The log identified two broken homepage deep links: index.html targets experiences.html#desert and experiences.html#city-tours, but the first Experiences rewrite removed those anchors.
- Restored the existing deep-link targets on the corresponding sunset-desert and guided-city cards, added scroll margin for the sticky header, and added regression assertions to keep both anchors present.
- This is a confirmed navigation regression, not an infrastructure failure. The same PR branch must pass the quality workflow on the post-fix exact head before it is considered green.


## Dining and Directions imagery recovery (2026-10-26)

**Baseline:** main at bb2da8121466ab26e64938d6c6f0f0f547b1f9f3 after PR #11 merged. This is a focused visual-context phase across the existing static Dining and Directions routes; no Studio/pack adapter work is included.

### Addressed in this batch

- Dining now uses a distinct night-time rooftop-table photograph from the legacy source at `img/rest5.jpg`, rather than using the same sunset-terrace scene for both the candlelight illustration and its Open Graph image. The photograph was retrieved as binary bytes and visually reviewed: 900×600, 92,506 bytes, no EXIF/XMP APP1 metadata. The local destination is `assets/images/dining/rooftop-candlelit-table.jpg`.
- Directions now includes a visually reviewed facade reference from legacy `img/optimized/v2/facade.webp`. The image shows the carved sandstone exterior and hotel name sign, making it more useful for recognising the building than a courtyard-only photograph. It is explicitly described as a visual reference, not a guaranteed pickup point or route marker. The local destination is `assets/images/directions/haveli-facade.webp`.
- The source facade WebP was 1333×2000 and contained ICCP, EXIF and XMP chunks. Those metadata chunks were removed and the VP8X flags/RIFF length updated before adding the local copy. The retained pixel image is unchanged; the resulting file is 587,056 bytes and contains only the VP8X and VP8 image chunks.
- Both images have descriptive alt text, explicit intrinsic dimensions, lazy loading and asynchronous decoding. The facade uses a responsive portrait layout that preserves the visible hotel sign instead of cropping the image to a landscape hero.
- Regression coverage now checks the exact local asset mapping, contextual caveats, JPEG/WebP metadata absence and explicit supporting-image byte budgets (100 KiB for the dining JPEG; 600 KiB for the facade WebP). Existing page-depth, unique metadata, local-link, orphan, geometry, alt-text, duplicate-image and canonical/sitemap safeguards remain enabled.
- The canonical host, robots/sitemap publication, contact/booking endpoints, menu/hours, rates, arrival route and operational promises are unchanged.

### Validation truth and remaining blockers

- Source image retrieval and visual review: **PASS** via the legacy repository content API. Source blob SHAs: `img/rest5.jpg` `e00320af65321045b27807c3994f5027ddb4bc68`; `img/optimized/v2/facade.webp` `132a69fe667c3dad773282ebc42c8423abd607b2`.
- Image byte preflight in the connector runtime: **PASS** — dining image 900×600 / 92,506 bytes with no EXIF/XMP; facade image 1333×2000 / 587,056 bytes after ICCP/EXIF/XMP removal.
- Full local `bash scripts/check-pr-quality.sh` and `bash scripts/check-site.sh`: **NOT RUN**. The connector execution environment has no complete checkout and shell DNS/network access to GitHub is unavailable. Do not treat this as a pass.
- Browser/device, Lighthouse, visual regression and staging tests: **NOT RUN**.
- `Site quality gates / quality` must pass on the final exact PR head after the audit update. Missing, stale, pending, cancelled or failed checks are not passing evidence. The local full-suite limitation remains a merge blocker.

### Deferred

The restaurant image remains a visual reference, not a promise of a live menu, service schedule or candlelit setup. The facade photograph is a historical source image and does not establish the current approach or meeting point. The owner must still verify canonical host, contact endpoints, current menu/service hours and arrival arrangements before those publication/booking gates can change. A source-reviewed Journal article remains deferred until source/date and publication gates are satisfied; Studio/pack integration remains out of scope.


### Exact-head check evidence for the Dining/Directions phase

- The first implementation commit `dd9f270eafd8d8dae33b6d8272d335e8ec3387fb` passed `Site quality gates / quality` in [run #40278374512](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40278374512). The follow-up code/test head `e333637a6f28c59438929516226359a88d595501` passed `Site quality gates / quality` in [PR run #40278468379](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40278468379) and the push-triggered run [#40278462693](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40278462693); both runs identify that exact head and their quality jobs completed successfully. These results are historical for `e333637a6f28c59438929516226359a88d595501` only. This audit update creates a new head, so a fresh exact-head quality run is required before merge consideration. Local full-suite and browser/device checks remain not run.


### Exact-head quality result before the final audit note (2026-10-26)

- Code/test head `7205826e2b70c31a71fa5de62d08dbe77ef1d269` passed `Site quality gates / quality` in [PR run #40278549502](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40278549502) and the push-triggered [run #40278545176](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40278545176). Both runs completed successfully on that exact SHA, including the full repository quality script.
- This audit note creates a new head; the new exact-head workflow result must be checked before any merge decision. The prior runs remain evidence for `7205826e2b70c31a71fa5de62d08dbe77ef1d269` only.
- The local full suite remains **NOT RUN** because no complete checkout is available and shell DNS resolution for `github.com` fails. Browser/device and Lighthouse checks also remain **NOT RUN**.


### Final-head validation checkpoint before this audit-only update (2026-10-26)

- Implementation/test head `a560347af0508b9cc555a819d9419a4b6d75e898` passed `Site quality gates / quality` in [PR run #40278711557](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40278711557) and push run [#40278705970](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40278705970). Both completed successfully on that exact SHA. The job log confirms `bash scripts/check-pr-quality.sh` completed the static-site, content/UX, renderer, importer, enquiry-flow, content-contract, Python-compilation and shell-syntax checks.
- This audit-only checkpoint creates a new head; the resulting exact-head quality check must pass before merge consideration. The run links above are historical evidence for `a560347af0508b9cc555a819d9419a4b6d75e898` only.
- Local `bash scripts/check-pr-quality.sh` and `bash scripts/check-site.sh` remain **NOT RUN**: no complete local checkout is present and shell DNS lookup for `github.com` fails. Browser/device, Lighthouse and staging checks remain **NOT RUN**.

## Follow-up wording correction — unverified arrival assistance (2026-10-26)

A final content review of PR #12 found one remaining promise boundary: Dining said the team “can guide” guests with directions or luggage help, and the Directions contact card said “We’ll help you plan the final stretch.” Those claims are stronger than approved source facts while public contact endpoints and assistance availability remain unverified.

- Reworded both to ask guests to use the contact route in their booking confirmation and confirm arrangements for their date; assistance is not guaranteed.
- Made the disabled arrival contact CTA explicitly say the channel is pending verification.
- Added the owner-confirmed Google Maps destination for Garh Jaisal’s Kitchen, retaining the separate arrival-guide link.
- Added regression assertions for the exact map link and non-promissory language so future copy changes cannot silently reintroduce service guarantees.
- No contact/booking endpoint, canonical host, robots/sitemap setting, menu/prices, service hours, pickup point or transfer promise was activated.

The current exact-head CI runs predate this wording correction and do not validate it. A fresh Site quality gates / quality result is required on the updated commit. Local full-suite, browser/device, Lighthouse and staging checks remain not run in this connector-only environment.
## Source-backed Fort guide draft recovery — 2026-10-26

### What failed

The registry already contained a Jaisalmer Fort guide, but its copy read like a migration placeholder rather than a guest-ready article. Several passages described the legacy article instead of answering a traveller's question; two related-blog slugs had no matching records; and the old draft repeated approximate walk distances that were not confirmed for current access conditions. Its source list also lacked the UNESCO designation source and the dedicated official Jain-temple page.

### Recovery batch

- Rewrote the existing draft as a substantive nine-section guide (connector-side count: approximately 1,800 words across title, lede and sections; no public detail route is generated).
- Added a specific SEO title and an in-range meta description.
- Grounded heritage claims in Rajasthan Tourism and UNESCO's official Hill Forts of Rajasthan entry; used the official Jain Temples page for temple context.
- Removed unverified walking-distance/time estimates and replaced them with date-specific arrival planning prompts.
- Added practical guidance on living-neighbourhood etiquette, temple access, mobility/uneven surfaces, room/dining verification and comparison of heritage/desert plans without asserting live availability.
- Cleared stale related-blog references; retained one related-tour slug, which the renderer exposes only if that tour is published.
- Added contract tests for schema, section/TOC integrity, word depth, official sources, access constraints and draft-only metadata.

### Publication and validation gates

The record remains status=draft, lastReviewed=null and publishedAt=null. The canonical host, booking/contact endpoints, current room/dining/tour operations and date-specific arrival arrangements remain owner-verification gates. No HTML route, Journal index, sitemap or robots setting was changed.

The updated content-contract tests are not called passed until GitHub Actions completes on the exact final PR head. Local full-suite, browser/device, accessibility and Lighthouse checks were not run in the connector-only environment. No deployment is included.

### PR #13 CI debugging notes — 2026-10-26

Two exact-head quality runs exposed test-fixture issues, not content or publication-gate failures:

- Run [#40285424677](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40285424677) failed in the existing renderer test because it still expected the former article section id `overview`. The new article uses `living-fort`; the fixture assertion was updated to match the current table-of-contents/section contract.
- Follow-up run [#40285672161](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40285672161) passed renderer, importer, enquiry and schema checks but failed the new article depth assertion. The test's whitespace regex was over-escaped, so the counter counted the article as one token. The assertion has been corrected to split on actual whitespace while retaining the 1,200-word minimum.

Both failures are explicitly recorded rather than labelled as environment failures. The follow-up fixes need a fresh quality run against the next exact PR HEAD. No local full suite, browser/device, Lighthouse or staging checks have been performed here, and the PR must not be merged until the exact-head CI and all required review/local-validation gates are satisfied.


## Homepage guest-decision journey — 2026-10-26

### Confirmed baseline and visitor impact

- The homepage's primary planning panel used a date/guest form whose submit control was disabled while contact details remained unverified. The note correctly said travel details would not be sent, but the form still occupied prime visitor attention without completing a useful action.
- The hero's local asset, `assets/images/rest3.jpg`, was visually inspected. It shows a rooftop terrace and Jaisalmer city lights at dusk; its existing hero alt text and Open Graph description are contextually appropriate, so this batch does not replace it.
- `assets/images/courtyard.jpg` was visually inspected and shows a carved sandstone interior. `assets/images/legacy/fort-temple-spires.jpg` shows temple spires and is not a hotel-façade or room photograph; it must not be labelled as either.
- Source `docs/OWNER-FACTS.md` still marks live room prices, current menu/pricing, dining hours, reception coverage, transfer fares and arrival assistance as needing confirmation. Contact/booking config and the final canonical host remain unapproved.

### Implementation in this batch

- Replaced the disabled date/guest form with four direct planning routes to Rooms, Experiences, Dining and Directions.
- Added visitor-facing guidance that vehicle access ends before the hotel door and that the current meeting point needs confirmation.
- Made enquiry state explicit: the homepage does not collect or transmit travel dates and does not make reservations while contact setup is unverified.
- Revised tour and booking FAQs to distinguish source-listed options from currently operated offers and to avoid implying that a booking request is transmitted.
- Replaced the closing booking-conversation CTA with useful links to room guidance and arrival planning.
- Added responsive two-column/stacked path cards, keyboard-visible focus treatment and reduced-motion handling. Existing page templates and the renderer were not replaced.
- Added regression checks for the four route targets, accessible group/heading, non-live booking boundary, arrival caveat, hero image/alt/OG alignment, and responsive/focus/reduced-motion CSS.
- Updated this audit and clarified that content/UX/SEO recovery takes priority over Content Studio integration.

### Asset and publication boundary

No new image binaries were copied or claimed as migrated in this phase. Existing locally hosted assets were visually inspected only to confirm their current subject/context; the full source-to-target media manifest and gallery curation remain outstanding. The fort temple image was not repurposed as a hotel image. No canonical host, sitemap/robots rule, booking/contact endpoint, room rate, menu, service schedule or production deployment was changed. The blog and tour content registry's publication rules remain unchanged.

### Validation status and limitations

The base commit's Site quality gates workflow passed on the exact main SHA before this batch; that is not evidence for the new feature head. A fresh exact-head GitHub Actions result is required for this implementation and any subsequent commit. The connected GitHub tools do not provide a complete local checkout in this chat, so the local full suite, browser/device rendering, accessibility tooling, Lighthouse and staging UAT were not run here. Do not treat those items as passed.


## Source-authorized booking, contact and bulk guest-journey recovery — 2026-10-26

### Confirmed source inputs

The designated legacy repository was reviewed directly for public configuration and factual hotel records:

- `include/site-config.php`: external AsiaTech booking-engine URL, primary WhatsApp number, phone display, alternate landline and hotel email.
- `docs/OWNER-FACTS.md`: source-listed seven-room context, SUV/sedan arrangements across Rajasthan and Delhi, driver languages, source-recorded Swiss-tent facilities, and the planned Jaisalmer Fort walk.
- `include/rooms-data.php`: Sweet Purple, Rising Sun, Scarlet, Opium, Red Maharani, Green and BlueSky source records. These match the existing seven-room presentation; rates and live inventory are not implied.
- `include/experience-data.php`: source itineraries for sunset camel safari, cultural desert evening, Sleep Under the Stars, Swiss-tent overnight, and half-/full-day guided Jaisalmer tours. These were used to add meaningful context, not to guarantee that each service is operating on a particular date.
- `include/menu-data.php`: `owner_confirmed=false`. Current menu items and prices therefore remain unpublished.
- `restaurant.php` and owner facts: Garh Jaisal's Kitchen map destination and Instagram profile.

### Implementation in the current branch

- Populated `content/site-config.json` with the owner-directed legacy booking URL, WhatsApp, phone, alternate landline, email, restaurant map and Instagram URL. The configuration explicitly uses `owner-authorized-source` / `source-authorized` to distinguish owner authorization to reuse repository details from an independent live endpoint/staffing test.
- Extended `assets/site.js` to hydrate Book Now, WhatsApp, telephone, alternate landline and email links from the central JSON configuration; provider/format validation remains in place, and configuration-fetch failures leave links disabled. Direct booking opens the external AsiaTech flow and does not mean a reservation is confirmed.
- Added Book Now in the shared navigation, mobile bar and footer across the seven core HTML pages; added direct booking alongside room enquiry actions.
- Expanded Experiences copy using the legacy itinerary records, retaining date-specific confirmation boundaries for operation, duration, stop access, guide language, route, transport, current price and inclusions.
- Added a Garh Jaisal's Kitchen contact/location panel with the owner-supplied Google Maps destination and Instagram profile. Kept menu prices hidden while the legacy menu remains unconfirmed.
- Added a directions/transport panel describing source-listed SUV/sedan arrangements across Rajasthan and Delhi, with route, pickup, fare, timing and availability to be confirmed per booking.
- Visually inspected and migrated three source images into the curated Gallery taxonomy: fort-side rooftop view, desert camp from above, and illuminated desert tents at night. Each has exact byte count, dimensions, alt text, source blob SHA, intended role and an explicit availability caveat in `docs/MEDIA-MIGRATION-MANIFEST.json`.
- Added automated enquiry/contact tests for booking, WhatsApp, primary phone, alternate landline and email; added a media manifest integrity test to the consolidated GitHub quality script.

### Guardrails and unresolved work

- Legacy contact details were reused at the owner's explicit request, but **live reachability, current staffing, booking-engine behavior, email delivery and WhatsApp response have not been independently smoke-tested**. Check them during staging/UAT before production launch.
- The source menu remains unconfirmed; no dish prices or claims about today's menu were migrated as current.
- Keep the canonical host unapproved, tour/article draft publication rules unchanged, and current room availability/rates, reception hours, luggage assistance, transfer fares and travel-time promises unconfirmed.
- No production deployment, indexing/canonical switch, server-side enquiry storage or menu publication occurred.

### Validation checkpoint

The newly added regression tests and content changes must pass the exact final feature-branch/PR-head GitHub quality run before merge. No complete local checkout was available in this chat, so local execution of `bash scripts/check-pr-quality.sh`, browser/device rendering, Lighthouse, accessibility tooling and staging UAT remain **not run** unless a later verified run records otherwise.


## Named-room gallery and launch-readiness recovery — 26 October 2026

### Room and dining media audit

- Audited the seven source room records and matching images in the legacy repository. The target room files are byte-identical to the named source files (matching Git blob SHA and byte count); no duplicate copies were created merely to satisfy the Gallery.
- Replaced three generic/ambiguous bedroom Gallery cards with a dedicated seven-room gallery: Sweet Purple, Rising Sun, Scarlet, Opium, Red Maharani, Green and BlueSky. Each card uses the mapped local room photo, explicit geometry, descriptive alt text, responsive layout, a link to the corresponding named room section, Book Now and a room-specific WhatsApp enquiry.
- Audited the existing homepage/dining rooftop images. The homepage hero remains mapped to the source rooftop-terrace photograph; the dining page's candlelit image remains a separate source-matched table photograph. Their distinct roles are now explicit in the media manifest.
- Expanded docs/MEDIA-MIGRATION-MANIFEST.json from 3 to 12 image records: the 3 previously migrated gallery binaries plus 7 byte-verified existing room images and 2 byte-verified existing rooftop/dining images. Each record declares source and target blob SHA, verification page, dimensions, byte count, subject/role, alt text, approval state and a current-availability caveat.
- Extended the media regression test to compute the actual Git blob SHA from each local file, confirm equality with the recorded source SHA, validate byte size/dimensions, enforce image budgets and verify the image/alt contract on the page appropriate to its role. The larger existing Green Room source photo is retained and called out as a candidate for a future optimized derivative rather than silently claiming it is optimized.

### Launch checks and release boundary

- Added docs/LAUNCH-READINESS-CHECKLIST.md and scripts/test-launch-readiness.js, wired into scripts/check-pr-quality.sh.
- A read-only automated request to the AsiaTech booking destination returned HTTP 403 on 26 October 2026. This does **not** prove normal guests are blocked, but a normal-browser staging check is required before release. The automated browser tool could not independently verify the WhatsApp endpoint either.
- The checklist separates automated wiring checks from human UAT for Book Now, WhatsApp, mobile and landline reachability, email delivery/reply, live room facts, current restaurant menu, currently operating tours, DNS/SSL/canonical host, staging rendering, rollback and post-deploy smoke testing.
- The canonical host remains unapproved, sitemap/robots publication gates remain unchanged, menu/prices remain unpublished while owner confirmation is false, and no production deploy or live reservation/payment test was performed.

### Validation statement

The full GitHub-hosted Site quality gates must pass on the exact feature/PR head and post-merge main SHA. This connected environment does not contain a complete local checkout; local browser/device, Lighthouse, accessibility-tooling and staging UAT are still not run from this chat. A green automated suite does not satisfy the manual release gates.


## Premium visual and media-performance batch — 26 October 2026

### Design decisions
- Kept the established paper/sandstone/ink palette and serif-led editorial typography rather than introducing a new template, gradients, fake testimonials or generated imagery.
- Simplified the homepage hero to one primary Book Now action with quieter secondary links for rooms and arrival.
- Replaced repeated fort wording in the proof strip with four concrete planning facts: the seven named rooms, rooftop dining questions, the final walk inside the fort and date-specific desert/city tour confirmations.
- Replaced the unattributed generic quote panel with an editorial arrival/decision section about the actual operating context: vehicles cannot reach the door; room photographs are not live inventory; tour and menu details must be confirmed for the dates.
- Moved the planning-path section before the closing CTA so the homepage ends with the direct booking handoff. The closing note says the external flow does not itself confirm a reservation.
- Reused a visually inspected, source-listed Green Room photograph at 114,126 bytes instead of 799,571 bytes. This reduces the Green Room image transfer by 685,445 bytes (about 85.7%) while preserving the correct subject.
- Added source-provided WebP image sources for the Sweet Purple room and sandstone sitting-room hero while keeping JPEG fallbacks. The WebP assets were visually inspected; exact blob hashes/bytes are recorded in the media manifest.

### Performance and regression work
- Media manifest tracks the replacement Green Room bytes/hash, the new Purple Room WebP, the sitting-room WebP and the JPEG fallback. Entries record source/target SHA, dimensions, byte size, intended role, page references, alt text and a current-availability caveat.
- Media gate now applies separate byte budgets to hero, named-room photos, WebP alternates, room hero, dining and rooftop/fort imagery; it verifies local file bytes, Git blob hashes, dimensions and page-specific reference/alt contracts.
- Content/UX regression tests check homepage-specific copy, CTA behavior and final section order, plus WebP/JPEG mapping and updated Green Room geometry.
- No unconfirmed menu items, public rates, live room availability or guaranteed luggage/transport/tour services were added.

### Validation boundaries
- GitHub Actions must pass on the exact PR head and post-merge main SHA.
- No complete local checkout is available through this chat; local full suite, browser/device, Lighthouse, accessibility-tooling and staging UAT are not represented as run.
- Live booking-provider and contact reachability and production-domain approval remain launch gates under docs/LAUNCH-READINESS-CHECKLIST.md.


## Guest-journey editorial and experience gallery phase — 26 October 2026

- Added manual, accessible next/previous photo galleries to five of the six source-listed experience cards. Swiss-tent remains a single-photo reference because only one distinct source-reviewed photo is mapped; it is not filled with a duplicate or unreviewed substitute. The five galleries use local photos, useful alt text/captions, a live slide counter and keyboard-operable buttons; there is no autoplay. Secondary photographs are visual context only, never a promise that the pictured place is on the current itinerary.
- Reworked the Experiences introduction to use plainer language and keep the source/availability distinction explicit.
- Reworked Dining to pair a rooftop-table photograph with a fort-at-dusk view rather than repeating the same photo. Copy points visitors to current menu, service-hour, dietary and table-availability confirmation. The unapproved menu remains unpublished.
- Reworked Directions to lead with the key arrival constraint—cars cannot reach the hotel door—followed by a scannable vehicle-access / final-walk / meeting-point summary and map link. Corrected wording that implied configured source-authorized contacts were still disabled.
- Reworked About around the actual fort setting, walk-in access and seven named rooms. The hero and social preview now use the inspected fort rooftop photo, planning links precede the closing CTA, and generic hospitality/quote filler was reduced.
- Expanded the media-manifest page contract for the fort rooftop photo so the same exact local asset/alt pairing is checked on Gallery, About and Dining.

### Validation and release boundary
- Added a Node regression test for next/previous/wraparound behavior, the live slide counter, aria-hidden state and fallback behavior when carousel markup is incomplete. It is part of scripts/check-pr-quality.sh.
- Static UX tests require unique local image sources across Experiences, two distinct local photos on carousel-enabled cards, the Swiss-tent single-photo exception, accessible controls, practical arrival content, About CTA ordering and the Dining/fort-photo pairing.
- GitHub-hosted exact-head validation must pass before merge. This chat does not have a complete local checkout for local browser/device QA, Lighthouse or staging UAT.
- No production deployment, menu-price publication, live room availability or new service guarantees were added.


## Confirmed regression failures and remediation — 26 October 2026

- [Run #40320474942](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40320474942) failed because `camp-evening.jpeg` was reused on cultural-evening and Swiss-tent cards.
- [Run #40321058117](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40321058117) confirmed the duplicate and missing Dining copy that a candlelight photo is not confirmation of date-specific availability.
- [Run #40321406270](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40321406270) failed to parse an over-escaped JavaScript regex; [run #40321768698](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40321768698) exposed remaining matcher/test-contract failures; [run #40322023069](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40322023069) still reported duplicate images, carousel matcher failures, Dining copy and a strict Directions class assertion.
- [Run #40322526343](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40322526343) passed the content/UX gate but failed the new carousel test because it assumed an `experiences.html` `.page-hero` section. The page intentionally uses a text-led intro instead. The test now validates the page's actual Open Graph image is present in the locally hosted content instead of imposing an unrelated page template.

The duplicate photo is removed from Swiss-tent, which retains its one reviewed image until another subject-matched source is reviewed. The other five galleries have unique sources. Dining's date-specific caveat, Directions copy and the relevant regression tests are corrected. The then-current head `cfb5e64d65058a81fb8900d6cf400600e9eec351` passed [PR quality run #40322822668](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40322822668). Any later commit, including audit/checklist corrections, requires a fresh exact-head run; historical failed runs above remain failures.


## Staging preflight, technical SEO and visual QA — 26 October 2026

### Authoritative checkpoint
- Main at phase start: `476dd625fce29cdc524da33214c4f260885d4e18`.
- PR #19, `Complete tour photo galleries and guest-journey safeguards`, is confirmed merged at `476dd625fce29cdc524da33214c4f260885d4e18`.
- PR #19 exact head `e42f9fb1dc7609013344f70a87d6dc10ec3e20da` passed the exact-head `Site quality gates / quality` workflow in [run #40324814286](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40324814286).
- Post-merge main passed in [run #40325052513](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40325052513). At the start of this phase, GitHub reported no open PRs.

### Media audit — actual GitHub blob sizes
- Homepage/dining hero `assets/images/rest3.jpg`: 75,390 bytes.
- Rooms hero JPEG fallback `assets/images/rooms/haveli-interior.jpg`: 519,598 bytes; source-provided WebP `assets/images/rooms/haveli-sitting-room.webp`: 307,548 bytes.
- Largest named-room JPEG `assets/images/rooms/sweet-purple.jpg`: 537,837 bytes; WebP alternate: 275,778 bytes.
- Green Room: 114,126 bytes (the previous source JPEG was 799,571 bytes; 85.7% smaller).
- Dining candlelit-table image: 92,506 bytes.
- Fort/rooftop image: 388,404 bytes.
- Directions facade image: 587,056 bytes.
- Largest currently referenced supporting image: `assets/images/courtyard.jpg`, 619,209 bytes.

The legacy `img/optimized/v2/courtyard.webp` was retrieved and visually compared with the current target courtyard JPEG. It is a different photograph (upper-level carved balcony/red-curtain view versus the current interior passage), so it was rejected as a replacement. No image mapping was changed in this phase.

### Implementation scope for this phase
- Add explicit Twitter image and image-alt metadata that match the existing local Open Graph image/alt for all seven core pages. The canonical host remains unapproved; no absolute canonical/OG URL is introduced.
- Add deterministic page-wide image byte budgets, hero fetch-priority checks, and below-fold lazy/async loading checks for all seven pages and responsive source candidates.
- Tighten existing curated-manifest budgets for hero, named-room, WebP, dining and fort/rooftop roles.
- Extend the staging UAT record with explicit responsive-image, keyboard-carousel, reduced-motion and social-preview rows. Every human result remains `NOT RUN` until an operator records exact URL, timestamp, operator, browser/device/viewport and evidence.
- Preserve the existing canonical-host, robots/sitemap, menu-owner-confirmation, draft-publication and source-provenance gates.

### Validation boundaries
- Baseline main quality run #40325052513 passed on the exact main SHA above.
- Local `bash scripts/check-pr-quality.sh` was not run because the connector environment has no complete checkout and shell GitHub DNS resolution is unavailable.
- Browser/device visual QA, accessibility-tool runs, Lighthouse and staging UAT remain NOT RUN. A green automated suite must not be described as proof of live booking/contact reachability or production readiness.
- Exact-head quality evidence for this new phase must be checked after its final commit; earlier/main runs are not a substitute.

### Remaining release blockers
- Human desktop/mobile test of the AsiaTech link (the automated read-only probe returned HTTP 403; normal-browser access remains unknown).
- WhatsApp, primary mobile, alternate landline and email reachability/response.
- Owner confirmation of current room inventory/rates/facilities, tour operation/inclusions and dining menu/prices/hours.
- Approved canonical hostname, DNS/SSL/routing, staging UAT, backup/rollback and deployment approval.
- Content Studio/importer integration remains deferred.


Review finding before merge: adding the follow-up-owner column made the staging UAT header eight columns wide while its Markdown separator still had seven. The separator has been corrected on this PR branch; the exact final-head quality run must be checked after this commit.

## Real-browser guest-journey QA gate — 26 October 2026

### Phase intent
The static checks already covered source provenance, image byte budgets, metadata parity, local link/anchor integrity, carousel logic and launch guards. The remaining automation gap was that most UX assertions were made against source text or a simulated DOM rather than a real browser layout and rendering engine.

### Implementation on `feat/browser-guest-journey-qa-20261026`
- Added `requirements-test.txt` pinning Playwright and `scripts/test-browser-smoke.py`, which serves the repository locally and runs Chromium against the seven core pages.
- Wired the browser smoke suite into `scripts/check-pr-quality.sh` and installed its dependency/browser inside the existing Site quality gates job. The workflow remains one job on the standard `ubuntu-latest` runner; no paid runner or new workflow job is added.
- The browser suite checks unique page titles, main/H1/current-navigation semantics, Open Graph/Twitter image and alt parity, local image decoding, local HTTP errors, responsive overflow at 360/768/1440 CSS pixels, mobile booking-bar bounds, skip-link visibility, Escape/focus restoration, reduced motion, all six carousel next/previous/wraparound states, no autoplay, no-JavaScript fallback, and source-authorized contact-link hydration.
- Third-party links are inspected only; no booking, payment, guest-data submission, WhatsApp send or email send is performed.

### Validation status
- The initial Chromium suite passed on implementation head `95585ac60165381a54f173363c055c066fde9dad` in [run #40329249764](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40329249764). Adding an explicit skip-link activation assertion then exposed a real accessibility defect in [run #40329472342](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40329472342): Enter revealed the main content but DOM focus did not move to it. The root cause was that all seven `<main id="main">` targets lacked `tabindex="-1"`. Added `tabindex="-1"` to each main landmark and made the browser test enforce the contract. The updated head must pass a fresh full quality run before merge.
- Local `bash scripts/check-pr-quality.sh`: NOT RUN in the connector environment because there is no complete local checkout. Do not describe the GitHub browser run as local execution.
- Staging browser/device UAT, formal accessibility tooling, Lighthouse/Core Web Vitals and human contact/booking checks: NOT RUN.
- The 17 operator UAT rows remain `NOT RUN` until real evidence is entered. Canonical-host approval, menu owner confirmation, draft publication and production deployment remain gated.

### Why this is a substantive phase
It adds real Chromium layout/rendering and interaction checks to the existing quality contract, rather than duplicating the already-merged static assertions. It provides early detection for page overflow, failed local assets, navigation state, actual image decode, responsive CTA layout and browser-level gallery behavior across the guest decision journey.

### Existing release blockers unchanged
- Owner/operator must test AsiaTech in a standard browser on desktop and mobile without making a real reservation/payment; the 26 October read-only HTTP 403 is not proof that ordinary guest access fails.
- WhatsApp, primary mobile, alternate landline and email require reachability/response checks.
- Owner confirmation is still required for room inventory/rates/facilities, tour operations/inclusions, current restaurant menu/prices/hours and arrival/transfer details.
- Canonical hostname, DNS/SSL, staging UAT, backup/rollback and production deployment remain unapproved. Content Studio/importer integration stays deferred.


## Operator-run staging preflight and keyboard gallery QA — 26 October 2026

### Live checkpoint at phase start
- Authoritative main: 1fccf9ba1dc312b6148905514bd28555e3668bd9, commit [Add real-browser guest journey QA](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/commit/1fccf9ba1dc312b6148905514bd28555e3668bd9).
- Open PR count: zero before this phase.
- PR #21, [Add real-browser guest journey QA to the quality gate](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/pull/21), is merged at the current main commit. Its exact head 88e7ca35fa09ce4bcc37996ef573cf89a40f7819 passed [Site quality gates run #40329804946](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40329804946).
- Main push run #40330343351 on exact main SHA 1fccf9ba1dc312b6148905514bd28555e3668bd9 had attempt 1 CANCELLED and attempt 2 PASS. The cancelled attempt is not counted as a pass; the successful second attempt completed the existing quality job.
- PR #21's earlier browser run #40329472342 exposed a real skip-link focus defect: activating the link did not move DOM focus to the main content. The root cause was missing tabindex="-1" on the seven main#main targets. The targets were fixed and the final PR head passed.

### Phase outcome and acceptance criteria
- Extend the existing real-browser smoke test with a guarded, read-only HTTPS staging mode that reuses the same seven-page, image, responsive-layout, navigation and carousel checks rather than creating a second browser suite.
- Refuse the configured production hostnames, HTTP, URL credentials, paths/queries/fragments, IP addresses and local hostnames before any browser request. Support optional HTTP Basic Auth from local environment variables, scoped to the staging origin and excluded from the evidence report.
- Check the deployed robots.txt, empty sitemap URL set and central config so staging remains non-indexable and canonical-host approval remains false.
- Detect same-origin HTTP/request failures and any HTTP mixed-content requests from HTTPS staging; block cross-origin top-level/frame navigation, disable redirects on robots/sitemap/config fetches, and strip URL query/fragment values from evidence logs.
- Exercise carousel buttons with keyboard Enter and Space, assert focus remains on the activated control, and verify slide visibility matches aria-hidden.
- Write a local JSON evidence report with exact staging origin, Asia/Kolkata timestamp, operator, Chromium version, planned and actually completed page/viewport evidence, blocked cross-origin navigation attempts, automated result/failures and all 17 manual UAT rows still marked NOT RUN.
- Add deterministic contract tests for unsafe-target refusal and report semantics, then wire them into the existing scripts/check-pr-quality.sh job. No new workflow job, paid runner, production endpoint interaction or Content Studio integration is required.

### Validation boundary for this branch
- The implementation is on feat/operator-staging-preflight-20261026. The exact final PR head and its quality workflow must be recorded after the branch is ready; earlier main/PR runs are not evidence for new changes.
- Local bash scripts/check-pr-quality.sh, browser/device UAT, formal accessibility tools, Lighthouse/Core Web Vitals and actual staging-host checks remain NOT RUN in the connector environment because no complete local checkout is available.
- The staging CLI is not being run against any live host during CI. Contract tests use an example-only hostname and verify target rejection/report semantics without network requests.
- The JSON report's automated PASS can never mark a human STG row complete or clear booking/contact/owner/domain/backup blockers.
- Exact-head run #40338578985 on head bd8fd885a6b3c702f4a27e847ddc63dfb246a7d7 failed in scripts/test-staging-preflight-contract.py:146 because one assertion still expected the removed viewportWidthsCssPixels field after the report schema was tightened to distinguish planned from completed viewports. The underlying site/browser checks before that contract test passed; the suite stopped at the stale assertion. The assertion was removed in commit 0c4ea558bc73a8df468819fa397b6774b93a6e24. The cancelled/pending/stale runs for earlier heads are not evidence for the final head; fresh exact-head runs are required.
- Exact-head run #40338923451 on head 8a2b509ec49fd138fdab00fdbea0f6bb508b4bc1 then failed because the new request-failure listener treated normal Chromium net::ERR_ABORTED cancellations of lazy images during page navigation as genuine resource failures (Rising Sun, Sweet Purple and the fort-temple image). The existing response listener already catches HTTP 4xx/5xx; commit 036573090b6df925e510488507381d5f126ca343 now ignores only ERR_ABORTED while retaining other request failures, with contract coverage in the same PR. The final head still requires a fresh green quality run.

### Existing release blockers unchanged
- Owner/operator must test AsiaTech in a normal desktop and mobile browser without completing a reservation/payment; the read-only automated HTTP 403 is not proof of guest-facing failure.
- WhatsApp, primary phone, alternate landline and email require reachability/response checks.
- Owner confirmation remains required for current room inventory/rates/facilities, tour operations/routes/inclusions, current menu/prices/hours and arrival/transfer details.
- Canonical hostname, DNS/SSL, staging UAT, backup/rollback and production deployment remain unapproved. Content Studio/importer integration stays deferred.


## Staging evidence URL-redaction finding — 26 October 2026

### Finding and root cause
- During review of PR #22 at head `7928163888955ee2297388bfcba700634b9cc7ee`, `safe_url_label()` correctly removed URL credentials, query strings and fragments from request labels, but some browser failure diagnostics interpolated raw `currentSrc` or Playwright exception text. `build_report()` copied failure strings without sanitization. A staging URL containing a token or other query value could therefore have appeared in a local JSON evidence report or CI failure output.
- The exact-head quality workflow on the pre-fix head passed in [run #40340353166](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40340353166), but that result is stale for the remediation commits and is not evidence for the new head.

### Fix on the same PR branch
- Added `sanitize_diagnostic_text()` to reduce any embedded HTTP(S) URL to scheme/host/path, removing credentials, query strings and fragments.
- Applied redaction when building the JSON report and before printing failure output; blocked-navigation evidence is also sanitized.
- Extended `scripts/test-staging-preflight-contract.py` with regression assertions covering credential-bearing URLs, token query values and fragments in both failure diagnostics and blocked-navigation evidence.
- Updated the README's operator guidance to describe the actual redaction boundary.

### Validation boundary
- The contract and source changes are present on `feat/operator-staging-preflight-20261026`; a fresh exact-head `Site quality gates / quality` run is required after these edits.
- Local `bash scripts/check-pr-quality.sh` remains NOT RUN because the connector environment has no complete checkout.
- No staging host was contacted, no external booking/contact endpoint was opened, and no production change was made.

## Staging evidence completeness must fail closed — 26 October 2026

### Finding
- Live main at phase start: `83019e2c84d9ddc5647d4a46350e63c4dc6002ce`; PR #22 was merged and no implementation PR was open.
- Review of `scripts/test-browser-smoke.py` found that `build_report()` derived `automatedResult` only from the supplied failure list. Its contract test passed an empty page list, empty HTTP-200 list and no completed viewport widths while asserting `automatedResult: PASS`.
- This was an evidence-integrity defect: an incomplete staging run could be represented as green if no assertion failure had been accumulated, even though none of the seven routes or responsive viewports had been evidenced. A green report must require recorded coverage, not just an empty error list.

### Fix in `fix/staging-evidence-completeness-20261026`
- Bump the local report schema to version 2 and add explicit `evidenceCoverage` booleans for page navigation, HTTP 200 responses on the target origin, responsive viewport completion and overall completeness.
- Treat any mismatch from the exact seven planned routes, their target-origin HTTP-200 results, or the planned 360/768/1440 CSS-pixel viewport sequence as a report failure.
- Make the console result use the same sanitized failure set as the JSON report so the two outputs cannot disagree about incomplete evidence.
- Extend the staging contract tests to cover empty evidence, partial route/viewport coverage and fully complete evidence. Even complete automated evidence keeps the release status blocked pending human UAT; STG-01 through STG-17 remain `NOT RUN`.

### Validation boundary
- The first exact-head `Site quality gates / quality` run #40356760697 passed on implementation head `1c4e8a1ba5b3140aa7ef0e27f34a63a4c94ed227` (the staging contract tests and Chromium smoke suite both completed successfully). This audit update creates a new head, so that earlier result is now historical evidence only; a fresh run on the resulting exact final head is required before merge.
- Local `bash scripts/check-pr-quality.sh` is NOT RUN because this connector environment has no complete local checkout.
- No staging host, booking provider, contact endpoint or production service was contacted. No deployment, canonical approval or publication-policy change was made.


## Staging visual evidence bundle — 26 October 2026

### Product/QA outcome
The operator-run staging preflight now requires a local visual evidence bundle in addition to route, HTTP and responsive-viewport coverage. The intent is to let an owner/operator compare the real guest journey at mobile, tablet and desktop widths without storing staging artifacts in the source checkout.

### Implementation
- `scripts/test-browser-smoke.py` accepts `--screenshots-dir` only in explicit staging mode. Staging mode requires the report path and screenshot directory to resolve outside the repository checkout; an existing screenshot directory must be empty so prior-run evidence cannot be mixed into a new report.
- The browser suite captures full-page PNGs for each of the seven routes at 360, 768 and 1440 CSS-pixel widths (21 screenshots). Before capture it waits for document fonts, requests eager image loading and image decoding, returns to the top of the page and disables animations for the capture.
- Each screenshot record includes the filename, viewport width/height, actual PNG pixel width/height, byte size, full-page flag and SHA-256. The JSON report stores filenames and measured facts only, not the local output directory path.
- Report schema advances to version 3. Automated PASS requires the complete planned route sequence, target-origin HTTP 200 responses, all three responsive widths and all 21 correctly ordered screenshot records with valid geometry, non-zero byte sizes and SHA-256 values. The overall evidence-coverage flag includes screenshot completeness.
- `scripts/test-staging-preflight-contract.py` covers invalid/unsafe output paths, non-empty screenshot directories, PNG header geometry, empty and partial evidence, missing screenshot evidence and a complete synthetic report. Manual STG-01 through STG-17 remain NOT RUN even for a complete synthetic automated report.
- Updated `README.md` and `docs/LAUNCH-READINESS-CHECKLIST.md` with the required staging command, output-path restrictions, report schema and interpretation.

### Validation boundary
- Baseline at phase start: main `3961b3cdb8a74f07446a38bc34537448e2176d94`; PR #23 was merged and no implementation PR was open.
- `Site quality gates / quality` run #40366969895 passed on exact feature head `454ee7052f445e2a6b0c7c4b2b1dca8f2067daf0`. Its log confirms the staging preflight contract tests and Chromium local-browser suite passed; the suite generated and integrity-checked all 21 temporary full-page PNGs.
- Source review caught an over-escaped PNG signature in the synthetic geometry fixture before the final run; the fixture was corrected to use the actual PNG signature. The earlier run #40366556107 was cancelled after the branch advanced, not treated as a pass.
- Local `bash scripts/check-pr-quality.sh`: NOT RUN in this connector environment because no complete local checkout is available. The full command did run successfully on the standard GitHub-hosted runner.
- Actual staging browser/device review, Lighthouse, formal accessibility tooling and owner-run booking/contact checks: NOT RUN. No staging host was contacted and no external booking/contact action was performed.
- This audit update changes the feature head; a fresh exact-head quality run is required before merge consideration.
- The operator must supply an owner-approved HTTPS staging origin and complete the manual UAT rows with real evidence. Canonical-host approval, menu publication, draft publication and production deployment remain blocked.

### Acceptance criteria
1. Staging mode refuses report or screenshot outputs inside the checkout, and refuses a screenshot directory containing prior artifacts.
2. A full automated PASS is impossible without all seven routes, all target-origin HTTP 200 responses, all 360/768/1440 widths and all 21 screenshot records.
3. Screenshot metadata must match the planned viewport width/height, valid PNG geometry, positive byte count and a 64-character lowercase SHA-256.
4. No output report contains a local screenshot directory path or any manual UAT row marked passed by automation.


## Offline staging visual review index — 26 October 2026

### Baseline and phase selection
- Live main at phase start: 15ac7e716bd113de51ade17ec92a303ebde2c58e, merge commit for PR #24. A live comparison against main returned identical refs; no implementation PR was open.
- PR #24, “Capture complete visual evidence in staging preflight”, is merged. Its exact head b886f225e54c9deb8df7d3c433c5f8a78f6ad711 has a successful Site quality gates run #40367376676: https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40367376676. The quality job's setup, dependency installation and full quality-suite step all completed successfully.
- Combined classic commit statuses for both the PR head and current main returned empty arrays; those are recorded as “none reported”, not as passing statuses. The workflow query used by the connector did not return a post-merge main run for 15ac7e7, so post-merge CI for that SHA is not independently reported by that query.

### Product/QA outcome
The staging runner now captures a reproducible 21-image bundle, but the operator still has to open individual files and compare seven page journeys across mobile, tablet and desktop. This phase adds an offline HTML review index so an owner/operator can inspect the full bundle efficiently without contacting the staging host again.

### Implementation
- Added scripts/render-staging-visual-review.py. It accepts only schema-version 3 staging-read-only JSON reports and screenshot directories outside the checkout, and requires the HTML output to be outside the checkout beside the screenshot directory.
- It verifies the planned route and viewport evidence, manual release rows remaining NOT RUN, all 21 expected filenames in order, image metadata, actual PNG header geometry, byte count and SHA-256.
- It groups Home, Rooms, Experiences, Dining, About, Directions and Gallery into page sections with Mobile 360px, Tablet 768px and Desktop 1440px screenshots. Invalid/missing/tampered files are displayed as unverified placeholders; a report marked automated FAIL remains failed.
- The HTML uses local relative image links, inline CSS only, escaped report fields and URL-redacted failure diagnostics. It embeds no external scripts/fonts/images, no absolute filesystem paths and never follows any link or contacts the staging host.
- Added scripts/test-staging-visual-review.py with valid PNG fixtures and coverage for 21-file ordering, real byte/hash/geometry verification, tampering detection, path traversal/output restrictions, escaped operator text, URL credential/query redaction and persistent manual UAT blocking.
- Wired the renderer contract test into scripts/check-pr-quality.sh. Updated README.md and docs/LAUNCH-READINESS-CHECKLIST.md with operator usage and privacy/release boundaries.

### Acceptance criteria
1. The renderer rejects report schema/mode mismatch and any input/output path inside the checkout.
2. It requires route/HTTP/viewport coverage arrays to match the seven planned pages and 360/768/1440 widths.
3. It verifies all 21 expected screenshots against actual file bytes, SHA-256 and PNG geometry before marking any image verified.
4. User-controlled operator/report/failure text is HTML-escaped; URL credentials, query strings and fragments are not emitted in failure diagnostics.
5. The generated review page uses relative local images only and always states that manual UAT and release remain blocked.
6. The new deterministic contract suite is wired into the existing quality script without changing the GitHub Actions workflow or adding jobs.

### Validation boundary
- Implementation branch: feat/staging-visual-review-index-20261026. The exact final PR head and its Site quality gates result must be checked after the last code/documentation commit; earlier PR #24 CI is baseline evidence only.
- Local bash scripts/check-pr-quality.sh is NOT RUN because the connector execution environment has no complete repository checkout. Do not represent GitHub CI as local execution.
- Actual staging browser/device UAT, screenshot review of a live staging origin, formal accessibility tooling, Lighthouse/Core Web Vitals and owner-run booking/contact checks remain NOT RUN.
- No staging URL was supplied in this run, so no staging host was contacted and no screenshots were represented as real staging evidence.
- Canonical-host approval, menu publication, draft publication, server-side guest-enquiry storage and production deployment remain blocked. Content Studio/importer integration stays deferred.


## 26 October 2026 — Staging evidence report consistency hardening

**Baseline:** main `f2cabb3e89645be787f19e61087711414c58c1ca`, after PR #25's offline visual-review index. The current main quality workflow was observed passing on that exact SHA in run #40372742888.

**Finding:** the offline review renderer verified screenshot bytes, SHA-256 and geometry, but it did not validate all report-level assertions together. A report could carry contradictory `automatedFailureCount` / `automatedFailures` values, a `PASS` label inconsistent with the recorded failures, a release status other than the mandatory manual-UAT block, or missing/true safety assertions. The HTML footer also phrased run-level safety as an unconditional claim instead of distinguishing the renderer's own behavior from the report's assertions.

**Implementation in PR #26:** `scripts/render-staging-visual-review.py` now validates schema/mode, non-empty operator, ISO-8601 Asia/Kolkata timestamp with +05:30 offset, browser metadata, failure-list/count consistency, PASS/FAIL consistency, mandatory `BLOCKED_PENDING_MANUAL_UAT`, explicit false values for external navigation/booking-payment/guest-data/contact-message flags, and the exact 21-image visual evidence contract. Contradictions produce an invalid-report indicator and a non-zero renderer result. The HTML now labels run-level safety assertions explicitly and states only what the renderer itself guarantees.

**Regression coverage:** `scripts/test-staging-visual-review.py` includes valid-report coverage and negative cases for inconsistent counts, contradictory result, premature release status, true or missing safety flags, invalid timestamp, missing browser metadata and incorrect screenshot count. The failed-report fixture now carries a matching failure count.

**Validation evidence for the original implementation revision:** exact-head GitHub quality run #40375220750 passed on `a59bc240ea82227e891e92cd764687c8e5559c84`. The follow-up coverage-summary correction and audit update are validated separately below. Local `bash scripts/check-pr-quality.sh`, real staging UAT, accessibility tooling and Lighthouse were not run in the connector environment.

**Release state:** all 17 manual staging checks remain `NOT RUN`; AsiaTech/contact-channel reachability, current owner facts, menu approval, canonical-host approval and deployment authorization remain unresolved. No production deployment or publication-gate change occurred.


### Follow-up finding — evidence summary could contradict coverage failures

The rerun of the original PR #26 head `a59bc240ea82227e891e92cd764687c8e5559c84` passed GitHub quality run #40375220750. A subsequent full-diff review found one remaining fail-closed gap: the renderer checked route/viewport arrays, but did not require every `evidenceCoverage` boolean to be explicitly true, and the summary could still display automated `PASS` while the bundle had other integrity issues.

The follow-up on this same PR now validates all four coverage flags (`pageNavigationComplete`, `pageHttp200Complete`, `responsiveViewportsComplete`, and `complete`). The top-line result becomes `INVALID REPORT` for report-contract violations and `FAIL — INCOMPLETE EVIDENCE` for any remaining bundle/coverage issue; it cannot be styled as a pass while issues exist. Regression cases cover false/missing coverage flags, incomplete route evidence and missing visual-evidence metadata.

The follow-up code/test revision at `4ca778e6d959ff66b9aebacab41e0c43441345c6` passed exact-head quality run #40384239512: https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40384239512. After recording that result, the current revision at `07cd32e577f38ad9cabd6c2d623c907ba9b7855c` also passed exact-head quality run #40384747021: https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40384747021. This audit update creates a new head and therefore requires its own exact-head check before merge. Local full-suite, actual staging UAT, accessibility tooling and Lighthouse remain NOT RUN.

## 27 October 2026 — 404 recovery and centralized contact safety

### Baseline and finding

- Live main at phase start: `d794175f8cfde6d2b717edb9ce0846dff1a6b90a`; no open PRs were reported.
- The exact-main GitHub-hosted `Site quality gates / quality` run #40385429397 completed successfully on that SHA. The classic commit-status endpoint returned no status contexts; the workflow run and check-run endpoint provide the positive CI evidence.
- Source review found that `404.html` embedded a direct WhatsApp URL instead of using `content/site-config.json` and `assets/site.js`. It was excluded from `scripts/check-site.py`, so its local paths, fragment targets, title, description and heading were not part of the static integrity scan. The page offered only a return-home link and had an inline layout style.

### Implementation in `feat/404-recovery-contact-centralization-20261027`

- Rebuilt `404.html` as a branded, responsive recovery page with clear homepage, rooms, experiences, dining, directions and Gallery routes. Its assets and page links are root-relative because Apache's `ErrorDocument 404 /404.html` can render while the browser address remains a nested missing path.
- Added a concise page description and `noindex,follow`; no canonical or `og:url` was introduced.
- Replaced the hard-coded WhatsApp URL with the existing data attributes consumed by `assets/site.js`: booking, WhatsApp, primary phone, alternate landline and email. If central configuration fails, actions remain disabled and the accessible contact-status message explains the failure.
- Added responsive styling in `assets/site.css`, preserving visible keyboard focus and the existing reduced-motion contract.
- Included `404.html` in `scripts/check-site.py` so local assets, links, in-page/target anchors, title, description and one-H1 structure are validated; the checker now resolves root-relative local paths against the site root and still rejects paths that escape it.
- Extended `scripts/test-launch-readiness.js` to require noindex, route links, all central contact markers, no hard-coded contact URLs, no inline styles, shared JavaScript hydration and responsive styling.
- Updated README page inventory and the launch checklist. Added STG-18 for the actual unknown-route response/recovery flow; it remains `NOT RUN` until an operator tests the deployed host.

### Scope and release boundary

This is a guest-recovery and contact-source-of-truth fix. It does not alter the configured phone numbers, email, WhatsApp base URL, booking-engine URL, canonical host, sitemap/robots policy, menu publication state, draft content or production deployment settings. It does not claim that any live contact channel is reachable or staffed.

### Validation boundary

- Exact-head GitHub quality evidence for this feature branch is pending at the time of this audit entry and must be refreshed after the final code/test/documentation commit.
- Local `bash scripts/check-pr-quality.sh`: `NOT RUN`; the connector execution environment has no complete checkout and GitHub DNS resolution is unavailable.
- Actual staging 404 HTTP status/redirect behavior, browser/device visual QA, formal accessibility tooling, Lighthouse and live booking/contact checks: `NOT RUN`.
- The owner-approved HTTPS staging origin is still missing. STG-01 through STG-18 remain `NOT RUN`; no staging or production host was contacted and no external booking/contact action was performed.


## 27 October 2026 — Browser-level 404 recovery and staging evidence contract

### Live baseline and gap

- Live main at phase start: `3c8bcb314ca41910e7d32d016fc769cd14b4e796`. There were no open PRs. Post-merge GitHub quality run #40424755768 completed successfully on that exact main commit; its `quality` job passed through dependency installation and the full project suite. The classic combined commit-status endpoint returned no status contexts, so the workflow run/job is the positive CI evidence.
- The launch checklist already contained manual STG-18, but the staging JSON report only emitted STG-01 through STG-17. The Chromium smoke runner also checked only the seven core pages and used Python's generic `http.server`, which returned a generic error body for an unknown route. As a result, the automated browser evidence did not exercise the new branded `404.html` on a true HTTP 404 response or prove that root-relative assets and contact configuration work at a nested missing URL.
- The offline screenshot renderer accepted only schema version 3 and required 17 manual gates, so it could not validate/report STG-18 parity.

### Implementation on `feat/staging-404-browser-qa-20261027`

- Added `scripts/test-static-server.py`, a loopback-only static server that models Apache `ErrorDocument 404`: it serves the repository's actual `404.html` body while preserving the HTTP 404 status for unknown paths and refuses non-loopback bind addresses. The server does not contact any external host.
- Extended `scripts/test-browser-smoke.py` to probe a deterministic unknown route at 360, 768 and 1440 CSS pixels in both local smoke and explicitly authorized HTTPS staging mode. It verifies the status remains 404 on the same origin, the branded single-H1 page renders, `noindex,follow` remains set without canonical/`og:url`, root-relative CSS/JavaScript load, all six recovery routes are present, centralized booking/WhatsApp/phone/landline/email links hydrate, the layout does not overflow, and the skip link moves focus to main.
- The browser runner never follows the configured booking or contact links and never submits guest data. The expected test-route 404 is excluded from generic HTTP-error reporting only when both the exact test path and HTTP 404 status match; all other same-origin HTTP errors still fail the run.
- Bumped the staging evidence report contract to schema version 4. `unknownRouteEvidence` stores only the deterministic path, expected/observed status, six root-relative recovery paths and per-viewport pass flags. The overall automated evidence is incomplete unless all three viewport records are valid.
- Updated `scripts/render-staging-visual-review.py` to reject missing/contradictory unknown-route evidence, require all 18 manual release gates in order, and display a per-viewport 404 evidence table in the offline review. A valid screenshot bundle cannot hide a bad 404 response or clear the manual STG-18 gate.
- Updated `scripts/test-staging-preflight-contract.py`, `scripts/test-staging-visual-review.py`, `README.md` and `docs/LAUNCH-READINESS-CHECKLIST.md` for schema v4 and the explicit evidence contract.

### Changed paths

- `scripts/test-static-server.py`
- `scripts/test-browser-smoke.py`
- `scripts/test-staging-preflight-contract.py`
- `scripts/render-staging-visual-review.py`
- `scripts/test-staging-visual-review.py`
- `docs/LAUNCH-READINESS-CHECKLIST.md`
- `README.md`
- `docs/CONTENT-UX-FAILURE-AUDIT.md`

### Validation and release boundary

- Exact-head GitHub CI must run after the final code/test/docs commit; this audit entry is not a pass claim for the feature branch.
- Local `bash scripts/check-pr-quality.sh` remains NOT RUN because this connector session has no complete checkout.
- The staging origin is still not owner-approved/available. No actual staging host was contacted, no screenshot report was generated against staging, and STG-01 through STG-18 remain NOT RUN.
- The AsiaTech booking portal and all contact channels remain unverified in normal guest browsers. The automated 403 observation is not proof that ordinary guests are blocked.
- Canonical-host approval remains false; the sitemap and robots policy are unchanged; no production deployment, unapproved menu publication, draft-content publication or server-side enquiry collection occurred.


## 27 October 2026 — Public image identity and experience-copy consistency

### Live baseline and gap

- Live main at phase start: `07b440f41c4c46e93b24b45515a6ab86fd0af49a`; there were no open PRs. Post-merge workflow run [#40432415064](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40432415064) completed successfully on that exact main commit. The classic combined commit-status endpoint returned no status contexts, so the workflow job result—not an empty status list—is the positive CI evidence.
- The current media manifest and `experiences.html` include the source-reviewed Swiss-tent secondary image `assets/images/experiences/swiss-tent-detail.jpeg` (source blob SHA `5b3a4022356e405df26a115963cb011c5051209c`, 240,485 bytes, 1600×1280). README copy still claimed only five of six experience options had two photos and Swiss-tent remained single-photo. That was stale and contradicted the shipped page/manifest.
- Per-page UX checks already rejected repeated image source paths on a single page, but no gate compared file bytes when separate local paths pointed to identical copies across the public HTML surface.

### Implementation on `feat/public-image-uniqueness-staging-qa-20261027`

- Added `scripts/test-public-image-uniqueness.js`, a dependency-free audit of image `src` and responsive `srcset` references in root HTML and generated `tours/` / `blogs/` HTML. It hashes local referenced files with SHA-256, rejects exact-byte duplicates under distinct paths, and fails closed for missing or repository-escaping local references. Reuse of the same path across pages is allowed.
- Added `scripts/test-public-image-uniqueness-contract.js` with fixture coverage for duplicate bytes, cross-page reuse of a single path, remote URL exclusion, missing files and path traversal.
- Wired both tests into `scripts/check-pr-quality.sh` after the media manifest and page-media budget checks.
- Corrected the stale README experience-photo statement and documented the exact-byte limitation. The check does not claim perceptual duplicate detection; images that look alike but differ by encoding, crop or pixels still need human visual review.
- Added the media identity check and its limitations to the launch-readiness checklist.

### Changed paths

- `scripts/test-public-image-uniqueness.js`
- `scripts/test-public-image-uniqueness-contract.js`
- `scripts/check-pr-quality.sh`
- `README.md`
- `docs/LAUNCH-READINESS-CHECKLIST.md`
- `docs/CONTENT-UX-FAILURE-AUDIT.md`

### Validation and release boundary

- The exact-head GitHub quality workflows must complete after these commits; no pass is claimed for this feature branch until those results are available.
- Local `bash scripts/check-pr-quality.sh` was not run from this chat because a complete local checkout is unavailable.
- No owner-approved staging origin was available. STG-01 through STG-18 remain `NOT RUN`; no staging host, booking provider or contact endpoint was contacted.
- Canonical-host approval remains false. The sitemap and robots policy are unchanged; no production deployment, unapproved menu publication, draft-content publication or server-side enquiry collection occurred.

## 27 October 2026 — Technical SEO publication safeguards

### Live baseline and risk

- Live main at phase start: `22f40dd1f070077057856cab7db9e8b54c28314a`; PR #29 was merged and the open-PR count was zero. Post-merge Site quality gates run [#40437441543](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40437441543) completed successfully on that exact SHA.
- Existing checks protected the seven core pages, but canonical and `og:url` absence was asserted only on those core pages. Generated tour/blog HTML and future public routes could therefore accidentally publish a canonical URL outside the core-page test.
- Sitemap and robots safeguards existed in the launch-readiness test, but the coverage was not a dedicated reusable audit of every public HTML page and its fixture-level failure modes.

### Implementation on `feat/seo-publication-guard-20261027`

- Added `scripts/test-seo-publication-safeguards.js` to scan root, `tours/` and `blogs/` HTML for canonical link tags and Open Graph `og:url` metadata while canonical approval is false.
- The same audit rejects sitemap URL entries, a `Sitemap:` robots directive, and loss of wildcard `Disallow: /` before the production hostname is approved.
- Added `scripts/test-seo-publication-safeguards-contract.js` fixture coverage for the valid pre-launch state, generated-page regressions, accidental publication, sitemap/robots changes and missing or malformed config. The test intentionally refuses an approved-host state so publication activation cannot happen silently in this pre-launch gate.
- Integrated the contract and live-repository checks into `scripts/check-pr-quality.sh`.
- Updated README guidance and refreshed the launch checklist's baseline to main `22f40dd1f070077057856cab7db9e8b54c28314a` with its verified post-merge CI run.

### Changed paths

- `scripts/test-seo-publication-safeguards.js`
- `scripts/test-seo-publication-safeguards-contract.js`
- `scripts/check-pr-quality.sh`
- `README.md`
- `docs/LAUNCH-READINESS-CHECKLIST.md`
- `docs/CONTENT-UX-FAILURE-AUDIT.md`

### Validation and release boundary

- The exact-head GitHub quality suite is the required validation for this feature branch; local `bash scripts/check-pr-quality.sh` was not run because a complete local checkout was unavailable.
- The change does not edit `robots.txt`, `sitemap.xml`, `content/site-config.json`, canonical metadata, menu content, contact endpoints or production deployment settings.
- A green guard proves the repository remains in the intended pre-launch publication state. It does not verify staging DNS/SSL, actual crawler behavior, live contact channels, booking completion or owner approval.


## 27 October 2026 — Static accessibility regression contract

### Live baseline and scope

- Live main at phase start: `dcb6e2dd824b0b629b4983b115c311ac04ea3380`; PR #30 was merged and there were no open PRs. Its post-merge Site quality gates run [#40442760559](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40442760559) completed successfully on that exact SHA.
- Existing checks already covered local links/anchors, image alt presence, core-page metadata, the 404 recovery path, mobile navigation keyboard behavior and the six carousel controls. However, the static integrity check did not enforce accessible names on every interactive element, label/ARIA reference integrity across the full HTML surface, positive tabindex avoidance, or `rel=noopener` for all new-tab links.

### Implementation on `feat/static-accessibility-contract-20261027`

- Added `scripts/test-static-accessibility.py` to audit root HTML plus nested HTML under `tours/` and `blogs/`.
- The audit checks unique IDs; exactly one `main#main` and a named skip link; accessible names for links, buttons, summaries and visible form controls; explicit button types; valid `aria-controls`, `aria-labelledby`, `aria-describedby`, `aria-owns` and label-for references; boolean `aria-expanded`/`aria-hidden`; no positive tabindex; no focusable content under `aria-hidden=true` without hidden/inert protection; image alt attributes and common generic-alt regressions; and `rel=noopener` on `_blank` links.
- Added `scripts/test-static-accessibility-contract.py` fixture tests for valid names and labels plus deliberately invalid names, references, tabindex, duplicate IDs, hidden focusable actions, missing image alt and unsafe new-tab links.
- Integrated both scripts into `scripts/check-pr-quality.sh` before the real Chromium smoke suite, and documented the source-level contract in the README, launch checklist and `docs/STATIC-ACCESSIBILITY-CONTRACT.md`.

### Changed paths

- `scripts/test-static-accessibility.py`
- `scripts/test-static-accessibility-contract.py`
- `scripts/check-pr-quality.sh`
- `README.md`
- `docs/LAUNCH-READINESS-CHECKLIST.md`
- `docs/STATIC-ACCESSIBILITY-CONTRACT.md`
- `docs/CONTENT-UX-FAILURE-AUDIT.md`

### Validation and release boundary

- The exact-head GitHub-hosted full quality suite is required; local `bash scripts/check-pr-quality.sh` was not run because a complete local checkout was unavailable.
- The new check does not alter public HTML, assets, site configuration, canonical/robots/sitemap policy, contact endpoints, menu content or deployment configuration.
- Source checks cannot certify WCAG conformance, test real assistive technology, measure contrast, prove live booking/contact reachability or substitute for STG-01–STG-18. The operator UAT and production approval gates remain unchanged.


## 27 October 2026 — Recursive route and fragment validation

### Baseline and finding

- Live main at phase start: \`2aa27db3a34c883322096c148075cc8c047129fc\`; there were no open PRs. Post-merge quality run [#40448685596](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40448685596) completed successfully on that exact SHA.
- The static checker used \`glob("*.html")\` for each of the root, \`tours/\` and \`blogs/\` directories. It therefore missed deeper nested content routes. Its fragment-only links also skipped local target resolution, so a missing same-page anchor such as \`href="#missing"\` could escape the link-integrity check.

### Implementation on \`feat/deep-static-route-integrity-20261027\`

- Refactored \`scripts/check-site.py\` into testable route-discovery, local-reference and repository-audit functions.
- Recursive discovery now covers every root HTML page and nested HTML under \`tours/\` and \`blogs/\`, while not following symlinked directories/files.
- Local URL resolution now separates path/query/fragment, decodes URL-encoded paths, supports root-relative and page-relative paths, maps directory paths to an existing \`index.html\`, rejects repository escapes and checks fragments on the resolved HTML page, including fragment-only links.
- Added \`scripts/test-site-integrity-contract.py\` fixtures for nested tours/blogs, query-bearing links, root-relative paths, valid same/cross-page anchors, missing files, missing fragments and traversal attempts.
- Wired the contract into \`scripts/check-site.sh\`; the full quality suite already invokes that script through the site-integrity gate.
- Added \`docs/STATIC-ROUTE-INTEGRITY.md\` and updated README/launch documentation.

### Changed paths

- \`scripts/check-site.py\`
- \`scripts/test-site-integrity-contract.py\`
- \`scripts/check-site.sh\`
- \`docs/STATIC-ROUTE-INTEGRITY.md\`
- \`README.md\`
- \`docs/LAUNCH-READINESS-CHECKLIST.md\`
- \`docs/CONTENT-UX-FAILURE-AUDIT.md\`

### Validation and release boundary

- Exact-head PR and push quality runs are required after the final commit; no pass is claimed for this branch before those runs complete.
- Local \`bash scripts/check-pr-quality.sh\` was not run because a complete local checkout is unavailable.
- The change is offline-only and does not modify public content/assets, contact endpoints, menu approval, canonical/robots/sitemap publication settings or deployment configuration.
- STG-01–STG-18, real assistive-technology testing, Lighthouse, normal-browser booking checks and human contact reachability remain unverified.


## 27 October 2026 — Recursive SEO publication and social-preview parity

### Finding

- The route-integrity gate now covers nested generated pages, but the pre-launch SEO publication guard still inspected only root files and one directory level. A future deeper tour/blog page could therefore introduce a canonical link or `og:url` without triggering that guard.
- The deterministic content renderer emitted Open Graph image metadata but omitted the corresponding Twitter image and alt tags. Explicit tour `seo.ogImage` metadata also had no dedicated, enforced image-alt field.

### Implementation

- Made the SEO publication guard recursively inspect root HTML plus nested `tours/` and `blogs/` pages, excluding symlinked routes.
- Added nested tour/blog fixture tests for canonical and `og:url` regressions, plus a symlink non-following test.
- Added optional `seo.ogAlt` fields to tour/blog schemas and made them mandatory by policy whenever `seo.ogImage` is supplied. The renderer independently blocks live records missing that alt text.
- Updated generated tour/blog markup so Twitter image URL and alt text exactly match Open Graph metadata, using the explicit OG alt for `seo.ogImage` or the verified hero alt for a blog hero fallback.
- Extended content contract and renderer tests, and documented the new release safeguard.

### Changed paths

- `scripts/test-seo-publication-safeguards.js`
- `scripts/test-seo-publication-safeguards-contract.js`
- `scripts/build-content-pages.js`
- `scripts/validate-content.js`
- `content/schemas/tour.schema.json`
- `content/schemas/blog.schema.json`
- `scripts/test-content-renderer.js`
- `scripts/test-content-contract.js`
- `README.md`
- `docs/LAUNCH-READINESS-CHECKLIST.md`
- `docs/CONTENT-UX-FAILURE-AUDIT.md`

### Validation and release boundary

- The full GitHub-hosted quality suite on the exact PR head is required before merge; local `bash scripts/check-pr-quality.sh` was not run because a complete checkout is unavailable in this environment.
- No public page copy, property facts, source images, menu, contact endpoints, canonical approval, robots policy, sitemap entries or deployment settings were changed.
- The pre-launch guard intentionally still rejects canonical/OG URL activation. Manual staging social-preview review, STG-01–STG-18, booking-provider browser verification and human contact-channel checks remain NOT RUN.

## 27 October 2026 — broken experience detail links

### Finding

- The push quality run [#40463575073](https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism/actions/runs/40463575073) failed in the static-site integrity gate.
- `experiences.html` linked to `experience-details.html` for six tour options, the Fort heritage walk, car/road arrangements and other route ideas, but the destination page did not exist. The integrity checker correctly reported nine broken local links.

### Fix in progress

- Added the detail page with nine stable anchors, source-backed sequence outlines, source-listed inclusions/exclusions and questions to confirm before travel.
- Kept all enquiries and booking links dependent on the existing `content/site-config.json` runtime hydration; no contact URL or phone number is duplicated in the new HTML.
- Added a regression test that checks every source-page link resolves to exactly one destination anchor, verifies social-preview metadata and local image provenance, and prevents unapproved rates, fixed times or canonical publication.
- The first exact-head PR run also found that the new detail destination had replaced the card's separate enquiry action. All nine cards now retain a distinct, config-driven “Ask about dates” action that starts disabled; the detail route marks Experiences as the current navigation location, and the Chromium contract distinguishes that parent location from a page-level current link.
- Expanded content, media, Chromium smoke and staging visual-review coverage to include the new route. The staging evidence contract now expects eight pages across three viewport widths (24 full-page screenshots).

### Release boundary

- This is an offline implementation. The current operating status of each experience, current prices, guide/vehicle availability and route access still require owner confirmation.
- No production deployment, canonical-host activation, sitemap/robots change or external booking/contact action is part of this fix. HTTPS staging UAT remains a separate release gate.



## 27 October 2026 — centralize the source-authorized exact hotel map pin

- **Finding:** all eight public routes linked to a generic Google Maps text search for “Garh Jaisal Haveli, Jaisalmer”; the Directions hero repeated the same broad search. The authoritative legacy `direction.php` specifies the exact property pin `https://maps.app.goo.gl/nAbRiZhv78FSbju48`.
- **Implementation:** moved the source-provided pin into `content/site-config.json` under `propertyNavigation.hotelMapUrl`, marked `source-authorized`. The eight public page footers and both Directions links now hydrate from that single value via `assets/site.js`; invalid or missing map configuration fails closed. External links open with `noopener noreferrer`.
- **Regression protection:** launch-readiness and enquiry-flow contract tests reject duplicated map URLs in public HTML; the VM test covers valid hydration and an invalid host; Chromium smoke inspects the hydrated Directions/footer links without opening the external destination.
- **Boundary:** the link is source-authorized, not live-tested. Human UAT must confirm that the pin is geographically correct. No booking/contact endpoint, canonical-host approval, sitemap/robots policy or deployment setting changed.


## 27 October 2026 — booking and enquiry handoff copy consistency

### Finding

- The runtime accepts the owner-authorized-source configuration and enables valid source-authorized booking, WhatsApp, phone, landline, email and map links after validation, but several public copy blocks still said that direct enquiries were disabled and instructed new visitors to use a booking confirmation they may not have.
- Error-state copy also referred to contact details as “being verified” and offered another visible contact option even though all links can be disabled when configuration loading fails. This was inconsistent with the actual fail-closed behavior.

### Implementation

- Corrected the booking-status note and room-reservation FAQ on the homepage to distinguish the external booking-provider route from a WhatsApp draft the visitor must review and send.
- Replaced stale “verified contact route” wording with the available on-page WhatsApp/phone path for date-specific questions about arrival, assistance and current operating details. No service or assistance is promised; guests must wait for direct confirmation.
- Updated the shared contact-configuration failure banner across all eight public routes. It now says no enquiry was sent, asks guests to refresh and try again, and points to contact details already supplied directly by the hotel instead of requiring an existing booking confirmation.
- Aligned JavaScript fallback messages and regression tests with the same fail-closed recovery wording. Added content guards to reject the stale disabled-enquiry, existing-booking-confirmation and “verified contact route” claims.

### Changed paths

- `index.html`, `rooms.html`, `experiences.html`, `experience-details.html`
- `dining.html`, `about.html`, `directions.html`, `gallery.html`
- `assets/site.js`
- `scripts/test-content-ux.js`, `scripts/test-enquiry-flow.js`
- `README.md`

### Validation and release boundary

- Run the full GitHub-hosted quality suite on the exact final PR head and again on post-merge `main`; local `bash scripts/check-pr-quality.sh` is not claimed from this environment.
- The work does not change the source-authorized endpoints, the canonical-host approval flag, sitemap/robots publication, menu approval, content facts, deployment configuration or guest-data storage.
- Source authorization is not proof of live channel reachability. The AsiaTech route still requires human desktop/mobile browser verification; contact channels, the exact hotel map pin, current service facts and STG-01–STG-18 remain human UAT gates.

## 27 October 2026 — source-backed room finder and comparison support

### Finding

- The Rooms page presented seven correctly mapped room cards and a source-feature list, but visitors had no in-page way to narrow the list by the documented floor or by a particular bed/view/window-seat preference. Choosing among the cards required scanning every card manually.
- Room selection must not imply that a photographed room is available, that an unlisted feature is absent, or that current occupancy/rates/cancellation terms are known.

### Implementation

- Added a scoped, progressively enhanced room finder above the existing seven-card catalogue. Floor options reflect the owner-maintained registry (three ground-floor entries and four first-floor entries).
- Added source-listed feature filters for king bed, second bed, city view, window seat and carved bed. Multiple selected features are combined with AND semantics and only match features explicitly recorded in the visible catalogue.
- Added a live count/status, a clear-filters action, and an explicit no-match state. Filter controls remain hidden until the seven-card catalogue and all control hooks pass basic initialization checks. With JavaScript disabled, all room cards stay visible and controls do not appear as inert UI.
- Added deterministic coverage that verifies every room's floor and filter metadata match the visible source-list feature chips, then exercises floor filters, combined features, reset/focus recovery and malformed-catalogue fail-closed behavior. Extended the Chromium smoke suite to check the interaction at mobile width, keyboard Tab/Space activation and the JavaScript-disabled fallback.

### Changed paths

- `rooms.html`
- `assets/room-finder.css`, `assets/room-finder.js`
- `scripts/test-room-finder.js`, `scripts/test-content-ux.js`
- `scripts/test-browser-smoke.py`, `scripts/check-pr-quality.sh`
- `README.md`, `docs/LAUNCH-READINESS-CHECKLIST.md`

### Validation and release boundary

- The full GitHub-hosted quality suite must pass on the exact final PR head and the resulting `main` SHA. Local full-suite execution is not claimed from this environment.
- All room facts remain source-catalogue references, not live inventory. Do not add rates, occupancy, cancellation terms or unlisted bed/amenity guarantees. The finder does not change contact endpoints, booking behavior or storage.
- No approved staging origin was found; staging/browser-device UAT, current room fact confirmation, formal accessibility testing, Lighthouse and production deployment remain outside this implementation.

## 27 October 2026 — navigation contrast and screenshot image readiness

### Finding

- The shared About navigation group used cream text and toggle colors on the light header. When the Gallery dropdown was open, the dark menu panel could appear blank or low-contrast in small full-page captures.
- The screenshot capture routine requested each image's decode but swallowed decode failures. This could let visual evidence be saved even when an image was still unavailable to the browser capture.

### Implementation

- Changed the About link and dropdown toggle to use the same dark foreground as the other top-level links on the light header; the dropdown's Gallery item remains light on the dark panel.
- Extended the Chromium keyboard/navigation journey to open and close the desktop dropdown and assert computed foreground colors and item visibility.
- Extended the static UX contract to guard the header color rules.
- Changed screenshot readiness to fail the capture if any document image cannot decode or has zero intrinsic width/height. This reports the failing asset names instead of silently saving an incomplete capture.
- Kept local images and their source mappings unchanged. The user confirmed that photographs render on the live website; screenshot placeholders alone are not classified as a broken asset without browser/network evidence.

### Validation and release boundary

- Exact-head GitHub CI must prove that all eight routes' screenshot capture remains successful with strict image decoding and that the dropdown interaction/contrast assertions pass.
- This is automated rendering-readiness evidence, not human visual approval of image subject, crop, color, or layout. No live staging UAT, Lighthouse/Core Web Vitals or formal accessibility audit is claimed.
- Canonical host, robots/sitemap publication, guest-data handling, booking/contact endpoints and deployment remain unchanged.
