<?php
declare(strict_types=1);
const HOTEL_NAME = 'Garh Jaisal Haveli';
function hotel_config(string $key): string {
    $value = getenv($key);
    return is_string($value) ? trim($value) : '';
}
function hotel_escape(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function hotel_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    if (headers_sent()) throw new RuntimeException('Session headers have already been sent.');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_set_cookie_params([
        'httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Lax', 'path' => '/'
    ]);
    session_start();
}
function hotel_csrf_token(): string {
    hotel_session();
    if (empty($_SESSION['hotel_csrf'])) $_SESSION['hotel_csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['hotel_csrf'];
}
function hotel_valid_date(string $value): bool {
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date !== false && $date->format('Y-m-d') === $value;
}
