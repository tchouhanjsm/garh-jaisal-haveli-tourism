#!/usr/bin/env python3
"""Contract tests for the guarded, read-only staging preflight CLI."""
from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "test-browser-smoke.py"
SPEC = importlib.util.spec_from_file_location("browser_smoke", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load the browser smoke module")
browser_smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(browser_smoke)

SERVER_SPEC = importlib.util.spec_from_file_location(
    "static_404_test_server", ROOT / "scripts" / "test-static-server.py"
)
if SERVER_SPEC is None or SERVER_SPEC.loader is None:
    raise RuntimeError("Could not load the local 404 test server")
static_server = importlib.util.module_from_spec(SERVER_SPEC)
SERVER_SPEC.loader.exec_module(static_server)
assert static_server.validate_loopback_bind("127.0.0.1") == "127.0.0.1"
for unsafe_bind in ("0.0.0.0", "192.168.1.5", "localhost", "::1"):
    try:
        static_server.validate_loopback_bind(unsafe_bind)
    except argparse.ArgumentTypeError:
        pass
    else:
        raise AssertionError("The temporary 404 test server must refuse non-IPv4-loopback binds")


REPORT_OUTSIDE_CHECKOUT = str(Path(tempfile.gettempdir()) / "garh-jaisal-preflight-contract.json")


def expect_rejected(url: str, operator: str = "QA operator",
                    report: str = REPORT_OUTSIDE_CHECKOUT) -> None:
    try:
        browser_smoke.validate_staging_target(url, operator, report)
    except ValueError:
        return
    raise AssertionError(f"Unsafe staging target was accepted: {url!r}")


valid = browser_smoke.validate_staging_target(
    "https://staging.example.test/", "QA operator", REPORT_OUTSIDE_CHECKOUT
)
assert valid == "https://staging.example.test/"
assert browser_smoke.same_origin("https://staging.example.test/rooms.html", valid)
assert not browser_smoke.same_origin("https://staging.example.test.evil/rooms.html", valid)
assert not browser_smoke.same_origin("not-a-url", "also-not-a-url")
assert browser_smoke.safe_url_label("https://outside.example/path?token=secret#section") == "https://outside.example/path"
assert browser_smoke.safe_url_label("https://qa-user:qa-password@outside.example/path?token=secret#section") == "https://outside.example/path"
assert browser_smoke.safe_url_label("not-a-url?token=secret") == "not-a-url"

diagnostic = browser_smoke.sanitize_diagnostic_text(
    "Request failed for https://qa-user:qa-password@outside.example/path?token=secret#fragment"
)
assert diagnostic == "Request failed for https://outside.example/path"

assert not browser_smoke.is_actionable_request_failure("net::ERR_ABORTED")
assert browser_smoke.is_actionable_request_failure("net::ERR_CONNECTION_RESET")
assert browser_smoke.is_actionable_request_failure(None)


class FakeRequest:
    def __init__(self, url: str, navigation: bool = True):
        self.url = url
        self._navigation = navigation

    def is_navigation_request(self) -> bool:
        return self._navigation


class FakeRoute:
    def __init__(self, url: str, navigation: bool = True):
        self.request = FakeRequest(url, navigation)
        self.aborted = False
        self.continued = False

    def abort(self) -> None:
        self.aborted = True

    def continue_(self) -> None:
        self.continued = True


class FakeContext:
    def route(self, pattern: str, handler) -> None:
        assert pattern == "**/*"
        self.handler = handler


fake_context = FakeContext()
browser_smoke.install_navigation_guard(fake_context, valid)
external_route = FakeRoute("https://hotelgarhjaisal.com/?token=secret#fragment")
fake_context.handler(external_route)
assert external_route.aborted and not external_route.continued
assert browser_smoke.CROSS_ORIGIN_NAVIGATION_ERRORS[-1] == "Blocked cross-origin navigation request: https://hotelgarhjaisal.com/"
assert "secret" not in browser_smoke.CROSS_ORIGIN_NAVIGATION_ERRORS[-1]
same_origin_route = FakeRoute("https://staging.example.test/rooms.html")
fake_context.handler(same_origin_route)
assert same_origin_route.continued and not same_origin_route.aborted
browser_smoke.CROSS_ORIGIN_NAVIGATION_ERRORS.clear()

for production_url in (
    "https://hotelgarhjaisal.com/",
    "https://www.hotelgarhjaisal.com/",
):
    expect_rejected(production_url)

for unsafe_url in (
    "http://staging.example.test/",
    "https://user:password@staging.example.test/",
    "https://staging.example.test/rooms.html",
    "https://staging.example.test/?token=not-allowed",
    "https://staging.example.test/#main",
    "https://127.0.0.1/",
    "https://staging.example.test:0/",
    "https://localhost/",
    "https://preview.local/",
):
    expect_rejected(unsafe_url)

expect_rejected("https://staging.example.test/", operator="")
expect_rejected("https://staging.example.test/", report="")
expect_rejected("https://staging.example.test/", report="preflight.txt")
expect_rejected("https://staging.example.test/", report=str(ROOT / "artifacts" / "preflight.json"))

with tempfile.TemporaryDirectory() as evidence_directory:
    assert browser_smoke.validate_screenshot_directory(evidence_directory) == Path(evidence_directory).resolve()
    screenshot_dir = Path(evidence_directory) / "screens"
    screenshot_dir.mkdir()
    assert browser_smoke.validate_screenshot_directory(str(screenshot_dir)) == screenshot_dir.resolve()
    (screenshot_dir / "old-run.png").write_bytes(b"old evidence")
    try:
        browser_smoke.validate_screenshot_directory(str(screenshot_dir))
    except ValueError:
        pass
    else:
        raise AssertionError("A non-empty screenshot directory must be refused to prevent mixing runs")

try:
    browser_smoke.validate_screenshot_directory(str(ROOT / "artifacts" / "screenshots"))
except ValueError:
    pass
else:
    raise AssertionError("Screenshot evidence inside the repository must be refused")

with tempfile.TemporaryDirectory() as temporary_directory:
    png_path = Path(temporary_directory) / "header-only.png"
    png_path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + (13).to_bytes(4, "big") + b"IHDR"
        + (360).to_bytes(4, "big") + (1200).to_bytes(4, "big")
    )
    assert browser_smoke.read_png_dimensions(png_path) == (360, 1200)
    png_path.write_bytes(b"not a png header")
    try:
        browser_smoke.read_png_dimensions(png_path)
    except ValueError:
        pass
    else:
        raise AssertionError("Invalid screenshot bytes must be rejected")

assert browser_smoke.resolve_http_credentials(None, None) is None
assert browser_smoke.resolve_http_credentials("qa-user", "qa-password") == {
    "username": "qa-user",
    "password": "qa-password",
}
for username, password in (("qa-user", None), (None, "qa-password"), ("", "qa-password"), ("qa-user", "")):
    try:
        browser_smoke.resolve_http_credentials(username, password)
    except ValueError:
        pass
    else:
        raise AssertionError("Incomplete Basic Auth credentials must be refused")

def valid_screenshot_records() -> list[dict]:
    records = []
    for width, height in browser_smoke.VIEWPORTS:
        for page_name in browser_smoke.PAGES:
            records.append({
                "filename": f"{Path(page_name).stem}-{width}px.png",
                "viewportWidthCssPixels": width,
                "viewportHeightCssPixels": height,
                "imageWidthPixels": width,
                "imageHeightPixels": 1200,
                "fullPage": True,
                "bytes": 12345,
                "sha256": "a" * 64,
            })
    return records


complete_screenshots = valid_screenshot_records()
assert len(complete_screenshots) == 21
assert [record["filename"] for record in complete_screenshots] == browser_smoke.expected_screenshot_names()


def valid_unknown_route_evidence() -> dict:
    return {
        "path": "/" + browser_smoke.NOT_FOUND_SMOKE_PATH,
        "expectedHttpStatus": 404,
        "recoveryLinks": list(browser_smoke.NOT_FOUND_RECOVERY_LINKS),
        "viewportChecks": [
            {
                "viewportWidthCssPixels": width,
                "httpStatus": 404,
                "targetOrigin": True,
                "brandedRecoveryPage": True,
                "noindex": True,
                "rootRelativeAssets": True,
                "contactChannelsHydrated": True,
                "responsiveLayoutValid": True,
                "recoveryLinks": list(browser_smoke.NOT_FOUND_RECOVERY_LINKS),
            }
            for width, _height in browser_smoke.VIEWPORTS
        ],
        "complete": True,
    }


bad_unknown_route = valid_unknown_route_evidence()
bad_unknown_route["viewportChecks"][1]["httpStatus"] = 200
assert not browser_smoke.unknown_route_evidence_is_complete(bad_unknown_route)
bad_recovery_links = valid_unknown_route_evidence()
bad_recovery_links["viewportChecks"][2]["recoveryLinks"] = []
assert not browser_smoke.unknown_route_evidence_is_complete(bad_recovery_links)
assert browser_smoke.unknown_route_evidence_is_complete(valid_unknown_route_evidence())

incomplete_report = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
)
assert incomplete_report["schemaVersion"] == 4
assert incomplete_report["automatedResult"] == "FAIL"
assert incomplete_report["automatedFailureCount"] == 5
assert incomplete_report["evidenceCoverage"] == {
    "pageNavigationComplete": False,
    "pageHttp200Complete": False,
    "responsiveViewportsComplete": False,
    "unknownRouteRecoveryComplete": False,
    "complete": False,
}
assert incomplete_report["unknownRouteEvidence"]["complete"] is False
assert incomplete_report["visualEvidence"]["complete"] is False
assert incomplete_report["visualEvidence"]["expectedScreenshotCount"] == 21
assert incomplete_report["pagesAttempted"] == []
assert incomplete_report["pagesWithHttp200OnTargetOrigin"] == []
assert incomplete_report["completedResponsiveViewportWidthsCssPixels"] == []

complete_evidence = (
    list(browser_smoke.PAGES),
    list(browser_smoke.PAGES),
    [360, 768, 1440],
)
report = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
)
assert report["automatedResult"] == "PASS"
assert report["automatedFailureCount"] == 0
assert report["evidenceCoverage"] == {
    "pageNavigationComplete": True,
    "pageHttp200Complete": True,
    "responsiveViewportsComplete": True,
    "unknownRouteRecoveryComplete": True,
    "complete": True,
}
assert report["unknownRouteEvidence"]["complete"] is True
assert report["visualEvidence"]["complete"] is True
assert report["visualEvidence"]["capturedScreenshotCount"] == 21
assert report["visualEvidence"]["capturedFiles"] == complete_screenshots
assert report["releaseStatus"] == "BLOCKED_PENDING_MANUAL_UAT"
assert report["operator"] == "QA operator"
assert report["targetUrl"] == valid
assert report["pagesPlanned"] == browser_smoke.PAGES
assert report["pagesAttempted"] == browser_smoke.PAGES
assert report["pagesWithHttp200OnTargetOrigin"] == browser_smoke.PAGES
assert report["plannedViewportWidthsCssPixels"] == [360, 768, 1440]
assert report["completedResponsiveViewportWidthsCssPixels"] == [360, 768, 1440]
assert "viewportWidthsCssPixels" not in report

partial_report = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    list(browser_smoke.PAGES[:-1]),
    list(browser_smoke.PAGES[:-1]),
    [360, 768],
)
assert partial_report["automatedResult"] == "FAIL"
assert partial_report["evidenceCoverage"]["complete"] is False
assert partial_report["automatedFailureCount"] == 5

missing_visual_evidence = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=[],
    unknown_route_evidence=valid_unknown_route_evidence(),
)
assert missing_visual_evidence["automatedResult"] == "FAIL"
assert missing_visual_evidence["automatedFailureCount"] == 1
assert missing_visual_evidence["evidenceCoverage"]["complete"] is False

malformed_screenshots = [dict(record) for record in complete_screenshots]
malformed_screenshots[0]["sha256"] = "not-a-sha256"
invalid_visual_evidence = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=malformed_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
)
assert invalid_visual_evidence["automatedResult"] == "FAIL"
assert invalid_visual_evidence["automatedFailureCount"] == 1
assert invalid_visual_evidence["evidenceCoverage"]["complete"] is False
assert report["safety"]["externalLinkNavigationPerformed"] is False
assert report["crossOriginNavigationAttemptsBlocked"] == []
assert report["safety"]["bookingOrPaymentSubmitted"] is False
assert report["safety"]["guestDataSubmitted"] is False
assert report["safety"]["contactMessageSent"] is False
assert "qa-password" not in str(report)
assert [item["id"] for item in report["manualReleaseChecks"]] == [
    f"STG-{number:02d}" for number in range(1, 19)
]
assert all(item["result"] == "NOT RUN" for item in report["manualReleaseChecks"])
with tempfile.TemporaryDirectory() as temporary_directory:
    report_path = Path(temporary_directory) / "preflight.json"
    written_path = browser_smoke.write_report(str(report_path), report)
    serialized = written_path.read_text(encoding="utf-8")
    assert serialized.endswith("\n")
    round_trip = json.loads(serialized)
    assert round_trip["targetUrl"] == valid
    assert all(item["result"] == "NOT RUN" for item in round_trip["manualReleaseChecks"])
assert report["browser"]["name"] == "Chromium"

blocked_navigation = ["Blocked cross-origin navigation request: https://qa-user:qa-password@hotelgarhjaisal.com/?token=secret#fragment"]
blocked_report = browser_smoke.build_report(
    "staging-read-only", valid, "QA operator", "Chromium test version", [],
    *complete_evidence, blocked_navigation_attempts=blocked_navigation,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
)
assert blocked_report["crossOriginNavigationAttemptsBlocked"] == [
    "Blocked cross-origin navigation request: https://hotelgarhjaisal.com/"
]
assert "qa-password" not in str(blocked_report) and "secret" not in str(blocked_report)

failed_report = browser_smoke.build_report(
    "staging-read-only", valid, "QA operator", "Chromium test version",
    ["request failed at https://qa-user:qa-password@outside.example/path?token=secret#fragment"],
    *complete_evidence,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
)
assert failed_report["automatedResult"] == "FAIL"
assert failed_report["automatedFailureCount"] == 1
assert failed_report["automatedFailures"] == [
    "request failed at https://outside.example/path"
]
assert "qa-password" not in str(failed_report) and "secret" not in str(failed_report)

print(
    "PASS: staging preflight refuses HTTP, credentials, path/query/fragment, local/IP and configured "
    "production targets; evidence reports preserve manual release checks as NOT RUN."
)
