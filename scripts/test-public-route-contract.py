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
    {"width": 360, "height": 800, "label": "Mobile"},
    {"width": 768, "height": 1024, "label": "Tablet"},
    {"width": 1440, "height": 900, "label": "Desktop"},
]

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
    "Staging evidence must cover Mobile 360x800, Tablet 768x1024 and Desktop 1440x900"
)
expected_screenshot_count = len(routes) * len(viewports)
assert expected_screenshot_count == 24, (
    "The current eight-route, three-viewport evidence contract must contain 24 screenshots"
)

browser = (ROOT / "scripts" / "test-browser-smoke.py").read_text(encoding="utf-8")
review = (ROOT / "scripts" / "render-staging-visual-review.py").read_text(encoding="utf-8")
launch_test = (ROOT / "scripts" / "test-launch-readiness.js").read_text(encoding="utf-8")
quality_runner = (ROOT / "scripts" / "check-pr-quality.sh").read_text(encoding="utf-8")
readme = (ROOT / "README.md").read_text(encoding="utf-8")
launch_doc = (ROOT / "docs" / "LAUNCH-READINESS-CHECKLIST.md").read_text(encoding="utf-8")

manifest_reference = 'ROOT / "content" / "staging-route-contract.json"'
for label, source in (("Chromium smoke", browser), ("offline visual review", review)):
    assert manifest_reference in source, f"{label} must read the shared route contract"
assert 'PAGES = [route["file"] for route in ROUTE_CONTRACT["routes"]]' in browser
assert 'VIEWPORTS = [\n    (viewport["width"], viewport["height"])\n    for viewport in ROUTE_CONTRACT["viewports"]\n]' in browser
assert 'PAGES = [(route["file"], route["title"]) for route in ROUTE_CONTRACT["routes"]]' in review
assert 'VIEWPORTS = [(viewport["width"], viewport["height"], viewport["label"]) for viewport in ROUTE_CONTRACT["viewports"]]' in review
assert "staging-route-contract.json" in launch_test
assert "routeContract.routes.map(route => route.file)" in launch_test
assert "routeContract.viewports.map(viewport => viewport.width)" in launch_test
assert "node scripts/test-public-route-contract.py" in quality_runner

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
assert "24 full-page PNG" in readme and "24 full-page PNG" in launch_doc
assert "experience-details.html" in readme and "experience-details.html" in launch_doc

print(
    "PASS: one shared eight-route/three-viewport contract drives Chromium, "
    "launch wiring and screenshot review; all 24 evidence images and release docs agree."
)
