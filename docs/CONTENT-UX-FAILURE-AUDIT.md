# Content and UX Failure Audit

**Checkpoint:** main at `e7dc8bd9d664e9ad6985b8e32333a200a669471e` (26 October 2026).  
**Scope:** public static HTML/CSS/vanilla-JS routes. Content Studio pack import and adapter work are explicitly out of scope for this recovery phase.

## Evidence from the pre-change pages

The initial content pass measured main-region text (navigation and footer excluded) at approximately:

| Route | Main-region words | Observed issue |
|---|---:|---|
| `index.html` | 898 | Useful overview, but the same rooftop and sandstone images repeat in multiple sections; a generic Google search was presented as a current guest-review link. |
| `rooms.html` | 244 | Too little decision support; the same Scarlet photograph repeated and generic rooftop/corridor images were used as room cards. |
| `experiences.html` | 359 | The open-sky photograph was repeated and a bedroom image was used for a general trip-planning card; owner-confirmed facts were not easy to discover. |
| `dining.html` | 359 | The rooftop image appeared three times and a corridor image was used to illustrate a candlelit dinner. |
| `about.html` | 386 | The corridor photograph repeated; the public page stated a 2005 hospitality start date even though the legacy launch checklist says the family story/date still requires approval. |
| `directions.html` | 503 | The corridor photograph repeated; copy implied luggage assistance, transfers and a fixed one-day advance-notice rule despite those operational details not being approved. |

The six root pages used the same rooftop photograph for Open Graph metadata and contained canonical/OG URL values pointing at `https://hotelgarhjaisal.com`, while `content/site-config.json` explicitly says `canonicalHostApproved: false`. The pre-launch `robots.txt` blocked indexing but still advertised a sitemap containing six absolute URLs on that unapproved host.

These observations came from the checked-in HTML/configuration and legacy `docs/OWNER-FACTS.md` / `docs/LAUNCH-CHECKLIST.md`; they are source-level findings, not browser or analytics measurements.

## Addressed in this recovery batch

- Added `gallery.html`, linked from the primary navigation and footer, with four existing target-repository photographs that were fetched as actual image bytes and visually reviewed:
  - `rest3.jpg` — rooftop terrace over Jaisalmer at dusk (900×600).
  - `courtyard.jpg` — sandstone passage/interior details (2200×1467).
  - `scarlet.jpg` — red-toned bedroom and carved wooden bed (900×600).
  - `tent.jpg` — open-sky sleeping scene beneath stars (750×750); captions/alt text do not mislabel it as a tent.
- Added explicit width/height attributes, below-the-fold lazy loading and decoding hints to retained photographs. Removed repeated or contextually misleading images rather than reusing a photo as proof of a room, meal or package.
- Expanded Rooms with a factual checklist of details to confirm rather than asserting unverified room amenities, availability or rates.
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
7. More legacy photographs may be added only after the actual binaries can be transferred into the target repository and visually reviewed. This batch uses only the four existing local assets; no image was hotlinked or guessed from a filename.
8. The Journal/blog archive remains deferred until at least one article passes source review, fact/date checks, local-link validation and the publication/canonical gates.

## Validation evidence for this checkpoint

- Source-level inspection: completed through connected GitHub file reads; the four existing local image files were retrieved and visually inspected.
- Local full-suite commands: **not run**. The execution environment cannot resolve GitHub (`git ls-remote https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism.git refs/heads/main` failed with `Could not resolve host: github.com`).
- GitHub Actions for this feature head: **not reported yet** because the branch has not been opened as a PR at the time this audit was drafted.
- Browser/device, Lighthouse, visual regression and production/staging tests: **not run**.
- No deployment or production changes were made.

## Next bulk phases

1. Complete the content/UX recovery review and exact-head quality checks for this PR.
2. After owner approval of the canonical host and content facts, prepare a source-reviewed Journal article plus a discoverable archive, with publication gates and internal links.
3. Only after the website recovery is accepted, reconsider a legacy Content Studio adapter as a separate roadmap decision.
