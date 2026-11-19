#!/usr/bin/env python3
"""Check rendered PHP SEO fundamentals while respecting prelaunch indexing policy."""
from __future__ import annotations
from html.parser import HTMLParser
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SLUGS = ["index", "about", "rooms", "gallery", "dining", "directions", "experiences", "experience-details", "journal", "car-services", "privacy-policy", "booking-policy"]
class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self._title = False
        self.description = []
        self.h1 = 0
        self.images_missing_alt = 0
    def handle_starttag(self, name, attrs):
        attrs = dict(attrs)
        if name == "title": self._title = True
        if name == "h1": self.h1 += 1
        if name == "img" and "alt" not in attrs: self.images_missing_alt += 1
        if name == "meta" and attrs.get("name", "").lower() == "description":
            self.description.append(attrs.get("content", ""))
    def handle_endtag(self, name):
        if name == "title": self._title = False
    def handle_data(self, value):
        if self._title: self.title += value

seen_titles, seen_descriptions = set(), set()
report = []
for slug in SLUGS:
    source = subprocess.check_output(["php", f"{slug}.php"], cwd=ROOT).decode("utf-8")
    p = Page()
    p.feed(source)
    assert p.title.strip() and p.title not in seen_titles, f"Missing/duplicate title: {slug}"
    assert len(p.description) == 1 and len(p.description[0].strip()) >= 45, f"Bad meta description: {slug}"
    assert p.description[0] not in seen_descriptions, f"Duplicate description: {slug}"
    assert p.h1 == 1, f"Expected one H1: {slug}, got {p.h1}"
    assert p.images_missing_alt == 0, f"Images missing alt attributes on {slug}: {p.images_missing_alt}"
    seen_titles.add(p.title)
    seen_descriptions.add(p.description[0])
    report.append({"route": slug+".php", "title": p.title.strip(), "h1": p.h1, "missing_alt": p.images_missing_alt})
config = json.loads((ROOT/"content/site-config.json").read_text(encoding="utf-8"))
if not config.get("site", {}).get("canonicalHostApproved", False):
    robots = (ROOT/"robots.txt").read_text(encoding="utf-8")
    assert "Disallow: /" in robots, "Prelaunch robots safeguard unexpectedly removed"
print(json.dumps({"status":"PASS","core_pages":len(report),"indexing_approved":bool(config.get("site", {}).get("canonicalHostApproved",False)),"pages":report},indent=2))
