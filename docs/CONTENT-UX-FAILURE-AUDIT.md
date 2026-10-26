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
