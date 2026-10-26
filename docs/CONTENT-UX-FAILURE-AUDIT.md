# Content and UX Failure Audit

**Baseline reviewed for this recovery phase:** main at 79367785c7463913f1452ac8c9550860393076d9 (26 October 2026; PR #13 and PR #14 merged; post-merge Site quality gates run #40291781455 passed on that exact main SHA). This cumulative audit now tracks authentic media curation and Gallery discovery; older entries remain historical.
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


## Authentic media curation and Gallery discovery — 2026-10-26

### Findings

- The Gallery had ten cards in one undifferentiated grid. Six images were also used on the homepage, and no manifest recorded source/target paths, visual subject, page role, dimensions, byte size, alt text or provenance.
- assets/images/legacy/room-purple.jpg was byte-identical to assets/images/rooms/rising-sun.jpg; assets/images/legacy/room-carved.jpg was byte-identical to assets/images/rooms/opium.jpg. The Gallery now uses canonical room paths and redundant copies are removed.
- Homepage image reuse is intentional where a photograph serves a distinct page context. The manifest records actual page/role use rather than treating all reuse as a defect.
- The fort-from-roof WebP was visually reviewed and localized after stripping its EXIF RIFF chunk and clearing its metadata flag. Its encoded VP8 payload and 2000×1333 dimensions are preserved; final size is 388,130 bytes. The owner-provided CampingInJsm.jpeg tent-interior image was copied byte-for-byte at 1600×1280 and 307,643 bytes; no EXIF/XMP segments were found.
- camp_from_above.jpeg and camp_evening.jpeg were reviewed but not migrated because their dark overhead/night scenes provide less legible guest context than the selected images.

### Implemented

- Reorganized gallery.html into four collections: Haveli & fort, Rooms, Rooftop & dining, and Desert & overnight. Twelve curated cards have descriptive captions and contextual links to About, Directions, Rooms, Dining or Experiences.
- Added keyboard-visible category navigation, responsive 3/2/1-column layouts, reduced-motion handling, intrinsic image dimensions, lazy loading and asynchronous decoding.
- Added docs/MEDIA-CURATION-MANIFEST.json with source/target paths and blob SHAs, visually reviewed subject, intended roles, dimensions, byte size/budget, alt text, provenance, actual page reuse, Open Graph reuse and approval/status notes.
- Extended scripts/test-content-ux.js to check manifest-to-file blob SHA, dimensions and byte budgets, transfer consistency, valid local paths, alt/caption context, subject/category mapping, cross-page reuse, Open Graph metadata, duplicate binary hashes and retired duplicate aliases. Existing canonical, enquiry and draft-publication gates remain in force.
- Contact/booking endpoints, canonical-host approval, robots/sitemap policy, room availability, menus, prices, hours and tour operation status were not changed.

### Source/release boundary

- The owner-designated legacy repository is the source reference. No separate per-file license metadata was found in the reviewed image-optimization notes; provenance is recorded, and any rights uncertainty remains an owner release check.
- The tent-interior image does not prove the exact tent or its facilities are currently available. The rooftop panorama is a setting reference, not a promise of a specific view/table.
- A separate unmerged branch, feat/direct-booking-and-source-backed-content at 051d4507d1cffb7179f1169882a84397645b0e0d, is not part of this phase. Push quality run #40296907581 failed JavaScript syntax validation because the WhatsApp-path regular expression is over-escaped. That branch also fills contact/booking values from legacy configuration and relaxes owner-verification status. Legacy presence is not current owner approval or proof of staffing; keep endpoints inactive and do not promote that branch without separate verification.

### Validation evidence and limitations

- Source-level checks performed: source image bytes fetched and visually reviewed; source/target blob SHAs compared; dimensions and byte counts parsed from actual binaries; WebP chunks/flags checked after transformation; JPEG EXIF/XMP markers checked on the selected tent image.
- The repository quality suite must be checked on the exact final PR head; no CI pass is claimed here before that run completes.
- Local bash scripts/check-pr-quality.sh and bash scripts/check-site.sh: NOT RUN. No complete checkout is available and the connector runtime cannot resolve GitHub DNS. Browser/device review, automated accessibility tooling, Lighthouse and staging UAT were also NOT RUN.

### Next phase

After this batch is reviewed and merged, reassess remaining content/internal-discovery gaps. Prepare a Journal article only after source/date review and publication gates are satisfied; keep the Fort article and all unapproved editorial records in draft. Content Studio/pack integration remains deferred.
