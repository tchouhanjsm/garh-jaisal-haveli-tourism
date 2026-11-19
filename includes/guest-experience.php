<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

/** Guest-first, source-grounded PHP compositions. Never invent inventory or policies. */
function guest_home(): string {
    return <<<'HTML'
<main id="main" tabindex="-1" class="guest-home">
  <section class="hero guest-hero" aria-labelledby="hero-title">
    <img class="hero__image" src="assets/images/rest3.jpg" alt="Golden sandstone rooftop terrace overlooking Jaisalmer at dusk" fetchpriority="high" loading="eager" decoding="async" width="900" height="600">
    <div class="hero__veil"></div>
    <div class="hero__content wrap">
      <p class="eyebrow eyebrow--light">A heritage haveli · Inside Jaisalmer Fort</p>
      <h1 id="hero-title">Stay inside<br><em>the Golden Fort.</em></h1>
      <p class="hero__subhead">Seven individual rooms. Rooftop views. A rare chance to stay within Jaisalmer's living fort.</p>
      <div class="hero__actions">
        <a class="button button--gold" href="#contact-status" data-booking-link aria-disabled="true" aria-describedby="contact-status">Book your stay ↗</a>
        <a class="guest-hero__secondary" href="rooms.php">Explore the rooms →</a>
      </div>
      <p class="guest-hero__arrival">Inside the fort · Final approach on foot · <a href="directions.php">Arrival guide ↗</a></p>
    </div>
  </section>

  <section class="guest-intro wrap" aria-label="The essentials">
    <p><strong>Sleep in the fort.</strong> Wake among historic sandstone lanes.</p>
    <p><strong>Seven named rooms.</strong> See the individual spaces before choosing.</p>
    <p><strong>Rooftop evenings.</strong> Ask about current dining options.</p>
  </section>

  <section class="guest-feature wrap" aria-labelledby="guest-rooms-title">
    <div class="guest-feature__heading"><div><p class="eyebrow">Your stay</p><h2 id="guest-rooms-title">Rooms with<br><em>a story to tell.</em></h2></div><p>Carved details, rich colours and a sense of place. Explore all seven rooms, then confirm the exact option and rate for your dates.</p></div>
    <div class="guest-room-grid">
      <a href="rooms.php#room-sweet-purple" class="guest-room-card"><img src="assets/images/rooms/sweet-purple.webp" width="2000" height="1333" alt="Sweet Purple heritage room with carved wooden bed and colourful textiles" loading="lazy"><span>Sweet Purple <small>Explore room ↗</small></span></a>
      <a href="rooms.php#room-rising-sun" class="guest-room-card"><img src="assets/images/rooms/rising-sun.jpg" width="1600" height="1066" alt="Rising Sun heritage bedroom" loading="lazy"><span>Rising Sun <small>Explore room ↗</small></span></a>
      <a href="rooms.php#room-red-maharani" class="guest-room-card"><img src="assets/images/rooms/red-maharani.jpg" width="1600" height="1066" alt="Red Maharani room with richly coloured furnishings" loading="lazy"><span>Red Maharani <small>Explore room ↗</small></span></a>
    </div>
    <a class="guest-inline-link" href="rooms.php">Discover all seven rooms <span aria-hidden="true">→</span></a>
  </section>

  <section class="guest-arrival" aria-labelledby="guest-arrival-title">
    <div class="wrap guest-arrival__inner"><div><p class="eyebrow eyebrow--light">Part of the experience</p><h2 id="guest-arrival-title">The fort is your<br><em>front doorstep.</em></h2><p>Our haveli is inside the living Jaisalmer Fort. Cars do not reach the hotel door, so the final stretch is a walk through historic lanes.</p><a class="button button--gold" href="directions.php">Plan your arrival ↗</a></div><img src="assets/images/courtyard.jpg" alt="Sandstone courtyard and heritage architecture at the haveli" loading="lazy" width="2200" height="1467"></div>
  </section>

  <section class="guest-discover wrap" aria-labelledby="guest-discover-title">
    <div class="guest-feature__heading"><div><p class="eyebrow">Beyond your room</p><h2 id="guest-discover-title">Make Jaisalmer<br><em>your own.</em></h2></div><p>A few paths to explore. Go deeper only when something catches your interest.</p></div>
    <div class="guest-discover__grid">
      <a href="experiences.php"><img src="assets/images/legacy/camel-day.jpg" alt="Camels on the dunes near Jaisalmer" loading="lazy" width="1366" height="768"><strong>Desert &amp; city experiences</strong><span>Explore the possibilities →</span></a>
      <a href="dining.php"><img src="assets/images/dining/rooftop-candlelit-table.jpg" alt="A candlelit rooftop dining setup" loading="lazy" width="1200" height="800"><strong>Rooftop dining</strong><span>Discover the setting →</span></a>
      <a href="car-services.php"><img src="assets/images/directions/haveli-facade.webp" alt="Heritage sandstone entrance of the haveli" loading="lazy" width="1200" height="800"><strong>Car &amp; arrival planning</strong><span>Plan the journey →</span></a>
    </div>
  </section>

  <section class="guest-closing" aria-labelledby="guest-final-title"><div class="wrap"><p class="eyebrow eyebrow--light">Garh Jaisal Haveli</p><h2 id="guest-final-title">Your story in<br><em>the Golden City.</em></h2><p>Find the room you love. We will help with the details of getting here.</p><div class="guest-closing__actions"><a class="button button--gold" href="#contact-status" data-booking-link aria-disabled="true" aria-describedby="contact-status">Book now ↗</a><a href="#contact-status" data-enquiry-link data-enquiry-message="Namaste Garh Jaisal Haveli, I would like to ask about room options and rates for my dates." aria-disabled="true" aria-describedby="contact-status" class="guest-hero__secondary">WhatsApp the hotel ↗</a></div></div></section>
</main>
HTML;
}

/** Reused across PHP routes instead of copying policy links into each static template. */
function guest_footer(): string {
    return <<<'HTML'
<footer class="site-footer guest-footer">
  <div class="site-footer__main wrap">
    <div class="footer-brand"><a class="brand brand--footer" href="index.php"><span class="brand__mark" aria-hidden="true">GJ</span><span class="brand__wordmark"><strong>GARH JAISAL</strong><small>HAVELI · JAISALMER</small></span></a><p>A heritage stay within the living Jaisalmer Fort.</p></div>
    <div class="footer-column"><h2>Stay &amp; discover</h2><a href="rooms.php">Rooms</a><a href="about.php">Our story</a><a href="gallery.php">Gallery</a><a href="experiences.php">Experiences</a><a href="dining.php">Dining</a><a href="journal.php">The journal</a></div>
    <div class="footer-column"><h2>Plan &amp; contact</h2><a href="directions.php">Getting here</a><a href="car-services.php">Car services</a><a href="#contact-status" data-booking-link aria-disabled="true" aria-describedby="contact-status">Book now ↗</a><a href="#contact-status" data-enquiry-link data-enquiry-message="Namaste Garh Jaisal Haveli, I have a question about a stay." aria-disabled="true" aria-describedby="contact-status">WhatsApp the hotel ↗</a><a href="#contact-status" data-contact-phone data-contact-prefix="Call" aria-disabled="true" aria-describedby="contact-status">Call the hotel</a><a href="#contact-status" data-contact-email data-contact-prefix="Email" aria-disabled="true" aria-describedby="contact-status">Email</a></div>
    <div class="footer-address"><h2>Find us</h2><p>Kotari Para, inside Jaisalmer Fort<br>Jaisalmer, Rajasthan 345001, India</p><a href="#contact-status" data-property-map-link aria-disabled="true" aria-describedby="contact-status" class="text-link text-link--light">Hotel location ↗</a><p class="guest-footer__note">Vehicles cannot reach the hotel door. <a href="directions.php">Read arrival guidance.</a></p></div>
  </div>
  <div class="site-footer__bottom wrap guest-footer__bottom"><span>© <span data-current-year>2026</span> Garh Jaisal Haveli</span><nav aria-label="Legal and guest policies"><a href="privacy-policy.php">Privacy</a><a href="booking-policy.php">Booking, cancellation &amp; refunds</a></nav><a href="#main">Back to top ↑</a></div>
</footer>
HTML;
}

function guest_contact_status(): string {
    return '<div class="contact-status-banner wrap" id="contact-status" role="status" aria-live="polite" hidden><strong>Contact options temporarily unavailable.</strong> Refresh and try again, or call the hotel using contact information already supplied to you.</div>';
}

function guest_simple_page(string $slug): string {
    if ($slug === 'journal') {
        return <<<'HTML'
<main id="main" tabindex="-1" class="guest-service-page">
  <section class="guest-service-hero wrap"><p class="eyebrow">Stories from Jaisalmer</p><h1>The Garh Jaisal<br><em>Journal.</em></h1><p>Practical local guidance for a slower, more memorable stay in the Golden City.</p></section>
  <section class="wrap guest-service-grid" aria-label="Explore our guides">
    <article><img src="assets/images/courtyard.jpg" width="2200" height="1467" loading="lazy" alt="Sandstone architectural details inside the haveli"><p class="eyebrow">Inside the fort</p><h2>Arriving at a living landmark</h2><p>Understand the final walk and what to confirm before setting out.</p><a href="directions.php">Read the arrival guide →</a></article>
    <article><img src="assets/images/rooms/sweet-purple.webp" width="2000" height="1333" loading="lazy" alt="Heritage room interior"><p class="eyebrow">Where to stay</p><h2>Choosing your room</h2><p>Take time to compare seven rooms and their documented features.</p><a href="rooms.php">Explore the rooms →</a></article>
    <article><img src="assets/images/legacy/camel-sunset.jpg" width="1366" height="768" loading="lazy" alt="Camels in the Thar Desert at sunset"><p class="eyebrow">Beyond the fort</p><h2>Desert, city &amp; culture</h2><p>Consider experiences at your own pace and confirm arrangements for your dates.</p><a href="experiences.php">Explore experiences →</a></article>
  </section><div class="wrap guest-service-note"><p>More original destination guides are in editorial preparation. Articles are published only after factual and editorial review.</p></div>
</main>
HTML;
    }
    if ($slug === 'car-services') {
        return <<<'HTML'
<main id="main" tabindex="-1" class="guest-service-page">
  <section class="guest-service-hero wrap"><p class="eyebrow">Transport planning</p><h1>Car services &amp;<br><em>the last mile.</em></h1><p>Arriving by train, plane or road? Ask us about current transport options and where your driver should stop before you set off.</p><a class="button button--dark" href="#contact-status" data-enquiry-link data-enquiry-message="Namaste Garh Jaisal Haveli, can you advise on current car or transfer arrangements, the pick-up/drop-off point, total cost and availability for my dates?" aria-disabled="true" aria-describedby="contact-status">Ask on WhatsApp ↗</a></section>
  <section class="wrap guest-service-grid" aria-label="Journey options">
    <article><h2>Railway station arrival</h2><p>Share your train details and preferred arrival time. Ask whether a suitable transfer can be arranged and request the current quote.</p></article>
    <article><h2>Airport arrival</h2><p>Confirm your airport, flight timing, the vehicle meeting point and whether collection is available for that date.</p></article>
    <article><h2>Local trips &amp; excursions</h2><p>Ask about possible vehicle arrangements, routes, driver availability and inclusions before agreeing to a trip.</p></article>
  </section>
  <section class="guest-arrival"><div class="wrap guest-arrival__inner"><div><p class="eyebrow eyebrow--light">Important for all arrivals</p><h2>The car cannot reach<br><em>our doorstep.</em></h2><p>The hotel is inside Jaisalmer Fort. Vehicles do not reach the hotel door; the final approach is on foot through historic lanes. Confirm the exact vehicle drop-off and meeting point before travelling.</p><a class="button button--gold" href="directions.php">Read the arrival guide ↗</a></div><img src="assets/images/directions/haveli-facade.webp" width="1200" height="800" loading="lazy" alt="Exterior of the heritage haveli"></div></section>
  <div class="wrap guest-service-note"><p><strong>Service note:</strong> Car or transfer availability, rates, vehicle types and accessibility assistance are not guaranteed by this page. Confirm arrangements directly with the hotel.</p></div>
</main>
HTML;
    }
    if ($slug === 'privacy-policy') {
        return <<<'HTML'
<main id="main" tabindex="-1" class="guest-policy wrap"><p class="eyebrow">Guest information</p><h1>Privacy information</h1><p><strong>Review before production publication:</strong> This describes the website features currently implemented; the property operator must verify its data-handling practices and applicable legal requirements.</p><h2>Information you provide</h2><p>When you use the website's stay enquiry form, you may provide your name, email, telephone number, dates, guest count, room preference and message. The server sends those details to the configured hotel email service. The form does not itself maintain a guest reservation database.</p><h2>External services</h2><p>Choosing an external booking provider, WhatsApp, Google Maps or other third-party service means that provider may handle information under its own privacy terms. The website also loads Google Fonts. Contact and booking links should be reviewed before sending sensitive information.</p><h2>Technical information</h2><p>Server and hosting systems may record standard access logs. The enquiry form uses a session cookie for security and request validation. Actual retention, access rights, contact details for privacy requests and any analytics settings must be confirmed by the property operator.</p><h2>Your questions</h2><p>Contact the hotel through the contact options on this site to request information about how your enquiry is handled. Do not include payment card details in free-text messages.</p></main>
HTML;
    }
    return <<<'HTML'
<main id="main" tabindex="-1" class="guest-policy wrap"><p class="eyebrow">Before you reserve</p><h1>Booking, cancellation &amp; refunds</h1><p><strong>Policy approval pending:</strong> No property-wide cancellation window, refund percentage or deadline has been verified for publication on this website.</p><h2>Check the terms for your reservation</h2><p>Before making any payment, review the rate conditions shown by the booking provider or the written terms shared by the hotel. Different dates, room types, promotions or booking channels may have different terms.</p><h2>Changes and cancellations</h2><p>Contact the hotel or the service through which you reserved, quoting your booking details. Eligibility for a change, cancellation or refund depends on the specific terms agreed at booking and applicable law.</p><h2>Refund enquiries</h2><p>Ask the booking provider or hotel to confirm the relevant process, timelines and payment method in writing. This website does not approve or issue refunds.</p><p><a href="rooms.php">Explore rooms →</a> &nbsp; <a href="booking.php">Send a stay enquiry →</a></p></main>
HTML;
}

/** Expand the existing small discovery dropdown without overcrowding the header. */
function guest_enhance_nav(string $html): string {
    $html = str_replace('href="gallery.php">Gallery</a>', 'href="gallery.php">Gallery</a><a href="journal.php">Journal</a><a href="car-services.php">Car services</a>', $html);
    return $html;
}

function guest_simple_document(string $slug): void {
    $titles = [
      'journal' => 'Jaisalmer Journal | Garh Jaisal Haveli',
      'car-services' => 'Car Services and Arrivals | Garh Jaisal Haveli',
      'privacy-policy' => 'Privacy Information | Garh Jaisal Haveli',
      'booking-policy' => 'Booking, Cancellation and Refunds | Garh Jaisal Haveli',
    ];
    if (!isset($titles[$slug])) { http_response_code(404); exit('Not found'); }
    // Reuse the established navigation and JS contact configuration rather than duplicate them.
    $home = (string) file_get_contents(dirname(__DIR__) . '/index.html');
    $start = strpos($home, '<body>');
    $mainStart = strpos($home, '<main id="main"');
    if ($start === false || $mainStart === false) { http_response_code(500); exit('Page layout unavailable'); }
    $bodyStart = substr($home, $start + 6, $mainStart - ($start + 6));
    $bodyStart = preg_replace('~href="(index|about|rooms|gallery|dining|directions|experiences|experience-details)\.html~', 'href="$1.php', $bodyStart);
    $head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#171b19"><title>' . hotel_escape($titles[$slug]) . '</title><meta name="description" content="Practical information about Garh Jaisal Haveli, staying in Jaisalmer Fort and planning your visit."><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/css/premium-guest-journey.css"><link rel="stylesheet" href="assets/css/php-upgrade.css"><link rel="stylesheet" href="assets/css/guest-first.css">';
    if (in_array($slug, ['privacy-policy','booking-policy'], true)) $head .= '<meta name="robots" content="noindex,follow">';
    $head .= '</head><body>';
    header('Content-Type: text/html; charset=UTF-8');
    echo $head . $bodyStart . guest_simple_page($slug) . guest_contact_status() . guest_footer()
       . '<div class="mobile-booking-bar"><span>Inside the Golden Fort</span><a href="#contact-status" data-booking-link aria-disabled="true" aria-describedby="contact-status">Book now ↗</a></div><script src="assets/site.js" defer></script></body></html>';
}
