# Deployment notes

## Hosting target

This is a static site intended for cPanel or another standard web host. Upload the HTML files and `assets/` directory into the chosen document root. No Node runtime, PHP backend, build command, database, or paid plugin is required.

## Before production cutover

- Decide whether existing `.php` URLs must be preserved. If so, add carefully tested redirects from the old URLs to the new `.html` routes, or rename pages to match your desired URLs. Do not leave the old and new pages competing at the same URL.
- Update canonical tags and `sitemap.xml` only after the final domain and URL scheme have been decided.
- Keep staging `noindex` or password-protected until approved. Do not allow the staging copy to compete in search results.
- Localize photos via `scripts/localize-images.sh` and check output sizes. The website repository image hotlinks are useful for initial design review, not the preferred production delivery method.
- Confirm that direct message and telephone numbers are correct and actively monitored.
- Test the enquiry form with real devices, because whether WhatsApp opens in a new tab/window depends on the browser and installed app.
