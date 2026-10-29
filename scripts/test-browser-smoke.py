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

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get("BROWSER_SMOKE_ROOT", str(REPOSITORY_ROOT))).resolve()
CONTRACT_ROOT = Path(os.environ.get("BROWSER_SMOKE_CONTRACT_ROOT", str(ROOT))).resolve()
ROUTE_CONTRACT_PATH = CONTRACT_ROOT / "content" / "staging-route-contract.json"
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
    """Require an empty screenshot-evidence directory outside the checkout."""
    if not raw_path or not raw_path.strip():
        raise ValueError("a screenshot evidence directory is required")
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


def validate_local_report_path(raw_path: str) -> Path:
    """Require a JSON evidence report outside the repository checkout."""
    if not raw_path or not raw_path.strip():
        raise ValueError("a visual-evidence report path is required")
    destination = Path(raw_path).expanduser().resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError("write visual-evidence reports outside the repository checkout")
    if destination == Path(destination.anchor):
        raise ValueError("the filesystem root cannot be used as a report path")
    if destination.suffix.lower() != ".json":
        raise ValueError("the visual-evidence report must use a .json extension")
    if destination.exists() and destination.is_dir():
        raise ValueError("the visual-evidence report path must be a file")
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
        "schemaVersion": 5,
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
            "required": True,
            "captureMode": "full-page PNG",
            "expectedScreenshotCount": len(expected_screenshots),
            "capturedScreenshotCount": len(screenshot_records),
            "complete": screenshot_complete,
            "reviewStatus": "PENDING_OWNER_REVIEW",
            "ownerApproved": False,
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
            str(REPOSITORY_ROOT / "scripts" / "test-static-server.py"),
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


def run_responsive_image_preview_smoke() -> int:
    """Audit packaged responsive image selection at six breakpoints and DPR 1/2."""
    failures: list[str] = []
    checked_pictures = 0
    routes_with_responsive_images: set[str] = set()
    max_selected_to_required_ratio = 0.0
    server = None
    browser = None

    def check_preview(condition: bool, message: str) -> None:
        if not condition:
            failures.append(message)

    try:
        server, base_url = start_server()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            for width, height in RESPONSIVE_AUDIT_VIEWPORTS:
                for device_scale_factor in (1, 2):
                    for page_name in PAGES:
                        context = browser.new_context(
                            viewport={"width": width, "height": height},
                            device_scale_factor=device_scale_factor,
                        )
                        install_navigation_guard(context, base_url)
                        page = context.new_page()
                        request_counts: dict[str, int] = {}
                        image_responses: dict[str, int] = {}
                        image_request_failures: dict[str, str] = {}

                        def record_request(request) -> None:
                            if same_origin(request.url, base_url):
                                request_counts[request.url] = request_counts.get(request.url, 0) + 1

                        def record_image_response(response) -> None:
                            image_path = urlsplit(response.url).path.lower()
                            if same_origin(response.url, base_url) and Path(image_path).suffix in {".jpg", ".jpeg", ".png", ".webp", ".avif"}:
                                image_responses[response.url] = response.status

                        def record_image_request_failed(request) -> None:
                            image_path = urlsplit(request.url).path.lower()
                            if same_origin(request.url, base_url) and Path(image_path).suffix in {".jpg", ".jpeg", ".png", ".webp", ".avif"}:
                                image_request_failures[request.url] = request.failure or "request failed"

                        page.on("request", record_request)
                        page.on("response", record_image_response)
                        page.on("requestfailed", record_image_request_failed)
                        try:
                            response = page.goto(
                                base_url + page_name,
                                wait_until="domcontentloaded",
                                timeout=15000,
                            )
                            if response is None or response.status != 200:
                                failures.append(
                                    f"{page_name} at {width}px: expected HTTP 200 for packaged preview"
                                )
                                continue

                            # The preview is an automated rendering check, not an animation test.
                            # Disable transitions and smooth scrolling so layout motion cannot make
                            # Playwright's stability heuristic time out while inspecting lazy images.
                            page.emulate_media(reduced_motion="reduce")
                            page.add_style_tag(content="""
                                *, *::before, *::after {
                                    animation-delay: 0s !important;
                                    animation-duration: 0s !important;
                                    animation-iteration-count: 1 !important;
                                    scroll-behavior: auto !important;
                                    transition-delay: 0s !important;
                                    transition-duration: 0s !important;
                                }
                            """)

                            pictures = page.locator(
                                'picture:has(source[data-responsive-image="true"])'
                            )
                            picture_count = pictures.count()

                            for index in range(picture_count):
                                picture = pictures.nth(index)
                                source = picture.locator('source[data-responsive-image="true"]').first
                                image = picture.locator("img").first
                                label = f"{page_name} at {width}px @{device_scale_factor}x picture {index + 1}"
                                # Exercise every responsive picture in the real package, including
                                # offscreen and inactive carousel/gallery slides. Force eager loading
                                # only in this isolated test context; production loading policy is
                                # checked below and remains unchanged in the artifact.
                                production_loading = image.get_attribute("loading") or ""
                                image.evaluate("(img) => { img.loading = 'eager'; img.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}); }")
                                image.wait_for(state="attached")
                                try:
                                    image.evaluate(
                                        """async (img) => {
                                          if (!img.complete) {
                                            await new Promise((resolve, reject) => {
                                              const timeout = setTimeout(() => {
                                                cleanup();
                                                reject(new Error('timed out waiting for offscreen image: ' + (img.currentSrc || img.src)));
                                              }, 8000);
                                              const cleanup = () => {
                                                clearTimeout(timeout);
                                                img.removeEventListener('load', onLoad);
                                                img.removeEventListener('error', onError);
                                              };
                                              const onLoad = () => { cleanup(); resolve(); };
                                              const onError = () => { cleanup(); reject(new Error('offscreen image request failed: ' + (img.currentSrc || img.src))); };
                                              img.addEventListener('load', onLoad, {once: true});
                                              img.addEventListener('error', onError, {once: true});
                                            });
                                          }
                                        }"""
                                    )
                                except Exception as error:
                                    failures.append(
                                        f"{label}: could not load image after activating the test-only eager path: "
                                        f"{type(error).__name__}: {sanitize_diagnostic_text(error)}"
                                    )
                                    continue
                                routes_with_responsive_images.add(page_name)
                                checked_pictures += 1
                                try:
                                    image.evaluate(
                                        "(img) => img.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'})"
                                    )
                                    details = image.evaluate(
                                        """async (img) => {
                                          const waitForImageLoad = () => new Promise((resolve, reject) => {
                                            const cleanup = () => {
                                              clearTimeout(timer);
                                              img.removeEventListener('load', onLoad);
                                              img.removeEventListener('error', onError);
                                            };
                                            const onLoad = () => { cleanup(); resolve(); };
                                            const onError = () => {
                                              cleanup();
                                              reject(new Error('image request failed for ' + (img.currentSrc || img.src)));
                                            };
                                            const timer = setTimeout(() => {
                                              cleanup();
                                              reject(new Error('timed out waiting for image load: ' + (img.currentSrc || img.src)));
                                            }, 8000);
                                            img.addEventListener('load', onLoad, {once: true});
                                            img.addEventListener('error', onError, {once: true});
                                          });
                                          if (!img.complete) await waitForImageLoad();
                                          if (!img.naturalWidth || !img.naturalHeight) {
                                            throw new Error('image completed without decodable pixels: currentSrc='
                                              + (img.currentSrc || '<empty>') + '; fallback='
                                              + (img.getAttribute('src') || '<empty>'));
                                          }
                                          const selectedBeforeDecode = img.currentSrc;
                                          try {
                                            await img.decode();
                                          } catch (error) {
                                            const selectedAfterDecode = img.currentSrc;
                                            if (selectedAfterDecode && selectedAfterDecode !== selectedBeforeDecode
                                                && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                                              await img.decode();
                                            } else {
                                              throw new Error('decode failed for '
                                                + (selectedAfterDecode || selectedBeforeDecode || '<empty>')
                                                + '; fallback=' + (img.getAttribute('src') || '<empty>')
                                                + '; natural=' + img.naturalWidth + 'x' + img.naturalHeight
                                                + '; cause=' + error.message);
                                            }
                                          }
                                          const box = img.getBoundingClientRect();
                                          const carouselViewport = img.closest('.experience-carousel__viewport');
                                          const renderedWidth = box.width || (carouselViewport
                                            ? carouselViewport.getBoundingClientRect().width : 0);
                                          const classes = Array.from(img.classList);
                                          return {
                                            currentSrc: img.currentSrc,
                                            fallbackSrc: img.getAttribute('src') || '',
                                            width: img.naturalWidth,
                                            height: img.naturalHeight,
                                            renderedWidth,
                                            devicePixelRatio: window.devicePixelRatio,
                                            declaredWidth: img.getAttribute('width') || '',
                                            declaredHeight: img.getAttribute('height') || '',
                                            loading: img.getAttribute('loading') || '',
                                            decoding: img.getAttribute('decoding') || '',
                                            fetchpriority: img.getAttribute('fetchpriority') || '',
                                            classes,
                                            alt: img.getAttribute('alt')
                                          };
                                        }"""
                                    )
                                    source_details = source.evaluate(
                                        """(element) => ({
                                          type: element.getAttribute('type') || '',
                                          srcset: element.getAttribute('srcset') || '',
                                          sizes: element.getAttribute('sizes') || ''
                                        })"""
                                    )
                                except Exception as error:
                                    try:
                                        selected_url = image.evaluate("(img) => img.currentSrc")
                                        fallback_url = image.get_attribute("src") or "<empty>"
                                        source_srcset = source.get_attribute("srcset") or "<empty>"
                                    except Exception:
                                        selected_url, fallback_url, source_srcset = "", "<unavailable>", "<unavailable>"
                                    selected_status = image_responses.get(selected_url, "not observed")
                                    selected_failure = image_request_failures.get(selected_url, "none recorded")
                                    failures.append(
                                        f"{label}: responsive image failed to decode or inspect: "
                                        f"{type(error).__name__}: {sanitize_diagnostic_text(error)}; "
                                        f"selected={safe_url_label(selected_url) if selected_url else '<empty>'}; "
                                        f"http={selected_status}; requestFailure={sanitize_diagnostic_text(selected_failure)}; "
                                        f"fallback={fallback_url}; srcset={source_srcset}"
                                    )
                                    continue

                                check_preview(
                                    source_details["type"].lower() == "image/webp",
                                    f"{label}: responsive source must declare image/webp",
                                )
                                check_preview(
                                    bool(source_details["sizes"].strip()),
                                    f"{label}: responsive source must declare sizes",
                                )
                                candidate_pairs: list[tuple[str, int]] = []
                                for raw_candidate in source_details["srcset"].split(","):
                                    pieces = raw_candidate.strip().rsplit(None, 1)
                                    if len(pieces) != 2:
                                        continue
                                    width_match = re.fullmatch(r"([1-9][0-9]*)w", pieces[1])
                                    if width_match:
                                        candidate_pairs.append((
                                            pieces[0].split("?", 1)[0].lstrip("/"),
                                            int(width_match.group(1)),
                                        ))
                                candidates = [path for path, _width in candidate_pairs]
                                check_preview(
                                    len(candidates) >= 2,
                                    f"{label}: responsive source must expose multiple width candidates",
                                )
                                selected_path = urlsplit(details["currentSrc"]).path.lstrip("/")
                                candidate_paths = [
                                    candidate.split("?", 1)[0].lstrip("/")
                                    for candidate in candidates
                                ]
                                check_preview(
                                    selected_path.endswith(".webp") and selected_path in candidate_paths,
                                    f"{label}: Chromium selected a WebP candidate declared by srcset; "
                                    f"selected {selected_path or '<empty>'}",
                                )
                                selected_width = next(
                                    (width for candidate_path, width in candidate_pairs if candidate_path == selected_path),
                                    None,
                                )
                                check_preview(
                                    selected_width is not None,
                                    f"{label}: selected WebP width descriptor must be recoverable from srcset",
                                )
                                check_preview(
                                    details["renderedWidth"] > 0,
                                    f"{label}: responsive image slot must have a measurable rendered width",
                                )
                                if selected_width is not None and details["renderedWidth"] > 0:
                                    required_pixels = float(details["renderedWidth"]) * device_scale_factor
                                    ratio = selected_width / required_pixels
                                    max_selected_to_required_ratio = max(max_selected_to_required_ratio, ratio)
                                    check_preview(
                                        selected_width <= required_pixels * 1.9,
                                        f"{label}: selected WebP {selected_width}px exceeds 1.9x "
                                        f"rendered slot demand ({required_pixels:.1f}px); verify sizes",
                                    )
                                check_preview(
                                    details["fallbackSrc"].lower().endswith((".jpg", ".jpeg")),
                                    f"{label}: JPEG fallback must remain available",
                                )
                                check_preview(
                                    details["width"] > 0 and details["height"] > 0,
                                    f"{label}: selected image must have positive natural dimensions",
                                )
                                check_preview(
                                    details["declaredWidth"].isdigit()
                                    and int(details["declaredWidth"]) > 0
                                    and details["declaredHeight"].isdigit()
                                    and int(details["declaredHeight"]) > 0,
                                    f"{label}: intrinsic width/height must reserve layout space",
                                )
                                check_preview(
                                    details["decoding"].lower() == "async",
                                    f"{label}: responsive image must decode asynchronously",
                                )
                                check_preview(
                                    details["alt"] is not None,
                                    f"{label}: image must retain an alt attribute",
                                )
                                is_hero = (
                                    details["fetchpriority"].lower() == "high"
                                    or "hero__image" in details["classes"]
                                )
                                expected_loading = "eager" if is_hero else "lazy"
                                check_preview(
                                    production_loading.lower() == expected_loading,
                                    f"{label}: expected loading={expected_loading}",
                                )

                                if is_hero:
                                    preload_count = page.locator(
                                        'link[rel="preload"][as="image"][imagesrcset]'
                                    ).count()
                                    matching_preload = False
                                    for preload_index in range(preload_count):
                                        preload = page.locator(
                                            'link[rel="preload"][as="image"][imagesrcset]'
                                        ).nth(preload_index)
                                        matching_preload = matching_preload or (
                                            preload.get_attribute("imagesrcset") == source_details["srcset"]
                                            and preload.get_attribute("imagesizes") == source_details["sizes"]
                                            and (preload.get_attribute("type") or "").lower() == "image/webp"
                                        )
                                    check_preview(
                                        matching_preload,
                                        f"{label}: hero responsive preload must match source srcset and sizes",
                                    )

                                selected_request_count = request_counts.get(details["currentSrc"], 0)
                                check_preview(
                                    selected_request_count == 1,
                                    f"{label}: selected WebP candidate should be requested once, "
                                    f"observed {selected_request_count}",
                                )

                            page.wait_for_timeout(50)
                            for request_url, request_count in request_counts.items():
                                request_path = urlsplit(request_url).path.lower()
                                if request_path.endswith(".webp") and request_count > 1:
                                    failures.append(
                                        f"{page_name} at {width}px: duplicate WebP request "
                                        f"({request_count}): {safe_url_label(request_url)}"
                                    )
                        finally:
                            context.close()

            browser.close()
            browser = None
    except Exception as error:
        failures.append(
            f"Packaged responsive-image browser smoke could not complete: "
            f"{type(error).__name__}: {sanitize_diagnostic_text(error)}"
        )
    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)

    if not routes_with_responsive_images:
        failures.append("Packaged preview did not expose responsive image markup on any core route")
    if not checked_pictures:
        failures.append("Packaged preview did not exercise any responsive picture")

    if failures:
        print(f"FAIL: packaged responsive-image browser smoke found {len(failures)} issue(s)")
        for failure in failures:
            print(f" - {failure}")
        return 1

    viewport_widths = ", ".join(str(width) for width, _height in RESPONSIVE_AUDIT_VIEWPORTS)
    print(
        "PASS: packaged responsive-image browser smoke checked "
        f"{checked_pictures} picture instances across {len(routes_with_responsive_images)} routes "
        f"at {viewport_widths}px and DPR 1x/2x; maximum selected/required pixel ratio "
        f"{max_selected_to_required_ratio:.2f}x. Chromium selected declared WebP candidates, "
        "retained JPEG fallbacks, matched hero responsive preloads, and issued no duplicate WebP requests."
    )
    return 0


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
          f"{page_name}: canonical must remain gated pending explicit owner host approval")
    check(page.locator('meta[property="og:url"]').count() == 0,
          f"{page_name}: og:url must remain gated pending explicit owner host approval")
    check("https://hotelgarhjaisal.com" not in page.content(),
          f"{page_name}: unapproved canonical origin must not appear in public HTML")
    for label, value in (("Open Graph", og_image), ("Twitter", twitter_image)):
        parsed = urlparse(value or "")
        check(bool(value) and not parsed.scheme and not parsed.netloc and value.startswith("assets/images/"),
              f"{page_name}: {label} image must remain a local relative asset until canonical approval")



PREMIUM_JOURNEY_HREFS = ["rooms.html", "experiences.html", "dining.html", "directions.html#arrival-planning"]
PREMIUM_JOURNEY_CURRENT = {
    "rooms.html": "rooms.html",
    "experiences.html": "experiences.html",
    "dining.html": "dining.html",
    "directions.html": "directions.html#arrival-planning",
}


def check_premium_guest_journey(page, page_name: str, viewport_width: int) -> None:
    """Verify the real rendered planning rail at every responsive breakpoint."""
    rail = page.locator(".guest-journey")
    if page_name == "index.html":
        check(rail.count() == 0, "index.html: home planning panel should not duplicate the shared journey rail")
        panel = page.locator(".home-plan-panel")
        check(panel.count() == 1, "index.html: expected one existing home planning panel")
        links = panel.locator("a.home-plan-path")
        check(links.count() == 4, "index.html: home planning panel must expose four decision paths")
        if links.count() == 4:
            actual = [link.get_attribute("href") for link in links.all()]
            check(actual == PREMIUM_JOURNEY_HREFS,
                  "index.html: home planning paths must align with Stay / Explore / Dine / Arrive order")
            for link in links.all():
                check(link.is_visible(), "index.html: every home planning path must be visible")
                box = link.bounding_box()
                if box:
                    check(box["width"] >= 44 and box["height"] >= 44,
                          "index.html: home planning paths must remain usable tap/click targets")
                    check(box["x"] >= -1 and box["x"] + box["width"] <= viewport_width + 1,
                          f"index.html: home planning path exceeds the {viewport_width}px viewport")
        return

    check(rail.count() == 1, f"{page_name}: expected exactly one rendered premium guest-journey rail at {viewport_width}px")
    if rail.count() != 1:
        return

    check(rail.is_visible(), f"{page_name} at {viewport_width}px: guest journey must be visible")
    nav = rail.locator('nav[aria-label="Stay planning steps"]')
    check(nav.count() == 1, f"{page_name}: journey must expose one labelled navigation landmark")
    links = rail.locator("a.guest-journey__step")
    check(links.count() == 4, f"{page_name}: journey must present four links at {viewport_width}px")
    if links.count() != 4:
        return

    actual_hrefs = [link.get_attribute("href") for link in links.all()]
    check(actual_hrefs == PREMIUM_JOURNEY_HREFS,
          f"{page_name} at {viewport_width}px: Stay / Explore / Dine / Arrive destination order changed")
    expected_current = PREMIUM_JOURNEY_CURRENT.get(page_name)
    active_links = rail.locator('a.guest-journey__step[aria-current="page"]')
    check(active_links.count() == (1 if expected_current else 0),
          f"{page_name}: current journey step must be present only for an exact matching destination")
    if expected_current and active_links.count() == 1:
        check(active_links.get_attribute("href") == expected_current,
              f"{page_name}: active journey state points at the wrong page")

    for link in links.all():
        check(link.is_visible(), f"{page_name}: journey link must be visible at {viewport_width}px")
        href = link.get_attribute("href") or ""
        parsed_href = urlparse(href)
        check(parsed_href.path in PAGES and not parsed_href.scheme and not parsed_href.netloc,
              f"{page_name}: journey link must resolve to a listed same-site route ({href})")
        if parsed_href.path == "directions.html":
            check(parsed_href.fragment == "arrival-planning",
                  f"{page_name}: Arrive link must target the planner, not the top of Directions ({href})")
        box = link.bounding_box()
        if box:
            check(box["width"] >= 44 and box["height"] >= 44,
                  f"{page_name} at {viewport_width}px: journey tap target is smaller than 44 CSS pixels")
            check(box["x"] >= -1 and box["x"] + box["width"] <= viewport_width + 1,
                  f"{page_name} at {viewport_width}px: journey link exceeds the viewport")

    metrics = rail.evaluate("""(element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth
      };
    }""")
    check(metrics["left"] >= -1 and metrics["right"] <= viewport_width + 1,
          f"{page_name} at {viewport_width}px: journey rail must remain inside the viewport ({metrics})")
    check(metrics["scrollWidth"] <= metrics["clientWidth"] + 1,
          f"{page_name} at {viewport_width}px: journey content must not overflow its own rail ({metrics})")



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


def check_stay_planner(page, base_url: str) -> None:
    """Exercise the shared enquiry planner, editable draft, and deliberate WhatsApp handoff."""

    # The home page already has its own four-path planning panel; do not duplicate it.
    home_response = page.goto(base_url + "index.html", wait_until="domcontentloaded", timeout=15000)
    check(home_response is not None and home_response.status == 200,
          "Home conversion panel route should load")
    check(page.locator("[data-stay-planner]").count() == 0,
          "Home: avoid repeating the multi-topic planner after the purpose-built planning panel")
    check(page.locator("#plan-stay .home-plan-path").count() == 4,
          "Home: keep the four primary Stay / Explore / Dine / Arrive decision paths")
    check(page.locator('script[src="assets/stay-planner.js"]').count() == 0,
          "Home: do not load the generic planner runtime when its component is absent")
    page.goto(base_url + "rooms.html", wait_until="domcontentloaded", timeout=15000)
    page.goto(base_url + "rooms.html", wait_until="domcontentloaded", timeout=15000)
    planner = page.locator("[data-stay-planner]")
    check(planner.count() == 1, "Stay planner should appear once on the Rooms route")
    if planner.count() != 1:
        return
    details = planner.locator("[data-stay-planner-disclosure]")
    details.locator("summary").click()
    form = planner.locator("[data-stay-planner-form]")
    arrival = form.locator("#stay-plan-arrival")
    departure = form.locator("#stay-plan-departure")
    guests = form.locator("#stay-plan-guests")
    draft = planner.locator("#stay-plan-draft")
    status = planner.locator("[data-stay-plan-status]")
    whatsapp_button = planner.locator("[data-open-stay-plan-whatsapp]")
    copy_button = planner.locator("[data-copy-stay-plan]")

    arrival.fill("2099-01-10")
    departure.fill("2099-01-10")
    check(not departure.evaluate("(element) => element.checkValidity()"),
          "Stay planner must reject a departure date on the arrival date")
    departure.fill("2099-01-12")
    guests.select_option("3")
    form.locator('[data-stay-plan-topic][value="room options and total rates"]').check()
    form.locator("#stay-plan-notes").fill("Arriving after sunset")
    non_get_requests: list[str] = []
    page.on("request", lambda request: non_get_requests.append(request.url)
            if request.method.upper() not in {"GET", "HEAD", "OPTIONS"} else None)
    page.evaluate("""() => {
      window.__stayPlanOriginalOpen = window.open;
      window.__stayPlanOpenedUrl = null;
      window.open = (url) => { window.__stayPlanOpenedUrl = String(url); return null; };
    }""")
    form.locator('button[type="submit"]').click()
    check(planner.locator("[data-stay-plan-result]").is_visible(),
          "Stay planner should reveal a reviewable draft after valid input")
    message = draft.input_value()
    check("10 January 2099" in message and "12 January 2099" in message,
          "Stay planner draft should include the requested arrival and departure dates")
    check("Travelling party: 3 people." in message and "room options and total rates" in message,
          "Stay planner draft should include party size and selected planning topics")
    check("Arriving after sunset" in message and "does not confirm a booking" in message,
          "Stay planner draft should preserve optional notes and clear enquiry-only language")
    check("Nothing has been sent or saved." in status.inner_text(),
          "Stay planner must confirm that the draft remains local to the page")
    check(page.url.endswith("/rooms.html"), "Stay planner must not navigate away when building a draft")
    check(not non_get_requests, "Stay planner must not submit the enquiry form over the network")
    check(page.evaluate("window.__stayPlanOpenedUrl") is None,
          "Preparing an enquiry must not launch WhatsApp automatically")

    edited_message = message + "\nGuest note: A&B + 50% / room"
    draft.fill(edited_message)
    check(copy_button.is_enabled(), "The editable draft must retain its copy fallback")
    ready = False
    try:
        page.wait_for_function(
            "() => { const button = document.querySelector('[data-open-stay-plan-whatsapp]'); return Boolean(button && !button.disabled); }",
            timeout=5000,
        )
        ready = True
    except Exception:
        ready = False
    check(ready, "WhatsApp handoff must enable after contact configuration and a draft are ready")
    if ready:
        whatsapp_button.click()
        opened_url = page.evaluate("window.__stayPlanOpenedUrl")
        parsed_target = page.evaluate("""raw => {
          try {
            const url = new URL(raw);
            return {protocol: url.protocol, hostname: url.hostname, pathname: url.pathname, text: url.searchParams.get('text')};
          } catch (_) { return null; }
        }""", opened_url)
        path_digits = (parsed_target or {}).get("pathname", "").strip("/")
        check(bool(parsed_target) and parsed_target["protocol"] == "https:"
              and parsed_target["hostname"] == "wa.me"
              and path_digits.isdigit() and 8 <= len(path_digits) <= 15,
              "WhatsApp handoff must use the centrally authorized HTTPS wa.me destination")
        check(bool(parsed_target) and parsed_target["text"] == edited_message,
              "WhatsApp handoff must safely encode the exact guest-edited draft")
        check("press Send yourself" in status.inner_text(),
              "WhatsApp handoff must clearly require the guest to review and send manually")
        check(page.url.endswith("/rooms.html"),
              "WhatsApp handoff test must not navigate the site or send guest details from the page")
    page.evaluate("""() => {
      if (typeof window.__stayPlanOriginalOpen === 'function') window.open = window.__stayPlanOriginalOpen;
      delete window.__stayPlanOriginalOpen;
      delete window.__stayPlanOpenedUrl;
    }""")

    # A failed or disabled script must not turn guest dates and notes into a GET query.
    browser = page.context.browser
    if browser is None:
        check(False, "Stay planner privacy fallback requires an attached browser context")
    else:
        # A tab left open across local midnight must reject the previous day.
        rollover_context = browser.new_context()
        try:
            rollover_context.add_init_script(
                """(() => {
                  const NativeDate = Date;
                  let now = new NativeDate(2099, 0, 10, 12, 0, 0).getTime();
                  Object.defineProperty(window, '__setPlannerClock', {
                    value(year, month, day) {
                      now = new NativeDate(year, month - 1, day, 12, 0, 0).getTime();
                    },
                  });
                  class ControlledDate extends NativeDate {
                    constructor(...args) {
                      if (args.length === 0) super(now);
                      else super(...args);
                    }
                    static now() { return now; }
                  }
                  window.Date = ControlledDate;
                })();"""
            )
            rollover_page = rollover_context.new_page()
            rollover_page.goto(base_url + "rooms.html", wait_until="domcontentloaded", timeout=15000)
            rollover_planner = rollover_page.locator("[data-stay-planner]")
            rollover_planner.locator("[data-stay-planner-disclosure] summary").click()
            rollover_arrival = rollover_planner.locator("#stay-plan-arrival")
            rollover_departure = rollover_planner.locator("#stay-plan-departure")
            rollover_arrival.fill("2099-01-10")
            rollover_page.evaluate("window.__setPlannerClock(2099, 1, 11)")
            rollover_arrival.dispatch_event("change")
            check(
                rollover_arrival.get_attribute("min") == "2099-01-11",
                "Stay planner must advance the arrival minimum after local midnight",
            )
            check(
                not rollover_arrival.evaluate("(element) => element.checkValidity()"),
                "Stay planner must reject an arrival date that became historical while the tab was open",
            )
            check(
                rollover_departure.get_attribute("min") == "2099-01-11",
                "Stay planner must keep departure minimum at today when arrival is now historical",
            )
        finally:
            rollover_context.close()

        fallback_context = browser.new_context(java_script_enabled=False)
        try:
            fallback_page = fallback_context.new_page()
            fallback_page.goto(base_url + "rooms.html", wait_until="domcontentloaded", timeout=15000)
            fallback_planner = fallback_page.locator("[data-stay-planner]")
            fallback_planner.locator("[data-stay-planner-disclosure] summary").click()
            fallback_notice = fallback_planner.locator(".stay-planner__no-script")
            check(
                fallback_notice.is_visible(),
                "Stay planner must show a usable privacy notice when JavaScript is disabled",
            )
            check(
                "Nothing entered here is sent or saved" in fallback_notice.inner_text(),
                "Stay planner no-JavaScript notice must explain that guest details are not transmitted or stored",
            )
            fallback_form = fallback_planner.locator("[data-stay-planner-form]")
            fallback_form.locator("#stay-plan-arrival").fill("2099-01-10")
            fallback_form.locator("#stay-plan-departure").fill("2099-01-12")
            fallback_form.locator("#stay-plan-guests").select_option("3")
            fallback_form.locator("#stay-plan-notes").fill("NOJS-PRIVACY-SENTINEL-20261029")
            fallback_navigation_requests: list[str] = []
            fallback_page.on(
                "request",
                lambda request: fallback_navigation_requests.append(request.url)
                if request.is_navigation_request() else None,
            )
            fallback_url = fallback_page.url
            fallback_form.locator('button[type="submit"]').click()
            fallback_page.wait_for_timeout(200)
            check(
                fallback_page.url == fallback_url,
                "Stay planner must not navigate or serialize guest details when JavaScript is disabled",
            )
            check(
                not fallback_navigation_requests,
                "Stay planner no-JS fallback must not issue a document navigation",
            )
            check(
                "NOJS-PRIVACY-SENTINEL-20261029" not in fallback_page.url,
                "Stay planner notes must never appear in a URL when JavaScript is disabled",
            )
        finally:
            fallback_context.close()

    planner.locator("[data-edit-stay-plan]").click()
    check(planner.locator("[data-stay-plan-result]").is_hidden(),
          "Stay planner should let visitors revise their draft inputs")

    # Keep the multi-topic planner only where a more specific conversion form is not present.
    context_specific_routes = {
        "experiences.html": "[data-guest-enquiry-form]",
        "experience-details.html": "[data-guest-enquiry-form]",
        "dining.html": "[data-restaurant-table-form]",
    }
    for route in (
        "rooms.html", "experiences.html", "experience-details.html",
        "dining.html", "about.html", "gallery.html",
    ):
        response = page.goto(base_url + route, wait_until="domcontentloaded", timeout=15000)
        check(response is not None and response.status == 200,
              f"{route}: conversion route should load before handoff testing")
        route_planner = page.locator("[data-stay-planner]")
        if route in context_specific_routes:
            check(route_planner.count() == 0,
                  f"{route}: a purpose-built enquiry route must not repeat the generic stay planner")
            check(page.locator('script[src="assets/stay-planner.js"]').count() == 0,
                  f"{route}: do not load unused generic planner runtime")
            check(page.locator(context_specific_routes[route]).count() == 1,
                  f"{route}: purpose-built conversion form should remain available")
            if route == "dining.html":
                check(page.locator("[data-guest-enquiry-form]").count() == 1,
                      "Dining: retain the separate stay/experience enquiry as a distinct intent")
                check("not reserved" in page.locator(".dining-table-panel__notice").inner_text().lower(),
                      "Dining: the table request must be distinguished from a confirmed reservation")
            continue
        check(route_planner.count() == 1, f"{route}: planner must appear exactly once")
        if route_planner.count() != 1:
            continue
        route_planner.locator("[data-stay-planner-disclosure] summary").click()
        route_form = route_planner.locator("[data-stay-planner-form]")
        route_form.locator("#stay-plan-arrival").fill("2099-02-10")
        route_form.locator("#stay-plan-departure").fill("2099-02-12")
        route_form.locator("#stay-plan-guests").select_option("2")
        route_form.locator("[data-stay-plan-topic]").first.check()
        route_draft = route_planner.locator("#stay-plan-draft")
        route_status = route_planner.locator("[data-stay-plan-status]")
        page.evaluate("""() => {
          window.__stayPlanOriginalOpen = window.open;
          window.__stayPlanOpenedUrl = null;
          window.open = (url) => { window.__stayPlanOpenedUrl = String(url); return null; };
        }""")
        route_form.locator('button[type="submit"]').click()
        check(route_planner.locator("[data-stay-plan-result]").is_visible(),
              f"{route}: valid details should create a local reviewable draft")
        route_message = route_draft.input_value()
        check("10 February 2099" in route_message and "12 February 2099" in route_message,
              f"{route}: draft should retain its requested dates")
        check(page.evaluate("window.__stayPlanOpenedUrl") is None,
              f"{route}: preparing a draft must not open WhatsApp automatically")
        route_ready = False
        try:
            page.wait_for_function(
                "() => { const button = document.querySelector('[data-open-stay-plan-whatsapp]'); return Boolean(button && !button.disabled); }",
                timeout=5000,
            )
            route_ready = True
        except Exception:
            route_ready = False
        check(route_ready, f"{route}: WhatsApp handoff must enable with authorized configuration and a draft")
        if route_ready:
            route_planner.locator("[data-open-stay-plan-whatsapp]").click()
            opened_url = page.evaluate("window.__stayPlanOpenedUrl")
            parsed_target = page.evaluate("""raw => {
              try {
                const url = new URL(raw);
                return {protocol: url.protocol, hostname: url.hostname, pathname: url.pathname, text: url.searchParams.get('text')};
              } catch (_) { return null; }
            }""", opened_url)
            path_digits = (parsed_target or {}).get("pathname", "").strip("/")
            check(bool(parsed_target) and parsed_target["protocol"] == "https:"
                  and parsed_target["hostname"] == "wa.me"
                  and path_digits.isdigit() and 8 <= len(path_digits) <= 15,
                  f"{route}: handoff must use the authorized HTTPS wa.me destination")
            check(bool(parsed_target) and parsed_target["text"] == route_message,
                  f"{route}: encoded WhatsApp draft must match the generated guest enquiry")
            check("press Send yourself" in route_status.inner_text(),
                  f"{route}: handoff must preserve the guest-controlled send step")
        page.evaluate("""() => {
          if (typeof window.__stayPlanOriginalOpen === 'function') window.open = window.__stayPlanOriginalOpen;
          delete window.__stayPlanOriginalOpen;
          delete window.__stayPlanOpenedUrl;
        }""")
        check(page.url.endswith("/" + route),
              f"{route}: preparing and opening a WhatsApp draft must not navigate the site")

    directions_response = page.goto(base_url + "directions.html", wait_until="domcontentloaded", timeout=15000)
    check(directions_response is not None and directions_response.status == 200,
          "Directions: dedicated arrival planner route should load")
    check(page.locator("[data-stay-planner]").count() == 0,
          "Directions: do not repeat the generic stay planner after the dedicated arrival form")
    check(page.locator("[data-arrival-planning-form]").count() == 1,
          "Directions: keep exactly one dedicated arrival enquiry form")
    check(page.locator("#arrival-enquiry-title").is_visible(),
          "Directions: the purpose-built arrival planner heading must remain visible")
    check(page.locator('script[src="assets/stay-planner.js"]').count() == 0,
          "Directions: do not load the redundant generic planner runtime")

    check(not non_get_requests,
          "Stay planner handoff must not submit guest details using a non-GET request")

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
    # Directions M2: validate in-page wayfinding and responsive navigation without opening external links.
    section_nav = page.locator("nav.arrival-section-nav")
    check(section_nav.count() == 1 and section_nav.is_visible(),
          "Directions must expose one visible, named section navigation")
    expected_sections = [
        ("Quick directions", "#arrival-overview-title"),
        ("Travel options", "#travel-options-title"),
        ("Walking & mobility", "#walking-access-title"),
        ("Map & navigation", "#arrival-map-title"),
        ("FAQs", "#arrival-faq-title"),
    ]
    for label, href in expected_sections:
        link = section_nav.get_by_role("link", name=label, exact=True)
        check(link.count() == 1 and link.get_attribute("href") == href,
              f"Directions section navigation must target {href}")
        check(page.locator(href).count() == 1,
              f"Directions section navigation target {href} must exist exactly once")
    for width in (320, 390, 768, 1280):
        page.set_viewport_size({"width": width, "height": 900})
        dimensions = page.evaluate(
            "() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth })"
        )
        check(dimensions["document"] <= dimensions["viewport"] + 1,
              f"Directions section navigation must not cause horizontal page overflow at {width}px")
    page.set_viewport_size({"width": 1280, "height": 900})
    section_nav.get_by_role("link", name="Walking & mobility", exact=True).click()
    check(urlparse(page.url).fragment == "walking-access-title",
          "Walking & mobility navigation must update the in-page fragment")
    check(page.locator("#walking-access-title").is_visible(),
          "Walking & mobility navigation must target a visible heading")
    section_nav.get_by_role("link", name="Map & navigation", exact=True).click()
    check(urlparse(page.url).fragment == "arrival-map-title",
          "Map & navigation must update the in-page fragment")
    check(page.locator("#arrival-map-title").is_visible(),
          "Map & navigation must target a visible heading")

    # This smoke test inspects the destination but never opens the external map.

    # This test only inspects links; it never navigates to the provider or submits guest data.



def check_direct_enquiry_dock(page, base_url: str) -> None:
    """Exercise the contextual enquiry dock without following WhatsApp or sending data."""
    response = page.goto(base_url + "about.html", wait_until="domcontentloaded", timeout=15000)
    check(response is not None and response.status == 200, "direct enquiry dock: expected About route HTTP 200")
    page.wait_for_selector("main#main", timeout=5000)
    dock = page.locator("[data-direct-enquiry-dock]")
    check(dock.count() == 1, "direct enquiry dock: expected exactly one dock on the route")
    if dock.count() != 1:
        return
    check(dock.is_hidden(), "direct enquiry dock: it must start hidden at the top of the page")

    page.evaluate("window.scrollTo(0, 420)")
    page.wait_for_function(
        "() => { const dock = document.querySelector('[data-direct-enquiry-dock]'); return dock && !dock.hidden; }",
        timeout=5000,
    )
    check(dock.is_visible(), "direct enquiry dock: it should appear after scrolling")
    action = dock.locator("a[data-enquiry-link]")
    check(action.count() == 1, "direct enquiry dock: expected one validated enquiry action")
    if action.count() == 1:
        page.wait_for_function(
            "() => { const link = document.querySelector('[data-direct-enquiry-dock] a[data-enquiry-link]'); return link && /^https:\\/\\/wa\\.me\\//i.test(link.href); }",
            timeout=5000,
        )
        href = action.get_attribute("href") or ""
        parsed = urlparse(href)
        check(parsed.scheme == "https" and parsed.hostname == "wa.me"
              and bool(re.fullmatch(r"/\d{8,15}", parsed.path)),
              "direct enquiry dock: CTA must use the authorized HTTPS WhatsApp endpoint")
        check(action.get_attribute("target") == "_blank",
              "direct enquiry dock: external draft must open separately for guest review")
        rel = set((action.get_attribute("rel") or "").lower().split())
        check({"noopener", "noreferrer"}.issubset(rel),
              "direct enquiry dock: external target must use noopener/noreferrer")
        message = action.evaluate("(link) => new URL(link.href).searchParams.get('text') || ''")
        check("room options" in message.lower() and "arrival" in message.lower(),
              "direct enquiry dock: About route must ask about rooms and arrival")
        check("nothing is sent automatically" in (dock.inner_text() or "").lower(),
              "direct enquiry dock: visitor disclosure must state draft-only behavior")

    for width in (320, 390, 1440):
        page.set_viewport_size({"width": width, "height": 900})
        page.evaluate("window.scrollTo(0, 420)")
        page.wait_for_function(
            "() => { const dock = document.querySelector('[data-direct-enquiry-dock]'); return dock && !dock.hidden; }",
            timeout=5000,
        )
        bounds = dock.bounding_box()
        check(bounds is not None, f"direct enquiry dock at {width}px: missing rendered geometry")
        if bounds:
            check(bounds["x"] >= -1 and bounds["x"] + bounds["width"] <= width + 1,
                  f"direct enquiry dock at {width}px: dock must remain inside the viewport ({bounds})")
            if width <= 520:
                mobile_bar = page.locator(".mobile-booking-bar")
                bar_bounds = mobile_bar.bounding_box()
                check(bar_bounds is not None and bounds["y"] + bounds["height"] <= bar_bounds["y"] - 1,
                      f"direct enquiry dock at {width}px: dock must sit above the fixed booking bar ({bounds}, {bar_bounds})")
        for selector in ("a[data-enquiry-link]", "[data-direct-enquiry-dismiss]"):
            box = dock.locator(selector).bounding_box()
            check(box is not None and box["width"] >= 44 and box["height"] >= 44,
                  f"direct enquiry dock at {width}px: {selector} must be at least 44px square")

    page.locator(".site-footer").scroll_into_view_if_needed(timeout=5000)
    page.wait_for_function(
        "() => { const dock = document.querySelector('[data-direct-enquiry-dock]'); return dock && dock.hidden; }",
        timeout=5000,
    )
    check(dock.is_hidden(), "direct enquiry dock: it must yield while the footer is visible")
    page.evaluate("window.scrollTo(0, 420)")
    page.wait_for_function(
        "() => { const dock = document.querySelector('[data-direct-enquiry-dock]'); return dock && !dock.hidden; }",
        timeout=5000,
    )
    dock.locator("[data-direct-enquiry-dismiss]").click()
    check(dock.is_hidden(), "direct enquiry dock: explicit dismissal must hide it")
    page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    page.evaluate("window.scrollTo(0, 420)")
    check(dock.is_hidden(), "direct enquiry dock: dismissal must persist while scrolling")
    page.set_viewport_size({"width": 1440, "height": 900})


def check_guest_enquiry_forms(page, base_url: str) -> None:
    # Capture the intended WhatsApp destination in-page. The test never opens
    # a real external tab, sends a message, or submits guest data to a service.
    page.add_init_script(
        """window.__guestEnquiryOpenCalls = [];
        window.__guestEnquiryClipboardWrites = [];
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async function(text) {
            window.__guestEnquiryClipboardWrites.push(String(text));
          } }
        });
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
        interest.select_option(label="Swiss tent overnight")
        check(departure.get_attribute("required") is not None,
              f"{page_name}: overnight and room enquiries must require a departure date")
        check("required" in page.locator("[data-departure-requirement-label]").inner_text().lower(),
              f"{page_name}: stay intent must update the visible departure requirement")
        check("overnight" in page.locator("[data-departure-hint]").inner_text().lower(),
              f"{page_name}: stay intent must explain why departure is required")

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
            "Interest: Swiss tent overnight",
            "Requested date / arrival: " + dates["day3"],
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
        recovery = page.locator("[data-guest-enquiry-recovery]")
        check(recovery.is_visible(),
              f"{page_name}: copyable draft fallback must appear after an explicit submit")
        fallback_text = page.locator("[data-guest-enquiry-draft]").input_value()
        check(fallback_text == draft["text"],
              f"{page_name}: fallback must expose the exact encoded WhatsApp draft text")
        page.locator("[data-guest-enquiry-copy]").click()
        page.wait_for_function(
            "() => Array.isArray(window.__guestEnquiryClipboardWrites) && window.__guestEnquiryClipboardWrites.length === 1",
            timeout=5000,
        )
        check(page.evaluate("window.__guestEnquiryClipboardWrites[0]") == draft["text"],
              f"{page_name}: copy action must copy the prepared message without sending it")
        check("copied" in page.locator("[data-guest-enquiry-status]").inner_text().lower(),
              f"{page_name}: copy result must be announced through the live status")
        check(page.evaluate("window.__guestEnquiryOpenCalls.length") == 1,
              f"{page_name}: one user submission must prepare exactly one draft")

        # A day experience needs one requested date only. A departure is
        # optional and must not leak into the WhatsApp draft when left blank.
        interest.select_option(label="Sunset camel safari")
        departure.fill("")
        arrival.fill(dates["day3"])
        check(departure.get_attribute("required") is None,
              f"{page_name}: day experiences must not require a departure date")
        check("optional" in page.locator("[data-departure-requirement-label]").inner_text().lower(),
              f"{page_name}: day intent must show that departure is optional")
        check("leave this blank" in page.locator("[data-departure-hint]").inner_text().lower(),
              f"{page_name}: day intent must explain the single-date flow")
        check(form.evaluate("(element) => element.checkValidity()"),
              f"{page_name}: a single future date must validate for a day experience")
        submit.click()
        page.wait_for_function(
            "() => Array.isArray(window.__guestEnquiryOpenCalls) && window.__guestEnquiryOpenCalls.length === 2",
            timeout=5000,
        )
        day_draft = page.evaluate(
            """() => {
              const call = window.__guestEnquiryOpenCalls[1];
              const url = new URL(call.url);
              return { text: url.searchParams.get('text') || '', currentUrl: window.location.href };
            }"""
        )
        check("Interest: Sunset camel safari" in day_draft["text"],
              f"{page_name}: day draft must retain the selected experience")
        check("Requested date / arrival: " + dates["day3"] in day_draft["text"],
              f"{page_name}: day draft must include the requested date")
        check(not re.search(r"^Departure:", day_draft["text"], re.M),
              f"{page_name}: blank optional departure must be omitted from the draft")
        check(same_origin(day_draft["currentUrl"], base_url),
              f"{page_name}: day draft test must remain on the site and must not send the message")
        check(page.evaluate("window.__guestEnquiryOpenCalls.length") == 2,
              f"{page_name}: each explicit submission must prepare exactly one draft")



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
          window.__tableEnquiryClipboardWrites = [];
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async function(text) {
              window.__tableEnquiryClipboardWrites.push(String(text));
            } }
          });
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
          and guests.get_attribute("step") == "1" and guests.get_attribute("max") is None,
          "Dining party size must accept positive whole-number requests without an unconfirmed maximum")
    check(guests.input_value() == "2",
          "Dining party size defaults to two but remains editable")
    check(requested_time.get_attribute("required") is None,
          "Dining preferred time must remain optional until service hours are owner-confirmed")
    check(note.get_attribute("maxlength") == "240" and note.get_attribute("required") is None,
          "The optional context note must remain bounded and optional")
    check(note.get_attribute("aria-describedby") == "restaurant-table-note-help"
          and page.locator("#restaurant-table-note-help").is_visible(),
          "The optional context note must expose its privacy guidance to assistive technology")

    guests.fill("0")
    check(not form.evaluate("(element) => element.checkValidity()"),
          "Dining table form must reject a party size below one")
    guests.fill("1.5")
    check(not form.evaluate("(element) => element.checkValidity()"),
          "Dining table form must reject fractional party sizes")
    guests.fill("21")
    check(form.evaluate("(element) => element.checkValidity()"),
          "Larger groups must be able to enquire; the restaurant confirms capacity and availability")
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
    table_recovery = page.locator("[data-restaurant-table-recovery]")
    check(table_recovery.is_visible(),
          "Dining: table draft fallback must appear after explicit submission")
    table_fallback = page.locator("[data-restaurant-table-draft]").input_value()
    check(table_fallback == draft["text"],
          "Dining: table fallback must preserve the exact WhatsApp draft text")
    page.locator("[data-restaurant-table-copy]").click()
    page.wait_for_function(
        "() => Array.isArray(window.__tableEnquiryClipboardWrites) && window.__tableEnquiryClipboardWrites.length === 1",
        timeout=5000,
    )
    check(page.evaluate("window.__tableEnquiryClipboardWrites[0]") == draft["text"],
          "Dining: copy action must copy the prepared table message without sending it")
    check("copied" in page.locator("[data-restaurant-table-status]").inner_text().lower(),
          "Dining: copy result must be announced through the live status")
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
          "robots.txt must explicitly identify all crawlers")
    check(bool(re.search(r"(?im)^\s*Disallow:\s*/\s*$", robots)),
          "robots.txt must keep crawling blocked until owner approval")
    check(not re.search(r"(?im)^\s*Sitemap\s*:", robots),
          "robots.txt must not advertise a sitemap before canonical-host approval")
    check(bool(re.search(r"<urlset\b", sitemap, re.I)), "sitemap.xml must be a valid URL-set document")
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
            check_premium_guest_journey(page, page_name, width)
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
                if page_name == "directions.html":
                    state = page.evaluate("""() => {
                      const card = document.querySelector('[data-arrival-quick-card]');
                      const bar = document.querySelector('.mobile-booking-bar');
                      if (!card || !bar) return null;
                      const bounds = card.getBoundingClientRect();
                      const height = Math.max(64, Number.parseFloat(getComputedStyle(bar).height) || 0);
                      const overlaps = bounds.left < window.innerWidth && bounds.right > 0
                        && bounds.top < window.innerHeight
                        && bounds.bottom > Math.max(0, window.innerHeight - height);
                      const expected = overlaps && !bar.contains(document.activeElement);
                      return {expected, suppressed: bar.classList.contains('is-suppressed-by-arrival-card'),
                        display: getComputedStyle(bar).display, ariaHidden: bar.getAttribute('aria-hidden'),
                        inert: bar.hasAttribute('inert')};
                    }""")
                    check(state is not None and state["suppressed"] == state["expected"],
                          f"{page_name}: mobile booking bar should yield only when it overlaps arrival summary")
                    if state and state["expected"]:
                        check(state["display"] == "none" and state["ariaHidden"] == "true" and state["inert"],
                              f"{page_name}: hidden booking bar must leave visual and keyboard access")
                else:
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

    journey_first = page.locator(".guest-journey__step").first
    journey_second = page.locator(".guest-journey__step").nth(1)
    check(journey_first.is_visible() and journey_second.is_visible(),
          "Rooms journey must expose the first two keyboard navigation steps")
    if journey_first.is_visible() and journey_second.is_visible():
        journey_first.focus()
        page.keyboard.press("Tab")
        check(page.evaluate("document.activeElement === document.querySelectorAll('.guest-journey__step')[1]"),
              "Tab from Stay must advance to Explore in the guest journey")
        focused_style = journey_second.evaluate("""(el) => {
          const style = getComputedStyle(el);
          return {outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth)};
        }""")
        check(focused_style["outlineStyle"] not in ("none", "hidden") and focused_style["outlineWidth"] >= 2.5,
              "Keyboard-focused guest journey links must have a clearly visible focus outline")

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
    hero = page.locator(".arrival-hero")
    quick_card = page.locator("[data-arrival-quick-card]")
    check(hero.count() == 1 and hero.is_visible(),
          "Directions: arrival-specific photo hero must be visible")
    check(quick_card.count() == 1 and quick_card.is_visible(),
          "Directions: one prioritized quick-arrival card must be visible")
    if quick_card.count():
        quick_text = quick_card.inner_text()
        check("Fort Parking" in quick_text and "300 metres" in quick_text and "5–6 minutes" in quick_text,
              "Directions: quick-arrival card must surface source-listed parking-walk guidance")
        check("narrow" in quick_text.lower() and "steps" in quick_text.lower(),
              "Directions: quick-arrival card must explain pedestrian access conditions")
        check("Confirm the meeting point" in quick_text,
              "Directions: quick-arrival card must prompt guests to confirm the meeting point")
    check(page.locator("#walking-access .arrival-steps > .arrival-step").count() == 4,
          "Directions: the arrival sequence must have four steps")
    check(page.locator("#travel-options .arrival-travel-card").count() == 3,
          "Directions: station, airport and road options should remain separate")

    section_nav = page.get_by_role("navigation", name="Directions page sections")
    for label, fragment in [
        ("Quick directions", "#arrival-overview-title"),
        ("Travel options", "#travel-options-title"),
        ("Walking & mobility", "#walking-access-title"),
        ("Map & navigation", "#arrival-map-title"),
        ("FAQs", "#arrival-faq-title"),
    ]:
        link = section_nav.get_by_role("link", name=label, exact=True)
        check(link.count() == 1 and link.get_attribute("href") == fragment,
              f"Directions: {label} navigation must point to its real section heading")
    page.evaluate(
        """() => {
          const heading = document.querySelector('#travel-options-title');
          if (!heading) return;
          document.documentElement.style.scrollBehavior = 'auto';
          heading.scrollIntoView({ block: 'start', behavior: 'auto' });
        }"""
    )
    try:
        page.wait_for_function(
            """() => {
              const heading = document.querySelector('#travel-options-title');
              const header = document.querySelector('.site-header');
              const sectionNav = document.querySelector('.arrival-section-nav');
              const current = document.querySelector('.arrival-section-nav a[aria-current="location"]');
              if (!heading || !header || !sectionNav || !current || current.getAttribute('href') !== '#travel-options-title') return false;
              const top = heading.getBoundingClientRect().top;
              const headerBottom = header.getBoundingClientRect().bottom;
              // At tablet/mobile widths the section rail sticks beneath the site header.
              // Measure the heading against the lowest visible sticky obstruction, not the header alone.
              const navBottom = sectionNav.getBoundingClientRect().bottom;
              const clearanceBottom = Math.max(headerBottom, navBottom);
              return top >= clearanceBottom + 8 && top <= clearanceBottom + 80;
            }""",
            timeout=5000,
        )
        check(True, "Directions: scroll position must select the nearest section and keep its heading clear of the sticky header")
    except Exception as error:
        check(False, f"Directions: active section link must follow scroll position ({error})")
    finally:
        page.evaluate("document.documentElement.style.removeProperty('scroll-behavior')")

    travel_nav = section_nav.get_by_role("link", name="Travel options", exact=True)
    if travel_nav.count() == 1:
        page.evaluate("document.documentElement.style.scrollBehavior = 'auto'")
        travel_nav.click()
        try:
            page.wait_for_function(
                """() => {
                  const heading = document.querySelector('#travel-options-title');
                  const header = document.querySelector('.site-header');
                  const sectionNav = document.querySelector('.arrival-section-nav');
                  if (!heading || !header || !sectionNav || window.location.hash !== '#travel-options-title') return false;
                  const top = heading.getBoundingClientRect().top;
                  const headerBottom = header.getBoundingClientRect().bottom;
                  // The section rail is sticky below the header at tablet/mobile widths.
                  const navBottom = sectionNav.getBoundingClientRect().bottom;
                  const clearanceBottom = Math.max(headerBottom, navBottom);
                  return top >= clearanceBottom + 8 && top <= clearanceBottom + 80;
                }""",
                timeout=5000,
            )
            heading_top = page.locator("#travel-options-title").bounding_box()["y"]
            header_box = page.locator(".site-header").bounding_box()
            header_bottom = header_box["y"] + header_box["height"]
            check(heading_top >= header_bottom + 8,
                  "Directions: section navigation must leave clear space below the sticky site header")
        except Exception as error:
            check(False, f"Directions: section navigation must reach a visible travel heading ({error})")
        finally:
            page.evaluate("document.documentElement.style.removeProperty('scroll-behavior')")
        page.goto(base_url + "directions.html", wait_until="domcontentloaded", timeout=15000)
    check(page.locator(".arrival-visual__media img").count() == 1,
          "Directions: the accessible facade reference section must load its local building image")
    check(page.locator(".arrival-visual__copy").get_by_role("heading", name="A visual reference for the final approach.").is_visible(),
          "Directions: the facade reference section must have a visible heading")

    orientation = page.locator("#arrival-map .arrival-map__orientation")
    check(orientation.count() == 1 and orientation.is_visible(),
          "Directions: map panel must contain one visible arrival-orientation diagram")
    check(orientation.locator(".arrival-map__route-stop").count() == 3,
          "Directions: orientation diagram must show three ordered approach steps")
    orientation_text = orientation.inner_text()
    check("Confirm your vehicle stop" in orientation_text
          and "Continue on foot" in orientation_text
          and "Reach Garh Jaisal Haveli" in orientation_text,
          "Directions: orientation diagram must explain the vehicle-to-foot sequence")
    check("not a scaled map or turn-by-turn route" in orientation_text.lower(),
          "Directions: orientation diagram must be labeled as illustrative, not measured")
    check(page.locator(".arrival-next-step__panel a[href='#arrival-planning']").count() == 1,
          "Directions: one terminal CTA must return guests to its dedicated arrival enquiry")
    check(page.locator("[data-stay-planner]").count() == 0,
          "Directions: remove the duplicated generic stay planner")

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
        check("fort entrance" in entrance.lower()
              and "200 metres" in entrance
              and "3–4 minutes" in entrance
              and "approximate walk" in entrance.lower()
              and "confirm your meeting point" in entrance.lower()
              and "current access" in entrance.lower(),
              "Directions: fort entrance card must retain the source-listed approximate 200 metres / 3–4 minutes and current-access caveat")
        check("Rickshaw access rules and drop-off points can vary" in rickshaw
              and "8:00 AM" not in section.inner_text(),
              "Directions: unconfirmed rickshaw hours must be omitted and current access confirmed")

    for width, height in [(320, 740), (360, 800), (390, 844), (768, 900), (1280, 800), (1440, 900)]:
        page.set_viewport_size({"width": width, "height": height})
        dimensions = page.evaluate(
            "() => ({viewport: window.innerWidth, document: document.documentElement.scrollWidth})"
        )
        check(dimensions["document"] <= dimensions["viewport"] + 1,
              f"Directions: arrival distance cards must not overflow horizontally at {width}px")
        check(page.locator("#arrival-walk-distances-title").is_visible(),
              f"Directions: arrival distance heading must remain available at {width}px")
        travel_layout = page.evaluate("""() => {
          const section = document.querySelector('#travel-options');
          const grid = document.querySelector('#travel-options .arrival-travel__grid');
          const cards = Array.from(document.querySelectorAll('#travel-options .arrival-travel-card'));
          if (!section || !grid || cards.length !== 3) return null;
          const rect = element => {
            const box = element.getBoundingClientRect();
            return {x: box.x, y: box.y, width: box.width, height: box.height};
          };
          return {section: rect(section), grid: rect(grid), cards: cards.map(rect)};
        }""")
        check(travel_layout is not None,
              f"Directions: travel layout evidence must exist at {width}px")
        if travel_layout:
            check(travel_layout["grid"]["width"] >= travel_layout["section"]["width"] * 0.88,
                  f"Directions: travel-card grid must use the main content width at {width}px, not a squeezed secondary column")
            card_widths = [card["width"] for card in travel_layout["cards"]]
            if width > 1000:
                check(all(card_width >= travel_layout["grid"]["width"] * 0.27 for card_width in card_widths),
                      f"Directions: three desktop travel cards must have useful width at {width}px ({card_widths})")
                check(max(card["y"] for card in travel_layout["cards"]) - min(card["y"] for card in travel_layout["cards"]) <= 2,
                      f"Directions: all three desktop travel cards must share the same row at {width}px")
            elif width > 620:
                check(all(card_width >= travel_layout["grid"]["width"] * 0.40 for card_width in card_widths[:2]),
                      f"Directions: tablet travel cards must use two readable columns at {width}px ({card_widths})")
            else:
                check(all(card_width >= travel_layout["grid"]["width"] * 0.88 for card_width in card_widths),
                      f"Directions: mobile travel cards must stack full width at {width}px ({card_widths})")
        if width <= 760:
            page.wait_for_timeout(80)
            state = page.evaluate("""() => {
              const card = document.querySelector('[data-arrival-quick-card]');
              const bar = document.querySelector('.mobile-booking-bar');
              if (!card || !bar) return null;
              const bounds = card.getBoundingClientRect();
              const height = Math.max(64, Number.parseFloat(getComputedStyle(bar).height) || 0);
              const overlaps = bounds.left < window.innerWidth && bounds.right > 0
                && bounds.top < window.innerHeight
                && bounds.bottom > Math.max(0, window.innerHeight - height);
              const expected = overlaps && !bar.contains(document.activeElement);
              return {expected, suppressed: bar.classList.contains('is-suppressed-by-arrival-card'),
                display: getComputedStyle(bar).display, ariaHidden: bar.getAttribute('aria-hidden'),
                inert: bar.hasAttribute('inert')};
            }""")
            check(state is not None and state["suppressed"] == state["expected"],
                  f"Directions at {width}px: booking bar must yield only while it overlaps the hero summary")
            if state and state["expected"]:
                check(state["display"] == "none" and state["ariaHidden"] == "true" and state["inert"],
                      f"Directions at {width}px: suppressed bar must be visually and keyboard hidden")
            elif state:
                check(state["display"] != "none" and state["ariaHidden"] is None and not state["inert"],
                      f"Directions at {width}px: booking bar must return when the hero summary clears")



def check_journal_preview(page, base_url: str, evidence_dir: Path) -> None:
    """Exercise the local Journal prototype and capture preview-only design evidence."""
    before_runtime_errors = len(RUNTIME_ERRORS)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    screenshots: list[dict] = []
    archive_widths: list[int] = []
    article_widths: list[int] = []
    interactions = [
        "draft record loading and count",
        "search no-match state and clear recovery",
        "topic and text filters intersect",
        "keyboard open and keyboard back with focus restoration",
        "table-of-contents target and navigation",
        "safe source-link attributes",
        "related draft navigation without route change",
        "hero-caption and caption-review readiness",
        "archive/article overflow at six viewport widths",
    ]

    def check_no_horizontal_overflow(view: str, width: int) -> None:
        dims = page.evaluate("() => ({viewport: window.innerWidth, document: document.documentElement.scrollWidth})")
        check(dims["document"] <= dims["viewport"] + 1,
              f"Journal preview {view} at {width}px: document must not overflow horizontally ({dims})")

    def capture(filename: str, view: str, width: int, height: int) -> None:
        destination = evidence_dir / filename
        try:
            page.evaluate("() => window.scrollTo(0, 0)")
            page.screenshot(path=str(destination), full_page=True, animations="disabled", caret="hide")
            image_width, image_height = read_png_dimensions(destination)
            payload = destination.read_bytes()
            screenshots.append({
                "filename": filename, "view": view, "route": "preview/journal.html",
                "viewportWidthCssPixels": width, "viewportHeightCssPixels": height,
                "imageWidthPixels": image_width, "imageHeightPixels": image_height,
                "fullPage": True, "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            })
            check(image_width == width and len(payload) > 0,
                  f"Journal preview {view} at {width}px: invalid screenshot geometry/bytes ({image_width}x{image_height}, {len(payload)} bytes)")
        except Exception as error:
            check(False, f"Journal preview {view} at {width}px: screenshot failed ({type(error).__name__}: {error})")

    response = page.goto(base_url + "preview/journal.html", wait_until="domcontentloaded", timeout=15000)
    check(response is not None and response.status == 200, "Journal preview: local prototype must load successfully")
    if response is None or response.status != 200:
        return
    check(page.locator('meta[name="robots"][content="noindex,nofollow"]').count() == 1,
          "Journal preview: must opt out of indexing")
    check(page.locator('link[rel="canonical"]').count() == 0,
          "Journal preview: must not claim a canonical URL")
    check(page.locator("[data-preview-only]").is_visible(),
          "Journal preview: draft-only disclosure must be visible")
    check(page.locator("h1#journal-masthead-title").is_visible(),
          "Journal preview: masthead must expose a visible H1")
    check(page.locator(".journal-masthead__image img[alt]").count() == 1,
          "Journal preview: masthead photo must keep descriptive alternative text")
    try:
        page.wait_for_function("document.querySelectorAll('[data-journal-card]').length === 12", timeout=7000)
    except Exception as error:
        check(False, f"Journal preview: all 12 draft cards should render from JSON ({error})")
        return

    check(page.locator("[data-journal-card]").count() == 12,
          "Journal preview: exactly 12 current draft records should render")
    check("12 draft guides" in page.locator("[data-journal-results]").inner_text().lower(),
          "Journal preview: result count must announce all drafts")
    check(page.locator("a[href*='/blogs/'], a[href^='../blogs/']").count() == 0,
          "Journal preview: draft cards must not link to unpublished article URLs")
    page.locator(".journal-masthead__image img").evaluate("(img) => img.decode().catch(() => null)")

    for width, height in [(320,740),(360,780),(390,844),(768,900),(1280,900),(1440,900)]:
        page.set_viewport_size({"width":width,"height":height})
        check_no_horizontal_overflow("archive", width)
        archive_widths.append(width)
        if width == 390:
            capture("journal-archive-390px.png","archive",width,height)
        elif width == 1280:
            capture("journal-archive-1280px.png","archive",width,height)

    search=page.locator("[data-journal-search]")
    topic=page.locator("[data-journal-topic]")
    clear=page.locator("[data-journal-clear]")
    results=page.locator("[data-journal-results]")
    empty=page.locator("[data-journal-empty]")
    search.fill("zz-no-journal-match-20261029")
    check(empty.is_visible(),"Journal preview: a query with no matches must show a clear empty state")
    check("0 draft guides" in results.inner_text().lower(),"Journal preview: no-match state must announce zero results")
    check(page.locator("[data-journal-card]:visible").count()==0,"Journal preview: no-match state must hide all cards")
    clear.click()
    check(page.locator("[data-journal-card]:visible").count()==12,"Journal preview: clear must restore all cards")
    topic.select_option("fort-and-heritage")
    check(page.locator("[data-journal-card]:visible").count()==3,"Journal preview: Fort & heritage must show its three assigned drafts")
    search.fill("Jaisalmer Fort Guide")
    check(page.locator("[data-journal-card]:visible").count()==1,"Journal preview: text search must intersect with the selected topic")
    clear.click()
    check(page.locator("[data-journal-card]:visible").count()==12,"Journal preview: clear filters must restore all drafts")

    page.locator('[data-journal-open="jaisalmer-fort-guide"]').first.focus()
    page.keyboard.press("Enter")
    article=page.locator("[data-journal-article]")
    check(article.is_visible(),"Journal preview: keyboard activation must open an article")
    check(article.locator("#journal-article-title").inner_text()=="Jaisalmer Fort Guide: Plan a Better Visit",
          "Journal preview: heading must come from the article record")
    check("draft — not published" in article.locator("[data-review-record-status]").inner_text().lower(),
          "Journal preview: article must expose draft-only status")
    check("not approved" in article.locator("[data-review-owner-facts]").inner_text().lower(),
          "Journal preview: owner-fact approval must remain pending")
    check("none recorded" in article.locator("[data-review-approved-media]").inner_text().lower(),
          "Journal preview: no article media may appear approved without review evidence")
    check("not drafted" in article.locator("[data-review-hero-caption]").inner_text().lower(),
          "Journal preview: draft without a caption must be clearly marked as missing one")
    check("not recorded" in article.locator("[data-review-hero-caption-review]").inner_text().lower(),
          "Journal preview: draft without caption review metadata must remain explicitly unreviewed")

    toc=article.locator("[data-journal-toc] a")
    check(toc.count()>0,"Journal preview: table of contents must be populated")
    check(article.locator("[data-journal-sources] a").count()>=2,"Journal preview: sources must remain visible")
    safe_sources=article.locator("[data-journal-sources] a").evaluate_all(
        """links => links.length >= 2 && links.every(link =>
          link.protocol === 'https:' && link.target === '_blank' &&
          link.rel.includes('noopener') && link.rel.includes('noreferrer'))"""
    )
    check(safe_sources,"Journal preview: source links must use HTTPS and safe external-link attributes")
    if toc.count()>0:
        target=toc.first.get_attribute("href") or ""
        check(bool(target) and article.locator(target).count()==1,"Journal preview: contents must target a real section")
        if target:
            toc.first.click()
            try:
                page.wait_for_function("(hash) => window.location.hash === hash", arg=target, timeout=5000)
            except Exception as error:
                check(False,f"Journal preview: contents navigation must reach the selected section ({error})")
            check(article.locator(target).is_visible(),"Journal preview: selected contents target must remain visible")

    related=article.locator("[data-journal-related] button").first
    check(related.count()>0,"Journal preview: related drafts must be discoverable")
    if related.count():
        related_title=related.inner_text()
        related.click()
        check(article.locator("#journal-article-title").inner_text()==related_title,
              "Journal preview: related-draft navigation must open the selected record")
        check(page.evaluate("() => window.location.pathname.endsWith('/preview/journal.html')"),
              "Journal preview: related navigation must not create a public article route")

    for width,height in [(320,740),(360,780),(390,844),(768,900),(1280,900),(1440,900)]:
        page.set_viewport_size({"width":width,"height":height})
        check_no_horizontal_overflow("article",width)
        article_widths.append(width)
        if width==390:
            capture("journal-article-390px.png","article",width,height)
        elif width==1280:
            capture("journal-article-1280px.png","article",width,height)

    back=article.locator("[data-journal-back]").first
    back.focus()
    page.keyboard.press("Enter")
    check(article.is_hidden(),"Journal preview: keyboard Back must return to the archive")
    check(page.locator(".journal-archive").is_visible(),"Journal preview: archive must be visible after Back")
    check(page.evaluate("() => document.activeElement && document.activeElement.id === 'journal-query'"),
          "Journal preview: Back must restore focus to the search field")
    check(page.evaluate("() => window.location.pathname.endsWith('/preview/journal.html')"),
          "Journal preview: interactions must remain on the local preview route")

    evidence={
        "schemaVersion":1,"scope":"local-only-editorial-preview","route":"preview/journal.html",
        "indexability":"noindex,nofollow","articleRecordsLoaded":page.locator("[data-journal-card]").count(),
        "publicArticleRoutesGenerated":0,"publicSitemapChanged":False,"canonicalHostApproved":False,
        "archiveViewportWidthsCssPixels":archive_widths,"articleViewportWidthsCssPixels":article_widths,
        "checksPerformed":interactions,"screenshots":screenshots,
        "complete":len(screenshots)==4 and archive_widths==[320,360,390,768,1280,1440]
            and article_widths==[320,360,390,768,1280,1440],
    }
    try:
        destination=evidence_dir/"journal-preview-evidence.json"
        destination.write_text(json.dumps(evidence,indent=2)+"\n",encoding="utf-8")
        check(evidence["complete"],
              "Journal preview: four screenshots and both complete responsive-width matrices must be recorded")
        print(f"Journal preview visual evidence captured locally: {destination}")
    except Exception as error:
        check(False,f"Journal preview: could not write evidence report ({type(error).__name__}: {error})")
    check(len(RUNTIME_ERRORS)==before_runtime_errors,
          f"Journal preview: browser JavaScript exception(s): {RUNTIME_ERRORS[before_runtime_errors:]}")


def check_arrival_planning_deep_links(page, base_url: str) -> None:
    """Verify all guest-planning entry points land on the date-specific arrival form anchor."""

def check_arrival_planning_deep_links(page, base_url: str) -> None:
    """Verify all guest-planning entry points land on the date-specific arrival form anchor."""
    for page_name in PAGES:
        response = page.goto(base_url + page_name, wait_until="domcontentloaded", timeout=15000)
        check(response is not None and response.status == 200,
              f"{page_name}: arrival deep-link source must return HTTP 200")
        if page_name == "index.html":
            link = page.locator('.home-plan-panel a.home-plan-path[href="directions.html#arrival-planning"]')
        else:
            link = page.locator('.guest-journey a.guest-journey__step[href="directions.html#arrival-planning"]')
        check(link.count() == 1, f"{page_name}: expected exactly one Arrive deep link to the planner")
        if link.count() != 1:
            continue
        link.click()
        try:
            page.wait_for_url("**/directions.html#arrival-planning", timeout=7000)
        except Exception as error:
            check(False, f"{page_name}: Arrive link must land at Directions#arrival-planning ({error})")
            continue
        target = page.locator("#arrival-planning")
        check(target.count() == 1, "Directions must provide one arrival-planning fragment target")
        if target.count() == 1:
            try:
                page.wait_for_function(
                    "() => { const target = document.querySelector('#arrival-planning'); "
                    "if (!target) return false; const rect = target.getBoundingClientRect(); "
                    "return rect.top < window.innerHeight && rect.bottom > 0 "
                    "&& document.activeElement === target; }",
                    timeout=5000,
                )
            except Exception as error:
                check(False, f"{page_name}: arrival fragment should scroll into view and transfer focus ({error})")
            bounds = target.bounding_box()
            viewport_height = page.evaluate("() => window.innerHeight")
            is_focused = page.evaluate("() => document.activeElement && document.activeElement.id === 'arrival-planning'")
            check(is_focused, f"{page_name}: focus must move to the arrival planner for keyboard/screen-reader continuity")
            check(bounds is not None and bounds["y"] < viewport_height
                  and bounds["y"] + bounds["height"] > 0,
                  f"{page_name}: deep-linked arrival planner must be within the viewport ({bounds})")
        check(page.locator("#arrival-enquiry-title").is_visible(),
              f"{page_name}: deep link must expose the date-specific arrival planner heading")
        check(same_origin(page.url, base_url),
              f"{page_name}: arrival planning deep link must remain same-origin")


def check_arrival_planning_enquiry(page, base_url: str, browser) -> None:
    """Exercise the date-specific arrival draft without opening WhatsApp or sending data."""
    page.add_init_script(
        """window.__arrivalEnquiryOpenCalls = [];
        window.__arrivalEnquiryClipboardWrites = [];
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async function(text) {
            window.__arrivalEnquiryClipboardWrites.push(String(text));
          } }
        });
        window.open = function(url, target, features) {
          window.__arrivalEnquiryOpenCalls.push({
            url: String(url), target: String(target || ''), features: String(features || '')
          });
          return null;
        };"""
    )
    response = page.goto(base_url + "directions.html", wait_until="domcontentloaded", timeout=15000)
    check(response is not None and response.status == 200,
          "Arrival enquiry: Directions must load successfully")
    form = page.locator("[data-arrival-planning-form]")
    fallback = page.locator("[data-arrival-enquiry-fallback]")
    page.wait_for_function(
        """() => {
          const form = document.querySelector('[data-arrival-planning-form]');
          const submit = form && form.querySelector('[data-arrival-enquiry-submit]');
          return Boolean(form && !form.hidden && submit && !submit.disabled);
        }""",
        timeout=7000,
    )
    check(form.count() == 1 and form.is_visible(),
          "Arrival enquiry: exactly one form must appear after authorized contact configuration loads")
    check(fallback.is_hidden(),
          "Arrival enquiry: static fallback should yield when the authorized form is ready")
    check(form.locator('[name="name"], [name="email"], [name="phone"], [name="mobile"], [name="notes"], [name="address"]').count() == 0,
          "Arrival enquiry: do not collect personal contact details or open-ended notes")
    check(form.locator('[data-arrival-enquiry-status][role="status"][aria-live="polite"]').count() == 1,
          "Arrival enquiry: status must be announced politely to assistive technology")
    check(form.locator('[data-arrival-enquiry-recovery][hidden]').count() == 1,
          "Arrival enquiry: draft fallback must stay hidden until explicit submission")

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
    travel_date = form.locator('[name="arrival-date"]')
    arrival_window = form.locator('[name="arrival-window"]')
    arrival_mode = form.locator('[name="arrival-mode"]')
    submit = form.locator('[data-arrival-enquiry-submit]')
    check(travel_date.get_attribute("min") == dates["today"],
          "Arrival enquiry: travel date must not permit a date before today")
    travel_date.fill(dates["yesterday"])
    check(travel_date.evaluate("(element) => element.validity.rangeUnderflow"),
          "Arrival enquiry: browser validation must reject a past travel date")
    submit.click()
    check(page.evaluate("() => window.__arrivalEnquiryOpenCalls.length") == 0,
          "Arrival enquiry: invalid date must not open a WhatsApp draft")

    travel_date.fill(dates["tomorrow"])
    arrival_window.fill("early afternoon")
    arrival_mode.select_option("taxi-rickshaw")
    form.locator('[name="arrival-luggage"]').check()
    form.locator('[name="arrival-access"]').check()
    submit.click()
    page.wait_for_function("() => window.__arrivalEnquiryOpenCalls.length === 1", timeout=3000)
    call = page.evaluate(
        """() => {
          const call = window.__arrivalEnquiryOpenCalls[0];
          const url = new URL(call.url);
          return {
            url: call.url, target: call.target, features: call.features,
            text: url.searchParams.get('text') || ''
          };
        }"""
    )
    check(call["url"].startswith("https://wa.me/"),
          "Arrival enquiry: draft must use the centrally authorized WhatsApp host")
    check(call["target"] == "_blank" and "noopener" in call["features"] and "noreferrer" in call["features"],
          "Arrival enquiry: external draft must use a protected new tab")
    check("Travel date: " + dates["tomorrow"] in call["text"],
          "Arrival enquiry: prepared message must include the selected travel date")
    check("Approximate arrival window: early afternoon" in call["text"],
          "Arrival enquiry: prepared message must include the optional arrival window when supplied")
    check("Expected approach: Taxi or rickshaw" in call["text"],
          "Arrival enquiry: prepared message must include the selected approach")
    check("luggage assistance can be arranged" in call["text"] and "not guaranteed" in call["text"],
          "Arrival enquiry: luggage request must remain a question, never a guarantee")
    check("steps and uneven surfaces" in call["text"],
          "Arrival enquiry: optional route/access request must not claim assistance is available")
    check("not a transfer booking or reservation" in call["text"],
          "Arrival enquiry: draft must explicitly avoid implying a booking")
    check(form.locator('[data-arrival-enquiry-recovery]').is_visible(),
          "Arrival enquiry: copyable draft must remain visible after submit")
    draft = form.locator('[data-arrival-enquiry-draft]')
    check(draft.get_attribute("readonly") is not None and draft.input_value() == call["text"],
          "Arrival enquiry: fallback must be read-only and contain the exact prepared message")
    check(page.evaluate("() => window.__arrivalEnquiryOpenCalls.length") == 1
          and same_origin(page.url, base_url) and page.url.endswith("/directions.html"),
          "Arrival enquiry: tests must intercept the external tab and keep the page on the site")
    form.locator('[data-arrival-enquiry-copy]').click()
    page.wait_for_function("() => window.__arrivalEnquiryClipboardWrites.length === 1", timeout=3000)
    check(page.evaluate("() => window.__arrivalEnquiryClipboardWrites[0]") == call["text"],
          "Arrival enquiry: explicit copy must copy the exact draft text")
    check("copied" in (form.locator('[data-arrival-enquiry-status]').inner_text() or "").lower(),
          "Arrival enquiry: copy result must be announced")

    for width, height in [(320, 740), (390, 844), (768, 900), (1280, 800), (1440, 900)]:
        page.set_viewport_size({"width": width, "height": height})
        dimensions = page.evaluate(
            "() => ({viewport: window.innerWidth, document: document.documentElement.scrollWidth})"
        )
        bounds = form.bounding_box()
        action_bounds = submit.bounding_box()
        check(dimensions["document"] <= dimensions["viewport"] + 1,
              f"Arrival enquiry: no horizontal overflow at {width}px")
        check(bounds is not None and bounds["width"] <= width + 1,
              f"Arrival enquiry: form must fit the viewport at {width}px")
        check(action_bounds is not None and action_bounds["height"] >= 44,
              f"Arrival enquiry: submit target must be at least 44px tall at {width}px")

    nojs_context = browser.new_context(java_script_enabled=False, viewport={"width": 320, "height": 740})
    try:
        nojs_page = nojs_context.new_page()
        nojs_response = nojs_page.goto(base_url + "directions.html", wait_until="domcontentloaded", timeout=15000)
        check(nojs_response is not None and nojs_response.status == 200,
              "Arrival enquiry: no-JavaScript Directions page must still load")
        check(nojs_page.locator("[data-arrival-planning-form]").is_hidden(),
              "Arrival enquiry: interactive form must stay hidden without JavaScript")
        check(nojs_page.locator("[data-arrival-enquiry-fallback]").is_visible(),
              "Arrival enquiry: no-JavaScript visitors must retain a clear static fallback")
    finally:
        nojs_context.close()


def check_room_finder(page, base_url: str, browser) -> None:
    """Exercise progressive room filters and verify the all-rooms no-JavaScript fallback."""
    page.set_viewport_size({"width": 360, "height": 800})
    page.goto(base_url + "rooms.html", wait_until="domcontentloaded", timeout=15000)
    page.evaluate(
        """() => {
          window.__roomCompareOpenCalls = [];
          window.__roomCompareClipboardWrites = [];
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async function(text) {
              window.__roomCompareClipboardWrites.push(String(text));
            } }
          });
          window.open = function(url, target, features) {
            window.__roomCompareOpenCalls.push({
              url: String(url), target: String(target || ''), features: String(features || '')
            });
            return null;
          };
        }"""
    )
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
    enquiry_button = compare_panel.locator("[data-room-compare-enquiry]")
    page.wait_for_function(
        """() => {
          const button = document.querySelector('[data-room-compare-enquiry]');
          return Boolean(button && button.dataset.roomCompareContactState === 'ready');
        }""",
        timeout=7000,
    )
    check(not enquiry_button.is_disabled(),
          "Rooms: authorized contact hydration must enable the selected-room enquiry")
    check("selected rooms" in enquiry_button.inner_text().lower(),
          "Rooms: shortlist action must clearly describe the selected room set")
    enquiry_button.click()
    page.wait_for_function(
        "() => Array.isArray(window.__roomCompareOpenCalls) && window.__roomCompareOpenCalls.length === 1",
        timeout=5000,
    )
    room_draft = page.evaluate(
        """() => {
          const call = window.__roomCompareOpenCalls[0];
          const url = new URL(call.url);
          return {host:url.hostname,path:url.pathname,text:url.searchParams.get('text') || '',
                  target:call.target,features:call.features,currentUrl:window.location.href};
        }"""
    )
    check(room_draft["host"] == "wa.me" and room_draft["path"] == "/917727047567",
          "Rooms: selected-room enquiry must use the authorized centralized WhatsApp destination")
    check("Sweet Purple Room" in room_draft["text"] and "Green Room" in room_draft["text"],
          "Rooms: enquiry draft must include exactly the selected room names")
    check("does not confirm a booking" in room_draft["text"].lower(),
          "Rooms: shortlist draft must state that an enquiry does not confirm a booking")
    check(room_draft["target"] == "_blank"
          and {"noopener","noreferrer"}.issubset(set(room_draft["features"].split(","))),
          "Rooms: selected-room draft must use a protected new tab")
    check(same_origin(room_draft["currentUrl"], base_url),
          "Rooms: smoke test must not navigate to WhatsApp or transmit guest data")
    room_recovery = compare_panel.locator("[data-room-compare-recovery]")
    check(room_recovery.is_visible(),
          "Rooms: a visible draft fallback must remain when WhatsApp does not open")
    room_fallback_text = compare_panel.locator("[data-room-compare-draft]").input_value()
    check(room_fallback_text == room_draft["text"],
          "Rooms: fallback must contain the exact selected-room WhatsApp draft")
    compare_panel.locator("[data-room-compare-copy]").click()
    page.wait_for_function(
        "() => Array.isArray(window.__roomCompareClipboardWrites) && window.__roomCompareClipboardWrites.length === 1",
        timeout=5000,
    )
    check(page.evaluate("window.__roomCompareClipboardWrites[0]") == room_draft["text"],
          "Rooms: copy control must copy the prepared selected-room message without sending it")
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
    parser.add_argument(
        "--responsive-image-preview",
        action="store_true",
        help="Run focused Chromium checks against a generated local preview package.",
    )
    args = parser.parse_args(argv)
    local_screenshots_raw = os.environ.get("BROWSER_SMOKE_SCREENSHOTS_DIR")
    local_report_raw = os.environ.get("BROWSER_SMOKE_REPORT_PATH")
    journal_screenshots_raw = os.environ.get("BROWSER_SMOKE_JOURNAL_EVIDENCE_DIR")
    if args.responsive_image_preview:
        if (args.base_url or args.operator or args.report or args.screenshots_dir
                or local_screenshots_raw or local_report_raw or journal_screenshots_raw):
            parser.error("Preview-image mode cannot be combined with staging or screenshot evidence options")
        return run_responsive_image_preview_smoke()
    if bool(local_screenshots_raw) != bool(local_report_raw):
        parser.error("BROWSER_SMOKE_SCREENSHOTS_DIR and BROWSER_SMOKE_REPORT_PATH must be set together")
    staging_mode = bool(args.base_url)
    journal_screenshots_dir = None
    journal_screenshot_tempdir = None

    if staging_mode:
        if journal_screenshots_raw:
            parser.error("Journal preview screenshots are local-only and cannot be captured in staging mode")
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
        local_report_path = None
        if local_screenshots_raw:
            try:
                screenshots_dir = validate_screenshot_directory(local_screenshots_raw)
                local_report_path = validate_local_report_path(local_report_raw or "")
            except ValueError as error:
                parser.error(f"local visual-evidence paths rejected before browser launch: {error}")
        if journal_screenshots_raw:
            try:
                journal_screenshots_dir = validate_screenshot_directory(journal_screenshots_raw)
                journal_screenshots_dir.mkdir(parents=True, exist_ok=True)
            except ValueError as error:
                parser.error(f"local Journal preview evidence path rejected before browser launch: {error}")

    unknown_route_evidence = None
    server = None
    browser = None
    context = None
    browser_version = None
    screenshot_tempdir = None
    try:
        if not staging_mode:
            server, base_url = start_server()
            if screenshots_dir is not None:
                screenshots_dir.mkdir(parents=True, exist_ok=True)
            else:
                screenshot_tempdir = tempfile.TemporaryDirectory(prefix="garh-jaisal-visual-evidence-")
                screenshots_dir = Path(screenshot_tempdir.name)
            if journal_screenshots_dir is None:
                journal_screenshot_tempdir = tempfile.TemporaryDirectory(prefix="garh-jaisal-journal-preview-")
                journal_screenshots_dir = Path(journal_screenshot_tempdir.name)
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
            check_stay_planner(page, base_url)
            check_direct_enquiry_dock(page, base_url)
            check_guest_enquiry_forms(page, base_url)
            check_experience_discovery_journey(page, base_url)
            check_room_finder(page, base_url, browser)
            check_arrival_wayfinding_journey(page, base_url)
            check_arrival_planning_enquiry(page, base_url, browser)
            check_arrival_planning_deep_links(page, base_url)
            if not staging_mode and journal_screenshots_dir is not None:
                check_journal_preview(page, base_url, journal_screenshots_dir)
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
        if journal_screenshot_tempdir is not None:
            journal_screenshot_tempdir.cleanup()

    if not staging_mode:
        local_visual_report = build_report(
            "local-browser-smoke", base_url, None, browser_version, FAILURES,
            PAGES_ATTEMPTED, PAGES_HTTP_OK, VIEWPORTS_COMPLETED,
            screenshot_evidence=SCREENSHOT_EVIDENCE,
            unknown_route_evidence=unknown_route_evidence,
        )
        if not local_visual_report["visualEvidence"]["complete"]:
            FAILURES.append(
                f"Local browser smoke did not produce all {len(expected_screenshot_names())} valid full-page screenshot records; "
                "visual evidence generation must be exercised by the standard quality suite."
            )
        if local_report_raw and local_report_path is not None:
            # Rebuild after completeness validation so the JSON result reflects capture failures.
            local_visual_report = build_report(
                "local-browser-smoke", base_url, None, browser_version, FAILURES,
                PAGES_ATTEMPTED, PAGES_HTTP_OK, VIEWPORTS_COMPLETED,
                screenshot_evidence=SCREENSHOT_EVIDENCE,
                unknown_route_evidence=unknown_route_evidence,
            )
            try:
                report_destination = write_report(str(local_report_path), local_visual_report)
                print(f"Visual baseline evidence report written locally: {report_destination}")
            except Exception as error:
                FAILURES.append(
                    f"Could not write the visual baseline evidence report: {type(error).__name__}: {error}"
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
        "same-origin assets/publication guards, contact-link hydration, shared enquiry draft generation/date validation/no network submission, room-finder filters/clear/no-JavaScript fallback, three-room side-by-side comparison/limit/removal/filter recovery/no-JavaScript fallback, 320/360/390/768/1280/1440px responsive layout, "
        "keyboard/skip-link behavior, reduced motion, date-specific arrival enquiry validation/recovery/no-JavaScript fallback, six galleries with keyboard activation, "
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
