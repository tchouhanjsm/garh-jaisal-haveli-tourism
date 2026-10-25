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

The four site photographs are stored in `assets/images/` and the HTML uses local image paths. To prepare the assets for a standalone deployment, run:

```bash
./scripts/localize-images.sh
```

The script preserves non-empty JPGs already in the checkout and downloads only missing originals from the public source repository `tchouhanjsm/garh-jaisal-website`. If Pillow is installed, it creates and verifies WebP derivatives and updates the site's local image references (including Open Graph image metadata) to WebP. If Pillow is unavailable or conversion fails, it keeps the JPG references. It also migrates legacy raw-image URLs if any remain.

The operation is safe to repeat: existing originals are not overwritten, and HTML references are changed only when needed. It requires `curl` and `python3`; an internet connection is needed only when one or more source JPGs are missing. Run `./scripts/check-site.sh` after localization to validate the site and the image-reference rewrite regression tests.

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
