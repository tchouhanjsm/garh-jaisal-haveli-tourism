#!/usr/bin/env python3
"""Static-site integrity checks for every public root, tour, and blog HTML route."""
from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
GENERATED_DIRECTORIES = ("tours", "blogs")
EXTERNAL_SCHEMES = {"http", "https", "mailto", "tel", "data", "javascript", "blob"}


class PageAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[tuple[str, str]] = []
        self.image_without_alt: list[str] = []
        self.title_text = ""
        self._in_title = False
        self.h1_count = 0
        self.meta_description = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr = {key.lower(): value for key, value in attrs}
        identifier = attr.get("id")
        if identifier:
            self.ids.append(str(identifier))
        for key in ("href", "src"):
            value = attr.get(key)
            if value is not None and str(value).strip():
                self.refs.append((key, str(value).strip()))
        if tag == "img" and "alt" not in attr:
            self.image_without_alt.append(str(attr.get("src") or "unknown src"))
        if tag == "title":
            self._in_title = True
        if tag == "h1":
            self.h1_count += 1
        if tag == "meta" and str(attr.get("name") or "").lower() == "description" and str(attr.get("content") or "").strip():
            self.meta_description = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_text += data


def collect_public_html(root: Path) -> list[Path]:
    """Collect root HTML and all nested generated tour/blog HTML without following symlinks."""
    root = root.resolve()
    pages = {
        path for path in root.glob("*.html")
        if path.is_file() and not path.is_symlink()
    }
    for directory_name in GENERATED_DIRECTORIES:
        directory = root / directory_name
        if not directory.is_dir() or directory.is_symlink():
            continue
        for current, subdirs, filenames in os.walk(directory, followlinks=False):
            current_path = Path(current)
            subdirs[:] = [
                name for name in subdirs
                if not (current_path / name).is_symlink()
            ]
            for filename in filenames:
                candidate = current_path / filename
                if filename.lower().endswith(".html") and candidate.is_file() and not candidate.is_symlink():
                    pages.add(candidate)
    return sorted(pages)


def parse_page(path: Path) -> PageAudit:
    audit = PageAudit()
    audit.feed(path.read_text(encoding="utf-8"))
    audit.close()
    return audit


def resolve_local_target(root: Path, page: Path, reference: str) -> tuple[Path | None, str, str | None]:
    """Resolve a local URL path and fragment without allowing repository escape."""
    try:
        parsed = urlsplit(reference)
    except ValueError as exc:
        return None, "", f"invalid local URL {reference!r}: {exc}"

    if parsed.scheme.lower() in EXTERNAL_SCHEMES or parsed.netloc:
        return None, "", None

    raw_path = unquote(parsed.path)
    if raw_path:
        candidate = root / raw_path.lstrip("/") if raw_path.startswith("/") else page.parent / raw_path
    else:
        candidate = page

    resolved = candidate.resolve()
    if not resolved.is_relative_to(root):
        return None, parsed.fragment, f"local reference escapes repository root: {reference}"
    if resolved.is_dir():
        index_page = resolved / "index.html"
        if index_page.is_file():
            resolved = index_page.resolve()
    if not resolved.exists() or not resolved.is_file():
        return None, parsed.fragment, f"broken local reference: {reference}"
    if not resolved.is_relative_to(root):
        return None, parsed.fragment, f"local reference escapes repository root: {reference}"
    return resolved, parsed.fragment, None


def audit_pages(root_directory: str | Path) -> dict:
    """Audit page metadata, IDs, local paths and HTML fragment targets."""
    root = Path(root_directory).resolve()
    errors: list[str] = []
    pages = collect_public_html(root)
    parsed_pages: dict[Path, PageAudit] = {}

    def fail(page_label: str, message: str) -> None:
        errors.append(f"{page_label}: {message}")

    if not pages:
        return {"errors": ["no public HTML pages found"], "pagesChecked": 0}

    for page in pages:
        label = page.relative_to(root).as_posix()
        try:
            audit = parse_page(page)
        except Exception as exc:
            fail(label, f"HTML parse failed: {type(exc).__name__}: {exc}")
            continue
        parsed_pages[page] = audit

        repeated_ids = [key for key, count in Counter(audit.ids).items() if count > 1]
        if repeated_ids:
            fail(label, f"duplicate IDs: {', '.join(repeated_ids)}")
        if not audit.title_text.strip():
            fail(label, "missing title")
        if not audit.meta_description:
            fail(label, "missing meta description")
        if audit.h1_count != 1:
            fail(label, f"expected one h1, found {audit.h1_count}")
        if audit.image_without_alt:
            fail(label, f"images missing alt text: {', '.join(audit.image_without_alt)}")

    for page in pages:
        audit = parsed_pages.get(page)
        if audit is None:
            continue
        label = page.relative_to(root).as_posix()
        known_ids = set(audit.ids)
        for key, reference in audit.refs:
            try:
                parts = urlsplit(reference)
            except ValueError:
                fail(label, f"invalid local {key}: {reference}")
                continue
            if parts.scheme.lower() in EXTERNAL_SCHEMES or parts.netloc:
                continue
            # Empty hrefs without fragments do not navigate to a distinct target.
            if not parts.path and not parts.fragment:
                continue

            target, fragment, resolution_error = resolve_local_target(root, page, reference)
            if resolution_error:
                if "escapes repository root" in resolution_error:
                    fail(label, f"local {key} escapes repository root: {reference}")
                else:
                    fail(label, f"broken local {key}: {reference}")
                continue
            if target is None:
                continue
            if key == "href" and fragment and target.suffix.lower() == ".html":
                target_audit = parsed_pages.get(target)
                if target_audit is None:
                    try:
                        target_audit = parse_page(target)
                        parsed_pages[target] = target_audit
                    except Exception as exc:
                        fail(label, f"could not parse anchor target {target.relative_to(root).as_posix()}: {exc}")
                        continue
                if fragment not in target_audit.ids:
                    target_label = target.relative_to(root).as_posix()
                    if target == page:
                        fail(label, f"missing in-page anchor: {reference}")
                    else:
                        fail(label, f"missing target anchor in {target_label}: {reference}")

    return {"errors": errors, "pagesChecked": len(pages)}


def audit_repository(root_directory: str | Path) -> dict:
    root = Path(root_directory).resolve()
    page_result = audit_pages(root)
    errors = list(page_result["errors"])

    for required in ("assets/site.css", "assets/site.js", "favicon.svg", "robots.txt", "sitemap.xml"):
        if not (root / required).is_file():
            errors.append(f"missing required project file: {required}")

    try:
        ET.parse(root / "sitemap.xml")
    except Exception as exc:
        errors.append(f"sitemap.xml is invalid: {exc}")

    try:
        home = (root / "index.html").read_text(encoding="utf-8")
        blocks = re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', home, re.S | re.I)
        if not blocks:
            errors.append("index.html: missing Hotel structured data")
        else:
            for block in blocks:
                json.loads(block)
    except Exception as exc:
        errors.append(f"index.html: invalid or missing structured data JSON: {exc}")

    return {"errors": errors, "pagesChecked": page_result["pagesChecked"]}


def main() -> int:
    result = audit_repository(ROOT)
    if result["errors"]:
        print(f"FAIL: {len(result['errors'])} issue(s) found across {result['pagesChecked']} public HTML page(s)")
        for item in result["errors"]:
            print(f" - {item}")
        return 1
    print(
        f"PASS: {result['pagesChecked']} root and nested tour/blog page(s) audited; "
        "local links, anchors, image alt text, metadata, JSON-LD and sitemap are valid."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
