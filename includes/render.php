<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/guest-experience.php';

/**
 * Transitional renderer: retain original hotel design, assets and source-authorized
 * booking/WhatsApp contact integrations; map navigation to PHP routes.
 */
function hotel_render_static(string $slug): void {
    $allowed = ['index','about','rooms','gallery','dining','directions','experiences','experience-details'];
    if (!in_array($slug, $allowed, true)) { http_response_code(404); exit('Page not found'); }
    $source = dirname(__DIR__) . '/' . $slug . '.html';
    if (!is_file($source)) { http_response_code(500); exit('Page source missing'); }
    $html = file_get_contents($source);
    if ($html === false) { http_response_code(500); exit('Unable to render page'); }

    // Rewrite same-site page references without changing images, CSS or scripts.
    $html = preg_replace_callback(
        '~(href=["\x27])((?:index|about|rooms|gallery|dining|directions|experiences|experience-details)\.html)(#[^"\x27]*)?(["\x27])~i',
        static function(array $m): string {
            return $m[1] . substr($m[2], 0, -5) . '.php' . ($m[3] ?? '') . $m[4];
        },
        $html
    );
    // One shared navigation and footer for PHP routes; keep static source untouched.
    $html = guest_enhance_nav($html);
    $html = preg_replace('~<footer class="site-footer">[\\s\\S]*?</footer>~', guest_footer(), $html, 1);
    $html = str_replace('A direct enquiry', 'WhatsApp the hotel', $html);
    $html = str_replace('Ask for current details for your dates. Nothing is sent automatically.', 'Chat about rooms, dates and arrival.', $html);
    $html = str_replace('Prepare enquiry <span aria-hidden="true">↗</span>', 'Open WhatsApp <span aria-hidden="true">↗</span>', $html);
    if ($slug === 'index') {
        $html = preg_replace('~<main id="main" tabindex="-1">[\\s\\S]*?</main>~', guest_home(), $html, 1);
    }
        // Preserve data-booking-link, data-enquiry-link, and their original labels.
    // assets/site.js validates the owner-authorized booking/WhatsApp URLs.
    // Booking remains the primary navigation CTA; secondary enquiries live in the footer.
    if ($slug === 'index') {
        $html = str_replace('<link rel="stylesheet" href="assets/css/homepage-room-discovery.css">', '', $html);
    }
    $html = str_replace(
        '<div class="mobile-booking-bar"><span>Inside the Golden Fort</span>',
        '<div class="mobile-booking-bar"><span>Inside the Golden Fort</span><a href="#contact-status" data-enquiry-link data-enquiry-message="Namaste Garh Jaisal Haveli, I would like to ask about a stay." aria-disabled="true" aria-describedby="contact-status" class="guest-mobile-whatsapp">WhatsApp</a>',
        $html
    );
    if ($slug === 'directions') {
        $html = str_replace(
            '<section class="guest-journey" aria-label="Plan your stay">',
            '<div class="guest-arrival-shortcut wrap"><strong>Arriving by car, train or plane?</strong><span>Arrange the journey to the fort, then confirm the last walking stretch.</span><a href="car-services.php">Car service guidance →</a></div><section class="guest-journey" aria-label="Plan your stay">',
            $html
        );
    }
    $html = str_replace('</head>', '<link rel="stylesheet" href="assets/css/php-upgrade.css"><link rel="stylesheet" href="assets/css/guest-first.css"></head>', $html);
    header('Content-Type: text/html; charset=UTF-8');
    header('X-Content-Type-Options: nosniff');
    echo $html;
}
