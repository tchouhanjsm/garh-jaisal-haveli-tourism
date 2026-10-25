# Launch checklist

## Content and operations
- [ ] Confirm room names, exact inventory, capacity, bed arrangements and included amenities.
- [ ] Confirm current room rates, taxes, meals, cancellation terms, check-in/check-out, early-arrival and late-arrival policies.
- [ ] Confirm current restaurant menu, opening hours, dietary handling and candlelit dinner availability/prices.
- [ ] Confirm the current desert operators, package inclusions, safety provisions, pickup times and cancellation terms.
- [ ] Confirm current guided-tour languages, itinerary, guide arrangements and rates.
- [ ] Confirm the number used by WhatsApp/phone is staffed and monitored.
- [ ] Add only authentic, permission-cleared guest testimonials and current verified third-party review links.
- [ ] Confirm the family story and date (hospitality operation began in 2005) are approved for publication.

## Website functionality
- [ ] Test every navigation link on desktop, tablet and mobile.
- [ ] Test booking form with valid dates; same-day/earlier departure must be rejected.
- [ ] Test WhatsApp deep links on Android, iOS and desktop; ensure guest details appear correctly.
- [ ] Test all telephone, map and direct-message links.
- [ ] Verify image assets remain available after localizing; no production hotlink dependencies.
- [ ] Check keyboard navigation, visible focus, heading order, labels, alt text, reduced-motion mode and contrast.
- [ ] Confirm sticky mobile CTA never obscures essential content; test safe-area insets and landscape mode.
- [ ] Check 404 behaviour and all inner-page routes on cPanel.

## Performance
- [ ] Localize images with `./scripts/localize-images.sh`.
- [ ] Compress large photographs and create responsive WebP/AVIF variants if supported by the hosting setup.
- [ ] Keep hero image prioritized; lazy-load below-the-fold images.
- [ ] Check Google Fonts fallback and consider hosting fonts locally if font requests delay rendering.
- [ ] Test with Lighthouse/PageSpeed on mobile; aim for Core Web Vitals pass, not a self-reported score.
- [ ] Confirm no console errors and no layout shift caused by unloaded images.

## SEO and analytics
- [ ] Confirm canonical tags point to the final production URL (not staging).
- [ ] Review all page titles, descriptions, image alt text, robots directives and `sitemap.xml`.
- [ ] Submit the final sitemap in Google Search Console after deployment.
- [ ] Add/verify Google Business Profile and map pin details.
- [ ] Configure only consent-appropriate analytics and conversion measurement; verify WhatsApp click tracking before launch.
- [ ] Check Hotel/LocalBusiness structured data in Google's Rich Results Test and correct any warnings.

## Deployment and rollback
- [ ] Deploy to staging first under HTTPS and protect staging from indexing.
- [ ] Save a restorable backup of the current production site and any server configuration.
- [ ] Run a complete UAT pass with the on-site hotel team on a real phone.
- [ ] Update canonical/OG/sitemap URLs before launch.
- [ ] Publish during a staffed period; keep an operator available to answer incoming booking enquiries.
- [ ] Monitor the first 48 hours for broken links, image failures, contact enquiries and search indexing.
- [ ] Change `robots.txt` from pre-launch `Disallow: /` to `Allow: /` only after the production launch is approved; do not let staging be indexed.
