#!/usr/bin/env python3
"""Fixture tests for the dependency-free static accessibility contract."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "test-static-accessibility.py"
SPEC = importlib.util.spec_from_file_location("static_accessibility", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load static accessibility audit")
static_accessibility = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(static_accessibility)


def page(extra: str = "", route: str = "Home") -> str:
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>{route}</title></head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header>
  <nav id="primary-navigation" aria-label="Primary navigation">
    <a href="index.html">Home</a>
  </nav>
  <span id="menu-label">Open navigation</span>
  <button type="button" aria-labelledby="menu-label" aria-controls="primary-navigation"
    aria-expanded="false">Menu</button>
</header>
<main id="main" tabindex="-1">
  <h1>{route}</h1>
  <a href="rooms.html"><img src="room.jpg" alt="Sandstone guest room"></a>
  <a href="https://example.test/" target="_blank" rel="noopener noreferrer">External map</a>
  <p id="email-help">Used only for correspondence.</p>
  <label for="email">Email address</label>
  <input id="email" type="email" aria-describedby="email-help">
  <label>Receive updates <input type="checkbox" id="updates"></label>
  <div hidden aria-hidden="true"><button type="button">Inactive control</button></div>
  {extra}
</main>
</body></html>"""


def write_fixture(root: Path, invalid: bool = False) -> None:
    (root / "tours").mkdir(parents=True, exist_ok=True)
    (root / "blogs").mkdir(parents=True, exist_ok=True)
    content = page(route="Home")
    if invalid:
        content = content.replace(
            "</main>",
            """
<a href="rooms.html"></a>
<button></button>
<a href="https://bad.example/" target="_blank">Unsafe new tab</a>
<button type="button" aria-label="Expand" aria-controls="missing-panel">Expand</button>
<button type="button" aria-labelledby="missing-name">Missing label reference</button>
<div tabindex="3">Positive tab order</div>
<input id="unlabelled-input" type="text">
<label for="missing-control">Orphan label</label>
<div id="duplicate"></div><div id="duplicate"></div>
<div aria-hidden="true"><button type="button">Focusable hidden action</button></div>
<img src="missing-alt.jpg">
</main>""",
        )
    (root / "index.html").write_text(content, encoding="utf-8")
    (root / "404.html").write_text(page(route="Not found"), encoding="utf-8")
    (root / "tours" / "desert.html").write_text(page(route="Desert tour"), encoding="utf-8")


with tempfile.TemporaryDirectory(prefix="garh-accessibility-valid-") as temporary:
    valid_root = Path(temporary)
    write_fixture(valid_root)
    valid = static_accessibility.audit_accessibility(valid_root)
    assert valid["pagesChecked"] == 3
    assert valid["controlsChecked"] >= 8
    assert valid["errors"] == [], "\n".join(valid["errors"])

with tempfile.TemporaryDirectory(prefix="garh-accessibility-invalid-") as temporary:
    invalid_root = Path(temporary)
    write_fixture(invalid_root, invalid=True)
    invalid = static_accessibility.audit_accessibility(invalid_root)
    joined = "\n".join(invalid["errors"])
    for expected in (
        "link has no accessible name",
        "button has no accessible name",
        "button must declare type",
        "target=_blank link must include rel=noopener",
        "aria-controls references missing id",
        "aria-labelledby references missing id",
        "positive tabindex is not allowed",
        "control has no accessible name",
        "label for=",
        "duplicate id",
        "inside aria-hidden content",
        "image missing alt attribute",
    ):
        assert expected in joined, f"expected fixture failure {expected!r}\n{joined}"

print("PASS: static accessibility contract accepts labelled/named controls and rejects unlabeled controls, invalid references, unsafe focus and new-tab regressions.")
