#!/usr/bin/env python3
"""Contract tests for the shared public-route and staging viewport inventory."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "content" / "staging-route-contract.json"
contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

EXPECTED_ROUTES = [
    ("index.html", "Home"),
    ("rooms.html", "Rooms"),
    ("experiences.html", "Experiences"),
    ("experience-details.html", "Experience details"),
    ("dining.html", "Dining"),
    ("about.html", "About"),
    ("directions.html", "Directions"),
    ("gallery.html", "Gallery"),
]
EXPECTED_VIEWPORTS = [
    {"width": 320, "height": 800, "label": "Narrow mobile"},
    {"width": 360, "height": 800, "label": "Mobile"},
    {"width": 390, "height": 844, "label": "Wide mobile"},
    {"width": 768, "height": 1024, "label": "Tablet"},
    {"width": 1280, "height": 900, "label": "Laptop"},
    {"width": 1440, "height": 900, "label": "Desktop"},
]
EXPECTED_RESPONSIVE_AUDIT_VIEWPORTS = EXPECTED_VIEWPORTS

assert contract.get("schemaVersion") == 1, "Unsupported staging route contract version"
assert "not a production sitemap" in contract.get("purpose", ""), (
    "The route inventory must remain a QA contract, not a publication signal"
)
routes = contract.get("routes")
assert isinstance(routes, list), "routes must be a list"
assert [(item.get("file"), item.get("title")) for item in routes] == EXPECTED_ROUTES, (
    "Core public routes and their visual-review titles must remain complete and ordered"
)
assert len({item["file"] for item in routes}) == len(routes), "Route filenames must be unique"
assert len({item["title"] for item in routes}) == len(routes), "Visual-review titles must be unique"
for item in routes:
    filename = item["file"]
    assert Path(filename).name == filename and filename.endswith(".html"), (
        f"Route must be a safe root-level HTML filename: {filename}"
    )
    target = ROOT / filename
    assert not target.is_symlink() and target.is_file(), f"Route file is missing or symlinked: {filename}"

viewports = contract.get("viewports")
assert viewports == EXPECTED_VIEWPORTS, (
    "Full-page screenshot evidence must cover all six approved responsive widths from 320 to 1440 CSS pixels"
)
responsive_audit_viewports = contract.get("responsiveAuditViewports")
assert responsive_audit_viewports == EXPECTED_RESPONSIVE_AUDIT_VIEWPORTS, (
    "Responsive layout audits must cover 320, 360, 390, 768, 1280 and 1440 CSS pixels"
)
expected_screenshot_count = len(routes) * len(viewports)
assert expected_screenshot_count == 48, (
    "The eight-route, six-viewport evidence contract must contain 48 screenshots"
)

browser = (ROOT / "scripts" / "test-browser-smoke.py").read_text(encoding="utf-8")
review = (ROOT / "scripts" / "render-staging-visual-review.py").read_text(encoding="utf-8")
launch_test = (ROOT / "scripts" / "test-launch-readiness.js").read_text(encoding="utf-8")
media_performance = (ROOT / "scripts" / "test-page-media-performance.js").read_text(encoding="utf-8")
quality_runner = (ROOT / "scripts" / "check-pr-quality.sh").read_text(encoding="utf-8")
readme = (ROOT / "README.md").read_text(encoding="utf-8")
launch_doc = (ROOT / "docs" / "LAUNCH-READINESS-CHECKLIST.md").read_text(encoding="utf-8")

manifest_reference = 'ROOT / "content" / "staging-route-contract.json"'
for label, source in (("Chromium smoke", browser), ("offline visual review", review)):
    assert manifest_reference in source, f"{label} must read the shared route contract"
assert 'PAGES = [route["file"] for route in ROUTE_CONTRACT["routes"]]' in browser
assert 'VIEWPORTS = [\n    (viewport["width"], viewport["height"])\n    for viewport in ROUTE_CONTRACT["viewports"]\n]' in browser
assert 'RESPONSIVE_AUDIT_VIEWPORTS = [\n    (viewport["width"], viewport["height"])\n    for viewport in ROUTE_CONTRACT["responsiveAuditViewports"]\n]' in browser
assert 'PAGES = [(route["file"], route["title"]) for route in ROUTE_CONTRACT["routes"]]' in review
assert 'VIEWPORTS = [\n    (viewport["width"], viewport["height"], viewport["label"])\n    for viewport in ROUTE_CONTRACT["viewports"]\n]' in review
assert 'RESPONSIVE_AUDIT_VIEWPORT_WIDTHS = [\n    viewport["width"] for viewport in ROUTE_CONTRACT["responsiveAuditViewports"]\n]' in review
assert "staging-route-contract.json" in launch_test
assert "routeContract.routes.map(route => route.file)" in launch_test
assert "routeContract.viewports.map(viewport => viewport.width)" in launch_test
assert "staging-route-contract.json" in media_performance
assert "routeContract.routes.map(route => route.file)" in media_performance
assert "python3 scripts/test-public-route-contract.py" in quality_runner

for stale in (
    "seven core HTML pages",
    "all seven page routes",
    "seven route/HTTP records",
    "Home, Rooms, Experiences, Dining, About, Directions and Gallery",
    "21-image visual evidence",
    "all 21 valid full-page screenshot records",
):
    assert stale not in readme + launch_doc + browser + review, (
        f"Stale route/evidence description remains: {stale}"
    )

assert "all eight page routes" in launch_doc
assert "eight core HTML pages" in launch_doc
assert "eight route/HTTP records" in readme
assert "Experience details" in readme
assert "48 full-page PNG" in readme and "48 full-page PNG" in launch_doc
assert "experience-details.html" in readme and "experience-details.html" in launch_doc

print(
    "PASS: one shared eight-route contract drives six responsive-audit breakpoints, "
    "320/360/390/768/1280/1440px full-page screenshots across the eight core routes with a 48-image evidence bundle; media checks and release docs agree."
)
