# Agent State — Garh Jaisal Haveli Tourism

Last verified repository revision at bootstrap: `f2948070e335b313f193f79c2ba047773f3c85da`
State updated: 2026-10-25
Status: Automation bootstrap proposed; scheduled execution remains disabled until owner configuration and PR merge.

## Objective and verified stack
Deliver a premium, accessible, mobile-first heritage-hotel and Rajasthan tourism website that drives honest direct enquiries. Current implementation is static HTML, custom CSS, and vanilla JavaScript for GoDaddy/cPanel. No framework, backend reservation engine, or payment flow is configured.

## Verified pages and checks
Pages: `index.html`, `rooms.html`, `experiences.html`, `dining.html`, `about.html`, `directions.html`.
Existing local check: `./scripts/check-site.sh` (HTML/link/anchor/metadata/alt/JSON-LD/sitemap audit plus JavaScript and shell syntax checks when the tools are present).
The owner previously ran this check locally and reported it passed. This state file does not claim browser visual checks, real-device checks, Lighthouse, or field Core Web Vitals have passed.

## Completed
- Initial static website baseline committed as `f294807`.
- Local property photographs copied into `assets/images/`; Pillow was unavailable during the owner's local run, so JPG files were retained.
- Readme and launch checklist warn that rates, room details, tour inclusions, contact details, canonical URLs, testimonials, and deployment readiness require owner verification.
- Automation architecture/prompt/CI setup is being proposed in a separate PR. Do not assume the workflows are active until that PR is merged and the required variables/secrets are explicitly configured.

## Current operating rules
- One coherent task per proposal; inspect open PRs and CI before new work.
- Do not duplicate work already in an open PR.
- Codex has read-only GitHub permissions and produces local patches. A separate publisher checks paths and base SHA, then opens a draft PR.
- The owner remains responsible for reviewing and merging PRs.
- The two-hour strategist is read-only against repository code; its separate reporting job updates the issue titled “Scheduled Strategy Review”.
- Scheduled agents are disabled by default; enabling them requires deliberate configuration and budget review.

## Prioritized backlog
1. P1: visually inspect all pages at mobile/tablet/desktop widths, especially navigation, hero crop, sticky/mobile enquiry bar, and booking handoff; capture screenshots and fix objective defects.
2. P2: add repeatable browser-based responsive/accessibility checks if an appropriate existing or lightweight test approach is justified.
3. P2: measure production-like image transfer and Core Web Vitals; preserve current self-hosted images and avoid delaying the LCP image.
4. P2: verify live canonical domain, contact details, room/rate/inclusion statements, WhatsApp handoff, and testimonial permissions with the owner before launch.
5. P3: improve substantive Rajasthan/Jaisalmer intent pages only after reviewing the existing content and avoiding keyword stuffing.

## Risks and blockers
- GitHub Action automation requires an OpenAI API key (separate API usage/billing), and a fine-grained GitHub token for the optional PR publisher.
- GitHub Actions minutes may be limited by the account/repository plan. The schedules are deliberately disabled until reviewed.
- Actual branch-protection rules, required reviewers/checks, available browser tooling, and production analytics data have not been verified.
- No claim of an independent browser visual review has been made.

## Next action
Review and merge the automation bootstrap PR only after inspecting the workflow diff and confirming the cost/security model. Then run the static checks on the PR and configure repository variables/secrets only if scheduled agent usage is approved.
