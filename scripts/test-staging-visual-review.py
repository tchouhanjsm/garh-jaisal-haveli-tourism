#!/usr/bin/env python3
"""Contract tests for the offline staging visual review renderer."""
from __future__ import annotations

import binascii
import importlib.util
import json
import hashlib
import struct
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


review = load_module("staging_visual_review", ROOT / "scripts" / "render-staging-visual-review.py")
browser_smoke = load_module("browser_smoke_for_visual_review", ROOT / "scripts" / "test-browser-smoke.py")
assert [page for page, _title in review.PAGES] == browser_smoke.PAGES
assert [width for width, _height, _label in review.VIEWPORTS] == [width for width, _height in browser_smoke.VIEWPORTS]
assert review.safe_origin("https://127.0.0.1/") is None
assert review.safe_origin("https://localhost/") is None
assert review.safe_origin("https://staging.example.test/?token=secret") is None


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF))


def make_png(width: int, height: int, shade: int) -> bytes:
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    row = b"\x00" + bytes((shade, (shade + 37) % 256, (shade + 91) % 256)) * width
    pixels = row * height
    return (review.PNG_SIGNATURE + png_chunk(b"IHDR", header)
            + png_chunk(b"IDAT", zlib.compress(pixels))
            + png_chunk(b"IEND", b""))


def build_fixture(directory: Path) -> tuple[Path, Path, Path, dict]:
    screenshots = directory / "screenshots"
    screenshots.mkdir()
    records = []
    counter = 1
    for width, viewport_height, _label in review.VIEWPORTS:
        for page_file, _page_title in review.PAGES:
            filename = f"{Path(page_file).stem}-{width}px.png"
            payload = make_png(width, 3, counter)
            counter += 1
            (screenshots / filename).write_bytes(payload)
            records.append({
                "filename": filename,
                "viewportWidthCssPixels": width,
                "viewportHeightCssPixels": viewport_height,
                "imageWidthPixels": width,
                "imageHeightPixels": 3,
                "fullPage": True,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            })
    pages = [page for page, _title in review.PAGES]
    widths = [width for width, _height, _label in review.VIEWPORTS]
    report = {
        "schemaVersion": 4,
        "mode": "staging-read-only",
        "targetUrl": "https://staging.example.test/",
        "recordedAtAsiaKolkata": "2026-10-26T23:00:00+05:30",
        "operator": "<script>alert('xss')</script>",
        "browser": {"name": "Chromium", "version": "test-version"},
        "pagesPlanned": pages,
        "pagesAttempted": pages,
        "pagesWithHttp200OnTargetOrigin": pages,
        "plannedViewportWidthsCssPixels": widths,
        "completedResponsiveViewportWidthsCssPixels": widths,
        "evidenceCoverage": {
            "pageNavigationComplete": True,
            "pageHttp200Complete": True,
            "responsiveViewportsComplete": True,
            "unknownRouteRecoveryComplete": True,
            "complete": True,
        },
        "automatedResult": "PASS",
        "automatedFailureCount": 0,
        "automatedFailures": [],
        "unknownRouteEvidence": {
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
        },
        "visualEvidence": {
            "required": True,
            "captureMode": "full-page PNG",
            "expectedScreenshotCount": review.EXPECTED_SCREENSHOT_COUNT,
            "capturedScreenshotCount": review.EXPECTED_SCREENSHOT_COUNT,
            "complete": True,
            "capturedFiles": records,
        },
        "manualReleaseChecks": [
            {"id": f"STG-{number:02d}", "check": f"Manual check {number}", "result": "NOT RUN"}
            for number in range(1, 19)
        ],
        "releaseStatus": "BLOCKED_PENDING_MANUAL_UAT",
        "safety": {
            "externalLinkNavigationPerformed": False,
            "bookingOrPaymentSubmitted": False,
            "guestDataSubmitted": False,
            "contactMessageSent": False,
        },
    }
    report_path = directory / "preflight.json"
    report_path.write_text(json.dumps(report), encoding="utf-8")
    output_path = directory / "visual-review.html"
    return report_path, screenshots, output_path, report


with tempfile.TemporaryDirectory(prefix="gjh-visual-review-test-") as temp:
    folder = Path(temp)
    report_path, screenshots, output_path, report = build_fixture(folder)
    assert review.report_contract_issues(report) == []
    checked, issues = review.inspect_bundle(report, screenshots)
    assert not issues, issues
    incomplete_coverage = json.loads(json.dumps(report))
    incomplete_coverage["pagesAttempted"] = []
    _coverage_images, coverage_issues = review.inspect_bundle(incomplete_coverage, screenshots)
    assert any(f"attempts for all {len(review.PAGES)} routes" in issue for issue in coverage_issues)
    coverage_html = review.build_html(
        incomplete_coverage, screenshots, _coverage_images, coverage_issues
    )
    assert 'Automated browser result<strong class="fail">FAIL — INCOMPLETE EVIDENCE</strong>' in coverage_html
    assert len(checked) == review.EXPECTED_SCREENSHOT_COUNT and all(item["valid"] for item in checked)
    page = review.build_html(report, screenshots, checked, issues)
    assert page.count('class="card"') == review.EXPECTED_SCREENSHOT_COUNT
    assert page.count('<section id="page-') == len(review.PAGES)
    assert 'src="screenshots/index-360px.png"' in page
    assert "staging.example.test" in page
    assert "BLOCKED — manual UAT required" in page
    assert "PASS — report records no external actions" in page
    assert "<script>alert('xss')</script>" not in page

    def expect_contract_issue(candidate: dict, fragment: str) -> None:
        contract_issues = review.report_contract_issues(candidate)
        assert any(fragment in issue for issue in contract_issues), (fragment, contract_issues)

    inconsistent_count = json.loads(json.dumps(report))
    inconsistent_count["automatedFailureCount"] = 1
    expect_contract_issue(inconsistent_count, "does not match automatedFailures length")

    contradictory_result = json.loads(json.dumps(report))
    contradictory_result["automatedFailureCount"] = 1
    contradictory_result["automatedFailures"] = ["a recorded browser failure"]
    expect_contract_issue(contradictory_result, "automatedResult must be FAIL")

    false_release = json.loads(json.dumps(report))
    false_release["releaseStatus"] = "READY"
    expect_contract_issue(false_release, "releaseStatus must remain BLOCKED_PENDING_MANUAL_UAT")

    unsafe_run = json.loads(json.dumps(report))
    unsafe_run["safety"]["bookingOrPaymentSubmitted"] = True
    expect_contract_issue(unsafe_run, "bookingOrPaymentSubmitted must be present and false")

    missing_safety = json.loads(json.dumps(report))
    del missing_safety["safety"]["contactMessageSent"]
    expect_contract_issue(missing_safety, "contactMessageSent must be present and false")

    invalid_timestamp = json.loads(json.dumps(report))
    invalid_timestamp["recordedAtAsiaKolkata"] = "2026-10-26T23:00:00"
    expect_contract_issue(invalid_timestamp, "valid ISO-8601 Asia/Kolkata timestamp")

    missing_browser = json.loads(json.dumps(report))
    missing_browser["browser"] = {}
    expect_contract_issue(missing_browser, "browser name and version metadata")

    wrong_visual_count = json.loads(json.dumps(report))
    wrong_visual_count["visualEvidence"]["expectedScreenshotCount"] = review.EXPECTED_SCREENSHOT_COUNT - 1
    expect_contract_issue(wrong_visual_count, f"expectedScreenshotCount must equal {review.EXPECTED_SCREENSHOT_COUNT}")

    for coverage_flag in (
        "pageNavigationComplete",
        "pageHttp200Complete",
        "responsiveViewportsComplete",
        "complete",
    ):
        contradictory_coverage = json.loads(json.dumps(report))
        contradictory_coverage["evidenceCoverage"][coverage_flag] = False
        expect_contract_issue(
            contradictory_coverage, f"evidenceCoverage.{coverage_flag} must be true"
        )
    missing_coverage_flag = json.loads(json.dumps(report))
    del missing_coverage_flag["evidenceCoverage"]["responsiveViewportsComplete"]
    expect_contract_issue(
        missing_coverage_flag, "evidenceCoverage.responsiveViewportsComplete must be true"
    )

    missing_visual = json.loads(json.dumps(report))
    del missing_visual["visualEvidence"]
    missing_visual_html = review.build_html(
        missing_visual, screenshots, *review.inspect_bundle(missing_visual, screenshots)
    )
    assert "INVALID REPORT" in missing_visual_html

    unsafe_html = review.build_html(
        unsafe_run, screenshots, *review.inspect_bundle(unsafe_run, screenshots)
    )
    assert "INVALID REPORT" in unsafe_html
    assert "FAIL — safety assertions missing or contradictory" in unsafe_html
    assert "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;" in page
    assert str(folder) not in page
    assert "<script" not in page
    assert 'src="https://' not in page

    # CLI writes the review beside the screenshot folder and returns PASS only
    # when the report result and all planned file hashes/byte counts/geometry agree.
    exit_code = review.main([
        "--report", str(report_path),
        "--screenshots-dir", str(screenshots),
        "--output", str(output_path),
    ])
    assert exit_code == 0
    assert output_path.is_file()
    rendered_html = output_path.read_text(encoding="utf-8")
    assert f"{review.EXPECTED_SCREENSHOT_COUNT} files verified" in rendered_html
    assert "Unknown-route / 404 recovery evidence" in rendered_html
    assert "HTTP 404" in rendered_html
    assert "STG-18" in rendered_html

    # Tampering with a real PNG while leaving the JSON unchanged must fail closed.
    target = screenshots / "rooms-360px.png"
    target.write_bytes(make_png(360, 3, 201))
    changed, changed_issues = review.inspect_bundle(report, screenshots)
    changed_room = next(item for item in changed if item["filename"] == "rooms-360px.png")
    assert not changed_room["valid"]
    assert any("SHA-256 mismatch" in issue for issue in changed_issues)
    changed_html = review.build_html(report, screenshots, changed, changed_issues)
    assert "Evidence integrity issues" in changed_html
    assert "Screenshot integrity mismatch" in changed_html
    assert 'src="screenshots/rooms-360px.png"' not in changed_html
    assert review.main([
        "--report", str(report_path),
        "--screenshots-dir", str(screenshots),
        "--output", str(output_path),
    ]) == 1

    # A failed browser report is still reviewable, but cannot exit successfully.
    failed_report = dict(report)
    failed_report["automatedResult"] = "FAIL"
    failed_report["automatedFailures"] = [
        "failure at https://qa-user:qa-password@outside.example/path?token=secret#fragment while reading /tmp/private/staging.json"
    ]
    failed_report["automatedFailureCount"] = len(failed_report["automatedFailures"])
    failed_report_path = folder / "failed-preflight.json"
    failed_report_path.write_text(json.dumps(failed_report), encoding="utf-8")
    for record in failed_report["visualEvidence"]["capturedFiles"]:
        (screenshots / record["filename"]).write_bytes(
            make_png(record["viewportWidthCssPixels"], 3, 17)
        )
        payload = (screenshots / record["filename"]).read_bytes()
        record["bytes"] = len(payload)
        record["sha256"] = hashlib.sha256(payload).hexdigest()
    failed_report_path.write_text(json.dumps(failed_report), encoding="utf-8")
    failed_html = review.build_html(
        failed_report, screenshots, *review.inspect_bundle(failed_report, screenshots)
    )
    assert "outside.example/path" in failed_html
    assert "qa-password" not in failed_html and "token=secret" not in failed_html
    assert "/tmp/private/staging.json" not in failed_html
    assert "[local path redacted]" in failed_html
    assert "BLOCKED — manual UAT required" in failed_html
    assert review.main([
        "--report", str(failed_report_path),
        "--screenshots-dir", str(screenshots),
        "--output", str(output_path),
    ]) == 1

    # Invalid schema and mode are rejected before an HTML review is written.
    invalid_schema_path = folder / "invalid-schema.json"
    invalid_schema_path.write_text(json.dumps({"schemaVersion": 3, "mode": "staging-read-only"}), encoding="utf-8")
    try:
        review.load_report(invalid_schema_path)
    except ValueError as error:
        assert "schema-version 4" in str(error)
    else:
        raise AssertionError("An incompatible schema-v3 report must be rejected")

    # A contradictory HTTP status for the unknown route must invalidate the report.
    invalid_404_report = dict(report)
    invalid_404_evidence = dict(report["unknownRouteEvidence"])
    invalid_404_checks = [dict(item) for item in invalid_404_evidence["viewportChecks"]]
    invalid_404_checks[0]["httpStatus"] = 200
    invalid_404_evidence["viewportChecks"] = invalid_404_checks
    invalid_404_report["unknownRouteEvidence"] = invalid_404_evidence
    assert any("unknownRouteEvidence" in issue
               for issue in review.report_contract_issues(invalid_404_report))

    # Invalid origin tokens are never echoed into HTML.
    bad_origin_report = dict(failed_report)
    bad_origin_report["targetUrl"] = "https://staging.example.test/?token=secret"
    bad_origin_html = review.build_html(
        bad_origin_report, screenshots, *review.inspect_bundle(bad_origin_report, screenshots)
    )
    assert "token=secret" not in bad_origin_html
    assert "Origin withheld" in bad_origin_html

    # Output paths are guarded against accidental evidence commits and path mismatch.
    try:
        review.validate_paths(str(ROOT / "content" / "site-config.json"), str(screenshots), str(output_path))
    except ValueError as error:
        assert "outside" in str(error)
    else:
        raise AssertionError("Report input inside the checkout must be rejected")
    try:
        review.validate_paths(str(report_path), str(ROOT / "assets"), str(output_path))
    except ValueError as error:
        assert "outside" in str(error)
    else:
        raise AssertionError("Screenshot directory inside the checkout must be rejected")
    try:
        review.validate_paths(str(report_path), str(screenshots), str(ROOT / "visual-review.html"))
    except ValueError as error:
        assert "outside" in str(error)
    else:
        raise AssertionError("HTML output inside the checkout must be rejected")
    try:
        review.validate_paths(str(report_path), str(screenshots), str(folder / "nested" / "visual-review.html"))
    except ValueError as error:
        assert "beside" in str(error)
    else:
        raise AssertionError("HTML output must be beside the screenshot directory")

print(f"PASS: offline staging visual review validates {review.EXPECTED_SCREENSHOT_COUNT} screenshot hashes/bytes/geometry, explicit HTTP 404 recovery evidence, escapes report text, redacts URLs, and preserves 18 manual release gates.")
