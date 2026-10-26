# Tourism Content Architecture and Studio Integration Plan

Status: proposed foundation for the static tourism website. Source material reviewed on 25 October 2026:
- Legacy repository: https://github.com/tchouhanjsm/garh-jaisal-website (public, PHP site; current default-branch commit dba7d73e36aa640b3a05ece535dd50618d981440).
- New tourism repository: https://github.com/tchouhanjsm/garh-jaisal-haveli-tourism (static HTML/CSS/vanilla JS; main at review time 9f90f5fd7e830abcd5717636d4c60368ae1427de).
- Legacy Studio runbook: https://github.com/tchouhanjsm/garh-jaisal-website/blob/main/docs/CONTENT-STUDIO.md
- Legacy Studio design: https://github.com/tchouhanjsm/garh-jaisal-website/blob/main/docs/CONTENT-STUDIO-DESIGN.md
- Legacy path registry: https://github.com/tchouhanjsm/garh-jaisal-website/blob/main/content/_paths.json
- Legacy tour content: https://github.com/tchouhanjsm/garh-jaisal-website/blob/main/include/experience-data.php
- Legacy editorial content: https://github.com/tchouhanjsm/garh-jaisal-website/blob/main/include/editorial-guides-data.php
- Legacy booking/contact config: https://github.com/tchouhanjsm/garh-jaisal-website/blob/main/include/site-config.php

This plan distinguishes verified source inventory from future implementation. No legacy PHP runtime, content, media or booking link is copied into this website by this document.

**Priority update — 26 October 2026:** Content, UX and SEO recovery takes precedence over Content Studio integration. First complete and validate the core visitor pages, page-to-page discovery, authentic image provenance/role mapping, useful editorial drafts and content-quality gates. Keep tour and blog records in draft until the relevant facts and publication prerequisites are approved. Studio/importer enhancements remain deferred and must not delay this recovery work or relax canonical-host, contact/booking, indexing or publication safeguards.

## Objective

Make it possible for a non-technical hotel operator using Content Studio to prepare a complete, polished tour or article once, preview it, approve it, and have it render predictably in the static tourism website. Content should be immersive and useful without inventing operational claims. A tour should communicate sequence and experience through a readable timeline, clear inclusions/exclusions, practical trip facts, photo narrative, FAQs and direct-enquiry CTA. Articles should answer travel-planning questions and link naturally to relevant tours and enquiry paths.

The existing static site remains the public rendering layer. Content Studio remains an authoring tool, not a second public runtime. Avoid porting the legacy PHP renderer or its filesystem assumptions wholesale.

## Verified inventory in the legacy repository

### Tour and experience records

The source `include/experience-data.php` holds 11 records across desert and city categories. These include:
- Hub records: `desert-safari`, `guided-jaisalmer-tour`.
- Published records in source data: `sunset-camel-safari`, `sleep-under-the-stars`, `swiss-tent-safari`, `cultural-safari`, `half-day-jaisalmer-tour`, `full-day-jaisalmer-tour`.
- A hidden entry: `explore-the-desert`.
- Draft entries requiring owner confirmation: `longewala-tour`, `rajasthan-tours`.

Some tour records contain detailed ordered itinerary steps and explicit inclusions/exclusions. Treat this as **legacy source material**, not automatically approved current offers. The source itself warns that desert timings vary by season, sunset and operator arrangements. Owner verification is required for availability, prices, exact schedule, route, transport, guide, entry fees, inclusions and exclusions before public release.

### Editorial inventory

The source `include/editorial-guides-data.php` contains 12 guides:
- Best time to visit Jaisalmer
- How to reach Jaisalmer
- Desert safari packing list
- Jaisalmer Fort guide
- Desert safari guide
- 2-day itinerary
- 3-day itinerary
- Honeymoon guide
- Havelis guide
- Food guide
- Beyond-the-Fort guide
- Markets and crafts guide

The editorial source explicitly keeps operator-specific prices, schedules, inclusions and availability out of editorial data, and provides source-linked sections and SEO metadata. Reuse the subjects and source links, then migrate article text only after checking factual currency, attribution and link targets.

### Gallery and media inventory

The legacy gallery groups media into Hotel, Rooms, Desert and Restaurant. The repo has a large mixed media library (the recursive tree contains more than 150 image files), including nested folders for desert camp, sleeping-under-the-stars, optimized imagery and V2 media. Do not bulk-copy the entire media library into the new site. Create an explicit, curated media manifest with source path, destination path, role, alt text, rights/provenance and approval status; include only assets selected for pages.

### Booking and contact configuration

The legacy `include/site-config.php` contains:
- Site URL: `https://www.hotelgarhjaisal.com`
- Booking-engine URL: `https://asiatech.in/booking_engine/index3?token=NjA2Ng==`
- WhatsApp URL: `https://wa.me/917727047567`
- Primary phone: `+91 77270 47567`
- Alternate phone: `+91 2992 253836`
- Email: `info@hotelgarhjaisal.com`

These values are evidence of what is stored in the legacy repository, not proof that the gateway is still valid or that these are the correct final production contacts. Before enabling a live link, the owner should test the booking engine and verify the contact channels. Keep all external endpoints in a single static config/manifest rather than duplicating links across pages.

## Proposed static-site folder layout

Use this as the canonical authoring/build contract. Prefer the existing project's `assets/` convention for public static files. Do not introduce a top-level `css/` or `img/` duplicate directory unless migration proves it is required.

```text
/
  index.html
  rooms.html
  experiences.html
  dining.html
  about.html
  directions.html
  experiences/
    index.html                  # directory/hub only if routing plan supports it
  blogs/
    index.html                  # blog archive
    best-time-to-visit-jaisalmer.html
    ...                         # one file per published article
  tours/
    index.html                  # tours hub
    sunset-camel-safari.html
    ...                         # one file per published tour
  gallery/
    index.html
  assets/
    site.css                    # shared tokens, typography, layout, components
    site.js                     # navigation and shared behavior only
    css/
      pages/                    # page-specific CSS, loaded only where needed
      components/               # reusable component styles, if separation is justified
    js/
      tours.js                  # only if tour UI needs behavior beyond shared JS
      blogs.js                  # only if article UI needs behavior beyond shared JS
    images/
      brand/
      home/
      rooms/
      tours/
        <tour-slug>/
          <slug>-hero-01.webp
          <slug>-step-01.webp
          <slug>-gallery-01.webp
          <slug>-og-01.webp
      blogs/
        <article-slug>/
          <slug>-hero-01.webp
          <slug>-inline-01.webp
          <slug>-og-01.webp
      gallery/
        hotel/
        rooms/
        desert/
        restaurant/
  content/
    site-config.json            # owner-verified public routes and contact endpoints
    content-manifest.json       # generated page index and stable ids
    tours/
      <tour-slug>.json
    blogs/
      <article-slug>.json
    gallery/
      gallery.json               # category/image manifest
    schemas/
      tour.schema.json
      blog.schema.json
      gallery.schema.json
  docs/
    ...
  scripts/
    check-site.sh                # existing check entry point
    validate-content.js          # schema and path checks (future)
    build-content.js             # deterministic renderer/build step (future)
    sync-studio-pack.js           # checked pack importer (future)
```

Keep existing six root HTML routes and their URLs working. Do not physically move current top-level pages just to make the folder layout look uniform. The `blogs/`, `tours/`, and `gallery/` directories above are the target for new page families once the URL migration/canonical strategy is approved. In the first migration, root-level page routes may be retained with source records under `content/` and images under `assets/images/`. The Studio should choose the destination from a registry; an operator should never need to type file paths.

### Path registry (single source of truth)

A future static `content/paths.json` should specify, per content type:
- Record directory and schema version
- Render template id and output route pattern
- Asset root and filename roles
- Public URL/canonical strategy
- sitemap policy
- hub/related-content listing destinations
- draft/live/hidden visibility behavior
- whether owner verification is required

The registry should generate both the Studio selection options and the content importer’s allowed path list. Reject paths outside the registry, traversal, case collisions and duplicate slugs. Do not maintain parallel hand-coded path maps in Studio UI, exporter, validator and renderer.

### Asset contract

For newly authored photos:
- Normalize slug and filenames to lowercase kebab-case.
- Use roles `hero`, `step`, `gallery`, `detail`, `og`; use a consistent 2-digit sequence.
- Prefer WebP; allow AVIF only when the current browser/build/hosting contract includes a verified fallback.
- Hero target cap: 1600px wide / 200 KiB. Supporting images: 1200px / 80 KiB. These are targets, not proof of current image quality.
- Require meaningful alt text and identify asset source/permission.
- Strip EXIF metadata, including GPS. Refuse fake extensions, corrupted images, oversized files and duplicate destination names.
- Keep existing source files untouched by default. Any replacement is a deliberate, reviewable operation.

## Tour page experience: required content model

A good tour page must be scannable first and immersive when the guest continues reading. Use a story-led visual hierarchy:
1. Cinematic hero image, specific H1, short benefit-led introduction, duration category and one primary “Enquire about this tour” CTA.
2. At-a-glance bar: approximate duration type, return/overnight, transport where confirmed, guide where confirmed, and schedule note. Do not infer unverified data.
3. Editorial itinerary/timeline with numbered steps, image or visual per meaningful step, and sequence-based timing (e.g. “afternoon”, “sunset”, “evening”, “next morning”) where exact clock times vary.
4. “What’s included” and “Not included” as separate explicit lists, rendered only from verified source records.
5. “Is this right for me?” / best-for copy.
6. Practical information, accessibility/terrain, pickup/meeting point, seasonal timing, what to bring and limitations only when source-backed.
7. FAQs answering the real booking doubts.
8. Related experiences and suitable editorial guides.
9. Closing CTA carrying a prefilled enquiry message with tour slug, date, party size and questions for the operator.
10. Structured metadata: canonical, page title/description, Open Graph image, breadcrumbs, and validated JSON-LD where appropriate.

No fabricated clock schedule, prices, seat counts, availability, ratings, customer quotations, route promises, included transport/food/fees or exact duration. If a value is unknown, display “Please confirm for your date” in Studio and do not render the placeholder as a public promise.

## Blog strategy and page experience

Use the existing guide themes as a starting queue. A first useful cluster:
1. Jaisalmer Fort guide — explain living-fort context and arrival expectations.
2. How to reach Jaisalmer — transport and the final walk into the fort.
3. 2-day and 3-day Jaisalmer itineraries — realistic day sequencing, alternative plans and clear interlinks.
4. Desert safari comparison — same-evening camel experience vs cultural evening vs open-sky overnight vs Swiss-tent overnight.
5. Best time to visit — season-dependent comfort and the need to verify weather.
6. Desert packing list — practical traveller questions.
7. Markets/crafts, food, havelis and beyond-the-fort guides.

Every post should have an audience/question, search intent, unique title and description, opening answer, structured sections, image/alt manifest, source links, last-verified date, related pages, one contextual CTA and factual review. Avoid mass-producing thin near-duplicate posts. Articles should assist the reader first; cross-link to tours only where genuinely useful. Publish only after source and internal-link review.

## Content Studio integration model

The legacy Studio already has a Quick Add workflow, photo handling, score card, preview, facts gate, registry, pack export/check/apply, and PR handoff. Adapt the workflow concepts, not its PHP-specific paths:
1. Author enters title, optional page name, brief/notes and photos.
2. Studio maps the content type to an allowed template and destination.
3. It creates a Draft JSON record and puts photos into its approved per-slug asset folder.
4. It renders a local preview using the same renderer and CSS used by the public site.
5. A quality panel reports missing facts, title/description range, heading structure, sources, alt text, image limits, link checks and approximate completeness.
6. Human author/approver verifies factual claims and package details. Author should not approve their own work.
7. Studio exports a deterministic pack with manifest, hashes and exact repository-relative paths; pack validator dry-runs before applying.
8. Pack importer writes only allowlisted content and assets on a feature branch, adds/updates the content manifest and hub listing if approved, then opens a PR. It must never merge or deploy.
9. The normal repository quality gate checks content schema, image existence/limits, duplicate slugs, internal links, sitemap eligibility, draft visibility and page rendering.
10. Owner reviews the diff, merges, and separately approves deployment.

Known legacy Studio limitation: the old runbook states that optional `images` metadata is validated but not yet rendered by the templates. The new static renderer must explicitly test the image/timeline sections rather than assuming the legacy Studio already wires every field through.

## URL and booking integration

- First verify whether the existing public static website’s domain and URLs are approved for the new site. Legacy pages used .php paths; new pages are .html files. Do not silently change canonical URLs or assume .php redirects exist.
- The current static tourism site centrally stores the booking-engine URL and WhatsApp/phone/email details copied from the designated legacy repository at the owner's explicit request. These are marked `source-authorized`, not independently live-tested. Validate the booking engine, telephone reachability, WhatsApp delivery and email contact on staging before production launch. Test desktop/mobile behavior, URL-encode enquiry payloads and never claim a booking is confirmed merely because a link opened or a message was prepared.
- Keep dates/party size in enquiry messages where helpful, with no guest data sent to an analytics platform unnecessarily.
- Do not copy the legacy site's secret/local config or server-side credentials. Public contact configuration only; no cPanel credentials, API tokens, or reCAPTCHA secret.

## SEO and discovery

- Keep canonical, OG, sitemap and robots policy aligned with actual hosting state.
- New drafts must not be linked from hubs, included in sitemap, or indexed.
- Only approved published tour/blog pages enter the generated manifest and sitemap.
- Test every internal link and exact asset path. Validate metadata and structured data after rendering.
- Avoid shipping `sitemap.xml` inside a content pack; regenerate it from the reviewed published manifest.
- Maintain breadcrumbs and related-content links without orphaning new pages.

## Rollout / acceptance gates

**Gate 1 — content/architecture foundation**
- Static-site folder and path registry documented.
- Inventory of legacy content categorized as published/hidden/draft; facts marked as needs-verification where appropriate.
- Existing six root HTML routes remain unchanged.
- No content pages moved or public URLs changed in this design-only phase.

**Gate 2 — first tour/blog vertical slice**
- One confirmed tour and one researched blog created end-to-end.
- All content lives in registry-approved record and image paths.
- Studio preview visually matches generated output at mobile and desktop widths.
- Tour has timeline, image sequence, explicit inclusion/exclusion lists and CTA.
- Blog has source links, table of contents where useful, related-content links and CTA.
- Unknown operational facts stay out of live output.
- Tests cover good record, missing facts, duplicate slug, bad image, broken link, draft public access, sitemap inclusion, and mobile overflow.

**Gate 3 — Content Studio pack import**
- Studio pack produces paths for the static repo, not legacy `.php` wrapper paths.
- Applying the pack in dry-run mode yields exactly the manifest file set; hashes and file paths verify.
- No existing page/assets change unless explicitly listed as approved.
- Human approval required before publishing content.
- The full local suite and the GitHub `Site quality gates / quality` check must pass for the exact final head. Any check that cannot run is marked not run, never passed.

**Gate 4 — marketing launch**
- Curated image gallery and service links.
- Approved tour and article content, verified booking/contact endpoints and current property details.
- Sitemap/canonical/robots updated after hosting and domain approval.
- Staging/phone UAT, backups/rollback, owner launch approval.

## Renderer implementation and current delivery checkpoint

The deterministic renderer is implemented in `scripts/build-content-pages.js`. It generates tour/blog detail pages, hub pages and sitemap URLs only from schema-valid `live` records that pass owner-approval gates. It uses the existing shared site CSS/JavaScript, escapes record content, filters related links to published records, preserves existing root routes, and reconciles only files carrying its generated marker. `scripts/test-content-renderer.js` covers draft exclusion, fact/canonical/contact gates, read-only check mode, deterministic output, sitemap reconciliation, escaping and safe cleanup.

The current Sunset Camel Safari and Jaisalmer Fort guide records remain drafts. The canonical host is not owner-approved and booking/contact endpoints remain unverified, so the renderer must not create public detail pages or add these routes to the sitemap yet.

The registry-bound pack importer is now `scripts/import-content-pack.js`. It accepts a ZIP or extracted pack directory with `pack.json`, verifies SHA-256/byte counts, validates tour/blog/gallery schemas and asset paths, requires existing hashes for updates, and applies transactionally only after a clean dry run. Imported records must be drafts; it never writes generated HTML or the sitemap. Use `node scripts/test-content-pack-import.js` for regression coverage.

The legacy Content Studio still exports PHP wrappers and `img/` paths; its adapter and preview panel are deferred. The current delivery priority is website content and UX recovery: fuller factual page contexts, distinct locally hosted imagery, accessible internal discovery, unique SEO metadata, internal-link/orphan checks, and publication-safe canonical/sitemap behavior. Do not import packs, integrate Studio, or publish current drafts in this phase. The canonical host, booking/contact endpoints, room facts, menu/hours, tour inclusions and additional imagery permissions remain owner-verification gates.

Do not copy all 11 legacy experience records, all 12 article records, or the entire image library in one unreviewable bulk import. Migrate remaining content in coherent batches after this website content/UX recovery phase is reviewed and the owner approves the publication prerequisites. Only then reconsider the Studio adapter/preview as a separate roadmap decision.


## Current implementation checkpoint — named room catalogue (2026-10-26)

The current phase restores the seven source-recorded room names in Rooms, uses mapped photographs as locally hosted assets, presents source-listed features with explicit live-inventory caveats, and adds regression coverage for the name/image/feature mapping. Contact, canonical-host, robots/sitemap and draft-publication gates remain unchanged.

The next imagery phase was delivered in PR #12 and merged on main as 2d31b80fbc4f9ee6f6abb0c50ddbd9db0c84a939. The subsequent phase is a source-backed Jaisalmer Fort guide draft; keep it unpublished while official sources, owner facts and canonical/contact prerequisites are reviewed. The legacy Studio adapter and pack integration remain deferred.


## Current implementation checkpoint — six experience options comparison (2026-10-26)

Main baseline: PR #10 is confirmed merged as 2c501f868e51f0baa1eb34d35ab90e0f39d274d8.

The Experiences phase presents six legacy-source concepts with distinct, locally hosted desert/heritage imagery and card-level prompts to confirm duration, timing, transport, access, inclusions and exclusions. The legacy records' historical status values of "live" are not treated as current operating approval. The cultural programme, open-sky stay, Swiss-tent option and both guided-tour formats remain enquiry-only until the hotel confirms what is currently offered. The heritage image is explicitly not a promised stop.

Contact/booking endpoints, canonical-host approval, robots/sitemap policy and draft publication gates remain unchanged. No Content Studio pack adapter work is included.

Validation checkpoint: source imagery was fetched as binary bytes and visually reviewed before inclusion; the changed regression suite covers six distinct option cards, local image mappings, accessible text, confirmation prompts and inactive enquiry actions. Local full-suite commands remain not run because the environment has no checkout and shell DNS/network access to GitHub fails. Exact-head GitHub quality status must be verified on the final PR commit before merge consideration.

Dining/Directions image recovery was completed in PR #12 (merged as 2d31b80fbc4f9ee6f6abb0c50ddbd9db0c84a939). The next batch is a substantive source-backed Fort guide draft with regression coverage; do not add a public Journal archive, generated article route, sitemap URL or production change until source/date review and owner publication prerequisites are satisfied. Studio/pack integration remains deferred.

## Source-backed Jaisalmer Fort guide draft — 2026-10-26

The existing content/blogs/jaisalmer-fort-guide.json record has been rewritten as a more useful, nine-section editorial draft. It covers the living fort, its precise UNESCO property context, the final walk, respectful exploration, Jain temples, inside-fort accommodation expectations, desert-option comparison and a practical confirmation checklist.

Source reference set: Rajasthan Tourism's Jaisalmer overview; UNESCO World Heritage Centre's Hill Forts of Rajasthan entry; the official Jain Temples of Jaisalmer page; and the legacy owner-facts notes for property-specific access caveats.

The article avoids unverified walking distances, temple hours/fees, guide access, room/dining prices and assistance promises. Stale related-blog references have been cleared. The article remains status=draft with lastReviewed and publishedAt null. The existing renderer test prevents drafts from generating public HTML or changing the sitemap; new content-contract assertions protect article depth, sources and draft-only state.

Next after this editorial draft: audit and improve the homepage's first-impression and guest decision journey in one substantial batch. Public Journal/index creation remains gated by editorial/date review, owner confirmation and canonical/contact/indexing approval. Studio/pack integration remains deferred.

## Bulk contact and source-content delivery — 26 October 2026

The current feature branch centralizes source-authorized external booking/contact channels and applies them throughout the shared navigation/footer/mobile booking affordance, alongside source-backed room/tour/restaurant/transport context. The legacy menu remains `owner_confirmed=false`, and research-only Longewala/Rajasthan-tour entries remain unpublished. Three visually inspected source images were migrated with a machine-checkable media manifest. This work does not approve the canonical host, enable new server-side form capture, publish draft content, or represent live service/endpoint confirmation.

Content/UX/SEO recovery remains the delivery priority. Content Studio/importer integration stays deferred until the main guest journeys, media provenance checks and release safeguards are stable.


## Named-room Gallery and explicit launch gates — 26 October 2026

The static site's room gallery has been expanded into seven named source-backed room cards. Each card links to the matching room section and carries a page-specific alt-text/image-geometry assertion. The existing named room images were not recopied; source/target Git blob hashes and byte counts were checked for exact matches in the legacy and target repositories. The media manifest now covers 12 selected assets: three previously migrated fort/desert images, seven existing named-room images, and two rooftop/dining assets.

The media test computes the local Git blob SHA from each target file, checks the exact source match, dimensions, file size budget, image-to-subject role and the page-specific alt text. The existing Green Room image is 799,571 bytes and remains a candidate for a smaller visually reviewed WebP derivative; don't replace it with an uninspected or incorrectly mapped image.

docs/LAUNCH-READINESS-CHECKLIST.md is now the explicit source of launch gates. A read-only automated request to the AsiaTech booking URL returned HTTP 403 on 26 October 2026. Treat that as a manual verification blocker, not proof that standard browsers are blocked. Verify it with the provider/owner in a regular browser, then test WhatsApp, primary mobile, alternate landline and email. Approve current room and tour operation facts, restaurant menu/prices, reception and arrival details before relying on them in public copy. The canonical hostname remains unapproved and no production release has occurred.

The new launch-readiness script validates link wiring, contact centralization, menu/canonical/sitemap safeguards and records the human checks as outstanding. Studio/pack integration stays deferred. Production release is not permitted until the manual P0 gates in the launch checklist are signed off.


## Premium presentation and image-weight reduction — 26 October 2026

The homepage now has one primary Book Now action and quieter room/arrival links. Repeated generic fort language and the unattributed quote panel were replaced with specific details about the seven named rooms, rooftop dining, the final walk inside the fort, and date-specific confirmation of tour/menu facts. Homepage planning links now precede the final conversion CTA.

The 799,571-byte Green Room image was replaced with a visually inspected source-repository image of the same named room at 114,126 bytes (85.7% smaller). Source-provided Sweet Purple WebP (275,778 bytes) and haveli sitting-room WebP (307,548 bytes) are now paired with existing JPEG fallbacks. These are authentic source photographs; no AI-generated property imagery was introduced.

The media manifest and regression gates now check per-role size budgets, exact source/target Git blob hashes, actual bytes/dimensions, WebP/JPEG page references, Green Room alt text/geometry and homepage CTA/section hierarchy. Manual launch gates are unchanged: standard-browser booking checks, owner/contact-channel verification, canonical hostname approval and staging UAT remain required. Content Studio/importer integration stays deferred.


## Guest-journey editorial phase — 26 October 2026

Experiences presents six source-listed options. Five have two locally hosted, source-backed photographs with accessible manual previous/next controls; Swiss-tent remains single-photo until a second distinct source image is reviewed. Images do not autoplay. Captions make clear that photos are visual references, not guarantees of the pictured location or itinerary stops.

Dining now places the actual rooftop-table photograph alongside specific menu/service-hour confirmation guidance, with a separate view across the fort for context. About uses the fort-side rooftop photograph and has practical links before the final conversion CTA. Directions leads with the final walking approach, a map link and a three-point arrival summary. Copy across these pages avoids guarantees for date-specific services.

The new carousel logic is isolated in assets/experience-carousel.js, has no timer/autoplay, updates the live slide counter and aria-hidden state, and is covered by scripts/test-experience-carousel.js. The quality runner also requires distinct local images per tour, accessible controls, local asset paths and accurate content/media pairing. The fort rooftop manifest record now validates its same image/alt on Gallery, About and Dining.

No menus/prices, rates, live inventory or transfer/tour availability were invented. The launch blocker for the standard-browser AsiaTech booking test and human contact-channel checks is unchanged.


## Current delivery checkpoint — 26 October 2026, 18:15 IST

This checkpoint supersedes earlier "next batch" notes above where they conflict with the current live repository state.

- Authoritative main at phase start: `476dd625fce29cdc524da33214c4f260885d4e18`.
- PR #19 "Complete tour photo galleries and guest-journey safeguards" is merged as `476dd625fce29cdc524da33214c4f260885d4e18`; exact-head PR quality run #40324814286 and post-merge main run #40325052513 both passed.
- The next bulk phase is staging preflight, technical SEO and visual QA: enforce explicit social image/alt parity, page-wide role-based image budgets, hero priority/lazy loading and evidence-bearing staging checks.
- Current media audit shows `assets/images/courtyard.jpg` is the largest referenced image at 619,209 bytes. The source repository's `img/optimized/v2/courtyard.webp` was visually reviewed and is a different photograph, so it must not replace the current image. Any derivative must be created from the exact intended source image and visually compared before remapping.
- The canonical host remains unapproved; current menu/prices remain unpublished; draft tour/article records remain non-public; booking/contact channels are source-authorized but not live-tested.
- Local full-suite execution, browser/device QA, accessibility tooling, Lighthouse and staging UAT remain not run in the connector environment. Do not mark manual release gates passed based on CI.
- Content Studio/importer integration remains deferred until website guest-journey, media provenance and release readiness are accepted.
