# Staging Responsive and Technical SEO Preflight

This is an operator guide for the static tourism site. It is QA documentation, not a production sitemap or deployment authorization.

## Responsive audit matrix

The browser preflight must exercise all eight core routes at the following CSS-pixel widths:

| Width | Device class | Required checks |
|---:|---|---|
| 320 | Narrow mobile | No horizontal overflow; booking bar remains within viewport |
| 360 | Mobile | No horizontal overflow; mobile navigation and booking actions remain usable |
| 390 | Wide mobile | No horizontal overflow; headings and calls to action remain readable |
| 768 | Tablet | No horizontal overflow; navigation and content sections remain usable |
| 1280 | Laptop | Desktop navigation is visible; mobile menu toggle is hidden |
| 1440 | Desktop | Desktop navigation is visible; page content does not overflow |

The branded unknown-route page must also preserve HTTP 404, show all six recovery routes, hydrate contact/booking actions from the central configuration and fit every width in the matrix.

The retained screenshot package is deliberately smaller: 24 full-page PNGs, covering the eight routes at 360, 768 and 1440 CSS pixels. Each report entry must retain the filename, true image geometry, byte count and SHA-256. A browser pass establishes automated behavior only; it does not count as operator visual sign-off.

## Technical SEO publication guard

Until the owner approves the canonical public hostname, staging must remain closed to indexing and public URL publication:

- robots.txt must include User-agent: * and Disallow: /.
- robots.txt must not advertise a sitemap.
- sitemap.xml must not contain absolute public location URLs.
- content/site-config.json must keep site.canonicalHostApproved set to false.
- Public pages must not emit canonical links or og:url while approval is false.
- Page title and description coverage, plus Open Graph/Twitter image and alt parity, must remain green in automated quality checks.

Do not switch the robots policy, publish canonical or sitemap URLs, deploy to production or store guest enquiries as part of this preflight. These are separate owner-approved release decisions.

## Operator evidence

For each human UAT entry, record the exact owner-approved staging origin, Asia/Kolkata date/time, operator, browser/device and viewport, result (PASS, FAIL, BLOCKED or NOT RUN), evidence reference, issue/follow-up and responsible owner. Keep report JSON, PNGs and generated review HTML outside the repository checkout. Do not write Basic Auth passwords, booking tokens, guest personal information or payment details into evidence.

All human staging checks remain NOT RUN until an operator actually performs and records them. Automated checks must never set manual UAT results, canonical-host approval or deployment status.
