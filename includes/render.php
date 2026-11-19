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
    // Add a separate server-side enquiry route that doesn't pretend to reserve rooms.
    $html = preg_replace(
        '~(<a\b[^>]*class=["\x27][^"\x27]*nav-book[^"\x27]*["\x27][^>]*>.*?</a>)(\s*</nav>)~is',
        '$1<a class="nav-enquiry" href="booking.php">Stay Enquiry</a>$2',
        $html, 1
    );
    $html = str_replace('</head>', '<link rel="stylesheet" href="assets/css/php-upgrade.css"><link rel="stylesheet" href="assets/css/guest-first.css"></head>', $html);
    header('Content-Type: text/html; charset=UTF-8');
    header('X-Content-Type-Options: nosniff');
    echo $html;
}
