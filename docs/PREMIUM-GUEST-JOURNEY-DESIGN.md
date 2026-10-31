# Premium Guest Journey — Design and Acceptance Brief

**Scope:** Source-level design system and cross-page guest navigation for Garh Jaisal Haveli. This is an implementation/QA brief, not a claim of live-site visual approval.

## Design direction

The site should feel like a considered heritage-hospitality brand: quiet, architectural, photo-led and clear about practical decisions. The visual system combines warm ivory surfaces, deep fort-green/charcoal, a restrained sandstone/brass accent, editorial serif headlines and clean sans-serif body copy. Borders and shadow are used to establish hierarchy rather than surround every paragraph. Hover movement is limited and reduced-motion preferences are respected.

## Guest journey

The shared route rail presents four decisions in a fixed order:

1. **Stay** — compare the seven named room catalogue entries and ask for current room/rate details.
2. **Explore** — compare existing experience outlines and confirm what operates for the guest's dates.
3. **Dine** — check the rooftop dining information and ask the restaurant to confirm current menu, service hours and table availability.
4. **Arrive** — read the final-walk and meeting-point guidance before travel.

The rail appears immediately after the hero on the seven inner core routes. The home page already has a four-path planning panel after the hero; it retains that primary layout to avoid duplicating the same navigation. Current-page state is only applied when the step link actually targets the current route.

## Component architecture

- `assets/css/premium-guest-journey.css`: shared tokens, route-hero refinements, card/form treatments, rail, responsive breakpoints, focus affordances and reduced-motion override.
- `scripts/test-premium-guest-journey.js`: protects stylesheet ordering, four-step route contract, active-page semantics, mobile grid behavior and the design-system safety hooks.
- `scripts/check-pr-quality.sh`: executes the new contract as part of the main quality suite.
- `README.md`: route/design overview and test boundaries.

Route-specific stylesheets continue to load before the shared premium layer. Existing interactions, booking/contact authorization, room data, experience descriptions and menu guardrails remain in place.

## Content and release guardrails

- No rates, live availability, room amenities, service hours, reviews, menu items or package inclusions are invented by this work.
- The new links are ordinary same-site HTML navigation and do not store or send guest data.
- Canonical host approval remains a separate release decision; this PR does not change the canonical, robots, sitemap or deployment gate.
- No staging hostname is assumed and no live HTTP/DNS/TLS or contact verification is claimed.

## Automated Chromium contract

The CI browser smoke now checks the actual rendered journey and home planning panel at every configured responsive audit breakpoint: 320, 360, 390, 768, 1280 and 1440 CSS pixels. It verifies the four destinations in order, exact-current-route semantics, visible tap targets of at least 44 by 44 CSS pixels, viewport bounds, rail-internal overflow and the homepage's non-duplicated planning panel. A keyboard path also verifies that Tab advances from Stay to Explore and that the focused step receives a visible outline.

These are automated local-browser checks of the repository build. They do not establish visual acceptance on a live owner-approved staging host and do not mark STG-01–STG-18 complete.

## Manual visual acceptance — NOT RUN

Complete only against an owner-approved staging URL and attach evidence.

- [ ] All eight routes at 320, 360, 390, 768, 1280 and 1440 CSS px.
- [ ] Hero readability and focal image crop on every route.
- [ ] Journey rail overlap and spacing against each route's next section.
- [ ] Rooms filter/shortlist/comparison at desktop and mobile.
- [ ] Experiences and detail enquiry forms, date intent and copyable fallback states.
- [ ] Dining tabs and copyable enquiry fallback, including menu confirmation guard.
- [ ] About/Gallery content rhythm and image captions.
- [ ] Directions arrival figures, map link and contact fallback.
- [ ] Keyboard-only sequence, focus visibility, screen-reader landmark naming and reduced-motion behavior.
- [ ] Human sign-off with exact URL, date/time, operator, device/browser and screenshot evidence.

A green automated suite is necessary but does not replace this review.


## M1 — readable editorial type roles

The shared type-role tokens are owned by `assets/site.css` and consumed by the final-loaded `assets/css/premium-guest-journey.css` layer:

| Role | Size | Intended use |
|---|---:|---|
| Micro | 11px | Secondary metadata and restrained utility labels |
| Label | 12px | Navigation, form labels, planner choices and buttons |
| Support | 13px | Card descriptions, itinerary details, FAQs and practical notes |
| Body | 15px | Default readable body copy |
| Lede | 17px | Introductory editorial emphasis |

Decorative folios, eyebrow labels, step numbers and image indexes remain deliberately smaller; they are not reading copy. The quality suite checks computed font sizes on rendered core routes at the responsive audit widths, rather than relying only on CSS source assertions.


## M16 — premium art direction and first-view system

The canonical heritage palette remains fort pine, olive, limestone, warm ivory and sandstone. Brass is reserved for architectural details, fine rules, folios and quiet highlights. High-intent actions use the saffron/copper brand colour, not brass-on-ivory; peacock is reserved for functional focus/selected states.

| Role | Token | Value |
|---|---|---|
| Fort pine | `--ink` | `#1a2821` |
| Deep olive | `--ink-soft` | `#354239` |
| Limestone | `--paper` | `#f7f3ea` |
| Warm ivory | `--white` | `#fffdf8` |
| Sandstone | `--sand` | `#eadcc5` |
| Antique brass | `--gold` | `#c9a46a` |
| Deep brass text | `--gold-dark` | `#765735` |
| Primary CTA | `--saffron` | `#b94a0e` |
| CTA hover | `--saffron-hover` | `#913b0b` |
| Functional focus | `--peacock` | `#1d7472` |

The shared homepage planning panel and inner-route guest-journey rail are full-bleed fort-green editorial transitions. Individual route actions remain visible without enclosing every choice in another white card. The mobile homepage hero crops toward the rooftop foreground and moves the headline/primary action higher in the first view.

Experiences, Experience Details, Gallery and Dining use owner-controlled, manifest-backed first-view photographs. The static HTML keeps source JPEG/WebP paths; the existing staging image pipeline derives responsive WebP sources in the isolated package. The original image subjects, availability caveats, booking/enquiry handoff and photo rights are unchanged.

Automated regression checks cover the palette/action roles, full-bleed decision bands, photo-led hero subject/alt text, hero priority/preload and page-specific image byte budgets. Screenshot review and owner-approved staging UAT remain separate manual acceptance gates; no visual score or release approval is inferred from a passing build.
