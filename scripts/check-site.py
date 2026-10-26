#!/usr/bin/env python3
"""Lightweight static-site integrity checks; no third-party packages required."""
from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAGE_DIRECTORIES = (ROOT, ROOT / 'tours', ROOT / 'blogs')
PAGES = sorted(
    page
    for directory in PAGE_DIRECTORIES
    if directory.is_dir()
    for page in directory.glob('*.html')
)
ERRORS: list[str] = []


class PageAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[tuple[str, str]] = []
        self.image_without_alt: list[str] = []
        self.title_text = ''
        self._in_title = False
        self._in_h1 = False
        self.h1_count = 0
        self.meta_description = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if attr.get('id'):
            self.ids.append(str(attr['id']))
        for key in ('href', 'src'):
            value = attr.get(key)
            if value and not str(value).startswith(('http://', 'https://', 'mailto:', 'tel:', 'data:', 'javascript:')):
                self.refs.append((key, str(value)))
        if tag == 'img' and 'alt' not in attr:
            self.image_without_alt.append(str(attr.get('src', 'unknown src')))
        if tag == 'title':
            self._in_title = True
        if tag == 'h1':
            self.h1_count += 1
            self._in_h1 = True
        if tag == 'meta' and attr.get('name', '').lower() == 'description' and attr.get('content', '').strip():
            self.meta_description = True

    def handle_endtag(self, tag: str) -> None:
        if tag == 'title':
            self._in_title = False
        if tag == 'h1':
            self._in_h1 = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_text += data


def error(message: str) -> None:
    ERRORS.append(message)


for page in PAGES:
    page_label = page.relative_to(ROOT).as_posix()
    audit = PageAudit()
    source = page.read_text(encoding='utf-8')
    try:
        audit.feed(source)
    except Exception as exc:  # pragma: no cover - parser error depends on malformed fixture
        error(f'{page_label}: HTML parse failed: {exc}')
        continue
    repeated_ids = [key for key, count in Counter(audit.ids).items() if count > 1]
    if repeated_ids:
        error(f'{page_label}: duplicate IDs: {", ".join(repeated_ids)}')
    if not audit.title_text.strip():
        error(f'{page_label}: missing title')
    if not audit.meta_description:
        error(f'{page_label}: missing meta description')
    if audit.h1_count != 1:
        error(f'{page_label}: expected one h1, found {audit.h1_count}')
    if audit.image_without_alt:
        error(f'{page_label}: images missing alt text: {", ".join(audit.image_without_alt)}')

    known_ids = set(audit.ids)
    for key, ref in audit.refs:
        path_part, _, fragment = ref.partition('#')
        if path_part:
            local_target = (page.parent / path_part.split('?', 1)[0]).resolve()
            if not local_target.is_relative_to(ROOT):
                error(f'{page_label}: local {key} escapes repository root: {ref}')
                continue
            if not local_target.exists():
                error(f'{page_label}: broken local {key}: {ref}')
                continue
            if fragment and local_target.suffix == '.html':
                target_audit = PageAudit()
                target_audit.feed(local_target.read_text(encoding='utf-8'))
                if fragment not in target_audit.ids:
                    target_label = local_target.relative_to(ROOT).as_posix()
                    error(f'{page_label}: missing target anchor in {target_label}: {ref}')
        elif fragment and fragment not in known_ids:
            error(f'{page_label}: missing in-page anchor: {ref}')

for required in ('assets/site.css', 'assets/site.js', 'favicon.svg', 'robots.txt', 'sitemap.xml'):
    if not (ROOT / required).is_file():
        error(f'missing required project file: {required}')

try:
    ET.parse(ROOT / 'sitemap.xml')
except Exception as exc:
    error(f'sitemap.xml is invalid: {exc}')

# Validate the embedded structured-data JSON on the homepage.
try:
    import json
    home = (ROOT / 'index.html').read_text(encoding='utf-8')
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', home, re.S)
    if not blocks:
        error('index.html: missing Hotel structured data')
    else:
        for block in blocks:
            json.loads(block)
except Exception as exc:
    error(f'index.html: invalid structured data JSON: {exc}')

if ERRORS:
    print(f'FAIL: {len(ERRORS)} issue(s) found')
    for item in ERRORS:
        print(f' - {item}')
    sys.exit(1)

print(f'PASS: {len(PAGES)} root and generated tour/blog page(s) audited; local links, anchors, image alt text, metadata, JSON-LD and sitemap are valid.')
