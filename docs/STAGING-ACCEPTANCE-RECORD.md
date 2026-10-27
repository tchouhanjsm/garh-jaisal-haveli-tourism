# Staging Acceptance Record — Per Run

**Purpose:** Record one operator-run acceptance pass for the static tourism site. This file is a template; copy it for each run rather than overwriting earlier evidence.

**Current record state:** `NOT RUN`  
**Release status:** `BLOCKED_PENDING_MANUAL_UAT`

## Run metadata

| Field | Value — fill only from the actual run |
|---|---|
| Intended staging URL | NOT ENTERED — fill only after the owner approves the exact HTTPS staging origin |
| Main commit SHA under test | NOT RECORDED |
| Automated preflight run URL / ID | NOT RUN |
| Date/time (Asia/Kolkata) | NOT RECORDED |
| Operator | NOT RECORDED |
| Browser and version | NOT RECORDED |
| Device / OS / viewport | NOT RECORDED |
| Automated JSON report path and SHA-256 | NOT RECORDED — keep the file outside the repository checkout |
| Screenshot bundle location | NOT RECORDED — keep the directory outside the repository checkout |
| Offline visual review HTML location | NOT RECORDED — keep the file outside the repository checkout |
| Overall result | NOT RUN |
| Overall release status | BLOCKED_PENDING_MANUAL_UAT |

Do not fill a URL until the owner has approved the staging origin. Use the origin only; do not record URL credentials, query strings, fragments, booking tokens, guest personal data or payment details. Do not commit screenshots, raw reports containing secrets, Basic Auth credentials or guest data.

## Manual staging checks

Run these checks in a normal browser against the exact owner-approved HTTPS staging origin. Enter a result only after performing the check and recording the evidence. A GitHub Actions pass is not manual evidence.

Allowed results: `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`. Leave all results as `NOT RUN` until the operator completes each row.

| ID | Check | Exact staging URL | Date/time (Asia/Kolkata) | Operator | Browser / device / viewport | Result | Evidence / notes | Follow-up owner |
|---|---|---|---|---|---|---|---|---|
| STG-01 | Desktop guest journey: Home → Rooms → Experiences → Dining → Directions |  |  |  |  | NOT RUN |  |  |
| STG-02 | Mobile guest journey and tap targets |  |  |  |  | NOT RUN |  |  |
| STG-03 | Images, config and styles: no 404 or mixed content |  |  |  |  | NOT RUN |  |  |
| STG-04 | Keyboard focus, Escape/menu state and reduced motion |  |  |  |  | NOT RUN |  |  |
| STG-05 | Page title, meta description and social preview consistency |  |  |  |  | NOT RUN |  |  |
| STG-06 | AsiaTech booking flow in desktop browser; do not book or pay |  |  |  |  | NOT RUN |  |  |
| STG-07 | AsiaTech booking flow in mobile browser; do not book or pay |  |  |  |  | NOT RUN |  |  |
| STG-08 | WhatsApp account and prefilled message reachability; do not send test guest data |  |  |  |  | NOT RUN |  |  |
| STG-09 | Primary mobile call answered by intended operator |  |  |  |  | NOT RUN |  |  |
| STG-10 | Alternate landline answered by intended operator |  |  |  |  | NOT RUN |  |  |
| STG-11 | Email delivery, no bounce and reply capability |  |  |  |  | NOT RUN |  |  |
| STG-12 | Owner review of current room, tour, dining and arrival facts |  |  |  |  | NOT RUN |  |  |
| STG-13 | Backup and rollback procedure reviewed |  |  |  |  | NOT RUN |  |  |
| STG-14 | Responsive image rendering/crop at 360, 768 and 1440 CSS-pixel viewports |  |  |  |  | NOT RUN |  |  |
| STG-15 | Keyboard-only navigation through all six experience galleries, visible focus and Enter/Space |  |  |  |  | NOT RUN |  |  |
| STG-16 | Reduced-motion preference, no carousel autoplay and stable layout |  |  |  |  | NOT RUN |  |  |
| STG-17 | Social preview image, title, description and image-alt consistency on staging |  |  |  |  | NOT RUN |  |  |
| STG-18 | Unknown-route response and 404 recovery links; no hard-coded contact endpoints |  |  |  |  | NOT RUN |  |  |

## Owner approval gates

These are decisions, not code-test results. Record the named approver and evidence before changing a status.

| ID | Owner decision / release gate | Approver | Result | Evidence / notes |
|---|---|---|---|---|
| OWN-01 | Approve the public canonical hostname and DNS/SSL plan |  | NOT RUN |  |
| OWN-02 | Confirm current room rates, inventory and facilities |  | NOT RUN |  |
| OWN-03 | Approve the current restaurant menu, prices and service hours |  | NOT RUN |  |
| OWN-04 | Confirm current tours, routes, inclusions and operating status |  | NOT RUN |  |
| OWN-05 | Confirm fort arrival guidance and any transfer/luggage arrangements |  | NOT RUN |  |
| OWN-06 | Verify AsiaTech booking flow in normal desktop/mobile browsers without submitting a reservation or payment |  | NOT RUN |  |
| OWN-07 | Verify WhatsApp, primary phone, alternate landline and email reachability/response |  | NOT RUN |  |
| OWN-08 | Review backup and rollback procedure |  | NOT RUN |  |
| OWN-09 | Explicitly authorize production deployment and any SEO publication changes |  | NOT RUN |  |

## Acceptance and release decision

- Automated `PASS` means the local/staging browser evidence met its automated contract; it does not clear any STG row or owner gate.
- The AsiaTech automated probe returned HTTP 403 on 26 October 2026. This may be a bot/access restriction; it is not proof that ordinary guests are blocked. A human must test the provider in a standard browser.
- Do not submit a real reservation, payment, or guest personal data to test the site.
- Do not publish current menu/prices, activate canonical URLs or sitemap entries, change `robots.txt`, collect guest enquiries server-side, or deploy to production without the specific owner approval.
- The record remains `BLOCKED_PENDING_MANUAL_UAT` while required manual checks or owner decisions are `NOT RUN`, `FAIL`, or `BLOCKED`.
