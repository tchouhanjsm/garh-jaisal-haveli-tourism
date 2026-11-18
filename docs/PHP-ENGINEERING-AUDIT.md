# Engineering audit — PHP transition, UX, SEO, security and readiness

**Date:** 2026-11-18  
**Scope:** `feat/premium-php-enquiries` branch of `tchouhanjsm/garh-jaisal-haveli-tourism`. No changes to `main`.  
**Important:** Static-code evidence is not equivalent to a live, visually verified production deployment.

## Confirmed and addressed

| Severity | Finding | Action | Verification |
|---|---|---|---|
| High | Existing full browser CI failed before testing because Playwright 1.55 did not support Chromium installation on GitHub's Ubuntu 26.04 runner. | Pin runner to Ubuntu 24.04. | Runner change committed; full browser suite must finish successfully before acceptance. |
| Critical | Initial PHP wrapper stripped `data-booking-link` and `data-enquiry-link`, silently disabling the source-authorized external booking and WhatsApp integrations. | Preserve both attributes and dynamic URL validation in `assets/site.js`; keep new PHP form as an *additional* enquiry option. | PHP integration CI asserts booking/enquiry hooks and PHP route output. Real browser click tests still required. |
| High | PHP enquiry depended on an unset mail recipient while still offering an apparently usable submit action. | Clearly disclose missing configuration, disable submit until `HOTEL_ENQUIRY_EMAIL` is provided, document setup. | PHP route smoke test; real mail delivery remains untested. |
| Medium | Generated mail From address was derived from untrusted HTTP Host. | Use a validated `HOTEL_SENDER_EMAIL`, falling back to configured recipient. | Source review; mail transport still untested. |
| Medium | CSRF token input could be posted as an array, causing a PHP warning. | Require string type before `hash_equals`. | PHP syntax/HTTP smoke tests only; targeted hostile-input test recommended. |
| Medium | Form date min used server timezone rather than property timezone. | Apply Asia/Kolkata consistently to date display and server validation. | Source inspection. |
| Medium | Standalone booking navigation could overflow narrow screens. | Separate booking navigation layout, wrap at mobile widths, use 44px+ touch targets and 16px mobile fields; refine form gaps and padding. | CSS implementation only; screenshots and manual viewport checks still needed. |
| Medium | Legacy HTML bookmarks needed compatibility after PHP transition. | Map HTML routes to PHP routes with temporary redirects; preserve assets and JSON contact configuration. | PHP integration route checks; Apache redirect behavior requires cPanel verification. |

## SEO source audit — core pages

The original HTML sources for `index`, `about`, `rooms`, `gallery`, `dining`, `directions`, `experiences`, and `experience-details` each have:
- A unique page title and unique meta description.
- Exactly one `<h1>`.
- Existing descriptive image alt attributes across the rendered image tags inspected.

**Launch blocker:** The repository's `robots.txt` intentionally contains `Disallow: /`. The `sitemap.xml` contains no site URLs, and the inspected eight pages have no canonical link tag. These are *deliberate staging protections*, not permission to publish. The owner must approve the canonical host before changing them; then generate correct production canonical tags, populated sitemap, robots rules, redirect mappings and crawl checks. Do not publish both the www and bare domain as duplicated indexable hosts.

**Other SEO gaps:** Validate structured data on rendered PHP pages, review content quality and search intent, verify generated blog/tour route indexing rules, test internal link graph and old-to-new redirects, and submit the approved sitemap in Search Console.

## UX and visual layout

The existing styles include a responsive design system, purpose-specific room/catalogue styles and progressive media loading. The transition preserves these rather than replacing them with a generic theme.

**New code reviewed:** booking form column proportions, mobile stacking, button tap targets, input font size, header wrapping and accessibility focus styling. **Not yet proven:** no horizontal overflow at 320/360/375/390/768/1024/1280/1440px; readable text overlays against real images; open mobile navigation; scroll/hero clipping; button collisions; all room/gallery overlays; keyboard-only use; reduced-motion behavior and zoom to 200%. Confirm with screenshot and interaction evidence before calling the visual layer complete.

## Security / bookings

- Enquiry is not a confirmed reservation. Source-authorized external booking stays connected via original JS configuration.
- Form uses session CSRF, escaping, server-side validation, a honeypot and simple per-session throttling. This does **not** replace rate limiting by IP/WAF or an abuse-resistant mail provider.
- No credentials should be committed; configure and test the receiving/sending mail accounts at the host. `mail()` reporting success only proves server handoff, not inbox delivery.
- Test session behavior behind HTTPS proxy, malicious fields, oversized POST payloads, invalid dates, CSRF reuse and repeat submissions on production-like hosting.
- Apache rules, directory access controls and host/canonical redirect behavior must be validated on the actual cPanel server.

## Performance

The repository includes optimized WebP assets and substantial legacy imagery. Source-level optimizations are not Core Web Vitals measurements. Test deployed pages on real mobile connections and measure LCP, INP and CLS with Lighthouse/PageSpeed and field data. Confirm that hero image priority, lazy loading, responsive sources and unused legacy assets behave correctly.

## Acceptance gates still outstanding

1. Full browser/visual/content quality suite completes on the supported runner without regressions.
2. Real cPanel test deployment, including the verified domain and Apache rewrite behavior.
3. Successful end-to-end delivery of an enquiry email to a monitored inbox, or replacement with configured SMTP.
4. Clickthrough verification of real booking and WhatsApp destinations and their failure states.
5. Desktop/tablet/mobile screenshots plus keyboard/screen-reader sanity checks.
6. Owner signs off canonical domain and public SEO publication; robots/sitemap/redirects updated only after approval.
7. Post-deployment Search Console, Lighthouse and security checks.

**Status:** Engineering improvements delivered in an isolated draft PR. NOT approved for production merge or launch until acceptance gates pass.
