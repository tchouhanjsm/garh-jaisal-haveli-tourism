# Static content workspace

This folder is the data contract between the Content Studio and the tourism website. Content Studio should select the content type/template; code determines the output and asset destinations using `paths.json`. Staff should not type raw filesystem paths.

## Files

- `paths.json`: single source of truth for approved paths, output routes, image roles/limits, sitemap policy and template identifiers.
- `site-config.json`: public contact and booking endpoint values found in the legacy repository. They are explicitly marked unverified until the owner tests them.
- `tours/<slug>.json`: future tour records. Store timeline steps as an ordered array, and store included/excluded items separately.
- `blogs/<slug>.json`: future editorial articles with headings/sections and source links.
- `gallery/<category>.json`: future curated gallery manifest. Each image needs a caption/alt description, source/provenance, and approval state.

## Publication lifecycle

`draft -> ready_for_review -> approved_for_release -> live`

Only `live` records may be rendered into public page output, surfaced by directory/hub pages, or included in the sitemap. Unknown tour timings, prices, availability, routes and inclusions must remain unpublished until confirmed. The publishing/import process must never change an existing route implicitly.

## Content pack contract

A pack should contain only the exact registered files plus a manifest with relative paths, sizes and SHA-256 hashes. The manifest is validated before any write. Packs must reject absolute paths, `..`, symlinks, duplicate slugs, unsupported image formats, oversized images, missing alt text and generated sitemap files. Previewing a pack should be read-only; applying it should default to dry-run.

## Content design expectations

Tour records should support: intro, duration label, best-for, ordered timeline, inclusion and exclusion lists, practical notes, FAQs, hero/step/gallery images, related tours/blogs, and an owner-approved enquiry CTA. Timelines should use reliable sequence language such as afternoon, sunset, evening and next morning when clock times vary; never fabricate exact departures.

Blog records should support: SEO title/description, introduction, table of contents, editorial sections, source links, last-reviewed date, related tour links, hero/inline/OG assets, and one contextual enquiry CTA.

This registry is a contract only. A static renderer, JSON Schema validator, Studio adapter, sitemap generator and tests still need to be implemented before records here can be published automatically.
