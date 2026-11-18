<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
/**
 * Transitional PHP renderer: preserves the verified original layout, images,
 * text, room filters and interactive scripts without duplicating page bodies.
 * All primary navigation and enquiry routes resolve to PHP.
 */
function hotel_render_static(string $slug): void {
    $allowed = ['index','about','rooms','gallery','dining','directions','experiences','experience-details'];
    if (!in_array($slug, $allowed, true)) { http_response_code(404); exit('Page not found'); }
    $source = dirname(__DIR__) . '/' . $slug . '.html';
    if (!is_file($source)) { http_response_code(500); exit('Page source missing'); }
    $html = file_get_contents($source);
    if ($html === false) { http_response_code(500); exit('Unable to render page'); }
    $html = preg_replace_callback('~(href=["\x27])((?:index|about|rooms|gallery|dining|directions|experiences|experience-details)\.html)(#[^"\x27]*)?(["\x27])~i', static function(array $m): string {
        return $m[1] . substr($m[2], 0, -5) . '.php' . ($m[3] ?? '') . $m[4];
    }, $html);
    // Original booking provider is not configured. Send visitors to a functional enquiry workflow.
    $html = preg_replace('~href=(["\x27])#contact-status\1(?=[^>]*data-(?:booking-link|enquiry-link))~i', 'href="booking.php"', $html);
    $html = preg_replace('~\sdata-(?:booking-link|enquiry-link)(?:="[^"]*")?~', '', $html);
    // Remove stale disabled states from links now routing to the enquiry form.
    $html = preg_replace('~(<a\b[^>]*href="booking\.php"[^>]*?)\saria-disabled="true"~i', '$1', $html);
    $html = preg_replace('~(<a\b[^>]*href="booking\.php"[^>]*?)\saria-describedby="contact-status"~i', '$1', $html);
    $html = str_replace('Book Now opens the external booking provider; it does not confirm availability or a reservation.', 'Book Now opens an enquiry form; availability and reservations are confirmed only by the hotel.', $html);
    $html = str_replace('Choose Book Now to open the external booking provider,', 'Choose Book Now to send a booking enquiry,', $html);
    $html = str_replace('data-enquiry-message=', 'data-original-enquiry-message=', $html);
    $html = str_replace('</head>', '<link rel="stylesheet" href="assets/css/php-upgrade.css"></head>', $html);
    header('Content-Type: text/html; charset=UTF-8');
    header('X-Content-Type-Options: nosniff');
    echo $html;
}
