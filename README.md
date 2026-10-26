# Garh Jaisal Haveli — Tourism Website

A mobile-first, conversion-focused website for Garh Jaisal Haveli in Jaisalmer, Rajasthan. Built with semantic HTML, custom CSS, and vanilla JavaScript so it can be hosted on GoDaddy/cPanel without a framework, build step, paid dependency, or database.

## Pages

- `index.html` — homepage and guest decision journey, with direct Book Now, room and experience paths, FAQs and primary CTA
- `rooms.html` — room discovery and direct availability enquiry
- `experiences.html` — Thar Desert safari/camping and guided city tour service pages
- `dining.html` — rooftop restaurant and candlelit dinner enquiry pages
- `about.html` — family/heritage story and hospitality philosophy
- `directions.html` — arrival planning, accessibility notes, luggage coordination and FAQs

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
2. Keep the pre-launch `robots.txt` blocking crawlers on staging; change it to `Allow: /` only on the approved production launch.
3. Run `./scripts/localize-images.sh` so photos are served from the new site, not hotlinked from the old repository.
4. Check mobile layouts and links on a real phone; test WhatsApp on both Android and iOS.
5. Upload the HTML files plus the `assets/` directory to a **staging subdomain** first.
6. Update canonical URLs, Open Graph URLs, and `sitemap.xml` to the final domain after the new site is approved.
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
- `scripts/test-media-manifest.js` and `scripts/test-launch-readiness.js` — media integrity and automated release-safeguard checks included in the quality runner.
- `docs/TESTIMONIAL-COLLECTION.md` — how to add authentic guest proof without inventing quotes


## Tours, articles, galleries and Content Studio

The first architecture and marketing plan is in [Tour and Blog Content Strategy](docs/TOUR-BLOG-CONTENT-STRATEGY.md); the migration and Studio integration contract is in [Content Migration and Studio Plan](docs/CONTENT-MIGRATION-AND-STUDIO-PLAN.md).

- `content/paths.json` is the planned single source of truth for allowed content types, output routes, image folders, SEO rules and sitemap behavior.
- `content/site-config.json` centralizes the external booking-engine URL, WhatsApp, primary phone, alternate landline, email and restaurant source links. They were migrated from the designated legacy repository under the owner's explicit instruction and are marked `owner-authorized-source` / `source-authorized`; they have not been independently smoke-tested. The JavaScript validates endpoint formats and fails closed if configuration cannot load. Canonical-host approval remains separate and false.
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
- Run `bash scripts/check-pr-quality.sh` before opening/merging a PR. The media test checks file bytes, source blob SHA, dimensions, role budgets and page-specific references/alt text. Passing automation does not replace staging visual inspection.


### Guest-journey editorial and experience photography
- Five of the six source-listed experience options have two locally hosted photographs with manual next/previous controls. Swiss-tent remains single-photo until a second distinct source image is reviewed. Galleries do not autoplay; captions are visual context, not guaranteed itinerary stops.
- Dining uses a real rooftop table image and a distinct fort view. About and Directions are differentiated around the fort panorama and practical final-walk information, avoiding generic filler and duplicated hero images.
- Run `node scripts/test-experience-carousel.js` for previous/next/wraparound behavior, live slide status and incomplete-markup fallback. The full quality runner invokes this test and the expanded static UX gates.
- Current menu approval, booking-provider browser verification, live contact-channel reachability, canonical-host approval and staging UAT remain manual release gates.
