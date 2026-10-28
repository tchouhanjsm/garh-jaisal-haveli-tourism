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
