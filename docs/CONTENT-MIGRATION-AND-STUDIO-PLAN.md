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
- Preserve the booking-engine URL and WhatsApp/phone/email values in one configuration manifest only after owner verification. Test both desktop and mobile behavior, URL-encode the enquiry payload and never claim a booking is confirmed when the gateway or hotel still needs to confirm.
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
- A successful PR check run on the final SHA plus full local site checks; no unreported check treated as green.

**Gate 4 — marketing launch**
- Curated image gallery and service links.
- Approved tour and article content, verified booking/contact endpoints and current property details.
- Sitemap/canonical/robots updated after hosting and domain approval.
- Staging/phone UAT, backups/rollback, owner launch approval.

## Recommended immediate engineering scope

While an older PR is open, do not open another PR. Extend the current PR branch only with a cohesive, low-risk architecture/content contract; no runtime rewrite or bulk media copy. The first content feature PR after the current PR is resolved should establish `content/paths.json`, JSON schemas and a deterministic content index, then add one tour page and one article as an end-to-end proof. Do not attempt to migrate all 11 tour records and 12 blog records in one unreviewable change.
