# Editorial Media Readiness

## Purpose

Use the media audit to prepare the 12-article Jaisalmer editorial cluster for *human* image review. The audit is deterministic and read-only: it prints reports to stdout, never writes an article, generates a derivative, approves rights, creates a public page, updates the sitemap, or changes publication configuration.

## Commands

Run the human-readable report:

```sh
node scripts/audit-editorial-media-readiness.js
```

Run the machine-readable JSON report:

```sh
node scripts/audit-editorial-media-readiness.js --json
```

The quality runner invokes the audit with `--check`. This checks catalogue integrity and unsafe references but does not fail just because editorial review is still pending. Use `--strict-release` when asking whether all required media can be released; unresolved review or invalid media approval produces a nonzero exit code. The audit uses the repository-pinned Playwright/Chromium dependency for full pixel decoding. Install the test dependency and browser with `python3 -m pip install -r requirements-test.txt` and `python3 -m playwright install chromium` before running the audit locally.

The existing combined editorial report also includes media details:

```sh
node scripts/audit-editorial-readiness.js --json
```

## Review-state contract

The record's `editorialReview.mediaStatus` describes the overall media decision:

- `missing`: no context-supported local candidate is declared for one or more required roles.
- `pending`: at least one candidate exists but the required role assets have not completed review.
- `rejected`: a candidate has an explicit rejection decision; choose a different candidate or provide the missing asset before approval.
- `approved`: the hero and social-preview roles each have an approved asset whose local path and alt text match the rendered record.

Each record's `media.requirements` defines the hero and social-preview subject and baseline dimensions/size limits. `media.candidates` records source files and candidate rationale with separate `fit`, `visualReview`, `reviewStatus`, `rightsStatus` and provenance text. A filename/path alone is never a contextual match: candidates stay at `fit: not-assessed` and `visualReview.status: not_assessed` until a human opens the image, records evidence, reviewer and date, and marks the visual subject `matched` or `mismatch`. A mismatch must be rejected and marked `fit: not-a-match`. `media.approvedAssets` is the release-facing record and must cite a reviewed candidate, an authorized reviewer, a date, descriptive alt text, and rights evidence. A source file's existence, size, filename, header, pixel decode or technical check never means editorial approval. The validator and renderer require a documented visual match, rights evidence, media review, and publication-grade technical checks before an asset can qualify.

If a candidate is selected for publication, make sure the rendered `heroImage` / `heroAlt` or `seo.ogImage` / `seo.ogAlt` exactly matches the respective approved record. The publication validator and renderer enforce those links and the shared image policy. Output files still must be WebP or AVIF under the dimensions/byte budgets in `content/paths.json`; source JPEG/PNG files can be inventoried but are not publishable derivatives.

## Technical checks and limits

The audit rejects unsafe paths, symlinks, missing files, unsupported/corrupt headers, malformed PNG chunks/CRC or deflate streams, zero-byte files, oversized reads, unavailable/invalid dimensions, over-budget dimensions and byte size, invalid candidate references, duplicate article usage and byte-identical files at different paths. It reports contextual candidate reuse across articles separately from content-identical files.

The audit combines format/header inspection with a local Chromium pixel-decode pass for inspectable assets. `scripts/decode-media-assets.py` receives repository-relative paths from the audit, rejects paths outside `assets/images`, loads file bytes into a blank browser page as data URLs, blocks network requests, verifies decoded dimensions against the header dimensions, and writes nothing into the repository. The helper uses the pinned Playwright dependency already installed by CI. If Playwright/Chromium is unavailable, an image cannot pass publication media checks; the report records decoder availability instead of silently treating header inspection as sufficient. PNG integrity also includes chunk CRC and deflate checks. A successful pixel decode proves that the file can be decoded and that dimensions agree—it does not prove visual relevance, correct crop, truthful alt text, licence, owner permission, or factual context. The editor/owner must still inspect the actual image and confirm those items before review.

## Rights, factual accuracy and release gates

Use only provenance/rights evidence that actually exists. Do not set `owner-confirmed` or `licensed`, enter a reviewer/approval date, or populate `media.approvedAssets` just because a file is present. The audit cannot establish authorship, licence scope, model/property releases, temple or cultural-site restrictions, current access, or the accuracy of a depicted place.

All current records remain drafts while editorial, source, factual and owner reviews are incomplete. This pipeline must not activate production canonical tags, change the pre-launch blocking `robots.txt`, populate the public sitemap, submit URLs to Search Console, or deploy the site. The existing canonical-host approval flag remains an independent owner-controlled gate.

## Current inventory outcome

The target repository does not currently contain a ready-to-publish image inside each article's blog-specific asset directory. Candidate paths from shared site assets are unassessed search leads, not contextual matches, until an editor verifies the actual visible subject and records the evidence, reviewer and date. Gadisar Lake, Bada Bagh/Vyas Chhatri, and Kuldhara currently have no suitable context-supported local candidate and need a suitable, sourced image before media approval.
