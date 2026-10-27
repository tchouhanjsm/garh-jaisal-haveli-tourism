#!/usr/bin/env python3
"""Fixture tests for recursive static route and local-anchor integrity."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "check-site.py"
SPEC = importlib.util.spec_from_file_location("site_integrity", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load static site integrity checker")
site_integrity = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(site_integrity)


def page(title: str, heading_id: str, extra: str = "") -> str:
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>{title}</title>
<meta name="description" content="A useful description for {title}."></head>
<body><main><h1 id="{heading_id}">{title}</h1>
<a href="#{heading_id}">Jump to this page</a>
{extra}
</main></body></html>"""


def make_fixture(root: Path) -> None:
    (root / "assets").mkdir(parents=True)
    (root / "assets" / "room.jpg").write_bytes(b"fixture-image")
    (root / "tours" / "desert" / "day").mkdir(parents=True)
    (root / "blogs" / "guides" / "fort").mkdir(parents=True)
    (root / "index.html").write_text(
        page("Home", "home", '<a href="/tours/desert/index.html?source=fixture#tour">Tour</a>'
             '<img src="/assets/room.jpg" alt="Sandstone guest room">'),
        encoding="utf-8",
    )
    (root / "rooms.html").write_text(
        page("Rooms", "rooms", '<a href="tours/desert/index.html#tour">Tour details</a>'),
        encoding="utf-8",
    )
    (root / "tours" / "desert" / "index.html").write_text(
        page("Desert tour", "tour", '<a href="../../../../rooms.html#rooms">Rooms</a>'
             '<img src="../../../../assets/room.jpg" alt="Sandstone guest room">'),
        encoding="utf-8",
    )
    (root / "tours" / "desert" / "day" / "index.html").write_text(
        page("Desert day", "day", '<a href="../../../../index.html#home">Home</a>'),
        encoding="utf-8",
    )
    (root / "blogs" / "guides" / "fort" / "index.html").write_text(
        page("Fort guide", "fort", '<a href="../../../../index.html#home">Home</a>'),
        encoding="utf-8",
    )


with tempfile.TemporaryDirectory(prefix="garh-route-integrity-") as temporary:
    root = Path(temporary)
    make_fixture(root)
    pages = site_integrity.collect_public_html(root)
    page_labels = {page.relative_to(root).as_posix() for page in pages}
    expected_pages = {
        "index.html",
        "rooms.html",
        "tours/desert/index.html",
        "tours/desert/day/index.html",
        "blogs/guides/fort/index.html",
    }
    assert page_labels == expected_pages, f"recursive route discovery mismatch: {page_labels}"
    valid = site_integrity.audit_pages(root)
    assert valid["pagesChecked"] == 5, valid
    assert valid["errors"] == [], "\n".join(valid["errors"])

with tempfile.TemporaryDirectory(prefix="garh-route-integrity-invalid-") as temporary:
    root = Path(temporary)
    make_fixture(root)
    index = root / "index.html"
    content = index.read_text(encoding="utf-8")
    content = content.replace(
        "</main>",
        '<a href="#missing-anchor">Broken fragment</a>'
        '<a href="/tours/missing.html">Missing route</a>'
        '<a href="../../outside.html">Escaping route</a>'
        "</main>",
    )
    index.write_text(content, encoding="utf-8")
    nested = root / "tours" / "desert" / "day" / "index.html"
    nested_content = nested.read_text(encoding="utf-8").replace(
        "</main>", '<a href="../../../index.html#not-real">Missing nested anchor</a></main>'
    )
    nested.write_text(nested_content, encoding="utf-8")
    invalid = site_integrity.audit_pages(root)
    diagnostics = "\n".join(invalid["errors"])
    for expected in (
        "missing in-page anchor",
        "broken local href",
        "local href escapes repository root",
        "missing target anchor",
    ):
        assert expected in diagnostics, f"expected {expected!r}\n{diagnostics}"

print("PASS: recursive root/tour/blog route discovery and local path/fragment validation reject broken, missing-anchor and escaping references.")
