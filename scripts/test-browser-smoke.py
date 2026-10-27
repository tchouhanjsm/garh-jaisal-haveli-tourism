#!/usr/bin/env python3
"""Real Chromium smoke tests for the static guest journey.

By default these checks use a temporary local HTTP server. An explicit, guarded
HTTPS staging mode is read-only and records machine evidence without completing
human UAT, following external links, or submitting guest data.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, urlsplit
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROUTE_CONTRACT_PATH = ROOT / "content" / "staging-route-contract.json"
with ROUTE_CONTRACT_PATH.open("r", encoding="utf-8") as route_contract_file:
    ROUTE_CONTRACT = json.load(route_contract_file)
PAGES = [route["file"] for route in ROUTE_CONTRACT["routes"]]
VIEWPORTS = [
    (viewport["width"], viewport["height"])
    for viewport in ROUTE_CONTRACT["viewports"]
]
RESPONSIVE_AUDIT_VIEWPORTS = [
    (viewport["width"], viewport["height"])
    for viewport in ROUTE_CONTRACT["responsiveAuditViewports"]
]
NOT_FOUND_SMOKE_PATH = "__garh-jaisal-404-smoke-not-found-20261027__"
NOT_FOUND_RECOVERY_LINKS = ["/dining.html", "/directions.html", "/experiences.html", "/gallery.html", "/index.html", "/rooms.html"]
SCREENSHOT_EVIDENCE: list[dict] = []
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
    url_pattern = re.compile(r"""https?://[^\s"'<>]+""", re.IGNORECASE)
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
    report_destination = Path(report_path).expanduser().resolve()
    if report_destination == ROOT or ROOT in report_destination.parents:
        raise ValueError("write the evidence report outside the repository checkout to avoid accidental commits")

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


def validate_screenshot_directory(raw_path: str) -> Path:
    """Require an empty evidence directory outside the checkout before staging access."""
    if not raw_path or not raw_path.strip():
        raise ValueError("a screenshot evidence directory is required for staging mode")
    destination = Path(raw_path).expanduser().resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError("write screenshots outside the repository checkout to avoid accidental commits")
    if destination == Path(destination.anchor):
        raise ValueError("the filesystem root cannot be used as a screenshot directory")
    if destination.exists() and not destination.is_dir():
        raise ValueError("the screenshot evidence path must be a directory")
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("the screenshot evidence directory must be empty so old and new runs cannot be mixed")
    return destination


def expected_screenshot_names() -> list[str]:
    return [
        f"{Path(page_name).stem}-{width}px.png"
        for width, _ in VIEWPORTS
        for page_name in PAGES
    ]


def read_png_dimensions(path: Path) -> tuple[int, int]:
    """Read PNG geometry from its IHDR without requiring an image-processing package."""
    with path.open("rb") as image_file:
        header = image_file.read(24)
    if (len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n"
            or header[12:16] != b"IHDR"):
        raise ValueError("screenshot is not a valid PNG header")
    width = int.from_bytes(header[16:20], "big")
    height = int.from_bytes(header[20:24], "big")
    if width <= 0 or height <= 0:
        raise ValueError("screenshot has invalid pixel dimensions")
    return width, height


def resolve_http_credentials(username: str | None, password: str | None) -> dict[str, str] | None:
    """Read optional Basic Auth credentials without placing them in URLs or reports."""
    if bool(username) != bool(password):
        raise ValueError("set both STAGING_BASIC_AUTH_USERNAME and STAGING_BASIC_AUTH_PASSWORD, or neither")
    if username is None and password is None:
        return None
    if not username or not password:
        raise ValueError("staging Basic Auth username and password must both be non-empty")
    return {"username": username, "password": password}


def unknown_route_evidence_is_complete(evidence: object) -> bool:
    """Fail closed unless the branded 404 response is verified at every planned width."""
    if not isinstance(evidence, dict):
        return False
    if (evidence.get("path") != "/" + NOT_FOUND_SMOKE_PATH
            or evidence.get("expectedHttpStatus") != 404
            or evidence.get("recoveryLinks") != NOT_FOUND_RECOVERY_LINKS
            or evidence.get("complete") is not True):
        return False
    checks = evidence.get("viewportChecks")
    expected_widths = [width for width, _height in RESPONSIVE_AUDIT_VIEWPORTS]
    if not isinstance(checks, list) or len(checks) != len(expected_widths):
        return False
    required_flags = (
        "targetOrigin", "brandedRecoveryPage", "noindex",
        "rootRelativeAssets", "contactChannelsHydrated", "responsiveLayoutValid",
    )
    for record, expected_width in zip(checks, expected_widths):
        if not isinstance(record, dict) or record.get("viewportWidthCssPixels") != expected_width:
            return False
        if record.get("httpStatus") != 404:
            return False
        if record.get("recoveryLinks") != NOT_FOUND_RECOVERY_LINKS:
            return False
        if any(record.get(flag) is not True for flag in required_flags):
            return False
    return True


def build_report(mode: str, base_url: str, operator: str | None,
                 browser_version: str | None, failures: list[str],
                 pages_attempted: list[str] | None = None,
                 pages_http_ok: list[str] | None = None,
                 completed_viewports: list[int] | None = None,
                 blocked_navigation_attempts: list[str] | None = None,
                 screenshot_evidence: list[dict] | None = None,
                 unknown_route_evidence: dict | None = None) -> dict:
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
        ("STG-18", "Human unknown-route response and recovery navigation on the intended staging host"),
    ]
    planned_pages = list(PAGES)
    attempted_pages = list(pages_attempted or [])
    http_ok_pages = list(pages_http_ok or [])
    planned_viewports = [width for width, _ in RESPONSIVE_AUDIT_VIEWPORTS]
    completed_viewport_list = list(completed_viewports or [])

    evidence_failures: list[str] = []
    if attempted_pages != planned_pages:
        missing = [name for name in planned_pages if name not in attempted_pages]
        unexpected = [name for name in attempted_pages if name not in planned_pages]
        evidence_failures.append(
            f"Incomplete browser evidence: page navigation coverage does not match the {len(PAGES)} planned routes "
            f"(attempted {len(attempted_pages)}/{len(planned_pages)}; missing={missing}; unexpected={unexpected})."
        )
    if http_ok_pages != planned_pages:
        missing_ok = [name for name in planned_pages if name not in http_ok_pages]
        evidence_failures.append(
            "Incomplete browser evidence: HTTP 200 on the target origin was not recorded for every planned route "
            f"(successful {len(http_ok_pages)}/{len(planned_pages)}; missing={missing_ok})."
        )
    if completed_viewport_list != planned_viewports:
        evidence_failures.append(
            "Incomplete responsive evidence: completed viewport widths "
            f"{completed_viewport_list} do not match planned widths {planned_viewports}."
        )

    expected_screenshots = expected_screenshot_names()
    screenshot_records = list(screenshot_evidence or [])
    captured_names = [str(record.get("filename", "")) for record in screenshot_records]
    expected_viewports = {
        f"{Path(page_name).stem}-{width}px.png": (width, height)
        for width, height in VIEWPORTS
        for page_name in PAGES
    }
    screenshot_metadata_complete = (
        len(screenshot_records) == len(expected_screenshots)
        and all(
            record.get("filename") in expected_viewports
            and record.get("viewportWidthCssPixels") == expected_viewports.get(record.get("filename"), (None, None))[0]
            and record.get("viewportHeightCssPixels") == expected_viewports.get(record.get("filename"), (None, None))[1]
            and record.get("imageWidthPixels") == expected_viewports.get(record.get("filename"), (None, None))[0]
            and isinstance(record.get("imageHeightPixels"), int)
            and record.get("imageHeightPixels", 0) > 0
            and isinstance(record.get("bytes"), int)
            and record.get("bytes", 0) > 0
            and isinstance(record.get("sha256"), str)
            and re.fullmatch(r"[0-9a-f]{64}", record.get("sha256", "")) is not None
            and record.get("fullPage") is True
            for record in screenshot_records
        )
    )
    screenshot_complete = captured_names == expected_screenshots and screenshot_metadata_complete
    if not screenshot_complete:
        evidence_failures.append(
            f"Incomplete visual evidence: expected {len(expected_screenshots)} full-page PNG screenshots "
            f"({len(PAGES)} routes at {', '.join(str(width) for width, _ in VIEWPORTS)} CSS pixels) "
            f"in the planned order; captured {len(screenshot_records)}/{len(expected_screenshots)} with valid geometry and SHA-256."
        )

    unknown_route_complete = unknown_route_evidence_is_complete(unknown_route_evidence)
    if not unknown_route_complete:
        evidence_failures.append(
            "Incomplete unknown-route evidence: the branded recovery page must return HTTP 404, "
            "load root-relative assets and configured contact actions, expose all six recovery routes, "
            "and fit at all six responsive-audit widths (320, 360, 390, 768, 1280 and 1440 CSS pixels)."
        )

    reported_failures = [
        sanitize_diagnostic_text(item) for item in [*failures, *evidence_failures]
    ]
    page_attempts_complete = attempted_pages == planned_pages
    page_http_complete = http_ok_pages == planned_pages
    viewport_complete = completed_viewport_list == planned_viewports
    evidence_complete = (page_attempts_complete and page_http_complete and viewport_complete
                         and screenshot_complete and unknown_route_complete)

    return {
        "schemaVersion": 4,
        "mode": mode,
        "targetUrl": base_url,
        "recordedAtAsiaKolkata": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"),
        "operator": operator.strip() if operator else None,
        "browser": {"name": "Chromium", "version": browser_version or "not started"},
        "pagesPlanned": planned_pages,
        "pagesAttempted": attempted_pages,
        "pagesWithHttp200OnTargetOrigin": http_ok_pages,
        "plannedViewportWidthsCssPixels": planned_viewports,
        "completedResponsiveViewportWidthsCssPixels": completed_viewport_list,
        "evidenceCoverage": {
            "pageNavigationComplete": page_attempts_complete,
            "pageHttp200Complete": page_http_complete,
            "responsiveViewportsComplete": viewport_complete,
            "unknownRouteRecoveryComplete": unknown_route_complete,
            "complete": evidence_complete,
        },
        "automatedResult": "PASS" if not reported_failures else "FAIL",
        "automatedFailureCount": len(reported_failures),
        "automatedFailures": reported_failures,
        "unknownRouteEvidence": unknown_route_evidence or {
            "path": "/" + NOT_FOUND_SMOKE_PATH,
            "expectedHttpStatus": 404,
            "recoveryLinks": [],
            "viewportChecks": [],
            "complete": False,
        },
        "visualEvidence": {
            "required": mode == "staging-read-only",
            "captureMode": "full-page PNG",
            "expectedScreenshotCount": len(expected_screenshots),
            "capturedScreenshotCount": len(screenshot_records),
            "complete": screenshot_complete,
            "capturedFiles": screenshot_records,
        },
        "crossOriginNavigationAttemptsBlocked": [
            sanitize_diagnostic_text(item) for item in (blocked_navigation_attempts or [])
        ],
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


def capture_visual_evidence(page, page_name: str, width: int, height: int,
                            screenshots_dir: Path) -> None:
    """Capture a full-page PNG after requesting image/font readiness and record its integrity."""
    filename = f"{Path(page_name).stem}-{width}px.png"
    destination = screenshots_dir / filename
    try:
        page.evaluate(
            """async () => {
              await document.fonts.ready;
              const images = Array.from(document.images);
              for (const image of images) image.loading = 'eager';
              const decodeResults = await Promise.all(images.map(async image => {
                try {
                  await image.decode();
                  return {src: image.currentSrc || image.src, ok: image.naturalWidth > 0 && image.naturalHeight > 0};
                } catch (error) {
                  return {src: image.currentSrc || image.src, ok: false, reason: String(error)};
                }
              }));
              const failedImages = decodeResults.filter(result => !result.ok);
              if (failedImages.length) {
                throw new Error('image decode/intrinsic-size failure (' + failedImages.length + '/' + decodeResults.length + '): '
                  + failedImages.map(result => result.src.split('/').pop() + (result.reason ? ' [' + result.reason + ']' : '')).join(', '));
              }
              window.scrollTo(0, 0);
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }"""
        )
        page.screenshot(path=str(destination), full_page=True, animations="disabled", timeout=20000)
        payload = destination.read_bytes()
        image_width, image_height = read_png_dimensions(destination)
        if image_width != width:
            raise ValueError(f"expected screenshot width {width}px, found {image_width}px")
        SCREENSHOT_EVIDENCE.append({
            "filename": filename,
            "viewportWidthCssPixels": width,
            "viewportHeightCssPixels": height,
            "imageWidthPixels": image_width,
            "imageHeightPixels": image_height,
            "fullPage": True,
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        })
    except Exception as error:
        check(False, f"{page_name} at {width}px: could not capture visual evidence: {type(error).__name__}: {error}")


def start_server() -> tuple[subprocess.Popen[bytes], str]:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = subprocess.Popen(
        [
            sys.executable,
            str(ROOT / "scripts" / "test-static-server.py"),
            "--port",
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

    active = page.locator('#primary-navigation a[aria-current="page"], #primary-navigation a[aria-current="location"]')
    check(active.count() == 1, f"{page_name}: primary navigation must identify one current page or parent location")
    if active.count() == 1:
        expected_href = "experiences.html" if page_name == "experience-details.html" else page_name
        expected_state = "location" if page_name == "experience-details.html" else "page"
        check(active.get_attribute("href") == expected_href,
              f"{page_name}: current navigation link must point to its page or parent location")
        check(active.get_attribute("aria-current") == expected_state,
              f"{page_name}: aria-current must distinguish the page from a parent location")

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


def check_404_recovery(page, base_url: str) -> dict:
    """Exercise Apache-style 404 recovery without following any external contact link."""
    evidence = {
        "path": "/" + NOT_FOUND_SMOKE_PATH,
        "expectedHttpStatus": 404,
        "recoveryLinks": [],
        "viewportChecks": [],
        "complete": False,
    }
    for width, height in RESPONSIVE_AUDIT_VIEWPORTS:
        page.set_viewport_size({"width": width, "height": height})
        response = None
        try:
            response = page.goto(base_url + NOT_FOUND_SMOKE_PATH,
                                 wait_until="domcontentloaded", timeout=15000)
        except Exception as error:
            check(False, f"Unknown route at {width}px could not be opened: {type(error).__name__}: {error}")

        status = response.status if response is not None else None
        target_origin = response is not None and same_origin(response.url, base_url)
        check(status == 404, f"Unknown route at {width}px must preserve HTTP 404 (found {status})")
        check(target_origin, f"Unknown route at {width}px must remain on the requested origin")

        if response is None:
            evidence["viewportChecks"].append({
                "viewportWidthCssPixels": width,
                "httpStatus": status,
                "targetOrigin": False,
                "brandedRecoveryPage": False,
                "noindex": False,
                "rootRelativeAssets": False,
                "contactChannelsHydrated": False,
                "responsiveLayoutValid": False,
                "recoveryLinks": [],
            })
            continue

        try:
            page.wait_for_selector("main.not-found-page", timeout=5000)
        except Exception:
            check(False, f"Unknown route at {width}px did not render the branded 404 recovery page")
        try:
            page.wait_for_function(
                """() => {
                  const booking = document.querySelector('[data-booking-link]');
                  const whatsapp = document.querySelector('[data-enquiry-link]');
                  const phone = document.querySelector('[data-contact-phone]');
                  const landline = document.querySelector('[data-contact-alt-phone]');
                  const email = document.querySelector('[data-contact-email]');
                  if (!booking || !whatsapp || !phone || !landline || !email) return false;
                  try {
                    const bookingUrl = new URL(booking.href);
                    const whatsappUrl = new URL(whatsapp.href);
                    return bookingUrl.protocol === 'https:'
                      && bookingUrl.hostname === 'asiatech.in'
                      && bookingUrl.pathname === '/booking_engine/index3'
                      && bookingUrl.searchParams.has('token')
                      && whatsappUrl.protocol === 'https:'
                      && whatsappUrl.hostname === 'wa.me'
                      && whatsappUrl.searchParams.has('text')
                      && phone.href === 'tel:+917727047567'
                      && landline.href === 'tel:+912992253836'
                      && email.href === 'mailto:info@hotelgarhjaisal.com'
                      && [booking, whatsapp, phone, landline, email]
                        .every(link => link.getAttribute('aria-disabled') !== 'true');
                  } catch (_) { return false; }
                }""",
                timeout=7000,
            )
        except Exception:
            check(False, f"Unknown route at {width}px did not hydrate the centralized contact channels")

        try:
            details = page.evaluate(
                """() => {
                  const main = document.querySelector('main.not-found-page');
                  const robots = document.querySelector('meta[name="robots"]');
                  const stylesheet = document.querySelector('link[rel="stylesheet"][href="/assets/site.css"]');
                  const script = document.querySelector('script[src="/assets/site.js"]');
                  const loadedStylesheet = Array.from(document.styleSheets).some(sheet => {
                    try { return new URL(sheet.href).pathname === '/assets/site.css'; }
                    catch (_) { return false; }
                  });
                  const loadedScript = performance.getEntriesByType('resource').some(resource => {
                    try { return new URL(resource.name).pathname === '/assets/site.js'; }
                    catch (_) { return false; }
                  });
                  const booking = document.querySelector('[data-booking-link]');
                  const whatsapp = document.querySelector('[data-enquiry-link]');
                  const phone = document.querySelector('[data-contact-phone]');
                  const landline = document.querySelector('[data-contact-alt-phone]');
                  const email = document.querySelector('[data-contact-email]');
                  let channelsHydrated = false;
                  try {
                    const bookingUrl = new URL(booking.href);
                    const whatsappUrl = new URL(whatsapp.href);
                    channelsHydrated = bookingUrl.hostname === 'asiatech.in'
                      && bookingUrl.pathname === '/booking_engine/index3'
                      && bookingUrl.searchParams.has('token')
                      && whatsappUrl.hostname === 'wa.me'
                      && whatsappUrl.searchParams.has('text')
                      && phone.href === 'tel:+917727047567'
                      && landline.href === 'tel:+912992253836'
                      && email.href === 'mailto:info@hotelgarhjaisal.com'
                      && [booking, whatsapp, phone, landline, email]
                        .every(link => link.getAttribute('aria-disabled') !== 'true')
                      && booking.target === '_blank'
                      && new Set((booking.rel || '').split(' ')).has('noopener')
                      && new Set((booking.rel || '').split(' ')).has('noreferrer');
                  } catch (_) {}
                  const recoveryLinks = Array.from(new Set(
                    Array.from(document.querySelectorAll('.not-found-page a[href^="/"]'))
                      .map(link => new URL(link.getAttribute('href'), location.href).pathname)
                  )).sort();
                  const width = window.innerWidth;
                  const documentWidth = document.documentElement.scrollWidth;
                  const bodyWidth = document.body.scrollWidth;
                  return {
                    brandedRecoveryPage: document.title === 'Page not found | Garh Jaisal Haveli'
                      && !!main && document.querySelectorAll('main h1').length === 1,
                    noindex: !!robots && robots.content.trim().toLowerCase() === 'noindex,follow'
                      && document.querySelectorAll('link[rel="canonical"]').length === 0
                      && document.querySelectorAll('meta[property="og:url"]').length === 0,
                    rootRelativeAssets: !!stylesheet && !!script && loadedStylesheet && loadedScript
                      && !!main && getComputedStyle(main).backgroundColor !== 'rgba(0, 0, 0, 0)',
                    contactChannelsHydrated: channelsHydrated,
                    recoveryLinks,
                    responsiveLayoutValid: documentWidth <= width + 2 && bodyWidth <= width + 2,
                    viewportWidthCssPixels: width,
                    viewportHeightCssPixels: window.innerHeight
                  };
                }"""
            )
        except Exception as error:
            check(False, f"Unknown route at {width}px could not be inspected: {type(error).__name__}: {error}")
            details = {
                "brandedRecoveryPage": False, "noindex": False, "rootRelativeAssets": False,
                "contactChannelsHydrated": False, "recoveryLinks": [], "responsiveLayoutValid": False,
            }

        for key, description in (
            ("brandedRecoveryPage", "must render one branded H1"),
            ("noindex", "must stay noindex without canonical/og:url publication"),
            ("rootRelativeAssets", "must load root-relative shared CSS/JavaScript"),
            ("contactChannelsHydrated", "must hydrate booking/contact from the central config"),
            ("responsiveLayoutValid", "must not overflow the viewport"),
        ):
            check(details.get(key) is True, f"Unknown route at {width}px {description}")
        actual_links = details.get("recoveryLinks", [])
        check(actual_links == NOT_FOUND_RECOVERY_LINKS,
              f"Unknown route at {width}px must expose the six expected root-relative recovery routes")
        if width == VIEWPORTS[0][0]:
            evidence["recoveryLinks"] = actual_links

        if width == 360:
            page.keyboard.press("Tab")
            skip_visible = page.evaluate(
                """() => {
                  const link = document.activeElement;
                  if (!link || !link.classList.contains('skip-link')) return false;
                  const box = link.getBoundingClientRect();
                  return box.top >= 0 && box.bottom <= window.innerHeight;
                }"""
            )
            check(skip_visible, "404 page: first keyboard Tab must reveal the skip link")
            page.keyboard.press("Enter")
            check(page.evaluate("document.activeElement === document.querySelector('main#main')"),
                  "404 page: activating Skip to content must focus the main region")

        evidence["viewportChecks"].append({
            "viewportWidthCssPixels": width,
            "httpStatus": status,
            "targetOrigin": bool(target_origin),
            "brandedRecoveryPage": details.get("brandedRecoveryPage") is True,
            "noindex": details.get("noindex") is True,
            "rootRelativeAssets": details.get("rootRelativeAssets") is True,
            "contactChannelsHydrated": details.get("contactChannelsHydrated") is True,
            "responsiveLayoutValid": details.get("responsiveLayoutValid") is True,
            "recoveryLinks": details.get("recoveryLinks", []),
        })

    evidence["complete"] = unknown_route_evidence_is_complete({**evidence, "complete": True})
    check(evidence["complete"], "Unknown-route recovery evidence is incomplete; release preflight must fail closed")
    return evidence


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
    # Inspect the exact source-authorized hotel pin without opening the external map.
    page.goto(base_url + "directions.html", wait_until="domcontentloaded", timeout=15000)
    page.wait_for_function(
        """() => {
          const map = document.querySelector('[data-property-map-link]');
          if (!map) return false;
          try {
            const url = new URL(map.href);
            return url.protocol === 'https:'
              && url.hostname === 'maps.app.goo.gl'
              && url.pathname === '/nAbRiZhv78FSbju48'
              && !url.search && !url.hash;
          } catch (_) { return false; }
        }""",
        timeout=7000,
    )
    map_links = page.locator("[data-property-map-link]")
    check(map_links.count() >= 2, "Directions and footer must expose the central hotel map pin")
    for index in range(map_links.count()):
        link = map_links.nth(index)
        check(link.get_attribute("target") == "_blank", "Hotel map pin must open in a separate tab")
        check(set((link.get_attribute("rel") or "").split()) >= {"noopener", "noreferrer"},
              "Hotel map pin must protect the new tab with noopener/noreferrer")
    # This smoke test inspects the destination but never opens the external map.

    # This test only inspects links; it never navigates to the provider or submits guest data.


def check_guest_enquiry_forms(page, base_url: str) -> None:
    # Capture the intended WhatsApp destination in-page. The test never opens
    # a real external tab, sends a message, or submits guest data to a service.
    page.add_init_script(
        """window.__guestEnquiryOpenCalls = [];
        window.open = function(url, target, features) {
          window.__guestEnquiryOpenCalls.push({
            url: String(url), target: String(target || ''), features: String(features || '')
          });
          return null;
        };"""
    )
    dates = None
    # Dining now has its own table-enquiry form; its dedicated Chromium coverage
    # runs in check_dining_table_enquiry below.
    for page_name in ("experiences.html", "experience-details.html", "dining.html"):
        response = page.goto(base_url + page_name, wait_until="domcontentloaded", timeout=15000)
        check(response is not None and response.status == 200,
              f"{page_name}: guest-enquiry test expected HTTP 200")
        check(response is not None and same_origin(response.url, base_url),
              f"{page_name}: guest-enquiry test must stay on the requested origin")
        page.wait_for_function(
            """() => {
              const form = document.querySelector('[data-guest-enquiry-form]');
              const submit = form && form.querySelector('[data-guest-enquiry-submit]');
              const status = form && form.querySelector('[data-guest-enquiry-status]');
              return Boolean(form && submit && !submit.disabled && status && status.dataset.state === 'ready');
            }""",
            timeout=7000,
        )
        form = page.locator("[data-guest-enquiry-form]")
        check(form.count() == 1, f"{page_name}: exactly one shared guest-enquiry form must render")
        arrival = form.locator('[name="arrival"]')
        departure = form.locator('[name="departure"]')
        interest = form.locator('[name="experience"]')
        notes = form.locator('[name="notes"]')
        submit = form.locator("[data-guest-enquiry-submit]")
        dates = page.evaluate(
            """() => {
              const iso = value => {
                const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
                return local.toISOString().slice(0, 10);
              };
              const shift = amount => {
                const value = new Date();
                value.setHours(12, 0, 0, 0);
                value.setDate(value.getDate() + amount);
                return iso(value);
              };
              return { yesterday: shift(-1), today: shift(0), day2: shift(2), day3: shift(3), day5: shift(5) };
            }"""
        )
        check(arrival.get_attribute("min") == dates["today"],
              f"{page_name}: arrival must not permit a date before today")
        check(departure.get_attribute("min") == dates["today"],
              f"{page_name}: departure must not permit a date before today when arrival is empty")
        interest.select_option(label="Sunset camel safari")

        # A past arrival is rejected by native min-date validation. The
        # departure minimum must stay at today rather than following a past
        # arrival into the past.
        arrival.fill(dates["yesterday"])
        departure.fill(dates["day3"])
        check(arrival.get_attribute("min") == dates["today"],
              f"{page_name}: arrival min date must remain today")
        check(departure.get_attribute("min") == dates["today"],
              f"{page_name}: departure min date must not move into the past")
        check(not form.evaluate("(element) => element.checkValidity()"),
              f"{page_name}: a past arrival must fail browser validation")

        # Same-day departure is invalid. Changing arrival alone to an earlier
        # valid date must clear the custom error without forcing a departure edit.
        arrival.fill(dates["day3"])
        departure.fill(dates["day3"])
        check(not form.evaluate("(element) => element.checkValidity()"),
              f"{page_name}: same-day departure must be rejected")
        validation_message = departure.evaluate("(element) => element.validationMessage")
        check(validation_message == "Departure must be after arrival.",
              f"{page_name}: departure error must explain the date rule")
        arrival.fill(dates["day2"])
        check(departure.get_attribute("min") == dates["day2"],
              f"{page_name}: departure minimum must follow the revised arrival date")
        check(departure.evaluate("(element) => element.validationMessage") == "",
              f"{page_name}: changing arrival to a valid range must clear the stale departure error")
        check(form.evaluate("(element) => element.checkValidity()"),
              f"{page_name}: correcting arrival alone must restore form validity")

        arrival.fill(dates["day3"])
        departure.fill(dates["day5"])
        notes.fill("Vegetarian meal request & early arrival")
        check(form.evaluate("(element) => element.checkValidity()"),
              f"{page_name}: valid future dates must allow an enquiry draft")
        submit.click()
        page.wait_for_function(
            "() => Array.isArray(window.__guestEnquiryOpenCalls) && window.__guestEnquiryOpenCalls.length === 1",
            timeout=5000,
        )
        draft = page.evaluate(
            """() => {
              const call = window.__guestEnquiryOpenCalls[0];
              const url = new URL(call.url);
              return {
                host: url.hostname, path: url.pathname, text: url.searchParams.get('text') || '',
                target: call.target, features: call.features, currentUrl: window.location.href
              };
            }"""
        )
        check(draft["host"] == "wa.me" and draft["path"] == "/917727047567",
              f"{page_name}: valid form must prepare a draft for the configured WhatsApp destination")
        check(draft["target"] == "_blank",
              f"{page_name}: draft must request a separate tab")
        check({"noopener", "noreferrer"}.issubset(set(draft["features"].split(","))),
              f"{page_name}: draft tab must use noopener and noreferrer")
        for expected in (
            "Interest: Sunset camel safari",
            "Arrival: " + dates["day3"],
            "Departure: " + dates["day5"],
            "Guests: 2",
            "Vegetarian meal request & early arrival",
            "does not confirm a booking",
        ):
            check(expected in draft["text"],
                  f"{page_name}: encoded draft must contain the expected field ({expected.split(':')[0]})")
        check("draft is ready to review" in page.locator("[data-guest-enquiry-status]").inner_text().lower(),
              f"{page_name}: status must describe a draft for guest review, not a confirmed booking")
        check(same_origin(draft["currentUrl"], base_url),
              f"{page_name}: browser smoke must not navigate to WhatsApp or send the draft")
        check(page.evaluate("window.__guestEnquiryOpenCalls.length") == 1,
              f"{page_name}: one user submission must prepare exactly one draft")



def check_dining_table_enquiry(page, base_url: str) -> None:
    """Exercise the restaurant tabs and table-enquiry draft without leaving the site."""
    response = page.goto(base_url + "dining.html", wait_until="domcontentloaded", timeout=15000)
    check(response is not None and response.status == 200,
          "Dining table enquiry: expected HTTP 200")
    check(response is not None and same_origin(response.url, base_url),
          "Dining table enquiry: page must remain on the requested origin")
    page.evaluate(
        """() => {
          window.__tableEnquiryOpenCalls = [];
          window.open = function(url, target, features) {
            window.__tableEnquiryOpenCalls.push({
              url: String(url), target: String(target || ''), features: String(features || '')
            });
            return null;
          };
        }"""
    )
    page.wait_for_function(
        """() => document.body.classList.contains('dining-tabs-ready')
          && Boolean(document.querySelector('[data-restaurant-table-submit]')
          && !document.querySelector('[data-restaurant-table-submit]').disabled)""",
        timeout=7000,
    )

    tabs = page.get_by_role("tablist", name="Restaurant information").get_by_role("tab")
    check(tabs.count() == 4, "Dining must expose the four restaurant tabs")
    menu_tab = page.get_by_role("tab", name="Menu")
    table_tab = page.get_by_role("tab", name="Ask about a table")
    directions_tab = page.get_by_role("tab", name="Directions")
    menu_tab.click()
    check(menu_tab.get_attribute("aria-selected") == "true",
          "Menu tab must update its selected state")
    check(page.locator("#restaurant-panel-menu").is_visible(),
          "Menu tab must show its panel")
    menu_tab.press("ArrowRight")
    check(table_tab.get_attribute("aria-selected") == "true",
          "ArrowRight from Menu must activate Ask about a table")
    check(table_tab.evaluate("(element) => document.activeElement === element"),
          "ArrowRight must move keyboard focus with the active tab")
    table_tab.press("End")
    check(directions_tab.get_attribute("aria-selected") == "true",
          "End key must activate the last Directions tab")
    directions_tab.press("Home")
    check(page.get_by_role("tab", name="Overview").get_attribute("aria-selected") == "true",
          "Home key must activate the first Overview tab")
    table_tab.click()

    form = page.locator("[data-restaurant-table-form]")
    check(form.count() == 1, "Dining must render exactly one dedicated table-enquiry form")
    note = form.locator('[name="note"]')
    requested_date = form.locator('[name="date"]')
    requested_time = form.locator('[name="time"]')
    guests = form.locator('[name="guests"]')
    submit = form.locator("[data-restaurant-table-submit]")
    check(requested_date.get_attribute("aria-invalid") == "false",
          "An untouched required date field must not be announced as invalid")
    check(form.locator('[name="name"], [name="email"], [name="mobile"]').count() == 0,
          "Dining table enquiry must not ask for redundant name, email or mobile details")

    dates = page.evaluate(
        """() => {
          const iso = value => {
            const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
            return local.toISOString().slice(0, 10);
          };
          const shift = amount => {
            const value = new Date();
            value.setHours(12, 0, 0, 0);
            value.setDate(value.getDate() + amount);
            return iso(value);
          };
          return { yesterday: shift(-1), today: shift(0), tomorrow: shift(1) };
        }"""
    )
    check(requested_date.get_attribute("min") == dates["today"],
          "Dining table date must not permit a past date")
    requested_date.fill(dates["yesterday"])
    check(requested_date.evaluate("(element) => element.validity.rangeUnderflow"),
          "Dining table date input must reject a past date")
    requested_date.fill(dates["tomorrow"])

    check(requested_time.get_attribute("type") == "text",
          "Dining time must be a free-text preference, not an assumed opening-hours list")
    check(requested_time.get_attribute("maxlength") == "40",
          "Dining preferred-time text must have a bounded length")
    check(requested_time.get_attribute("required") is None,
          "Dining preferred time must remain optional until service hours are owner-confirmed")
    check("confirm current service hours and availability" in page.locator("#restaurant-table-time-help").inner_text().lower(),
          "Dining preferred-time guidance must require restaurant confirmation")
    check(guests.get_attribute("type") == "number" and guests.get_attribute("min") == "1"
          and guests.get_attribute("max") == "20",
          "Dining party size must use the source form's 1–20 input bounds")
    check(guests.input_value() == "2",
          "Dining party size defaults to two but remains editable")
    check(requested_time.get_attribute("required") is None,
          "Dining preferred time must remain optional until service hours are owner-confirmed")
    check(guests.get_attribute("type") == "number" and guests.get_attribute("min") == "1"
          and guests.get_attribute("max") == "20",
          "Dining party size must use the source form's 1–20 input bounds")
    check(guests.input_value() == "2",
          "Dining party size defaults to two but remains editable")
    check(note.get_attribute("maxlength") == "240" and note.get_attribute("required") is None,
          "The optional context note must remain bounded and optional")

    guests.fill("0")
    check(not form.evaluate("(element) => element.checkValidity()"),
          "Dining table form must reject a party size below one")
    guests.fill("21")
    check(not form.evaluate("(element) => element.checkValidity()"),
          "Dining table form must reject a party size above the source form limit")
    guests.fill("4")
    requested_time.fill("")
    note.fill("")
    check(form.evaluate("(element) => element.checkValidity()"),
          "Dining form must allow an enquiry without optional time or note")
    requested_time.fill("7:30 PM")
    note.fill("Anniversary dinner setup question")
    check(form.evaluate("(element) => element.checkValidity()"),
          "Dining form must accept date, party size and bounded optional preferences")
    submit.click()
    page.wait_for_function(
        "() => Array.isArray(window.__tableEnquiryOpenCalls) && window.__tableEnquiryOpenCalls.length === 1",
        timeout=5000,
    )
    draft = page.evaluate(
        """() => {
          const call = window.__tableEnquiryOpenCalls[0];
          const url = new URL(call.url);
          return {
            host: url.hostname, path: url.pathname,
            text: url.searchParams.get('text') || '',
            target: call.target, features: call.features, currentUrl: window.location.href
          };
        }"""
    )
    check(draft["host"] == "wa.me" and draft["path"] == "/917727047567",
          "Dining table form must use the centrally configured authorized WhatsApp destination")
    check(draft["target"] == "_blank",
          "Dining table enquiry should open a reviewable draft in a new tab")
    check({"noopener", "noreferrer"}.issubset(set(draft["features"].split(","))),
          "Dining table enquiry must protect the new tab with noopener/noreferrer")
    for expected in (
        "Requested date: " + dates["tomorrow"],
        "Guests: 4",
        "Preferred time: 7:30 PM",
        "Additional note: Anniversary dinner setup question",
        "not a reservation",
        "not booked until the restaurant replies and confirms it",
    ):
        check(expected.lower() in draft["text"].lower(),
              "Dining table WhatsApp draft must include " + expected.split(":")[0])
    check(not any(label in draft["text"] for label in ("Name:", "Email:", "Mobile:")),
          "Dining draft must not include redundant personal contact fields")
    status = page.locator("[data-restaurant-table-status]").inner_text().lower()
    check("table is not reserved" in status and "review and send it yourself" in status,
          "Dining table status must clearly say the request is unconfirmed and guest-controlled")
    check(same_origin(draft["currentUrl"], base_url),
          "Browser smoke must not navigate to WhatsApp or send the draft")
    check(page.evaluate("window.__tableEnquiryOpenCalls.length") == 1,
          "One table enquiry submission must prepare exactly one draft")

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


def check_responsive_layout(page, base_url: str, screenshots_dir: Path | None = None) -> None:
    """Audit six requested breakpoints while capturing full-page evidence at three representative widths."""
    screenshot_widths = {width for width, _height in VIEWPORTS}
    for width, height in RESPONSIVE_AUDIT_VIEWPORTS:
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
            if width <= 390:
                bar = page.locator(".mobile-booking-bar")
                check(bar.is_visible(), f"{page_name}: mobile Book Now bar must be visible at {width}px")
                box = bar.bounding_box()
                if box:
                    check(box["x"] >= -1 and box["x"] + box["width"] <= width + 1,
                          f"{page_name}: mobile booking bar exceeds {width}px viewport")
                    check(box["y"] >= -1 and box["y"] + box["height"] <= height + 1,
                          f"{page_name}: mobile booking bar is outside the {width}px viewport")
            if width >= 1280:
                check(page.locator("#primary-navigation").is_visible(),
                      f"{page_name}: desktop primary navigation must be visible at {width}px")
                check(not page.locator(".menu-toggle").is_visible(),
                      f"{page_name}: mobile menu toggle must be hidden at {width}px")
            if screenshots_dir is not None and width in screenshot_widths:
                capture_visual_evidence(page, page_name, width, height, screenshots_dir)
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

    # Desktop About dropdown must have readable light-header text and a real menu item.
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(base_url + "about.html", wait_until="domcontentloaded", timeout=15000)
    about_link = page.locator(".nav-about-group > a")
    dropdown = page.locator(".nav-dropdown")
    summary = dropdown.locator("summary")
    check(about_link.is_visible(), "About navigation link must be visible on desktop")
    about_color = about_link.evaluate("(el) => getComputedStyle(el).color")
    check(about_color == "rgb(74, 79, 73)",
          "About navigation link must use readable dark text on the light header")
    summary_color = summary.evaluate("(el) => getComputedStyle(el).color")
    check(summary_color == "rgb(74, 79, 73)",
          "Dropdown toggle must use readable dark text on the light header")
    summary.click()
    menu_item = dropdown.locator(".nav-dropdown__menu a[href='gallery.html']")
    check(menu_item.is_visible(), "Opening the About dropdown must reveal the Gallery link")
    contrast = menu_item.evaluate("""(el) => {
      const foreground = getComputedStyle(el);
      const background = getComputedStyle(el.closest('.nav-dropdown__menu'));
      const parse = (color) => {
        const values = color.match(/[0-9.]+/g) || [];
        return values.slice(0, 3).map(Number);
      };
      const fg = parse(foreground.color);
      const bg = parse(background.backgroundColor);
      const alpha = Number(foreground.opacity || 1);
      const blended = fg.map((channel, index) => channel * alpha + bg[index] * (1 - alpha));
      const luminance = (rgb) => {
        const linear = rgb.map(value => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };
      const first = luminance(blended);
      const second = luminance(bg);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }""")
    check(contrast >= 4.5,
          "Gallery link must retain at least 4.5:1 contrast on the dark dropdown panel")
    summary.click()
    check(menu_item.is_hidden(), "Closing the About dropdown must hide its menu panel")



def check_experience_discovery_journey(page, base_url: str) -> None:
    """Verify that guests can browse packages, Fort/road paths and route ideas before an enquiry."""
    response = page.goto(base_url + "experiences.html", wait_until="domcontentloaded", timeout=15000)
    check(response is not None and response.status == 200,
          "Experience discovery: expected HTTP 200")
    check(response is not None and same_origin(response.url, base_url),
          "Experience discovery: page must stay on the requested origin")

    nav = page.get_by_role("navigation", name="Browse by experience type")
    check(nav.count() == 1, "Experience discovery must expose one named category navigation")
    expected = [
        ("Desert evenings", "#desert"),
        ("Sleep in the desert", "#open-sky"),
        ("Fort and city tours", "#city-tours"),
        ("Road and route ideas", "#experience-more-title"),
    ]
    for label, href in expected:
        link = nav.locator("a[href='" + href + "']")
        check(link.count() == 1, "Experience discovery must expose " + label)
        if link.count():
            check(label.lower() in link.inner_text().lower(),
                  "Experience category link must have a readable label: " + label)

    packages = page.locator("article.experience-option")
    check(packages.count() == 6, "All six source-listed package cards must remain present")
    route_cards = page.locator(".experience-more-paths__grid .content-depth__card")
    check(route_cards.count() == 3, "Fort walk, car/road and other route paths must appear separately")
    for index in range(packages.count()):
        card = packages.nth(index)
        detail_link = card.locator('a[href^="experience-details.html#"]')
        check(detail_link.count() == 1, "Each package must open its own itinerary/detail anchor")
        check("view itinerary and details" in detail_link.inner_text().lower(),
              "Package information must be available before a contextual enquiry")
        check(card.locator("a[data-enquiry-link]").count() == 1,
              "Each package keeps a separate date-specific enquiry action")

    nav.locator('a[href="#experience-more-title"]').click()
    check(page.evaluate("window.location.hash") == "#experience-more-title",
          "Road/route shortcut must target the additional travel-path section")
    routeDetailLink = page.locator(".experience-more-paths").get_by_role(
        "link", name=re.compile("See what to ask before planning", re.I)
    )
    routeDetailLink.click()
    page.wait_for_function(
        "() => window.location.pathname.endsWith('experience-details.html') && window.location.hash === '#other-routes'",
        timeout=5000,
    )
    check(page.locator("#other-routes").is_visible(),
          "Other route shortcut must land on the relevant detail section")
    check(page.get_by_role("heading", name="Other routes and interests", exact=True).count() == 1,
          "Other route section must have a clear heading")

    page.goto(base_url + "experience-details.html", wait_until="domcontentloaded", timeout=15000)
    primary = page.locator(".experience-detail-hero__actions a.button--gold")
    check(primary.count() == 1, "Detail page needs one prominent return-to-catalogue link")
    if primary.count():
        check("route ideas" in primary.inner_text().lower(),
              "Detail hero action must refer to the wider catalogue, not only six options")
        check(primary.get_attribute("href") == "experiences.html#experience-options",
              "Detail primary action must navigate back to Experiences, not WhatsApp")
    check(page.locator(".experience-detail-hero__actions a[data-enquiry-link]").count() == 1,
          "A separate contextual enquiry remains available alongside the details navigation")
    if primary.count():
        primary.click()
        page.wait_for_function(
            "() => window.location.pathname.endsWith('experiences.html') && window.location.hash === '#experience-options'",
            timeout=5000,
        )
        check(page.locator("#experience-options-title").is_visible(),
              "Return-to-catalogue action must land on the experience options")


def check_arrival_wayfinding_journey(page, base_url: str) -> None:
    """Verify the source-backed final-walk facts and their links from guest decision pages."""
    routes = [
        ("index.html", "Home"),
        ("rooms.html", "Rooms"),
        ("experiences.html", "Experiences"),
        ("experience-details.html", "Experience details"),
        ("dining.html", "Dining"),
        ("about.html", "About"),
        ("gallery.html", "Gallery"),
    ]
    for route, label in routes:
        response = page.goto(base_url + route, wait_until="domcontentloaded", timeout=15000)
        check(response is not None and response.status == 200,
              f"{label}: route must load for the arrival-planning handoff")
        if response is None or response.status != 200:
            continue
        arrival_links = page.locator('a[href="directions.html#arrival-walk-distances-title"]')
        check(arrival_links.count() > 0,
              f"{label}: contextual arrival guidance must deep-link to the walking-distance section")

    page.goto(base_url + "index.html", wait_until="domcontentloaded", timeout=15000)
    home_arrival_link = page.locator('a[href="directions.html#arrival-walk-distances-title"]').first
    if home_arrival_link.count():
        home_arrival_link.click()
        page.wait_for_function(
            "() => window.location.pathname.endsWith('/directions.html') "
            "&& window.location.hash === '#arrival-walk-distances-title'",
            timeout=5000,
        )
        check(page.locator("#arrival-walk-distances-title").is_visible(),
              "Home: arrival shortcut must land on the distance facts heading")

    response = page.goto(base_url + "directions.html", wait_until="domcontentloaded", timeout=15000)
    check(response is not None and response.status == 200, "Directions: expected HTTP 200")
    section = page.locator("#arrival-walk-distances")
    check(section.count() == 1 and section.is_visible(),
          "Directions: source-backed arrival distance section must be visible")
    cards = section.locator(".arrival-distance-card")
    check(cards.count() == 3,
          "Directions: parking, fort-entrance and rickshaw-access facts must each have one card")
    if cards.count() == 3:
        parking = cards.nth(0).inner_text()
        entrance = cards.nth(1).inner_text()
        rickshaw = cards.nth(2).inner_text()
        check("300 metres" in parking and "5–6 minutes" in parking,
              "Directions: Fort Parking estimate must be about 300 metres / 5–6 minutes")
        check("200 metres" in entrance and "3–4 minutes" in entrance,
              "Directions: fort entrance estimate must be about 200 metres / 3–4 minutes")
        check("Rickshaw access rules and drop-off points can vary" in rickshaw
              and "8:00 AM" not in section.inner_text(),
              "Directions: unconfirmed rickshaw hours must be omitted and current access confirmed")

    for width, height in [(320, 740), (390, 844), (768, 900), (1280, 800), (1440, 900)]:
        page.set_viewport_size({"width": width, "height": height})
        dimensions = page.evaluate(
            "() => ({viewport: window.innerWidth, document: document.documentElement.scrollWidth})"
        )
        check(dimensions["document"] <= dimensions["viewport"] + 1,
              f"Directions: arrival distance cards must not overflow horizontally at {width}px")
        check(page.locator("#arrival-walk-distances-title").is_visible(),
              f"Directions: arrival distance heading must remain available at {width}px")


def check_room_finder(page, base_url: str, browser) -> None:
    """Exercise progressive room filters and verify the all-rooms no-JavaScript fallback."""
    page.set_viewport_size({"width": 360, "height": 800})
    page.goto(base_url + "rooms.html", wait_until="domcontentloaded", timeout=15000)
    finder = page.locator("[data-room-finder]")
    cards = page.locator("#room-card-grid .room-card--named")
    check(finder.count() == 1 and finder.is_visible(),
          "Rooms: source-backed filter controls must appear after successful initialization")
    check(cards.count() == 7, "Rooms: all seven source-listed room cards must be present")

    def visible_room_ids() -> list[str]:
        return cards.evaluate_all("items => items.filter(card => !card.hidden).map(card => card.id)")

    all_ids = [
        "room-sweet-purple", "room-rising-sun", "room-scarlet",
        "room-opium", "room-red-maharani", "room-green", "room-bluesky",
    ]
    check(visible_room_ids() == all_ids, "Rooms: default finder state must show all seven rooms")
    floor = finder.locator("[data-room-floor-filter]")
    status = finder.locator("[data-room-finder-status]")
    reset = finder.locator("[data-room-reset]")
    floor.select_option("ground")
    check(visible_room_ids() == ["room-sweet-purple", "room-rising-sun", "room-scarlet"],
          "Rooms: Ground floor filter must show only the three source-listed ground-floor rooms")
    check("3 of seven" in (status.text_content() or ""),
          "Rooms: live result status must announce the ground-floor count")

    floor.select_option("first")
    finder.locator('[data-room-feature-filter][value="king-bed"]').check()
    check(visible_room_ids() == ["room-red-maharani", "room-green"],
          "Rooms: King bed filter must match only rooms whose source feature list records a king bed")
    finder.locator('[data-room-feature-filter][value="second-bed"]').check()
    check(visible_room_ids() == [],
          "Rooms: multiple feature selections must require all selected source-listed features")
    check(finder.locator("[data-room-finder-empty]").is_visible(),
          "Rooms: no-match state must be explained to the visitor")
    check(finder.locator('[data-room-finder-empty] a[href="#room-planning"]').is_visible(),
          "Rooms: no-match state must expose a room-fit enquiry recovery path")
    check(not reset.is_disabled(), "Rooms: Clear filters must be available when filters are active")

    reset.click()
    check(visible_room_ids() == all_ids, "Rooms: Clear filters must restore all seven cards")
    check(floor.input_value() == "all", "Rooms: Clear filters must restore the all-floors option")
    check(finder.locator("[data-room-feature-filter]:checked").count() == 0,
          "Rooms: Clear filters must unset every feature checkbox")
    check(finder.locator("[data-room-finder-empty]").is_hidden(),
          "Rooms: clearing filters must hide the no-match state")

    floor.focus()
    page.keyboard.press("Tab")
    keyboard_focus_ok = page.evaluate(
        """() => Boolean(document.activeElement
          && document.activeElement.matches('[data-room-feature-filter][value="king-bed"]'))"""
    )
    check(keyboard_focus_ok, "Rooms: Tab from the floor selector must reach the first feature checkbox")
    page.keyboard.press("Space")
    check(visible_room_ids() == ["room-red-maharani", "room-green"],
          "Rooms: keyboard Space must apply the focused King bed checkbox")
    page.keyboard.press("Space")
    check(visible_room_ids() == all_ids,
          "Rooms: keyboard Space must clear the focused King bed checkbox")

    # Side-by-side shortlist: compare two/three rooms, enforce the cap, remove entries,
    # and recover a selected room that is hidden by an active filter.
    compare_panel = page.locator("[data-room-compare-panel]")
    check(compare_panel.count() == 1 and compare_panel.is_hidden(),
          "Rooms: comparison panel must start hidden until a guest selects a room")
    compare_buttons = page.locator("#room-card-grid [data-room-compare-toggle]")
    check(compare_buttons.count() == 7,
          "Rooms: comparison controls must be added to all seven cards only after initialization")
    sweet_compare = page.locator("#room-sweet-purple [data-room-compare-toggle]")
    green_compare = page.locator("#room-green [data-room-compare-toggle]")
    opium_compare = page.locator("#room-opium [data-room-compare-toggle]")
    rising_compare = page.locator("#room-rising-sun [data-room-compare-toggle]")
    sweet_compare.focus()
    page.keyboard.press("Space")
    check(sweet_compare.get_attribute("aria-pressed") == "true",
          "Rooms: selecting a room must expose its pressed state")
    check(compare_panel.is_visible() and "1 room selected" in (compare_panel.locator("[data-room-compare-status]").text_content() or ""),
          "Rooms: a single selection must explain how to complete a comparison")
    check(compare_panel.locator("[data-room-compare-table-wrap]").is_hidden(),
          "Rooms: the comparison table must wait until at least two rooms are selected")

    green_compare.click()
    compare_table = compare_panel.locator("[data-room-compare-table]")
    table_wrap = compare_panel.locator("[data-room-compare-table-wrap]")
    check(table_wrap.is_visible(), "Rooms: selecting two rooms must reveal the side-by-side table")
    check(table_wrap.get_attribute("role") == "region" and table_wrap.get_attribute("tabindex") == "0",
          "Rooms: the horizontally scrollable comparison table must be a named keyboard-focusable region")
    check(table_wrap.evaluate("el => el.scrollWidth > el.clientWidth"),
          "Rooms: comparison table must scroll horizontally instead of overflowing the mobile viewport")
    compare_names = compare_table.locator("thead [data-room-compare-card-link]").all_text_contents()
    check(compare_names == ["Sweet Purple Room", "Green Room"],
          "Rooms: comparison columns must preserve the selected room names and selection order")
    check(compare_table.locator("thead th[scope='col']").count() == 3,
          "Rooms: every comparison column, including the detail label, must render a scoped column header")
    row_headers = compare_table.locator("tbody th[scope='row']")
    check(row_headers.count() == 3
          and row_headers.all_text_contents() == [
              "Floor listed", "Room description", "Features listed in the catalogue"
          ],
          "Rooms: each rendered comparison row must expose a scoped accessible row header")
    check(compare_table.locator("tbody th:not([scope='row'])").count() == 0,
          "Rooms: no comparison row heading may omit its row-header scope")

    floors = compare_table.locator("[data-room-compare-row='floor'] td").all_text_contents()
    check(floors == ["Ground floor", "First floor"],
          "Rooms: comparison must use each card's source-listed floor")
    feature_cells = compare_table.locator("[data-room-compare-row='features'] td")
    check("Second bed" in (feature_cells.nth(0).inner_text() or "")
          and "King bed" in (feature_cells.nth(1).inner_text() or ""),
          "Rooms: comparison must use the visible source-listed feature lists")
    compare_images = compare_table.locator("[data-room-compare-image]")
    check(compare_images.count() == 2,
          "Rooms: each comparison column must show its mapped room photograph")
    for image in compare_images.all():
        try:
            image.scroll_into_view_if_needed(timeout=3000)
            details = image.evaluate("""async img => {
              const alt = img.getAttribute("alt") || "";
              const src = img.getAttribute("src") || "";
              if (src.startsWith("/")) {
                // Convert root-relative local sources to a URL explicitly after the browser has positioned the image.
              } else if (!/^https?:\\/\\//i.test(src)) {
                return {alt, src, currentSrc: img.currentSrc || "", complete: img.complete,
                  naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, decoded: false};
              }
              try {
                await img.decode();
                return {alt, src, currentSrc: img.currentSrc || "", complete: img.complete,
                  naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, decoded: true};
              } catch (_) {
                return {alt, src, currentSrc: img.currentSrc || "", complete: img.complete,
                  naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, decoded: false};
              }
            }""")
            check(bool(details["alt"].strip()),
                  "Rooms: each comparison thumbnail must retain descriptive alt text")
            source_is_local = details["src"].startswith("/") or same_origin(details["src"], base_url)
            check(source_is_local and same_origin(details["currentSrc"], base_url),
                  f"Rooms: each comparison thumbnail must use a local same-origin image source (src={details['src']!r}, currentSrc={details['currentSrc']!r})")
            check(details["decoded"] and details["complete"]
                  and details["naturalWidth"] > 0 and details["naturalHeight"] > 0,
                  f"Rooms: each comparison thumbnail must decode to non-zero intrinsic dimensions (src={details['src']!r}, size={details['naturalWidth']}x{details['naturalHeight']})")
        except Exception as error:
            check(False, f"Rooms: comparison thumbnail failed to load: {error}")

    opium_compare.click()
    check(compare_table.locator("thead [data-room-compare-card-link]").count() == 3,
          "Rooms: a third selected room must appear in the comparison table")
    rising_compare.click()
    check(rising_compare.get_attribute("aria-pressed") == "false"
          and "up to three rooms" in (compare_panel.locator("[data-room-compare-status]").text_content() or ""),
          "Rooms: the shortlist must reject a fourth room and announce the three-room limit")

    compare_panel.locator("[data-room-compare-remove='room-opium']").click()
    remaining_names = compare_table.locator("thead [data-room-compare-card-link]").all_text_contents()
    check(remaining_names == ["Sweet Purple Room", "Green Room"],
          "Rooms: removing a comparison entry must update the table")
    check(opium_compare.get_attribute("aria-pressed") == "false",
          "Rooms: removing a room must restore its card control state")

    floor.select_option("ground")
    check(page.locator("#room-green").is_hidden(),
          "Rooms: the active floor filter should hide the selected first-floor card")
    compare_panel.locator("[data-room-compare-card-link='room-green']").click()
    check(not page.locator("#room-green").is_hidden() and floor.input_value() == "all",
          "Rooms: following a selected-room link must clear filters before returning to its card")

    compare_panel.locator("[data-room-compare-clear]").click()
    check(compare_panel.locator("[data-room-compare-table-wrap]").is_hidden()
          and "Shortlist cleared" in (compare_panel.locator("[data-room-compare-status]").text_content() or ""),
          "Rooms: clearing the shortlist must hide the table and announce recovery")
    check(all(button.get_attribute("aria-pressed") == "false" for button in compare_buttons.all()),
          "Rooms: clearing the shortlist must reset all seven card controls")
    check(compare_panel.locator("[data-room-compare-clear]").is_disabled(),
          "Rooms: Clear shortlist must disable when no rooms are selected")

    # With JavaScript off, the controls stay hidden and the full catalogue is readable.
    nojs = browser.new_context(
        viewport={"width": 360, "height": 800},
        java_script_enabled=False,
    )
    try:
        static_page = nojs.new_page()
        response = static_page.goto(base_url + "rooms.html", wait_until="domcontentloaded", timeout=15000)
        check(response is not None and response.status == 200,
              "Rooms: no-JavaScript fallback must serve the room page")
        static_cards = static_page.locator("#room-card-grid .room-card--named")
        check(static_cards.count() == 7,
              "Rooms: no-JavaScript fallback must retain all seven source-listed cards")
        check(static_cards.evaluate_all("items => items.every(card => !card.hidden)"),
              "Rooms: no-JavaScript fallback must not hide any room card")
        check(static_page.locator("[data-room-finder]").is_hidden(),
              "Rooms: inert filter controls must remain hidden when JavaScript is disabled")
        check(static_page.locator("[data-room-compare-panel]").count() == 0
              and static_page.locator("[data-room-compare-toggle]").count() == 0,
              "Rooms: comparison controls must not appear without JavaScript")
    finally:
        nojs.close()


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
    parser = argparse.ArgumentParser(description=f"Read-only Chromium smoke checks for the {len(PAGES)}-page guest journey.")
    parser.add_argument("--base-url", help="HTTPS staging origin; omitted to run against a temporary local server")
    parser.add_argument("--operator", help="Human operator name recorded in a staging evidence report")
    parser.add_argument("--report", help="Local JSON evidence-report path (required with --base-url)")
    parser.add_argument("--screenshots-dir", help=f"Empty local directory outside the checkout for {len(expected_screenshot_names())} visual evidence PNGs (required with --base-url)")
    args = parser.parse_args(argv)
    staging_mode = bool(args.base_url)

    if staging_mode:
        if not args.operator or not args.report or not args.screenshots_dir:
            parser.error("--operator, --report and --screenshots-dir are required with --base-url")
        try:
            base_url = validate_staging_target(args.base_url, args.operator, args.report)
            screenshots_dir = validate_screenshot_directory(args.screenshots_dir)
            screenshots_dir.mkdir(parents=True, exist_ok=True)
            http_credentials = resolve_http_credentials(
                os.environ.get("STAGING_BASIC_AUTH_USERNAME"),
                os.environ.get("STAGING_BASIC_AUTH_PASSWORD"),
            )
            if http_credentials:
                http_credentials["origin"] = base_url.rstrip("/")
        except ValueError as error:
            print(f"BLOCKED: staging target/auth/evidence path rejected before any network request: {error}", file=sys.stderr)
            return 2
    else:
        if args.operator or args.report or args.screenshots_dir:
            parser.error("--operator, --report and --screenshots-dir require --base-url")
        base_url = ""
        http_credentials = None
        screenshots_dir = None

    unknown_route_evidence = None
    server = None
    browser = None
    context = None
    browser_version = None
    screenshot_tempdir = None
    try:
        if not staging_mode:
            server, base_url = start_server()
            screenshot_tempdir = tempfile.TemporaryDirectory(prefix="garh-jaisal-visual-evidence-")
            screenshots_dir = Path(screenshot_tempdir.name)
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
                expected_404 = (response.status == 404 and same_origin(response.url, base_url)
                                and urlsplit(response.url).path == "/" + NOT_FOUND_SMOKE_PATH)
                if same_origin(response.url, base_url) and response.status >= 400 and not expected_404:
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

            unknown_route_evidence = check_404_recovery(page, base_url)
            check_contact_hydration(page, base_url)
            check_guest_enquiry_forms(page, base_url)
            check_experience_discovery_journey(page, base_url)
            check_room_finder(page, base_url, browser)
            check_arrival_wayfinding_journey(page, base_url)
            check_dining_table_enquiry(page, base_url)
            check_staging_publication_guards(page, base_url)
            check_responsive_layout(page, base_url, screenshots_dir)
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
            try:
                context.close()
            except Exception as cleanup_error:
                if not FAILURES:
                    FAILURES.append(
                        f"Browser context cleanup failed: {type(cleanup_error).__name__}: {cleanup_error}"
                    )
        if browser is not None:
            try:
                browser.close()
            except Exception as cleanup_error:
                if not FAILURES:
                    FAILURES.append(
                        f"Browser cleanup failed: {type(cleanup_error).__name__}: {cleanup_error}"
                    )
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
        if screenshot_tempdir is not None:
            screenshot_tempdir.cleanup()

    if not staging_mode:
        local_visual_report = build_report(
            "local-browser-smoke", base_url, None, browser_version, [],
            PAGES_ATTEMPTED, PAGES_HTTP_OK, VIEWPORTS_COMPLETED,
            screenshot_evidence=SCREENSHOT_EVIDENCE,
            unknown_route_evidence=unknown_route_evidence,
        )
        if not local_visual_report["visualEvidence"]["complete"]:
            FAILURES.append(
                f"Local browser smoke did not produce all {len(expected_screenshot_names())} valid full-page screenshot records; "
                "visual evidence generation must be exercised by the standard quality suite."
            )

    if staging_mode:
        report = build_report(
            "staging-read-only", base_url, args.operator, browser_version, FAILURES,
            PAGES_ATTEMPTED, PAGES_HTTP_OK, VIEWPORTS_COMPLETED, CROSS_ORIGIN_NAVIGATION_ERRORS,
            screenshot_evidence=SCREENSHOT_EVIDENCE,
            unknown_route_evidence=unknown_route_evidence,
        )
        # The console result and JSON report must agree. Missing route/viewport
        # evidence is a failure even when no individual assertion raised.
        FAILURES[:] = list(report["automatedFailures"])
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
        f"PASS: Chromium {mode_label} browser smoke suite covered {len(PAGES)} core pages plus the branded HTTP 404 recovery route, metadata ranges and parity, "
        "same-origin assets/publication guards, contact-link hydration, room-finder filters/clear/no-JavaScript fallback, three-room side-by-side comparison/limit/removal/filter recovery/no-JavaScript fallback, 320/360/390/768/1280/1440px responsive layout, "
        "keyboard/skip-link behavior, reduced motion, six galleries with keyboard activation, "
        f"wraparound, no-autoplay and no-JavaScript fallback, plus {len(expected_screenshot_names())} full-page PNG captures "
        "with measured geometry, byte size and SHA-256 in a temporary directory. "
        "No external links were followed and no booking, payment or guest data was submitted."
    )
    if staging_mode:
        print("Release remains BLOCKED until the human checks in the JSON report and launch checklist are completed.")
    else:
        print("This local-browser run is not staging UAT or live-channel verification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
