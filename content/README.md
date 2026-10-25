# Static content workspace

This folder is the data contract between the Content Studio and the tourism website. Content Studio should select the content type/template; code determines the destination from `paths.json`. Editors should never type raw filesystem paths.

## Files

- `paths.json`: single source of truth for allowed content types, output routes, asset folders, image roles/limits and sitemap policy.
- `site-config.json`: public booking/contact endpoints recovered from the legacy repository. Values are marked unverified until the owner tests them.
- `tours/<slug>.json`: tour records with an ordered timeline, explicit inclusions/exclusions, practical notes and fact-verification state. `sunset-camel-safari.json` is the first draft example.
- `blogs/<slug>.json`: editorial articles with a structured table of contents, sections, source links, reviewed date and related links. `jaisalmer-fort-guide.json` is the first draft example.
- `gallery/<category>.json`: curated gallery manifests. Every image requires alt text, source/provenance and approval status.
- `schemas/`: JSON Schema contracts for tour, blog and gallery records.

## Publication lifecycle

`draft -> ready_for_review -> approved_for_release -> live`

Only `live` records may be rendered into public page output, surfaced by directory/hub pages, or included in the sitemap. Drafts must never be linked publicly or listed in `sitemap.xml`. Unknown tour timings, prices, availability, routes and inclusions stay unpublished until confirmed. A full static renderer and sitemap generator are not implemented yet.

## Content pack contract

A pack should contain only the exact registered files plus a manifest with relative paths, sizes and SHA-256 hashes. The manifest must be validated before any write. Reject absolute paths, `..`, symlinks, duplicate slugs, unsupported image formats, oversized images, missing alt text and generated sitemap files. Previewing a pack should be read-only; applying it should default to dry-run.

## Content design expectations

Tour records support an intro, duration label, best-for, ordered timeline, inclusion and exclusion lists, practical notes, FAQs, hero/step/gallery images, related tours/blogs and an owner-approved enquiry CTA. Timelines use reliable sequence language when clock times vary; they never fabricate exact departures.

Blog records support SEO title/description, lede, table of contents, editorial sections, source links, last-reviewed date, related tour links, hero/inline/OG assets and one contextual CTA. Claims without supporting sources should be removed or qualified.

## Current implementation boundary

`scripts/validate-content.js` checks the path registry, schemas, content files, referenced local assets, draft/live publication rules and sitemap inclusion. `scripts/test-content-contract.js` provides focused contract tests. `scripts/check-pr-quality.sh` is intended as a local runner only; GitHub Actions CI has been removed.

These files are a foundation, not yet a publishing pipeline: Studio export/import, deterministic static HTML rendering, preview routing, directory/archive listing, and sitemap regeneration still need to be completed and tested. The current tour and blog samples are draft-only.