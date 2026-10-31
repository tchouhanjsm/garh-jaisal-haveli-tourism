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

with tempfile.TemporaryDirectory(prefix="garh-local-visual-evidence-") as evidence_root:
    report_path = Path(evidence_root) / "report.json"
    assert browser_smoke.validate_local_report_path(str(report_path)) == report_path.resolve()
    try:
        browser_smoke.validate_local_report_path(str(ROOT / "artifacts" / "report.json"))
    except ValueError:
        pass
    else:
        raise AssertionError("Visual-evidence JSON reports must not be written inside the repository checkout")
    try:
        browser_smoke.validate_local_report_path(str(Path(evidence_root) / "report.txt"))
    except ValueError:
        pass
    else:
        raise AssertionError("Visual-evidence report path must use a .json extension")

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
assert len(complete_screenshots) == 24
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
            for width, _height in browser_smoke.RESPONSIVE_AUDIT_VIEWPORTS
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

def valid_performance_evidence() -> list[dict]:
    records = []
    for width, height in browser_smoke.VIEWPORTS:
        for page_name in browser_smoke.PAGES:
            records.append({
                "route": page_name,
                "viewportWidthCssPixels": width,
                "viewportHeightCssPixels": height,
                "observerSupport": {"lcp": True, "layoutShift": True, "longTask": False},
                "navigation": {
                    "responseStartMs": 12.0,
                    "domContentLoadedMs": 28.0,
                    "loadEventEndMs": 42.0,
                    "documentEncodedBodyBytes": 2048,
                    "documentTransferBytesObserved": 2300,
                },
                "largestContentfulPaint": {
                    "valueMs": 180.0,
                    "size": 1200,
                    "element": {"tagName": "IMG", "id": "hero-image", "className": "hero__image"},
                    "urlPath": "/assets/images/hero.webp",
                },
                "cumulativeLayoutShift": 0.2 if page_name == "experiences.html" and width == 1280 else (0.1 if page_name == "experiences.html" and width == 768 else 0.0),
                "layoutShiftEntries": 2 if page_name == "experiences.html" and width == 1280 else (1 if page_name == "experiences.html" and width == 768 else 0),
                "layoutShiftSources": [
                    {
                        "value": 0.1,
                        "hadRecentInput": False,
                        "context": {
                            "scrollY": 0.0,
                            "header": {
                                "className": "site-header is-scrolled",
                                "rect": {"x": 0.0, "y": 34.0, "width": width, "height": 84.0},
                            },
                            "announcement": {"x": 0.0, "y": 0.0, "width": width, "height": 34.0},
                            "hero": {"x": 0.0, "y": 118.0, "width": width, "height": 680.0},
                            "viewport": {"width": width, "height": height},
                        },
                        "sources": [{
                            "element": {"tagName": "H1", "id": None, "className": "experience-discovery-hero"},
                            "previousRect": {"x": 0.0, "y": 0.0, "width": 640.0, "height": 100.0},
                            "currentRect": {"x": 0.0, "y": 12.0, "width": 640.0, "height": 112.0},
                        }],
                    }
                    for _ in range(2 if page_name == "experiences.html" and width == 1280 else (1 if page_name == "experiences.html" and width == 768 else 0))
                ],
                "fontReadiness": {
                    "status": "loaded",
                    "readyWithinCaptureWindow": True,
                    "families": {"playfairDisplay": True, "dmSans": True},
                    "layoutSnapshots": [
                        {
                            "phase": "sample-before-font-wait",
                            "atMs": 12.0,
                            "fontStatus": "loading",
                            "families": {"playfairDisplay": False, "dmSans": False},
                            "elements": {
                                "content": {"x": 0.0, "y": 100.0, "width": 640.0, "height": 360.0},
                                "heading": {"x": 0.0, "y": 180.0, "width": 640.0, "height": 112.0},
                                "supportingCopy": {"x": 0.0, "y": 310.0, "width": 640.0, "height": 50.0},
                            },
                            "textRanges": {
                                "heading": {"x": 0.0, "y": 182.0, "width": 620.0, "height": 110.0},
                                "supportingCopy": {"x": 0.0, "y": 312.0, "width": 610.0, "height": 48.0},
                            },
                        },
                        {
                            "phase": "sample-after-font-wait",
                            "atMs": 28.0,
                            "fontStatus": "loaded",
                            "families": {"playfairDisplay": True, "dmSans": True},
                            "elements": {
                                "content": {"x": 0.0, "y": 88.0, "width": 640.0, "height": 372.0},
                                "heading": {"x": 0.0, "y": 168.0, "width": 640.0, "height": 124.0},
                                "supportingCopy": {"x": 0.0, "y": 310.0, "width": 640.0, "height": 62.0},
                            },
                            "textRanges": {
                                "heading": {"x": 0.0, "y": 170.0, "width": 632.0, "height": 122.0},
                                "supportingCopy": {"x": 0.0, "y": 312.0, "width": 626.0, "height": 60.0},
                            },
                        },
                    ],
                },
                "longTasks": {"count": 0, "totalDurationMs": 0.0},
                "sameOriginResources": {
                    "count": 12,
                    "encodedBodyBytes": 40960,
                    "transferBytesObserved": 32768,
                    "images": {"count": 4, "encodedBodyBytes": 24576},
                    "stylesheets": {"count": 2, "encodedBodyBytes": 8192},
                    "scripts": {"count": 2, "encodedBodyBytes": 4096},
                    "fonts": {"count": 1, "encodedBodyBytes": 2048},
                    "other": {"count": 3, "encodedBodyBytes": 2048},
                },
            })
    return records


performance_evidence = valid_performance_evidence()
assert len(performance_evidence) == len(browser_smoke.PAGES) * len(browser_smoke.VIEWPORTS)
delivery_evidence_contract = {
    "measurementClass": "packaged-chromium-laboratory-diagnostic",
    "fieldDataAvailable": False,
    "candidateBytesAreTransferMeasurements": False,
    "candidateSavingsVersusJpegFallbackInferred": False,
}
assert delivery_evidence_contract["measurementClass"] == "packaged-chromium-laboratory-diagnostic"
assert delivery_evidence_contract["fieldDataAvailable"] is False
assert delivery_evidence_contract["candidateBytesAreTransferMeasurements"] is False
assert delivery_evidence_contract["candidateSavingsVersusJpegFallbackInferred"] is False
assert set(delivery_evidence_contract) == {
    "measurementClass",
    "fieldDataAvailable",
    "candidateBytesAreTransferMeasurements",
    "candidateSavingsVersusJpegFallbackInferred",
}


incomplete_report = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
)
assert incomplete_report["schemaVersion"] == 10
assert incomplete_report["automatedResult"] == "FAIL"
assert incomplete_report["automatedFailureCount"] == 6
assert incomplete_report["evidenceCoverage"] == {
    "pageNavigationComplete": False,
    "pageHttp200Complete": False,
    "responsiveViewportsComplete": False,
    "unknownRouteRecoveryComplete": False,
    "routePerformanceBaselineComplete": False,
    "complete": False,
}
assert incomplete_report["unknownRouteEvidence"]["complete"] is False
assert incomplete_report["visualEvidence"]["complete"] is False
assert incomplete_report["visualEvidence"]["required"] is True
assert incomplete_report["visualEvidence"]["reviewStatus"] == "PENDING_OWNER_REVIEW"
assert incomplete_report["visualEvidence"]["ownerApproved"] is False
assert incomplete_report["visualEvidence"]["expectedScreenshotCount"] == 24
assert incomplete_report["pagesAttempted"] == []
assert incomplete_report["pagesWithHttp200OnTargetOrigin"] == []
assert incomplete_report["completedResponsiveViewportWidthsCssPixels"] == []

complete_evidence = (
    list(browser_smoke.PAGES),
    list(browser_smoke.PAGES),
    [width for width, _height in browser_smoke.RESPONSIVE_AUDIT_VIEWPORTS],
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
    performance_evidence=performance_evidence,
)
assert report["automatedResult"] == "PASS"
assert report["automatedFailureCount"] == 0
assert report["evidenceCoverage"] == {
    "pageNavigationComplete": True,
    "pageHttp200Complete": True,
    "responsiveViewportsComplete": True,
    "unknownRouteRecoveryComplete": True,
    "routePerformanceBaselineComplete": True,
    "complete": True,
}
assert report["unknownRouteEvidence"]["complete"] is True
assert report["performanceBaseline"]["complete"] is True
assert report["performanceBaseline"]["expectedSampleCount"] == 24
assert report["performanceBaseline"]["capturedSampleCount"] == 24
assert report["performanceBaseline"]["fieldDataAvailable"] is False
assert report["performanceBaseline"]["thresholdsEnforced"] is False
assert report["performanceBaseline"]["dataClass"] == "laboratory-diagnostic-not-field-core-web-vitals"
assert len(report["performanceBaseline"]["samples"]) == 24
assert report["visualEvidence"]["complete"] is True
assert report["visualEvidence"]["required"] is True
assert report["visualEvidence"]["reviewStatus"] == "PENDING_OWNER_REVIEW"
assert report["visualEvidence"]["ownerApproved"] is False
assert report["visualEvidence"]["capturedScreenshotCount"] == 24
assert report["visualEvidence"]["capturedFiles"] == complete_screenshots
assert report["releaseStatus"] == "BLOCKED_PENDING_MANUAL_UAT"
assert report["operator"] == "QA operator"
assert report["targetUrl"] == valid
assert report["pagesPlanned"] == browser_smoke.PAGES
assert report["pagesAttempted"] == browser_smoke.PAGES
assert report["pagesWithHttp200OnTargetOrigin"] == browser_smoke.PAGES
assert report["plannedViewportWidthsCssPixels"] == [width for width, _height in browser_smoke.RESPONSIVE_AUDIT_VIEWPORTS]
assert report["completedResponsiveViewportWidthsCssPixels"] == [width for width, _height in browser_smoke.RESPONSIVE_AUDIT_VIEWPORTS]
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
    performance_evidence=performance_evidence,
)
assert partial_report["automatedResult"] == "FAIL"
assert partial_report["evidenceCoverage"]["complete"] is False
assert partial_report["automatedFailureCount"] == 5

missing_performance_evidence = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
    performance_evidence=performance_evidence[:-1],
)
assert missing_performance_evidence["automatedResult"] == "FAIL"
assert missing_performance_evidence["automatedFailureCount"] == 1
assert missing_performance_evidence["performanceBaseline"]["complete"] is False
assert missing_performance_evidence["evidenceCoverage"]["routePerformanceBaselineComplete"] is False
assert missing_performance_evidence["evidenceCoverage"]["complete"] is False

missing_layout_diagnostics = [dict(record) for record in performance_evidence]
missing_layout_diagnostics[0].pop("layoutShiftSources")
invalid_layout_diagnostics = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
    performance_evidence=missing_layout_diagnostics,
)
assert invalid_layout_diagnostics["automatedResult"] == "FAIL"
assert invalid_layout_diagnostics["performanceBaseline"]["complete"] is False
assert invalid_layout_diagnostics["evidenceCoverage"]["routePerformanceBaselineComplete"] is False

missing_font_layout_snapshots = [dict(record) for record in performance_evidence]
missing_font_layout_snapshots[0]["fontReadiness"] = dict(missing_font_layout_snapshots[0]["fontReadiness"])
missing_font_layout_snapshots[0]["fontReadiness"].pop("layoutSnapshots")
invalid_font_layout_snapshots = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
    performance_evidence=missing_font_layout_snapshots,
)
assert invalid_font_layout_snapshots["automatedResult"] == "FAIL"
assert invalid_font_layout_snapshots["performanceBaseline"]["complete"] is False
assert invalid_font_layout_snapshots["evidenceCoverage"]["routePerformanceBaselineComplete"] is False

missing_layout_context = [dict(record) for record in performance_evidence]
shift_record_index = next(index for index, record in enumerate(missing_layout_context) if record["layoutShiftEntries"] > 0)
missing_layout_context[shift_record_index] = dict(missing_layout_context[shift_record_index])
missing_layout_context[shift_record_index]["layoutShiftSources"] = [
    dict(shift) for shift in missing_layout_context[shift_record_index]["layoutShiftSources"]
]
missing_layout_context[shift_record_index]["layoutShiftSources"][0].pop("context")
invalid_layout_context = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
    performance_evidence=missing_layout_context,
)
assert invalid_layout_context["automatedResult"] == "FAIL"
assert invalid_layout_context["performanceBaseline"]["complete"] is False
assert invalid_layout_context["evidenceCoverage"]["routePerformanceBaselineComplete"] is False

missing_font_text_ranges = [dict(record) for record in performance_evidence]
missing_font_text_ranges[0]["fontReadiness"] = dict(missing_font_text_ranges[0]["fontReadiness"])
missing_font_text_ranges[0]["fontReadiness"]["layoutSnapshots"] = [
    dict(snapshot) for snapshot in missing_font_text_ranges[0]["fontReadiness"]["layoutSnapshots"]
]
missing_font_text_ranges[0]["fontReadiness"]["layoutSnapshots"][0].pop("textRanges")
invalid_font_text_ranges = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=complete_screenshots,
    unknown_route_evidence=valid_unknown_route_evidence(),
    performance_evidence=missing_font_text_ranges,
)
assert invalid_font_text_ranges["automatedResult"] == "FAIL"
assert invalid_font_text_ranges["performanceBaseline"]["complete"] is False
assert invalid_font_text_ranges["evidenceCoverage"]["routePerformanceBaselineComplete"] is False

missing_visual_evidence = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
    *complete_evidence,
    screenshot_evidence=[],
    unknown_route_evidence=valid_unknown_route_evidence(),
    performance_evidence=performance_evidence,
)
assert missing_visual_evidence["automatedResult"] == "FAIL"
assert missing_visual_evidence["visualEvidence"]["required"] is True
assert missing_visual_evidence["visualEvidence"]["reviewStatus"] == "PENDING_OWNER_REVIEW"
assert missing_visual_evidence["visualEvidence"]["ownerApproved"] is False
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
    performance_evidence=performance_evidence,
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
    performance_evidence=performance_evidence,
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
    performance_evidence=performance_evidence,
)
assert failed_report["automatedResult"] == "FAIL"
assert failed_report["automatedFailureCount"] == 1
assert failed_report["automatedFailures"] == [
    "request failed at https://outside.example/path"
]
assert "qa-password" not in str(failed_report) and "secret" not in str(failed_report)

# Staging release artifact must exclude the 46 MB legacy image archive unless a
# reviewed runtime asset migration deliberately moves an image into assets/.
PACKAGE_SPEC = importlib.util.spec_from_file_location(
    "staging_preview_packager", ROOT / "scripts" / "package-staging-preview.py"
)
if PACKAGE_SPEC is None or PACKAGE_SPEC.loader is None:
    raise RuntimeError("Could not load the staging preview packager")
staging_packager = importlib.util.module_from_spec(PACKAGE_SPEC)
PACKAGE_SPEC.loader.exec_module(staging_packager)

# The package source inventory must be derived from every responsive JPEG
# fallback actually emitted by the rewrite step, not a second hard-coded list.
with tempfile.TemporaryDirectory(prefix="garh-responsive-source-inventory-") as temporary_directory:
    responsive_root = Path(temporary_directory)
    responsive_page = responsive_root / "experience-details.html"
    responsive_page.write_text(
        '<picture><source data-responsive-image="true" type="image/webp" '
        'srcset="assets/images/responsive/experiences/open-air-sleeping-setup-320.webp 320w">'
        '<img data-responsive-image-fallback="true" '
        'src="assets/images/experiences/open-air-sleeping-setup.jpeg"></picture>'
        '<picture><source data-responsive-image="true" type="image/webp" '
        'srcset="assets/images/responsive/experiences/half-day-jaisalmer-tour-320.webp 320w">'
        '<img data-responsive-image-fallback="true" '
        'src="assets/images/experiences/half-day-jaisalmer-tour.jpg"></picture>'
        '<picture><source data-responsive-image="true" type="image/webp" '
        'srcset="assets/images/responsive/experiences/open-air-sleeping-setup-480.webp 480w">'
        '<img data-responsive-image-fallback="true" '
        'src="assets/images/experiences/open-air-sleeping-setup.jpeg"></picture>',
        encoding="utf-8",
    )
    allowed_sources = (
        "experiences/open-air-sleeping-setup.jpeg",
        "experiences/half-day-jaisalmer-tour.jpg",
    )
    assert staging_packager.collect_responsive_fallback_sources(
        responsive_root, allowed_sources
    ) == allowed_sources

    responsive_page.write_text(
        '<picture><source data-responsive-image="true" type="image/webp" '
        'srcset="assets/images/responsive/unreviewed/unknown-320.webp 320w">'
        '<img data-responsive-image-fallback="true" '
        'src="assets/images/unreviewed/unknown.jpg"></picture>',
        encoding="utf-8",
    )
    try:
        staging_packager.collect_responsive_fallback_sources(
            responsive_root, allowed_sources
        )
    except RuntimeError as error:
        assert "outside the approved image-source allowlist" in str(error)
    else:
        raise AssertionError("Responsive package must reject fallback sources outside the allowlist")

assert "img" not in staging_packager.RUNTIME_DIRECTORIES
selected_runtime_paths = {
    path.relative_to(ROOT).as_posix() for path in staging_packager.checked_paths()
}
assert "preview/journal.html" not in selected_runtime_paths
assert "assets/css/journal-preview.css" not in selected_runtime_paths
assert "assets/js/journal-preview.js" not in selected_runtime_paths
assert not any(path.startswith("preview/") for path in selected_runtime_paths)
assert not any(path.startswith("content/blogs/") for path in selected_runtime_paths)
assert not any(path.startswith("blogs/") and path.lower().endswith(".html") for path in selected_runtime_paths)

with tempfile.TemporaryDirectory(prefix="garh-package-assets-") as temporary_directory:
    package_root = Path(temporary_directory)
    (package_root / "assets").mkdir()
    (package_root / "index.html").write_text(
        '<!doctype html><html><body><img src="assets/images/room.jpg" alt="Room"></body></html>',
        encoding="utf-8",
    )
    clean_closure = staging_packager.validate_no_legacy_image_tree_references(package_root)
    assert clean_closure["status"] == "PASS"
    assert clean_closure["legacyImageReferences"] == 0
    clean_isolation = staging_packager.validate_editorial_draft_isolation(package_root)
    assert clean_isolation == {
        "status": "PASS",
        "previewDirectoryExcluded": True,
        "draftSourceRecordsExcluded": True,
        "previewAssetsExcluded": True,
        "generatedBlogHtmlRoutes": 0,
    }

    stylesheet = package_root / "assets" / "site.css"
    stylesheet.write_text(".legacy { background: url('../img/unused-large.jpg'); }", encoding="utf-8")
    try:
        staging_packager.validate_no_legacy_image_tree_references(package_root)
    except RuntimeError as error:
        assert "site.css" in str(error) and "img/" in str(error)
    else:
        raise AssertionError("Package must fail closed if runtime CSS references the excluded img/ library")

for forbidden_relative in (
    "preview/journal.html",
    "assets/css/journal-preview.css",
    "assets/js/journal-preview.js",
    "content/blogs/jaisalmer-fort-guide.json",
    "blogs/jaisalmer-fort-guide.html",
):
    with tempfile.TemporaryDirectory(prefix="garh-draft-isolation-") as temporary_directory:
        isolated_root = Path(temporary_directory)
        forbidden = isolated_root / forbidden_relative
        forbidden.parent.mkdir(parents=True, exist_ok=True)
        forbidden.write_text("draft-only fixture", encoding="utf-8")
        try:
            staging_packager.validate_editorial_draft_isolation(isolated_root)
        except RuntimeError as error:
            assert "Editorial draft isolation failed" in str(error), forbidden_relative
        else:
            raise AssertionError(
                "Release package must reject draft-only editorial payload: " + forbidden_relative
            )

metrics = staging_packager.package_size_metrics(
    [{"path": "index.html", "bytes": 4, "sha256": "0" * 64}],
    {"path": "img/", "fileCount": 164, "bytesExcluded": 46127863},
    budget_bytes=4,
)
assert metrics["uncompressedPayloadBytes"] == 4
assert metrics["sizeBudgetPassed"] is True
assert metrics["sourceOnlyImageLibraryExcluded"]["bytesExcluded"] == 46127863
try:
    staging_packager.package_size_metrics(
        [{"path": "oversized.bin", "bytes": 5, "sha256": "0" * 64}],
        {"path": "img/", "fileCount": 164, "bytesExcluded": 46127863},
        budget_bytes=4,
    )
except RuntimeError as error:
    assert "exceeds" in str(error) and "budget" in str(error)
else:
    raise AssertionError("Package-size regression must fail when the payload crosses its budget")


# M15: the packaged Chromium report is a complete, durable laboratory record,
# not field data or an inferred saving against the JPEG fallback.
fixture_picture_counts = {route: 1 for route in browser_smoke.PAGES}
fixture_observations = []
for route in browser_smoke.PAGES:
    for viewport_width, _height in browser_smoke.RESPONSIVE_AUDIT_VIEWPORTS:
        for dpr in (1, 2):
            fixture_observations.append({
                "route": route,
                "pictureIndex": 0,
                "viewportWidthCssPixels": viewport_width,
                "deviceScaleFactor": dpr,
                "selectedWebpPath": "assets/images/responsive/rooms/fixture-640.webp",
                "selectedWidth": 640,
                "requiredPixelWidth": 600.0,
                "selectionPixelRatio": round(640 / 600, 3),
                "encodedBodyBytes": 24576,
                "transferBytes": 24880,
                "decodedBodyBytes": 92160,
                "httpStatus": 200,
                "requestCount": 1,
            })

fixture_page_resource_evidence = []
for route in browser_smoke.PAGES:
    for viewport_width, viewport_height in browser_smoke.RESPONSIVE_AUDIT_VIEWPORTS:
        for dpr in (1, 2):
            hero_resource = {
                "path": "/assets/images/responsive/rooms/fixture-640.webp",
                "initiatorType": "img",
                "encodedBodyBytes": 24576,
                "transferBytes": 24880,
                "decodedBodyBytes": 92160,
                "durationMs": 18.2,
            }
            supporting_resource = {
                "path": "/assets/images/responsive/rooms/fixture-support-640.webp",
                "initiatorType": "img",
                "encodedBodyBytes": 8192,
                "transferBytes": 8496,
                "decodedBodyBytes": 32768,
                "durationMs": 10.4,
            }
            stylesheet_resource = {
                "path": "/assets/site.css",
                "initiatorType": "link",
                "encodedBodyBytes": 1024,
                "transferBytes": 1324,
                "decodedBodyBytes": 4096,
                "durationMs": 12.5,
            }
            fixture_page_resource_evidence.append({
                "route": route,
                "viewportWidthCssPixels": viewport_width,
                "deviceScaleFactor": dpr,
                "resources": [stylesheet_resource, hero_resource, supporting_resource],
                "firstView": {
                    "capturePhase": "after-load-before-test-only-image-activation",
                    "viewportHeightCssPixels": viewport_height,
                    "deferredTemplateCount": browser_smoke.EXPECTED_DEFERRED_MEDIA_COUNTS.get(route, 0),
                    "deferredActivatedCount": 0,
                    "resourceCount": 2,
                    "encodedBodyBytes": 1024 + 24576,
                    "transferBytes": 1324 + 24880,
                    "decodedBodyBytes": 4096 + 92160,
                    "resources": [stylesheet_resource, hero_resource],
                    "imageCount": 2,
                    "visibleImageCount": 2,
                    "inViewportImageCount": 1,
                    "requestedImageCount": 1,
                    "requestedOutsideViewportCount": 0,
                    "images": [
                        {
                            "index": 0,
                            "srcPath": "/assets/images/responsive/rooms/fixture-640.webp",
                            "currentSrcPath": "/assets/images/responsive/rooms/fixture-640.webp",
                            "loading": "eager",
                            "fetchpriority": "high",
                            "visible": True,
                            "intersectsViewport": True,
                            "requestedBeforeAuditActivation": True,
                            "complete": True,
                            "naturalWidth": 640,
                            "naturalHeight": 480,
                            "hasAlt": True,
                        },
                        {
                            "index": 1,
                            "srcPath": "/assets/images/responsive/rooms/fixture-support-640.webp",
                            "currentSrcPath": "/assets/images/responsive/rooms/fixture-support-640.webp",
                            "loading": "lazy",
                            "fetchpriority": "low",
                            "visible": True,
                            "intersectsViewport": False,
                            "requestedBeforeAuditActivation": False,
                            "complete": False,
                            "naturalWidth": 0,
                            "naturalHeight": 0,
                            "hasAlt": True,
                        },
                    ],
                },
            })

responsive_evidence = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=fixture_page_resource_evidence,
)
assert responsive_evidence["schemaVersion"] == 4
assert responsive_evidence["automatedResult"] == "PASS"
assert responsive_evidence["coverage"] == {
    "expectedObservationCount": 96,
    "capturedObservationCount": 96,
    "decodedPictureCount": 96,
    "uniqueObservationCount": 96,
    "complete": True,
}
assert responsive_evidence["summary"]["encodedBodyBytesObserved"] == 96 * 24576
assert responsive_evidence["summary"]["transferBytesObserved"] == 96 * 24880
assert responsive_evidence["summary"]["decodedBodyBytesObserved"] == 96 * 92160
assert responsive_evidence["summary"]["maximumSelectedToRequiredPixelRatio"] == 1.067
assert responsive_evidence["pageResourceEvidence"]["expectedContextCount"] == 96
assert responsive_evidence["pageResourceEvidence"]["capturedContextCount"] == 96
assert responsive_evidence["pageResourceEvidence"]["uniqueContextCount"] == 96
assert responsive_evidence["pageResourceEvidence"]["complete"] is True
assert responsive_evidence["pageResourceEvidence"]["allResponsivePicturesActivatedForAudit"] is True
assert responsive_evidence["pageResourceEvidence"]["initialNavigationPayloadClaimed"] is False
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["resourceCount"] == 3
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["byType"]["images"]["encodedBodyBytes"] == 24576 + 8192
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["byType"]["stylesheets"]["encodedBodyBytes"] == 1024
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["firstView"]["resourceCount"] == 2
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["firstView"]["imageCount"] == 2
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["firstView"]["inViewportImageCount"] == 1
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["firstView"]["requestedImageCount"] == 1
gallery_fixture_first_view = next(
    item["firstView"] for item in responsive_evidence["pageResourceEvidence"]["observations"]
    if item["route"] == "gallery.html"
)
assert gallery_fixture_first_view["deferredTemplateCount"] == 7
assert gallery_fixture_first_view["deferredActivatedCount"] == 0
home_fixture_first_view = next(
    item["firstView"] for item in responsive_evidence["pageResourceEvidence"]["observations"]
    if item["route"] == "index.html"
)
assert home_fixture_first_view["deferredTemplateCount"] == 5
assert home_fixture_first_view["deferredActivatedCount"] == 0
rooms_fixture_first_view = next(
    item["firstView"] for item in responsive_evidence["pageResourceEvidence"]["observations"]
    if item["route"] == "rooms.html"
)
assert rooms_fixture_first_view["deferredTemplateCount"] == 7
assert rooms_fixture_first_view["deferredActivatedCount"] == 0
experience_details_fixture_first_view = next(
    item["firstView"] for item in responsive_evidence["pageResourceEvidence"]["observations"]
    if item["route"] == "experience-details.html"
)
assert experience_details_fixture_first_view["deferredTemplateCount"] == 7
assert experience_details_fixture_first_view["deferredActivatedCount"] == 0
experiences_fixture_first_view = next(
    item["firstView"] for item in responsive_evidence["pageResourceEvidence"]["observations"]
    if item["route"] == "experiences.html"
)
assert experiences_fixture_first_view["deferredTemplateCount"] == 6
assert experiences_fixture_first_view["deferredActivatedCount"] == 0
assert responsive_evidence["pageResourceEvidence"]["observations"][0]["firstView"]["encodedBodyBytes"] == 1024 + 24576
assert responsive_evidence["pageResourceEvidence"]["firstViewSummaryByRoute"][browser_smoke.PAGES[0]]["contextCount"] == 12
assert responsive_evidence["pageResourceEvidence"]["firstViewSummaryByRoute"][browser_smoke.PAGES[0]]["averageRequestedImageCount"] == 1
assert responsive_evidence["pageResourceEvidence"]["measurementClass"] == "packaged-route-resource-timing-first-view-and-after-image-activation"
assert responsive_evidence["measurementClass"] == "packaged-chromium-laboratory-diagnostic"
assert responsive_evidence["fieldDataAvailable"] is False
assert responsive_evidence["candidateBytesAreTransferMeasurements"] is False
assert responsive_evidence["candidateSavingsVersusJpegFallbackInferred"] is False
browser_smoke.validate_responsive_image_evidence_report(responsive_evidence)

with tempfile.TemporaryDirectory(prefix="garh-responsive-evidence-") as temporary_directory:
    evidence_path = Path(temporary_directory) / "responsive-image-evidence.json"
    written_evidence = browser_smoke.write_responsive_image_evidence_report(
        str(evidence_path), responsive_evidence
    )
    round_trip_evidence = json.loads(written_evidence.read_text(encoding="utf-8"))
    assert round_trip_evidence["coverage"]["complete"] is True
    assert len(round_trip_evidence["observations"]) == 96
    assert len(round_trip_evidence["pageResourceEvidence"]["observations"]) == 96
    assert round_trip_evidence["browser"]["name"] == "Chromium"

mislabelled_evidence = dict(responsive_evidence)
mislabelled_evidence["fieldDataAvailable"] = True
try:
    browser_smoke.validate_responsive_image_evidence_report(mislabelled_evidence)
except ValueError as error:
    assert "distinguish laboratory observations" in str(error)
else:
    raise AssertionError("Responsive-image evidence must reject false field-data claims")

incomplete_page_resources = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=fixture_page_resource_evidence[:-1],
)
assert incomplete_page_resources["automatedResult"] == "FAIL"
assert incomplete_page_resources["pageResourceEvidence"]["complete"] is False
assert incomplete_page_resources["pageResourceEvidence"]["capturedContextCount"] == 95

unsafe_page_resources = [dict(item) for item in fixture_page_resource_evidence]
unsafe_page_resources[0] = dict(unsafe_page_resources[0])
unsafe_page_resources[0]["resources"] = [dict(item) for item in unsafe_page_resources[0]["resources"]]
unsafe_page_resources[0]["resources"][0]["path"] = "/assets/site.css?private=must-not-be-retained"
unsafe_resource_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=unsafe_page_resources,
)
assert unsafe_resource_report["automatedResult"] == "FAIL"
assert unsafe_resource_report["pageResourceEvidence"]["complete"] is False
assert any("unsafe same-origin resource evidence" in failure for failure in unsafe_resource_report["automatedFailures"])

missing_first_view = [dict(item) for item in fixture_page_resource_evidence]
missing_first_view[0] = dict(missing_first_view[0])
missing_first_view[0].pop("firstView")
missing_first_view_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=missing_first_view,
)
assert missing_first_view_report["automatedResult"] == "FAIL"
assert missing_first_view_report["pageResourceEvidence"]["complete"] is False
assert any("first-view snapshot is missing" in failure for failure in missing_first_view_report["automatedFailures"])

unsafe_first_view = [dict(item) for item in fixture_page_resource_evidence]
unsafe_first_view[0] = dict(unsafe_first_view[0])
unsafe_first_view[0]["firstView"] = dict(unsafe_first_view[0]["firstView"])
unsafe_first_view[0]["firstView"]["resources"] = [
    dict(resource) for resource in unsafe_first_view[0]["firstView"]["resources"]
]
unsafe_first_view[0]["firstView"]["resources"][0]["path"] = "/assets/site.css?private=must-not-be-retained"
unsafe_first_view_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=unsafe_first_view,
)
assert unsafe_first_view_report["automatedResult"] == "FAIL"
assert unsafe_first_view_report["pageResourceEvidence"]["complete"] is False
assert any("unsafe same-origin resource evidence" in failure for failure in unsafe_first_view_report["automatedFailures"])

invalid_deferred_counts = [dict(item) for item in fixture_page_resource_evidence]
invalid_gallery_index = next(index for index, item in enumerate(invalid_deferred_counts) if item["route"] == "gallery.html")
invalid_deferred_counts[invalid_gallery_index] = dict(invalid_deferred_counts[invalid_gallery_index])
invalid_deferred_counts[invalid_gallery_index]["firstView"] = dict(invalid_deferred_counts[invalid_gallery_index]["firstView"])
invalid_deferred_counts[invalid_gallery_index]["firstView"]["deferredTemplateCount"] = 6
invalid_deferred_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=invalid_deferred_counts,
)
assert invalid_deferred_report["automatedResult"] == "FAIL"
assert invalid_deferred_report["pageResourceEvidence"]["complete"] is False
assert any("deferred image counts do not match the route contract" in failure for failure in invalid_deferred_report["automatedFailures"])

invalid_home_deferred_counts = [dict(item) for item in fixture_page_resource_evidence]
invalid_home_index = next(index for index, item in enumerate(invalid_home_deferred_counts) if item["route"] == "index.html")
invalid_home_deferred_counts[invalid_home_index] = dict(invalid_home_deferred_counts[invalid_home_index])
invalid_home_deferred_counts[invalid_home_index]["firstView"] = dict(invalid_home_deferred_counts[invalid_home_index]["firstView"])
invalid_home_deferred_counts[invalid_home_index]["firstView"]["deferredTemplateCount"] = 4
invalid_home_deferred_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=invalid_home_deferred_counts,
)
assert invalid_home_deferred_report["automatedResult"] == "FAIL"
assert invalid_home_deferred_report["pageResourceEvidence"]["complete"] is False
assert any("deferred image counts do not match the route contract" in failure for failure in invalid_home_deferred_report["automatedFailures"])

invalid_rooms_deferred_counts = [dict(item) for item in fixture_page_resource_evidence]
invalid_rooms_index = next(index for index, item in enumerate(invalid_rooms_deferred_counts) if item["route"] == "rooms.html")
invalid_rooms_deferred_counts[invalid_rooms_index] = dict(invalid_rooms_deferred_counts[invalid_rooms_index])
invalid_rooms_deferred_counts[invalid_rooms_index]["firstView"] = dict(invalid_rooms_deferred_counts[invalid_rooms_index]["firstView"])
invalid_rooms_deferred_counts[invalid_rooms_index]["firstView"]["deferredTemplateCount"] = 6
invalid_rooms_deferred_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=invalid_rooms_deferred_counts,
)
assert invalid_rooms_deferred_report["automatedResult"] == "FAIL"
assert invalid_rooms_deferred_report["pageResourceEvidence"]["complete"] is False
assert any("deferred image counts do not match the route contract" in failure for failure in invalid_rooms_deferred_report["automatedFailures"])


invalid_experience_details_deferred_counts = [dict(item) for item in fixture_page_resource_evidence]
invalid_experience_details_index = next(
    index for index, item in enumerate(invalid_experience_details_deferred_counts)
    if item["route"] == "experience-details.html"
)
invalid_experience_details_deferred_counts[invalid_experience_details_index] = dict(
    invalid_experience_details_deferred_counts[invalid_experience_details_index]
)
invalid_experience_details_deferred_counts[invalid_experience_details_index]["firstView"] = dict(
    invalid_experience_details_deferred_counts[invalid_experience_details_index]["firstView"]
)
invalid_experience_details_deferred_counts[invalid_experience_details_index]["firstView"]["deferredTemplateCount"] = 6
invalid_experience_details_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=invalid_experience_details_deferred_counts,
)
assert invalid_experience_details_report["automatedResult"] == "FAIL"
assert invalid_experience_details_report["pageResourceEvidence"]["complete"] is False
assert any("deferred image counts do not match the route contract" in failure for failure in invalid_experience_details_report["automatedFailures"])

invalid_experiences_deferred_counts = [dict(item) for item in fixture_page_resource_evidence]
invalid_experiences_index = next(
    index for index, item in enumerate(invalid_experiences_deferred_counts)
    if item["route"] == "experiences.html"
)
invalid_experiences_deferred_counts[invalid_experiences_index] = dict(
    invalid_experiences_deferred_counts[invalid_experiences_index]
)
invalid_experiences_deferred_counts[invalid_experiences_index]["firstView"] = dict(
    invalid_experiences_deferred_counts[invalid_experiences_index]["firstView"]
)
invalid_experiences_deferred_counts[invalid_experiences_index]["firstView"]["deferredTemplateCount"] = 5
invalid_experiences_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=invalid_experiences_deferred_counts,
)
assert invalid_experiences_report["automatedResult"] == "FAIL"
assert invalid_experiences_report["pageResourceEvidence"]["complete"] is False
assert any("deferred image counts do not match the route contract" in failure for failure in invalid_experiences_report["automatedFailures"])

invalid_priority_first_view = [dict(item) for item in fixture_page_resource_evidence]
invalid_priority_first_view[0] = dict(invalid_priority_first_view[0])
invalid_priority_first_view[0]["firstView"] = dict(invalid_priority_first_view[0]["firstView"])
invalid_priority_first_view[0]["firstView"]["images"] = [
    dict(image) for image in invalid_priority_first_view[0]["firstView"]["images"]
]
invalid_priority_first_view[0]["firstView"]["images"][1]["fetchpriority"] = "urgent"
invalid_priority_report = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations,
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=invalid_priority_first_view,
)
assert invalid_priority_report["automatedResult"] == "FAIL"
assert invalid_priority_report["pageResourceEvidence"]["complete"] is False
assert any("loading-priority/visibility" in failure for failure in invalid_priority_report["automatedFailures"])

incomplete_evidence = browser_smoke.build_responsive_image_evidence_report(
    route_picture_counts=fixture_picture_counts,
    checked_picture_count=len(fixture_observations),
    selected_resource_evidence=fixture_observations[:-1],
    browser_version="Chromium test fixture",
    failures=[],
    page_resource_evidence=fixture_page_resource_evidence,
)
assert incomplete_evidence["automatedResult"] == "FAIL"
assert incomplete_evidence["coverage"]["complete"] is False
assert incomplete_evidence["coverage"]["capturedObservationCount"] == 95


print(
    "PASS: staging preflight refuses HTTP, credentials, path/query/fragment, local/IP and configured "
    "production targets; artifact packaging excludes unused legacy images, fails closed on broken "
    "references and enforces the release payload budget."
)
