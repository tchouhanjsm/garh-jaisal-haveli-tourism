# Static content workspace

This folder is the data contract between the Content Studio and the tourism website. Content Studio should select the content type/template; code determines the destination from `paths.json`. Editors should never type raw filesystem paths.

## Files

- `paths.json`: single source of truth for allowed content types, output routes, asset folders, image roles/limits and sitemap policy.
- `site-config.json`: public runtime verification state. Unverified booking/contact endpoint fields must remain empty; static page CTAs fail closed until the owner marks the configuration `owner-verified`, sets the relevant status to `verified`, and supplies valid endpoint values.
- `tours/<slug>.json`: tour records with an ordered timeline, explicit inclusions/exclusions, practical notes and fact-verification state. `sunset-camel-safari.json` is the first draft example.
- `blogs/<slug>.json`: editorial articles with a structured table of contents, sections, source links, reviewed date and related links. `jaisalmer-fort-guide.json` is the first draft example.
- `gallery/<category>.json`: curated gallery manifests. Every image requires alt text, source/provenance and approval status.
- `schemas/`: JSON Schema contracts for tour, blog and gallery records.

## Publication lifecycle

`draft -> ready_for_review -> approved_for_release -> live`

Only `live` records may be rendered into public page output, surfaced by directory/hub pages, or included in the sitemap. Drafts, hidden records and `approved_for_release` records must never be linked publicly or listed in `sitemap.xml`. Unknown tour timings, prices, availability, routes and inclusions stay unpublished until confirmed. The deterministic static renderer is `scripts/build-content-pages.js`; use `--write` to generate approved output and `--check` to verify output without changing files.

## Content pack contract

Use `scripts/import-content-pack.js` to check a registry-bound ZIP or extracted folder. A dry run is the default; inspect its exact operations before adding `--apply`. Each manifest file records its registry-approved path, role, byte length, SHA-256 and prior hash (null only for a new destination). New and updated records must stay `draft`; updates require a matching base hash. The importer writes only content JSON and referenced per-record images. It rejects traversal, symlinks, duplicate paths/slugs, stale hashes, invalid schemas, oversized or signature-mismatched images, missing assets and unlisted files. It never writes public HTML or `sitemap.xml`. See [Content Pack Format](../docs/CONTENT-PACK-FORMAT.md).

## Content design expectations

Tour records support an intro, duration label, best-for, ordered timeline, inclusion and exclusion lists, practical notes, FAQs, hero/step/gallery images, related tours/blogs and an owner-approved enquiry CTA. Timelines use reliable sequence language when clock times vary; they never fabricate exact departures.

Blog records support SEO title/description, lede, table of contents, editorial sections, source links, last-reviewed date, related tour links, hero/inline/OG assets and one contextual CTA. Claims without supporting sources should be removed or qualified.

## Current implementation boundary

`scripts/validate-content.js` checks the path registry, schemas, content files, referenced local assets, draft/live publication rules and sitemap inclusion. `scripts/test-content-contract.js` provides focused contract tests. `scripts/check-pr-quality.sh` is intended as a local runner only; GitHub Actions CI has been removed.

The deterministic renderer now creates tour/blog detail pages and hub pages only from eligible `live` records, maintains its own marked sitemap block, escapes record text, filters related links to published records, and refuses to overwrite or delete unowned HTML. It requires owner approval of the canonical host and verified contact/booking endpoints; tours also require `factsConfirmed: true`, a valid `lastVerified` date and at least one dated `factSources` entry; articles require a valid `lastReviewed` date. Run `node scripts/test-content-renderer.js` for publication-gate and output-reconciliation regression tests. The safe registry-bound pack importer is implemented in `scripts/import-content-pack.js`, with regression coverage in `scripts/test-content-pack-import.js`. The current legacy Studio ZIP format uses PHP routes and `img/` paths, so it is intentionally not accepted by this static importer until a dedicated exporter/adapter maps it to the static registry. Local Studio preview routing remains future work. The current tour and blog samples are still draft-only.