<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
// Keep personal guest details and session-bound forms out of intermediary caches.
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD', 'POST'], true)) {
    header('Allow: GET, HEAD, POST');
    http_response_code(405);
    exit('Method not allowed');
}
hotel_session();
$errors = [];
$success = false;
$values = ['name'=>'','email'=>'','phone'=>'','arrival'=>'','departure'=>'','guests'=>'2','room'=>'','message'=>''];
$rooms = ['','Sweet Purple','Rising Sun','Scarlet','Opium','Red Maharani','Green','BlueSky','Not sure yet'];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    // Reject abusive requests before processing user-supplied values.
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 12000) {
        http_response_code(413);
        exit('Enquiry is too large.');
    }
    foreach ($values as $key => $default) {
        $field = $_POST[$key] ?? '';
        $values[$key] = is_string($field) ? trim($field) : '';
    }
    if (!is_string($_POST['csrf'] ?? null) || !hash_equals(hotel_csrf_token(), $_POST['csrf'])) $errors[] = 'Your session expired. Please refresh and try again.';
    if (!empty($_POST['website'])) $errors[] = 'Unable to accept this request.';
    if (strlen($values['name']) < 2 || strlen($values['name']) > 100) $errors[] = 'Enter a name between 2 and 100 characters.';
    if (!filter_var($values['email'], FILTER_VALIDATE_EMAIL) || strlen($values['email']) > 254) $errors[] = 'Enter a valid email address.';
    if (strlen($values['phone']) > 40 || preg_match('/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]/', $values['phone']) === 1) $errors[] = 'Phone number is too long.';
    if (!hotel_valid_date($values['arrival']) || !hotel_valid_date($values['departure'])) {
        $errors[] = 'Choose valid arrival and departure dates.';
    } else {
        $today = new DateTimeImmutable('today', new DateTimeZone('Asia/Kolkata'));
        $arrival = new DateTimeImmutable($values['arrival'], new DateTimeZone('Asia/Kolkata'));
        $departure = new DateTimeImmutable($values['departure'], new DateTimeZone('Asia/Kolkata'));
        if ($arrival < $today || $departure <= $arrival || $departure > $arrival->modify('+90 days')) $errors[] = 'Choose future dates with a stay of 1 to 90 nights.';
    }
    if (!ctype_digit($values['guests']) || (int)$values['guests'] < 1 || (int)$values['guests'] > 20) $errors[] = 'Choose 1–20 guests.';
    if (!in_array($values['room'], $rooms, true)) $errors[] = 'Select a valid room preference.';
    if (strlen($values['message']) > 2000) $errors[] = 'Keep your message under 2,000 characters.';
    hotel_session();
    $now = time();
    if ($now - (int)($_SESSION['hotel_last_enquiry'] ?? 0) < 60) $errors[] = 'Please wait a minute before sending another enquiry.';
    $recipient = hotel_config('HOTEL_ENQUIRY_EMAIL');
    $sender = hotel_config('HOTEL_SENDER_EMAIL');
    if (!filter_var($sender, FILTER_VALIDATE_EMAIL)) $sender = $recipient;
    if (!$errors && !filter_var($recipient, FILTER_VALIDATE_EMAIL)) $errors[] = 'Online enquiries are not configured yet. Please contact the hotel using its verified phone or WhatsApp channel.';
    if (!$errors) {
        // Throttle repeated attempts in this session even when mail transport fails.
        // A WAF/edge limit remains recommended against distributed abuse.
        $_SESSION['hotel_last_enquiry'] = $now;
        $safe = static fn (string $s): string => str_replace(["\r","\n"], ' ', $s);
        $body = "New website stay enquiry\n\n";
        foreach ($values as $key => $value) $body .= ucfirst($key) . ': ' . $safe($value) . "\n";
        $body .= "\nThis is an enquiry, not a confirmed booking.\n";
        $sent = @mail($recipient, 'Garh Jaisal Haveli - Stay Enquiry', $body,
            "From: ".$safe($sender)."\r\n".
            "Reply-To: ".$safe($values['email'])."\r\n".
            "Content-Type: text/plain; charset=UTF-8");
        if ($sent) {
            $_SESSION['hotel_last_enquiry'] = $now;
            $_SESSION['hotel_enquiry_success'] = true;
            $_SESSION['hotel_csrf'] = bin2hex(random_bytes(32));
            header('Location: booking.php?sent=1', true, 303);
            exit;
        }
        $errors[] = 'The server could not hand off your enquiry email. Please use the hotel’s verified contact channel instead.';
    }
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && ($_GET['sent'] ?? '') === '1') {
    $success = !empty($_SESSION['hotel_enquiry_success']);
    unset($_SESSION['hotel_enquiry_success']);
}
$csrf = hotel_csrf_token();
$emailConfigured = filter_var(hotel_config('HOTEL_ENQUIRY_EMAIL'), FILTER_VALIDATE_EMAIL) !== false;
$minimumDate = (new DateTimeImmutable('today', new DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
$publicContact = json_decode((string) @file_get_contents(__DIR__ . '/content/site-config.json'), true);
$whatsappUrl = '';
if (is_array($publicContact)
    && ($publicContact['contact']['status'] ?? '') === 'source-authorized') {
    $candidate = $publicContact['contact']['whatsappBaseUrl'] ?? '';
    if (is_string($candidate) && preg_match('~^https://wa\\.me/[1-9][0-9]{7,14}$~D', $candidate)) {
        $whatsappUrl = $candidate . '?text=' . rawurlencode('Namaste Garh Jaisal Haveli, I would like to enquire about room availability and rates for my dates.');
    }
}

function old_value(array $values, string $key): string { return hotel_escape($values[$key] ?? ''); }
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enquire About Your Stay | Garh Jaisal Haveli</title>
<meta name="description" content="Ask Garh Jaisal Haveli about heritage room options and stay dates inside Jaisalmer Fort. Enquiries are not confirmed reservations.">
<meta name="robots" content="noindex,follow">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/css/php-upgrade.css">
</head><body><a class="skip-link" href="#main">Skip to content</a>
<header class="site-header hotel-booking-header"><a class="brand" href="index.php" aria-label="Garh Jaisal Haveli home"><span class="brand__mark">GJ</span><span class="brand__wordmark"><strong>GARH JAISAL</strong><small>HAVELI · JAISALMER</small></span></a>
<nav class="hotel-booking-nav" aria-label="Booking page navigation"><a href="index.php">Home</a><a href="rooms.php">Rooms</a><a href="directions.php">Find us</a></nav></header>
<main id="main" class="hotel-booking"><div class="hotel-booking__inner"><div><p class="eyebrow">Your heritage stay, thoughtfully planned</p><h1>Enquire about <em>your stay.</em></h1><p>Tell us your preferred dates and room. The hotel team can respond with current room options and rates once your enquiry reaches their configured email.</p><p class="hotel-booking__quick-actions"><a href="#stay-enquiry-form" class="hotel-booking__quick-link">Go to stay enquiry form ↓</a><?php if ($whatsappUrl !== ''): ?><a href="<?= hotel_escape($whatsappUrl) ?>" target="_blank" rel="noopener noreferrer" class="hotel-booking__whatsapp-link">Enquire on WhatsApp ↗</a><?php endif; ?></p><p><strong>Important:</strong> This form requests information only. It does not check live availability or create a reservation. Wait for direct written confirmation from the hotel before making travel arrangements.</p><p><a href="rooms.php">Explore all seven rooms →</a></p><p><a href="directions.php">Plan your arrival inside Jaisalmer Fort →</a></p></div><div class="hotel-form" id="stay-enquiry-form">
<?php if (!$emailConfigured): ?><div class="hotel-alert" role="status"><strong>Email enquiries are not configured on this server yet.</strong><p>The hotel must configure HOTEL_ENQUIRY_EMAIL before this form can send requests. <?php if ($whatsappUrl !== ''): ?><a href="<?= hotel_escape($whatsappUrl) ?>" target="_blank" rel="noopener noreferrer">Enquire via WhatsApp instead ↗</a><?php else: ?>The original contact and booking options remain on the main website.<?php endif; ?></p></div><?php endif; ?>
<?php if ($success): ?><div class="hotel-alert hotel-alert--success" role="status"><strong>Your request was submitted to the server's mail service.</strong><p>It is not a reservation. Email delivery and a reply from the hotel are not guaranteed; please contact the hotel if you do not receive a response.</p></div><?php endif; ?>
<?php if ($errors): ?><div class="hotel-alert" role="alert"><strong>We couldn't submit your enquiry.</strong><ul><?php foreach ($errors as $error): ?><li><?= hotel_escape($error) ?></li><?php endforeach; ?></ul></div><?php endif; ?>
<form method="post" action="booking.php" class="hotel-form__form"><input type="hidden" name="csrf" value="<?= hotel_escape($csrf) ?>"><div class="honeypot" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="hotel-form__grid"><div class="field"><label for="name">Your name *</label><input id="name" name="name" maxlength="100" required autocomplete="name" value="<?= old_value($values,'name') ?>"></div>
<div class="field"><label for="email">Email *</label><input id="email" type="email" name="email" maxlength="254" required autocomplete="email" value="<?= old_value($values,'email') ?>"></div>
<div class="field"><label for="phone">Phone (optional)</label><input id="phone" type="tel" name="phone" maxlength="40" autocomplete="tel" value="<?= old_value($values,'phone') ?>"></div>
<div class="field"><label for="guests">Guests *</label><input id="guests" type="number" name="guests" min="1" max="20" required value="<?= old_value($values,'guests') ?>"></div>
<div class="field"><label for="arrival">Check-in *</label><input id="arrival" type="date" name="arrival" required min="<?= hotel_escape($minimumDate) ?>" value="<?= old_value($values,'arrival') ?>"></div>
<div class="field"><label for="departure">Check-out *</label><input id="departure" type="date" name="departure" required min="<?= hotel_escape($minimumDate) ?>" value="<?= old_value($values,'departure') ?>"></div></div>
<div class="field"><label for="room">Preferred room</label><select id="room" name="room"><?php foreach ($rooms as $room): ?><option value="<?= hotel_escape($room) ?>" <?= $values['room'] === $room ? 'selected' : '' ?>><?= hotel_escape($room === '' ? 'Select a room (optional)' : $room) ?></option><?php endforeach; ?></select></div>
<div class="field"><label for="message">Anything else we should know?</label><textarea id="message" name="message" maxlength="2000"><?= old_value($values,'message') ?></textarea></div>
<button type="submit" <?= $emailConfigured ? "" : "disabled aria-disabled=\"true\"" ?>>Send stay enquiry ↗</button><p style="font-size:.8rem">By submitting, you request a reply about your stay. Your details are emailed to the hotel when email is configured. No room is reserved by this form.</p></form></div></div></main><footer style="padding:2rem;text-align:center;background:#171b19;color:#fff">Garh Jaisal Haveli · Inside Jaisalmer Fort · <a style="color:#e9cb92" href="index.php">Return home</a></footer></body></html>
