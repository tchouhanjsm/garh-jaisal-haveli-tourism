#!/usr/bin/env python3
"""Real Chromium smoke tests for the static guest journey.

By default these checks use a temporary local HTTP server. An explicit, guarded
HTTPS staging mode is read-only and records machine evidence without completing
human UAT, following external links, or submitting guest data.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, urlsplit
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = [
    "index.html",
    "rooms.html",
    "experiences.html",
    "dining.html",
    "about.html",
    "directions.html",
    "gallery.html",
]
VIEWPORTS = [(360, 800), (768, 1024), (1440, 900)]
FAILURES: list[str] = []
RUNTIME_ERRORS: list[str] = []
HTTP_ERRORS: list[str] = []
FAILED_REQUESTS: list[str] = []
MIXED_CONTENT_ERRORS: list[str] = []
CROSS_ORIGIN_NAVIGATION_ERRORS: list[str] = []
PAGES_ATTEMPTED: list[str] = []
PAGES_HTTP_OK: list[str] = []
VIEWPORTS_COMPLETED: list[int] = []


def origin_key(value: str) -> tuple[str, str, int | None] | None:
    try:
        parts = urlsplit(value)
        scheme = parts.scheme.lower()
        host = (parts.hostname or "").rstrip(".").lower()
        port = parts.port
    except ValueError:
        return None
    if not scheme or not host:
        return None
    if port is None:
        port = 443 if scheme == "https" else 80 if scheme == "http" else None
    return scheme, host, port


def same_origin(value: str, base_url: str) -> bool:
    value_origin = origin_key(value)
    base_origin = origin_key(base_url)
    return value_origin is not None and value_origin == base_origin


def safe_url_label(value: str) -> str:
    """Remove query and fragment values before writing a URL into logs or evidence."""
    try:
        parts = urlsplit(value)
    except ValueError:
        return "<invalid URL>"
    if not parts.scheme or not parts.netloc:
        return value.split("?", 1)[0].split("#", 1)[0]
    safe_netloc = parts.netloc.rsplit("@", 1)[-1]
    return f"{parts.scheme}://{safe_netloc}{parts.path}"


def sanitize_diagnostic_text(value: object) -> str:
    """Remove URL credentials, query strings and fragments from diagnostics."""
    url_pattern = re.compile(r"https?://[^\\s\\\"'<>]+", re.IGNORECASE)
    return url_pattern.sub(lambda match: safe_url_label(match.group(0)), str(value))


def is_actionable_request_failure(failure: str | None) -> bool:
    # Chromium reports navigation-cancelled lazy image requests as ERR_ABORTED;
    # HTTP 4xx/5xx responses are separately captured by the response listener.
    return failure is None or "ERR_ABORTED" not in failure


def install_navigation_guard(context, base_url: str) -> None:
    """Block top-level or frame navigation away from the requested site origin."""
    def guard(route) -> None:
        request = route.request
        if request.is_navigation_request() and not same_origin(request.url, base_url):
            CROSS_ORIGIN_NAVIGATION_ERRORS.append(f"Blocked cross-origin navigation request: {safe_url_label(request.url)}")
            route.abort()
            return
        route.continue_()

    context.route("**/*", guard)


def validate_staging_target(raw_url: str, operator: str, report_path: str) -> str:
    """Validate a staging-only HTTPS origin before any browser/network request."""
    if not raw_url or not raw_url.strip():
        raise ValueError("provide an explicit staging base URL")
    if not operator or not operator.strip():
        raise ValueError("an operator name is required for a staging evidence report")
    if not report_path or not report_path.strip():
        raise ValueError("a JSON report path is required for a staging run")
    if Path(report_path).suffix.lower() != ".json":
        raise ValueError("the evidence report path must end in .json")

    try:
        parts = urlsplit(raw_url.strip())
        hostname = (parts.hostname or "").rstrip(".").lower()
        port = parts.port
    except ValueError as error:
        raise ValueError(f"invalid staging URL: {error}") from error

    if parts.scheme.lower() != "https":
        raise ValueError("staging preflight requires HTTPS; HTTP targets are refused")
    if not hostname:
        raise ValueError("staging URL must include a hostname")
    if parts.username is not None or parts.password is not None:
        raise ValueError("credentials in the staging URL are not allowed")
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        raise ValueError("provide only the staging origin; paths, queries and fragments are refused")
    if hostname == "localhost" or hostname.endswith(".localhost") or hostname.endswith(".local"):
        raise ValueError("local/private hostnames are not valid staging targets")
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise ValueError("staging preflight requires a hostname, not an IP address")

    config_path = ROOT / "content" / "site-config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    site = config.get("site", {})
    production_hosts = set()
    for key in ("legacyProductionUrl", "newStaticSiteCanonicalHost"):
        value = site.get(key)
        if isinstance(value, str) and value.strip():
            host = urlsplit(value).hostname
            if host:
                production_hosts.add(host.rstrip(".").lower())
    if hostname in production_hosts:
        raise ValueError("configured production hosts are refused by the staging-only preflight")

    if port == 0:
        raise ValueError("staging URL port must be between 1 and 65535")
    normalized_host = hostname if port in (None, 443) else f"{hostname}:{port}"
    return f"https://{normalized_host}/"


def resolve_http_credentials(username: str | None, password: str | None) -> dict[str, str] | None:
    """Read optional Basic Auth credentials without placing them in URLs or reports."""
    if bool(username) != bool(password):
        raise ValueError("set both STAGING_BASIC_AUTH_USERNAME and STAGING_BASIC_AUTH_PASSWORD, or neither")
    if username is None and password is None:
        return None
    if not username or not password:
        raise ValueError("staging Basic Auth username and password must both be non-empty")
    return {"username": username, "password": password}


def build_report(mode: str, base_url: str, operator: str | None,
                 browser_version: str | None, failures: list[str],
                 pages_attempted: list[str] | None = None,
                 pages_http_ok: list[str] | None = None,
                 completed_viewports: list[int] | None = None,
                 blocked_navigation_attempts: list[str] | None = None) -> dict:
    manual_checks = [
        ("STG-01", "Human desktop guest journey: Home, Rooms, Experiences, Dining and Directions"),
        ("STG-02", "Human mobile guest journey and tap-target review"),
        ("STG-03", "Human network-panel check for missing assets and mixed content"),
        ("STG-04", "Human keyboard focus, menu Escape and reduced-motion review"),
        ("STG-05", "Human review of page metadata and social previews"),
        ("STG-06", "AsiaTech booking flow in a normal desktop browser"),
        ("STG-07", "AsiaTech booking flow in a normal mobile browser"),
        ("STG-08", "WhatsApp business-account reachability and response"),
        ("STG-09", "Primary phone answered by the intended operator"),
        ("STG-10", "Alternate landline answered by the intended operator"),
        ("STG-11", "Email delivery, no bounce and reply capability"),
        ("STG-12", "Owner confirmation of current room, tour, dining and arrival facts"),
        ("STG-13", "Backup and rollback procedure reviewed"),
        ("STG-14", "Human image crop/layout review at mobile, tablet and desktop sizes"),
        ("STG-15", "Keyboard-only use of all six experience galleries"),
        ("STG-16", "Human reduced-motion, carousel and layout-stability review"),
        ("STG-17", "Human review of social previews on the staging host"),
    ]
    return {
        "schemaVersion": 1,
        "mode": mode,
        "targetUrl": base_url,
        "recordedAtAsiaKolkata": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"),
        "operator": operator.strip() if operator else None,
        "browser": {"name": "Chromium", "version": browser_version or "not started"},
        "pagesPlanned": list(PAGES),
        "pagesAttempted": list(pages_attempted or []),
        "pagesWithHttp200OnTargetOrigin": list(pages_http_ok or []),
        "plannedViewportWidthsCssPixels": [width for width, _ in VIEWPORTS],
        "completedResponsiveViewportWidthsCssPixels": list(completed_viewports or []),
        "automatedResult": "PASS" if not failures else "FAIL",
        "automatedFailureCount": len(failures),
        "automatedFailures": [sanitize_diagnostic_text(item) for item in failures],
        "crossOriginNavigationAttemptsBlocked": [sanitize_diagnostic_text(item) for item in (blocked_navigation_attempts or [])],
        "manualReleaseChecks": [
            {"id": check_id, "check": name, "result": "NOT RUN",
             "note": "Requires a human operator; automated browser smoke does not follow external links or submit data."}
            for check_id, name in manual_checks
        ],
        "releaseStatus": "BLOCKED_PENDING_MANUAL_UAT",
        "safety": {
            "externalLinkNavigationPerformed": False,
            "bookingOrPaymentSubmitted": False,
            "guestDataSubmitted": False,
            "contactMessageSent": False,
        },
    }


def write_report(report_path: str, report: dict) -> Path:
    destination = Path(report_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return destination


def check(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)


def start_server() -> tuple[subprocess.Popen[bytes], str]:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "http.server",
            str(port),
            "--bind",
            "127.0.0.1",
            "--directory",
            str(ROOT),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError("Temporary static HTTP server exited before becoming ready")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return server, f"http://127.0.0.1:{port}/"
        except OSError:
            time.sleep(0.1)
    server.terminate()
    raise RuntimeError("Temporary static HTTP server did not become ready within 10 seconds")


def load_visible_images(page, page_name: str, base_url: str) -> None:
    images = page.locator("img")
    local_host = urlparse(base_url).netloc
    for index in range(images.count()):
        image = images.nth(index)
        if not image.is_visible():
            # The inactive carousel slide is checked after the browser advances it.
            continue
        try:
            image.scroll_into_view_if_needed(timeout=3000)
            details = image.evaluate(
                """async (img) => {
                  img.loading = 'eager';
                  try { await img.decode(); } catch (_) {}
                  return {
                    currentSrc: img.currentSrc,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    alt: img.getAttribute('alt')
                  };
                }"""
            )
        except Exception as error:  # keep reporting useful failures across all pages
            check(False, f"{page_name}: image {index + 1} could not be inspected: {error}")
            continue
        check(details["width"] > 0 and details["height"] > 0,
              f"{page_name}: image {index + 1} did not decode: {details['currentSrc']}")
        check(details["alt"] is not None,
              f"{page_name}: image {index + 1} is missing its alt attribute")
        source_host = urlparse(details["currentSrc"]).netloc
        check(source_host == local_host,
              f"{page_name}: browser selected a non-local image source: {details['currentSrc']}")


def check_page_contract(page, page_name: str, titles: dict[str, str]) -> None:
    title = page.title().strip()
    description = page.locator('meta[name="description"]').get_attribute("content") or ""
    check(bool(title), f"{page_name}: browser DOM has no title")
    check(bool(description.strip()), f"{page_name}: browser DOM has no meta description")
    check(110 <= len(description.strip()) <= 165,
          f"{page_name}: browser meta description must be 110–165 characters (found {len(description.strip())})")
    check(title not in titles, f"{page_name}: title duplicates {titles.get(title, '')}")
    if title:
        titles[title] = page_name
    check(page.locator("main#main").count() == 1, f"{page_name}: expected exactly one main#main")
    check(page.locator("main#main").get_attribute("tabindex") == "-1",
          f"{page_name}: main must be programmatically focusable as the skip-link destination")
    check(page.locator("main h1").count() == 1, f"{page_name}: expected exactly one main h1")

    active = page.locator('#primary-navigation a[aria-current="page"]')
    check(active.count() == 1, f"{page_name}: primary navigation must identify one current page")
    if active.count() == 1:
        check(active.get_attribute("href") == page_name,
              f"{page_name}: aria-current navigation link must point to the current page")

    og_image = page.locator('meta[property="og:image"]').get_attribute("content")
    twitter_image = page.locator('meta[name="twitter:image"]').get_attribute("content")
    og_alt = page.locator('meta[property="og:image:alt"]').get_attribute("content")
    twitter_alt = page.locator('meta[name="twitter:image:alt"]').get_attribute("content")
    check(bool(og_image) and og_image == twitter_image,
          f"{page_name}: Twitter and Open Graph image paths must match")
    check(bool(og_alt and og_alt.strip()) and og_alt == twitter_alt,
          f"{page_name}: Twitter and Open Graph image alt text must match")
    check(page.locator('link[rel="canonical"]').count() == 0,
          f"{page_name}: canonical must remain gated pending host approval")
    check(page.locator('meta[property="og:url"]').count() == 0,
          f"{page_name}: og:url must remain gated pending host approval")


def check_contact_hydration(page, base_url: str) -> None:
    page.goto(base_url + "index.html", wait_until="domcontentloaded", timeout=15000)
    page.wait_for_function(
        """() => {
          const booking = document.querySelector('[data-booking-link]');
          return booking && booking.href.startsWith('https://asiatech.in/booking_engine/index3?token=');
        }""",
        timeout=7000,
    )
    booking = page.locator("[data-booking-link]").first
    check(booking.get_attribute("target") == "_blank", "Book Now must open the external provider in a new tab")
    check(set((booking.get_attribute("rel") or "").split()) >= {"noopener", "noreferrer"},
          "Book Now must protect the new tab with noopener/noreferrer")
    whatsapp = page.locator("[data-enquiry-link]").first
    check((urlparse(whatsapp.get_attribute("href") or "").hostname or "").lower() == "wa.me",
          "WhatsApp must hydrate from the central config")
    check(page.locator("[data-contact-phone]").first.get_attribute("href") == "tel:+917727047567",
          "Primary phone must hydrate from the central config")
    check(page.locator("[data-contact-alt-phone]").first.get_attribute("href") == "tel:+912992253836",
          "Alternate landline must hydrate from the central config")
    check(page.locator("[data-contact-email]").first.get_attribute("href") == "mailto:info@hotelgarhjaisal.com",
          "Email must hydrate from the central config")
    # This test only inspects links; it never navigates to the provider or submits guest data.


def check_staging_publication_guards(page, base_url: str) -> None:
    def fetch_text(path: str) -> str:
        try:
            response = page.request.get(base_url + path, timeout=10000, max_redirects=0)
        except Exception as error:
            check(False, f"{path}: same-origin staging request failed: {error}")
            return ""
        check(response.status == 200, f"{path}: expected HTTP 200 on the target site (found {response.status})")
        return response.text() if response.status == 200 else ""

    robots = fetch_text("robots.txt")
    sitemap = fetch_text("sitemap.xml")
    config_text = fetch_text("content/site-config.json")

    check(bool(re.search(r"(?im)^\s*User-agent:\s*\*\s*$", robots)),
          "robots.txt must explicitly identify all crawlers while staging")
    check(bool(re.search(r"(?im)^\s*Disallow:\s*/\s*$", robots)),
          "robots.txt must continue blocking indexing on the pre-launch staging site")
    check(not re.search(r"(?im)^\s*Sitemap\s*:", robots),
          "robots.txt must not advertise a sitemap before canonical-host approval")
    check(bool(re.search(r"<urlset\b", sitemap, re.I)), "sitemap.xml must return a valid URL-set document")
    check(not re.search(r"<loc>\s*https?://", sitemap, re.I),
          "sitemap.xml must not publish public URLs before canonical-host approval")
    try:
        config = json.loads(config_text)
    except json.JSONDecodeError as error:
        check(False, f"content/site-config.json is not valid JSON on the target site: {error}")
    else:
        check(config.get("site", {}).get("canonicalHostApproved") is False,
              "canonicalHostApproved must remain false until explicit owner approval")


def check_responsive_layout(page, base_url: str) -> None:
    for width, height in VIEWPORTS:
        page.set_viewport_size({"width": width, "height": height})
        for page_name in PAGES:
            response = page.goto(base_url + page_name, wait_until="domcontentloaded", timeout=15000)
            check(response is not None and response.status == 200,
                  f"{page_name} at {width}px: expected HTTP 200")
            if response is not None:
                check(same_origin(response.url, base_url),
                      f"{page_name} at {width}px: navigation redirected away from the requested site origin")
            page.wait_for_selector("main#main", timeout=5000)
            page.wait_for_timeout(80)
            dimensions = page.evaluate(
                """() => ({
                  viewport: window.innerWidth,
                  document: document.documentElement.scrollWidth,
                  body: document.body.scrollWidth
                })"""
            )
            check(dimensions["document"] <= width + 2 and dimensions["body"] <= width + 2,
                  f"{page_name} at {width}px: horizontal overflow ({dimensions})")
            if width == 360:
                bar = page.locator(".mobile-booking-bar")
                check(bar.is_visible(), f"{page_name}: mobile Book Now bar must be visible at 360px")
                box = bar.bounding_box()
                if box:
                    check(box["x"] >= -1 and box["x"] + box["width"] <= width + 1,
                          f"{page_name}: mobile booking bar exceeds viewport width")
                    check(box["y"] >= -1 and box["y"] + box["height"] <= height + 1,
                          f"{page_name}: mobile booking bar is outside the viewport")
            if width == 1440:
                check(page.locator("#primary-navigation").is_visible(),
                      f"{page_name}: desktop primary navigation must be visible")
                check(not page.locator(".menu-toggle").is_visible(),
                      f"{page_name}: mobile menu toggle must be hidden at desktop width")
        VIEWPORTS_COMPLETED.append(width)


def check_keyboard_navigation(page, base_url: str) -> None:
    page.set_viewport_size({"width": 360, "height": 800})
    page.goto(base_url + "index.html", wait_until="domcontentloaded", timeout=15000)
    page.keyboard.press("Tab")
    focused_skip = page.evaluate(
        """() => {
          const el = document.activeElement;
          if (!el || !el.classList.contains('skip-link')) return false;
          const box = el.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight;
        }"""
    )
    check(focused_skip, "Keyboard Tab must reveal and focus the skip-to-content link")
    page.keyboard.press("Enter")
    check(page.evaluate("document.activeElement === document.querySelector('main#main')"),
          "Activating Skip to content must move keyboard focus to main content")

    toggle = page.locator(".menu-toggle")
    check(toggle.is_visible(), "Mobile navigation toggle must be visible at 360px")
    toggle.click()
    check(toggle.get_attribute("aria-expanded") == "true", "Opening mobile navigation must update aria-expanded")
    check(page.locator("#primary-navigation").evaluate("(nav) => nav.classList.contains('is-open')"),
          "Opening mobile navigation must expose the navigation panel")
    page.keyboard.press("Escape")
    check(toggle.get_attribute("aria-expanded") == "false", "Escape must close mobile navigation")
    check(page.evaluate("document.activeElement === document.querySelector('.menu-toggle')"),
          "Escape must restore focus to the menu toggle")

    page.emulate_media(reduced_motion="reduce")
    scroll_behavior = page.evaluate("getComputedStyle(document.documentElement).scrollBehavior")
    check(scroll_behavior == "auto", "Reduced-motion mode must disable smooth scrolling")
    page.emulate_media(reduced_motion="no-preference")

    toggle.click()
    page.locator('#primary-navigation a[href="rooms.html"]').click()
    page.wait_for_url("**/rooms.html", timeout=7000)
    check(page.locator('#primary-navigation a[aria-current="page"]').get_attribute("href") == "rooms.html",
          "Selecting Rooms from the mobile navigation must reach the Rooms page")


def check_carousels(page, base_url: str, browser,
                    http_credentials: dict[str, str] | None = None) -> None:
    page.set_viewport_size({"width": 360, "height": 800})
    page.goto(base_url + "experiences.html", wait_until="domcontentloaded", timeout=15000)
    cards = page.locator("[data-experience-carousel]")
    check(cards.count() == 6, "Experiences page must render all six source-listed galleries")

    for index in range(cards.count()):
        card = cards.nth(index)
        label = card.get_attribute("aria-label") or f"experience carousel {index + 1}"
        controls = card.locator("[data-carousel-controls]")
        try:
            controls.wait_for(state="visible", timeout=5000)
        except Exception as error:
            check(False, f"{label}: carousel controls did not become available: {error}")
            continue
        slides = card.locator("[data-carousel-slide]")
        check(slides.count() == 2, f"{label}: expected two distinct slides")
        status = card.locator("[data-carousel-status]")
        previous = card.locator("[data-carousel-previous]")
        next_button = card.locator("[data-carousel-next]")
        check(previous.get_attribute("type") == "button" and next_button.get_attribute("type") == "button",
              f"{label}: carousel controls must be non-submitting buttons")
        check(status.get_attribute("aria-live") == "polite" and status.get_attribute("aria-atomic") == "true",
              f"{label}: slide counter must expose a polite, atomic live status")

        next_button.focus()
        page.keyboard.press("Enter")
        check(status.inner_text().strip() == "Photo 2 of 2",
              f"{label}: Enter on the focused Next button must advance the live counter")
        check(next_button.evaluate("(el) => document.activeElement === el"),
              f"{label}: keyboard activation must preserve focus on the Next button")
        page.keyboard.press("Space")
        check(status.inner_text().strip() == "Photo 1 of 2",
              f"{label}: Space on the focused Next button must advance and wrap the live counter")
        check(next_button.evaluate("(el) => document.activeElement === el"),
              f"{label}: Space activation must preserve focus on the Next button")

        next_button.click()
        check(status.inner_text().strip() == "Photo 2 of 2", f"{label}: Next must advance the live counter")
        check(slides.nth(0).is_hidden() and slides.nth(1).is_visible(),
              f"{label}: Next must switch the visible slide")
        check(slides.nth(0).get_attribute("aria-hidden") == "true"
              and slides.nth(1).get_attribute("aria-hidden") == "false",
              f"{label}: slide visibility and aria-hidden state must stay synchronized")
        second_image = slides.nth(1).locator("img")
        try:
            second_image.scroll_into_view_if_needed(timeout=3000)
            details = second_image.evaluate(
                """async img => {
                  try { await img.decode(); } catch (_) {}
                  return {width: img.naturalWidth, height: img.naturalHeight, alt: img.getAttribute('alt')};
                }"""
            )
            check(details["width"] > 0 and details["height"] > 0,
                  f"{label}: second image must decode in the browser")
            check(bool(details["alt"] and details["alt"].strip()),
                  f"{label}: second image must have descriptive alt text")
        except Exception as error:
            check(False, f"{label}: second slide image failed inspection: {error}")

        next_button.click()
        check(status.inner_text().strip() == "Photo 1 of 2", f"{label}: Next must wrap from last to first")
        previous.click()
        check(status.inner_text().strip() == "Photo 2 of 2", f"{label}: Previous must wrap from first to last")
        previous.click()
        check(status.inner_text().strip() == "Photo 1 of 2", f"{label}: Previous must return to first slide")

    if cards.count():
        first_status = cards.nth(0).locator("[data-carousel-status]").inner_text()
        page.wait_for_timeout(1100)
        check(cards.nth(0).locator("[data-carousel-status]").inner_text() == first_status,
              "Experience galleries must not autoplay")

    no_js = browser.new_context(
        java_script_enabled=False,
        viewport={"width": 360, "height": 800},
        http_credentials=http_credentials,
    )
    install_navigation_guard(no_js, base_url)
    try:
        fallback = no_js.new_page()
        fallback.goto(base_url + "experiences.html", wait_until="domcontentloaded", timeout=15000)
        fallback_cards = fallback.locator("[data-experience-carousel]")
        check(fallback_cards.count() == 6, "No-JavaScript fallback must retain all six experience cards")
        for index in range(fallback_cards.count()):
            card = fallback_cards.nth(index)
            slides = card.locator("[data-carousel-slide]")
            check(slides.nth(0).is_visible(), f"Experience {index + 1}: first image must remain visible without JavaScript")
            check(slides.nth(1).is_hidden(), f"Experience {index + 1}: inactive image must remain hidden without JavaScript")
            check(card.locator("[data-carousel-controls]").is_hidden(),
                  f"Experience {index + 1}: nonfunctional carousel controls must remain hidden without JavaScript")
    finally:
        no_js.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Chromium smoke checks for the seven-page guest journey.")
    parser.add_argument("--base-url", help="HTTPS staging origin; omitted to run against a temporary local server")
    parser.add_argument("--operator", help="Human operator name recorded in a staging evidence report")
    parser.add_argument("--report", help="Local JSON evidence-report path (required with --base-url)")
    args = parser.parse_args(argv)
    staging_mode = bool(args.base_url)

    if staging_mode:
        if not args.operator or not args.report:
            parser.error("--operator and --report are required with --base-url")
        try:
            base_url = validate_staging_target(args.base_url, args.operator, args.report)
            http_credentials = resolve_http_credentials(
                os.environ.get("STAGING_BASIC_AUTH_USERNAME"),
                os.environ.get("STAGING_BASIC_AUTH_PASSWORD"),
            )
            if http_credentials:
                http_credentials["origin"] = base_url.rstrip("/")
        except ValueError as error:
            print(f"BLOCKED: staging target/auth rejected before any network request: {error}", file=sys.stderr)
            return 2
    else:
        if args.operator or args.report:
            parser.error("--operator and --report require --base-url")
        base_url = ""
        http_credentials = None

    server = None
    browser = None
    context = None
    browser_version = None
    try:
        if not staging_mode:
            server, base_url = start_server()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            browser_version = browser.version
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                http_credentials=http_credentials,
            )
            install_navigation_guard(context, base_url)
            page = context.new_page()
            page.on("pageerror", lambda error: RUNTIME_ERRORS.append(f"{safe_url_label(page.url)}: {error}"))

            def record_response(response) -> None:
                if same_origin(response.url, base_url) and response.status >= 400:
                    HTTP_ERRORS.append(f"HTTP {response.status}: {safe_url_label(response.url)}")

            def record_request(request) -> None:
                if staging_mode and urlsplit(request.url).scheme.lower() == "http":
                    MIXED_CONTENT_ERRORS.append(f"HTTP resource requested from HTTPS staging: {safe_url_label(request.url)}")

            def record_request_failed(request) -> None:
                if same_origin(request.url, base_url) and is_actionable_request_failure(request.failure):
                    FAILED_REQUESTS.append(f"{safe_url_label(request.url)}: {request.failure or 'request failed'}")

            page.on("response", record_response)
            page.on("request", record_request)
            page.on("requestfailed", record_request_failed)
            titles: dict[str, str] = {}
            for page_name in PAGES:
                before_errors = len(RUNTIME_ERRORS)
                PAGES_ATTEMPTED.append(page_name)
                response = page.goto(base_url + page_name, wait_until="domcontentloaded", timeout=15000)
                check(response is not None and response.status == 200, f"{page_name}: expected HTTP 200")
                if response is not None:
                    is_target_origin = same_origin(response.url, base_url)
                    check(is_target_origin,
                          f"{page_name}: navigation redirected away from the requested site origin")
                    if response.status == 200 and is_target_origin:
                        PAGES_HTTP_OK.append(page_name)
                page.wait_for_selector("main#main", timeout=5000)
                check_page_contract(page, page_name, titles)
                load_visible_images(page, page_name, base_url)
                page.evaluate("window.scrollTo(0, 0)")
                check(len(RUNTIME_ERRORS) == before_errors,
                      f"{page_name}: browser JavaScript exception(s): {RUNTIME_ERRORS[before_errors:]}")

            check_contact_hydration(page, base_url)
            check_staging_publication_guards(page, base_url)
            check_responsive_layout(page, base_url)
            check_keyboard_navigation(page, base_url)
            check_carousels(page, base_url, browser, http_credentials)
            context.close()
            context = None
            browser.close()
            browser = None

        for error in HTTP_ERRORS:
            FAILURES.append("Same-origin HTTP error: " + error)
        for error in FAILED_REQUESTS:
            FAILURES.append("Same-origin request failed: " + error)
        for error in MIXED_CONTENT_ERRORS:
            FAILURES.append(error)
        for error in CROSS_ORIGIN_NAVIGATION_ERRORS:
            FAILURES.append(error)
        for error in RUNTIME_ERRORS:
            FAILURES.append("Browser JavaScript exception: " + error)
    except Exception as error:
        FAILURES.append(f"Browser smoke suite could not complete: {type(error).__name__}: {error}")
    finally:
        if context is not None:
            context.close()
        if browser is not None:
            browser.close()
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)

    if staging_mode:
        report = build_report(
            "staging-read-only", base_url, args.operator, browser_version, FAILURES,
            PAGES_ATTEMPTED, PAGES_HTTP_OK, VIEWPORTS_COMPLETED, CROSS_ORIGIN_NAVIGATION_ERRORS,
        )
        try:
            destination = write_report(args.report, report)
            print(f"Staging preflight evidence written locally: {destination}")
        except Exception as error:
            FAILURES.append(f"Could not write the staging evidence report: {type(error).__name__}: {error}")

    # Failure output may be retained by CI or copied into an evidence report.
    # Sanitize all diagnostic URLs before either use, including exception messages.
    FAILURES[:] = [sanitize_diagnostic_text(item) for item in FAILURES]

    if FAILURES:
        print(f"FAIL: browser guest-journey smoke suite found {len(FAILURES)} issue(s)")
        for failure in FAILURES:
            print(" - " + failure)
        return 1

    mode_label = "staging" if staging_mode else "local"
    print(
        f"PASS: Chromium {mode_label} browser smoke suite covered seven pages, metadata ranges and parity, "
        "same-origin assets/publication guards, contact-link hydration, 360/768/1440px layout, "
        "keyboard/skip-link behavior, reduced motion, six galleries with keyboard activation, "
        "wraparound, no-autoplay and no-JavaScript fallback. "
        "No external links were followed and no booking, payment or guest data was submitted."
    )
    if staging_mode:
        print("Release remains BLOCKED until the human checks in the JSON report and launch checklist are completed.")
    else:
        print("This local-browser run is not staging UAT or live-channel verification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
