#!/usr/bin/env python3
"""Contract tests for the guarded, read-only staging preflight CLI."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "test-browser-smoke.py"
SPEC = importlib.util.spec_from_file_location("browser_smoke", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load the browser smoke module")
browser_smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(browser_smoke)


def expect_rejected(url: str, operator: str = "QA operator", report: str = "preflight.json") -> None:
    try:
        browser_smoke.validate_staging_target(url, operator, report)
    except ValueError:
        return
    raise AssertionError(f"Unsafe staging target was accepted: {url!r}")


valid = browser_smoke.validate_staging_target(
    "https://staging.example.test/", "QA operator", "artifacts/preflight.json"
)
assert valid == "https://staging.example.test/"
assert browser_smoke.same_origin("https://staging.example.test/rooms.html", valid)
assert not browser_smoke.same_origin("https://staging.example.test.evil/rooms.html", valid)
assert not browser_smoke.same_origin("not-a-url", "also-not-a-url")

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
    "https://localhost/",
    "https://preview.local/",
):
    expect_rejected(unsafe_url)

expect_rejected("https://staging.example.test/", operator="")
expect_rejected("https://staging.example.test/", report="")
expect_rejected("https://staging.example.test/", report="preflight.txt")
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

report = browser_smoke.build_report(
    "staging-read-only",
    valid,
    "QA operator",
    "Chromium test version",
    [],
)
assert report["automatedResult"] == "PASS"
assert report["releaseStatus"] == "BLOCKED_PENDING_MANUAL_UAT"
assert report["operator"] == "QA operator"
assert report["targetUrl"] == valid
assert report["safety"]["externalLinkNavigationPerformed"] is False
assert report["safety"]["bookingOrPaymentSubmitted"] is False
assert report["safety"]["guestDataSubmitted"] is False
assert report["safety"]["contactMessageSent"] is False
assert "qa-password" not in str(report)
assert report["manualReleaseChecks"]
assert all(item["result"] == "NOT RUN" for item in report["manualReleaseChecks"])
assert report["browser"]["name"] == "Chromium"
assert report["viewportWidthsCssPixels"] == [360, 768, 1440]

failed_report = browser_smoke.build_report(
    "staging-read-only", valid, "QA operator", "Chromium test version", ["example failure"]
)
assert failed_report["automatedResult"] == "FAIL"
assert failed_report["automatedFailureCount"] == 1

print(
    "PASS: staging preflight refuses HTTP, credentials, path/query/fragment, local/IP and configured "
    "production targets; evidence reports preserve manual release checks as NOT RUN."
)
