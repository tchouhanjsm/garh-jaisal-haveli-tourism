# Garh Jaisal Haveli — PHP enhancement branch

This enhancement builds on the existing website rather than replacing its layout, heritage branding, photographs or client-side room comparison tools.

## Implementation scope

- PHP 8.1+ page entry points for homepage, about, rooms, gallery, dining, directions, experiences and experience details.
- Existing page sources continue to render via `includes/render.php`, which preserves the validated external booking and WhatsApp channels while adding a separate PHP stay enquiry route.
- `booking.php` offers server-side validation, CSRF protection, honeypot filtering, per-session 60-second submission throttling and a server-side mail handoff.
- Legacy `.html` URLs redirect to the equivalent PHP page with temporary redirects while the upgrade is evaluated.
- All pre-existing CSS, images, JavaScript, and content remain in place; `assets/css/php-upgrade.css` adds only booking-form styles.

## cPanel installation

1. Obtain the ZIP archive of this branch from GitHub (Code → Download ZIP with this branch selected), or merge the branch after review and download the repository.
2. In cPanel File Manager, back up the existing site and database if any; upload and extract **the entire project** into the intended domain document root. Move files out of the ZIP's enclosing GitHub folder if necessary.
3. Set the domain's PHP version to **PHP 8.1 or later**, with sessions enabled and `mail()` available if email is to be used.
4. Configure `HOTEL_ENQUIRY_EMAIL` as the real hotel inbox and `HOTEL_SENDER_EMAIL` as a sender mailbox authorized by the hotel's domain and mail service. Configure SPF, DKIM and DMARC at the actual sender domain if available. **Do not put credentials or personal guest data in tracked files.** Ask the host how to set PHP environment variables for the chosen hosting configuration.
5. Verify that the domain routes to `index.php` and test the enquiry form with a real, consented test address. Confirm the email actually arrives, including spam folder checks. PHP `mail()` returning true means accepted for handoff, not guaranteed delivery.
6. Ensure HTTPS is configured at the hosting provider, and verify the existing source-authorized external booking provider and WhatsApp clickthroughs on the deployed site.

No MySQL or admin panel has been added to this transition: the contact process does not need a database, and unverified staff credentials or inventory management would introduce unnecessary risk.

## SEO launch caution

The original `robots.txt` deliberately blocks indexing; the original `sitemap.xml` is effectively empty. **This branch intentionally preserves both pre-launch safeguards.** Do not remove those protections or advertise a canonical production domain until the owner confirms the correct domain, content and launch readiness. Rebuild the sitemap and canonicals after the approved domain is known. The booking form is marked `noindex`.

## Known limitations / further work

This is a **first PHP conversion and enquiry workflow**, not a completed agency-level redesign. Email delivery, live hotel contact information and all PHP routes still require end-to-end testing on a configured cPanel server. The existing site's JavaScript contact-channel configuration must be checked on the deployed domain. The static HTML content is preserved instead of being fully refactored into shared component templates. Content/asset audits, responsive visual QA, automated accessibility testing, full sitemap generation, and performance measurement remain outstanding.

Enquiry forms do **not** confirm a booking, show live inventory or quote verified prices. Production use should include an established SMTP/API delivery service if cPanel `mail()` cannot reliably deliver enquiries.


## Additional engineering and accessibility checks

- The booking page is **noindex** and **no-store**; public guest details must never be cached by a reverse proxy.
- With no `HOTEL_ENQUIRY_EMAIL`, the email submit action is disabled and the page offers the source-authorized WhatsApp enquiry URL as an alternative. Verify the hotel is still monitoring this contact channel.
- Email is currently handed to PHP's `mail()` implementation. The website cannot prove actual inbox delivery without a configured, working host. For higher reliability, use the hosting provider's managed SMTP mail transport or a vetted transactional provider, then complete an end-to-end sending test. Do not put credentials in Git.
- Apache must honor `includes/.htaccess` and the root `.htaccess` security rules. Verify directly that `/includes/bootstrap.php` is not readable over HTTP and that directory indexes are not browsable.
- Desktop and responsive PHP browser tests are implemented in `scripts/test-php-browser.py` (36 route/viewport checks with screenshot evidence) and SEO-source tests in `scripts/test-php-seo.py`. These supplement, but do not replace, the existing comprehensive static-site suite.
- Confirm the HTML-to-PHP redirects work under **actual Apache**; the local PHP development server does not interpret `.htaccess`.
- The SEO production publication guard is intentionally unchanged. Do not enable robots indexing or canonical metadata without owner approval for the canonical host.
