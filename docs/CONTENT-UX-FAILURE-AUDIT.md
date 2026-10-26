# Content and UX Failure Audit

**Baseline:** `main` at `bc7e4c5d3bc5a87c88c06eb95dedcddfc027de8b` (26 October 2026; PR #8 merged). This audit now tracks the next room-reference UX phase.  
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

1. Complete the image-led room-reference phase and its regression checks; do not merge until the exact-head quality gate is green and the full local suite can be executed against the reviewed source.
2. Obtain owner approval for the canonical host, staffed contact/booking endpoints and current room facts before publishing operational claims.
3. After publication prerequisites are approved, prepare one source-reviewed Journal article plus a useful archive with source links, date checks, internal links and strict draft/sitemap gates.
4. Reconsider the legacy Content Studio adapter only after website content/UX recovery is accepted. Studio/pack integration is not part of the current phase.


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
