# SEO Publication Runbook — Garh Jaisal Haveli

**Current release status (28 October 2026): BLOCKED_PENDING_OWNER_APPROVAL.** PR #53 is merged. The candidate origin is `https://hotelgarhjaisal.com`; `content/site-config.json` must continue to use `canonicalHostApproved: false` until the owner explicitly authorizes a separate canonical-host release decision.

## What this implementation does

- `scripts/prepare-seo-publication.js --check` is read-only and must report an expected block while approval is false.
- `scripts/prepare-seo-publication.js --apply` refuses to write while approval is false. After approval, it validates the HTTPS origin, route inventory, title/description, social image alt text, local image targets and sitemap marker pair before writing anything.
- The approved artifact set contains one canonical link and `og:url` per core page, absolute canonical-host social image URLs, an indexable `robots.txt`, and all eight core routes in `sitemap.xml`. It preserves the content renderer's generated-content marker block.
- `scripts/test-seo-publication-preparation.js` covers the blocked state, approved fixture generation, exact route coverage, idempotence and fail-before-write validation.
- `.htaccess` maps non-canonical-host robots/sitemap requests to the staging-safe artifacts and sends `X-Robots-Tag: noindex, nofollow` for non-canonical hosts.

The script is a local artifact preparation tool only. It does not deploy, modify DNS, acquire SSL/TLS, confirm host routing, submit Search Console, validate real HTTP response headers or verify live booking/contact actions.

## Release procedure

1. Obtain explicit owner authorization for the exact canonical origin. Do not treat PR merge, repository presence, prior domain use or source authorization as canonical approval.
2. In a separately authorized release change, set `site.canonicalHostApproved` to `true` in `content/site-config.json`. Keep `canonicalPublicationMode` equal to `candidate-configured-owner-release-required`.
3. Run `node scripts/prepare-seo-publication.js --apply` from the site root. Review the complete diff: only the eight core HTML routes, `robots.txt` and `sitemap.xml` should be altered by this publisher.
4. Run `node scripts/prepare-seo-publication.js --check`, `node scripts/build-content-pages.js --check` and the full quality suite via `bash scripts/check-pr-quality.sh`. Check that the sitemap has exactly the intended core routes plus only separately approved generated content, and never includes `404.html`.
5. Review the actual host configuration. Confirm DNS records, HTTPS certificate and renewal, canonical/non-canonical host behavior, redirect chains, response headers, query-string preservation, missing-route behavior and asset delivery against an owner-approved URL. These are live checks and cannot be inferred from repository tests.
6. Complete STG-01–STG-18 manually, verify the guest room/enquiry/dining/arrival journeys and all approved factual content, then record release ownership and evidence.
7. Only after the manual release gates pass should the owner approve production deployment and Search Console submission.

## Current policies

- `robots.txt`: `Disallow: /`; it must remain blocked until canonical approval.
- `sitemap.xml`: no public `loc` entries; the generated-content markers remain for deterministic rendering.
- `robots-staging.txt`: blocks every crawler.
- `sitemap-empty.xml`: a valid empty sitemap for staging/preview host rewrites.
- `404.html`: remains `noindex,follow` and is not a sitemap route.
- No production canonical tags, `og:url` publication, crawl enabling, DNS change, redirect rule, deploy, live contact claim or Search Console submission is authorized by this runbook alone.

## Rollback

If an approved publication is prepared incorrectly, revert the publisher's exact HTML/robots/sitemap artifact diff and restore `canonicalHostApproved: false`. Verify that `robots.txt` returns to `Disallow: /` and `sitemap.xml` contains no `loc` entries. A rollback in Git does not roll back a deployment; confirm the hosted files separately.


## Editorial review is a separate release gate

Before approving a blog record for release, run `node scripts/audit-editorial-readiness.js --json` and inspect each article's blockers. The report distinguishes a structurally complete packet ready for a human editor from a release-eligible article. An article's primary query or official-source URLs alone do not constitute verified facts or owner approval.

The `editorialReview` fields must reflect completed work rather than intended work. `editorialStatus`, `sourceStatus`, `factStatus` and `mediaStatus` must all be `approved`; `ownerFactApproved` must be `true`; a real review date and named reviewer must be present. Both `heroImage`/`heroAlt` and `seo.ogImage`/`seo.ogAlt` must point to existing, reviewed assets. Do not fill those fields using assumptions or placeholder evidence.

The site-wide canonical, robots and sitemap gates remain separate. `--strict-release` should stay blocked until content review, owner approval and site release gates are actually clear. No audit command publishes content or mutates the crawl policy.
