# Garh Jaisal Haveli — Tourism Website

A mobile-first, conversion-focused website for Garh Jaisal Haveli in Jaisalmer, Rajasthan. Built with semantic HTML, custom CSS, and vanilla JavaScript so it can be hosted on GoDaddy/cPanel without a framework, build step, paid dependency, or database.

## Pages

- `index.html` — homepage, date/guest enquiry form, experiences, rooms, rooftop dining, FAQs, primary CTA
- `rooms.html` — room discovery and direct availability enquiry
- `experiences.html` — Thar Desert safari/camping and guided city tour service pages
- `dining.html` — rooftop restaurant and candlelit dinner enquiry pages
- `about.html` — family/heritage story and hospitality philosophy
- `directions.html` — arrival planning, accessibility notes, luggage coordination and FAQs

## Stack

- HTML5 and semantic page structure
- CSS with responsive desktop/tablet/mobile layouts; no CSS framework
- Vanilla JavaScript for responsive navigation, date validation, WhatsApp enquiry generation and accessible accordions
- Google Fonts (Playfair Display + DM Sans) with system fallbacks
- Local images can be hydrated from the existing public repository `tchouhanjsm/garh-jaisal-website` by running the asset script below

## Run locally

From this directory:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. A local HTTP server is recommended because browsers can treat some assets differently when opened as `file://` URLs.

## Images

During the first preview, image elements use the existing website repository's public raw image URLs. To make the new site self-contained (recommended before launch), run:

```bash
./scripts/localize-images.sh
```

This downloads four source photographs from `tchouhanjsm/garh-jaisal-website` into `assets/images/` and rewrites the project pages to use local paths. It keeps original JPGs and, when Pillow is available, also creates WebP derivatives and points the pages at those smaller files. It requires `curl` and `python3`; an internet connection is needed for the download.

The page copy deliberately avoids invented prices, fabricated guest reviews, or an availability promise. Confirm live rates, exact room details, current tour inclusions, opening hours, and testimonial permissions before publishing.

## Create a new GitHub repository

To create and push a new **private** repository from your machine, install GitHub CLI and sign in with `gh auth login`, then run:

```bash
./scripts/create-github-repo.sh garh-jaisal-haveli-tourism --private
```

For a public repository, use `--public`. The script initializes Git if needed, creates the first commit if needed, creates the new remote repository, adds `origin`, and pushes `main`. It does not change or write to `tchouhanjsm/garh-jaisal-website`.

If `gh` is not installed, create an empty repo at https://github.com/new, then run the following from this project directory after replacing `<OWNER>` with your GitHub username:

```bash
git init -b main
git add .
git commit -m "feat: launch Garh Jaisal Haveli tourism website"
git remote add origin https://github.com/<OWNER>/garh-jaisal-haveli-tourism.git
git push -u origin main
```

Do not check passwords, API tokens, `.env` files or any private guest data into Git.

## Deploy to GoDaddy/cPanel

1. Review the current site copy and property claims with the on-site team.
2. Keep the pre-launch `robots.txt` blocking crawlers on staging; change it to `Allow: /` only on the approved production launch.
3. Run `./scripts/localize-images.sh` so photos are served from the new site, not hotlinked from the old repository.
4. Check mobile layouts and links on a real phone; test WhatsApp on both Android and iOS.
5. Upload the HTML files plus the `assets/` directory to a **staging subdomain** first.
6. Update canonical URLs, Open Graph URLs, and `sitemap.xml` to the final domain after the new site is approved.
7. Verify HTTPS, image sizes, 404 behaviour, contact details, enquiry messages and all page routes.
8. Switch production only after a rollback copy of the existing site has been saved.

## Conversion and trust guardrails

- The availability form collects dates and guest count, validates the date order and opens WhatsApp; it does not make a reservation or collect payment.
- It is explicit that the hotel is inside the fort and vehicles cannot reach the door.
- No fabricated testimonials or current online rating have been added. Collect approved, attributed review excerpts before adding a testimonial carousel.
- Calls to action say “enquire”, “check availability” or “ask about options” where the answer depends on current inventory.

## Project documentation

- `docs/CONTENT-AND-CONVERSION.md` — message hierarchy, sections and service-page copy
- `docs/LAUNCH-CHECKLIST.md` — QA, SEO, accessibility, speed and deployment checklist
- `docs/TESTIMONIAL-COLLECTION.md` — how to add authentic guest proof without inventing quotes


## Branch, PR and quality-gate workflow

Use the branch-first process documented in [Development Workflow](docs/DEVELOPMENT-WORKFLOW.md): create a feature branch from current `main`, make focused commits, open a PR, and wait for the required checks on the latest PR head SHA. If a check fails, inspect its actual logs, fix the root cause on the same branch, and rerun checks before asking for merge approval.

The non-scheduled `Website quality gates` workflow runs `bash scripts/check-pr-quality.sh` for PRs targeting `main` and after pushes to `main`. It is a test workflow, not the scheduler for development agents. Its intended required check context is `Website quality gates / required-checks`.

Auto-merge remains disabled. Before considering it, the owner must verify the workflow on a subsequent test PR and configure GitHub branch rules to require this check, suitable approvals and resolution of blocking review comments. The first PR that introduces the workflow is a bootstrap exception because that workflow cannot run as a PR check until it exists on the base branch.
