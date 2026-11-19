# Guest-first website transformation: root-cause analysis (RCA)
Date: 2026-11-19
Branch: feat/guest-first-home-navigation-20261119
Input: user's full-page localhost screenshot of index.php and source inspection of main.

## Guest perspective

The original first screen has a strong, genuine property photograph and a distinctive proposition: stay inside Jaisalmer Fort. It is already a valuable identity worth preserving. The problem emerges on the second screen: visitors are presented with a process checklist, followed by an introductory story, proof strip, experiences, room teaser, dining callout, values, stay notes, FAQ, another next-step selector and a final CTA. That requires too much decision-making and scrolling before the guest chooses a room.

## Proven source-level causes

| Symptom | Root cause | Evidence | Resolution |
|---|---|---|---|
| Homepage feels like a long brochure | Twelve separate HTML sections before the footer, including overlapping decision aids and assurance blocks | `index.html`: `#plan-stay`, `.proof-strip`, `.section--values`, `.section--stay-notes`, `.content-depth`, `.final-cta` | PHP homepage replaced by six curated sections: hero, essentials, featured rooms, fort arrival, experiences, close |
| Guest cannot see a clear contact channel | Dock calls itself “A direct enquiry” and uses “Prepare enquiry” with explanatory copy rather than a clearly named WhatsApp destination | `data-direct-enquiry-dock`, `data-enquiry-link` in original HTML and JS | Label becomes “WhatsApp us”; simplified floating pill on desktop and separate WhatsApp mobile action |
| Header can be crowded | Long nav, dropdown, Book Now and transition's extra Stay Enquiry button compete for limited horizontal width | `includes/render.php`, `.primary-nav` | Single prominent Book Now in header; secondary enquiry in shared footer; Journal and Car services inside existing dropdown |
| Footer appears inconsistent/inaccessible | The original source **already has a footer on all eight core static pages**, but each page duplicates it, and none links to the requested legal policies | `index.html`, `rooms.html`, `about.html`, `dining.html`, others | PHP routes now render a single shared footer with Journal, transport, contact and policy links; booking.php shares it too |
| No editorial landing page | Draft article JSON records exist but approval is not complete | `content/blogs/*.json` status `draft` | Journal index links to verified on-site guides without publishing unapproved draft articles as completed posts |
| Transport and final-fort arrival mixed together | Arrival guidance has to cover car journey and separate on-foot access; users need a clear distinction | `directions.html` already covers final walk; no `car-services.php` route | Transport enquiry page and contextual arrival-page link; retain detailed fort approach instructions |
| Policy visibility absent | Footer lacked privacy and cancellation/refund links | Original repeated footer HTML | Reusable footer links to policy information pages, explicitly pending verification of operator-specific terms |
| Mobile experience prioritizes long card rows | Three large image-led discovery cards would add excess scrolling on smaller screens | First replacement layout review | Second pass renders compact image-and-text rows for mobile |

## New content hierarchy

1. **Three seconds:** property identity, location, desirable authentic image, visible booking CTA and room alternative.
2. **Confidence without friction:** three short verifiable property facts rather than a second planning section.
3. **Rooms:** show three representative options; full comparison lives on the Rooms page.
4. **Arrival distinction:** within the fort; cars cannot reach the door, link to dedicated directions.
5. **What else:** desert/city, rooftop dining, transport; details live on their own pages.
6. **Final booking nudge:** one elegant closing action, not four more decision cards.

### Content governance

- The site's source-authorized external booking provider and WhatsApp channel remain the only publicly grounded links; no claim of real-time inventory or guaranteed arrangements.
- Transport information is an enquiry, not a promised car service.
- Existing blog JSON records marked `draft` are not automatically published. The Journal hub is not a completed published article archive.
- Refund and cancellation amounts, periods, exceptions and property legal retention periods are **not verified**; policy pages must be owner-reviewed before release. `noindex` is applied to the new policy pages.
- Keep robots.txt blocking indexing and avoid approving canonical production host until the owner approves a launch.

## Implementation/review cadence

- **Pass 1 — structure:** removed overlapping homepage blocks, introduced reusable footer and four PHP routes, preserved existing photography.
- **Pass 2 — visual flow:** compacted mobile discovery cards, removed a redundant header enquiry button, turned dock into WhatsApp CTA, added separate WhatsApp on mobile.
- **Pass 3 — engineering:** expanded PHP SEO tests and Chromium viewport QA to 13 routes at 360/390/768/1280 widths, added first-screen CTA and footer checks.
- **Pass 4 — CI failure RCA:** corrected stale text matching in HTTP smoke tests and eliminated an unread PHP-server stderr pipe that could deadlock long browser runs.

## Acceptance requirements

- PHP lint; rendered SEO unique title/description, H1, image alt coverage; staging safety checks.
- All 52 route/viewport combinations load without JavaScript exceptions or horizontal overflow; screenshots reviewed.
- Confirm header, mobile menu, footer, dock, booking and WhatsApp links in real browsers.
- Validate actual Apache redirects, cPanel protections, sender email and privacy statements before deployment.
- Owner approves exact cancellation/refund policy and privacy retention/contact wording; unapproved values must never be invented.
- Measure LCP/INP/CLS on the deployed host; this source-level design change is not a measured performance guarantee.

## Non-goals / limitations

The static `.html` files remain unchanged because the Apache deployment redirects them to PHP. PHP templates still use the transitional renderer; deeper architecture consolidation can follow after acceptance. This PR is isolated from `main` pending testing and review.
