#!/usr/bin/env python3
"""Build a verified, non-deploying staging preview package after CI quality gates."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
from html.parser import HTMLParser
import sys
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
# The legacy `img/` tree is retained in Git as a source/asset archive, not
# used by the static runtime. Keep it out of staging artifacts unless the site
# deliberately migrates those assets into the supported `assets/` tree.
RUNTIME_DIRECTORIES = ("assets", "blogs", "tours", "gallery")
MAX_UNCOMPRESSED_PACKAGE_BYTES = 18 * 1024 * 1024
LEGACY_IMG_REFERENCE = re.compile(r"(?<![A-Za-z0-9_.-])(?:\.\.?/)*img/", re.IGNORECASE)
RUNTIME_ROOT_FILES = (
    ".htaccess",
    "favicon.svg",
    "robots.txt",
    "robots-staging.txt",
    "sitemap.xml",
    "sitemap-empty.xml",
)
ROOT_PAGE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*\.html$", re.IGNORECASE)
SHA_PATTERN = re.compile(r"^[0-9a-f]{40,64}$", re.IGNORECASE)


def fail(message: str) -> None:
    raise RuntimeError(message)


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_within(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


class ResponsivePictureParser(HTMLParser):
    """Collect generated responsive picture/source/fallback contracts from HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.pictures: list[dict] = []
        self.orphan_responsive_sources = 0
        self.orphan_responsive_fallbacks = 0
        self._current: dict | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        values = {key.lower(): value or "" for key, value in attrs}
        if name == "picture":
            if self._current is not None:
                raise ValueError("nested picture elements are not supported in packaged markup")
            self._current = {"sources": [], "fallbacks": []}
            return
        if name == "source" and values.get("data-responsive-image", "").lower() == "true":
            if self._current is None:
                self.orphan_responsive_sources += 1
            else:
                self._current["sources"].append(values)
        elif name == "img" and values.get("data-responsive-image-fallback", "").lower() == "true":
            if self._current is None:
                self.orphan_responsive_fallbacks += 1
            else:
                self._current["fallbacks"].append(values)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "picture" or self._current is None:
            return
        if self._current["sources"] or self._current["fallbacks"]:
            self.pictures.append(self._current)
        self._current = None

    def close(self) -> None:
        super().close()
        if self._current is not None:
            raise ValueError("responsive picture element was not closed")


def validate_responsive_markup(
    output: Path,
    generated_files: list[dict],
    image_sources: list[dict],
    responsive_widths: tuple[int, ...],
) -> dict:
    """Match every generated srcset descriptor to decoded output bytes and JPEG fallback."""
    output = output.resolve(strict=True)
    candidate_by_path = {entry["path"]: entry for entry in generated_files}
    if len(candidate_by_path) != len(generated_files):
        fail("Responsive package contains duplicate generated asset paths.")
    source_by_path = {entry["sourceJpeg"]: entry for entry in image_sources}
    if len(source_by_path) != len(image_sources):
        fail("Responsive package contains duplicate source-image records.")

    picture_count = 0
    candidate_count = 0
    for page in sorted(output.glob("*.html")):
        if page.is_symlink() or not page.is_file():
            fail(f"Responsive markup route is unsafe: {page.name}")
        parser = ResponsivePictureParser()
        try:
            parser.feed(page.read_text(encoding="utf-8"))
            parser.close()
        except (UnicodeDecodeError, ValueError) as error:
            fail(f"Responsive markup could not be parsed in {page.name}: {error}")
        if parser.orphan_responsive_sources or parser.orphan_responsive_fallbacks:
            fail(f"Responsive source/fallback must be inside a picture element: {page.name}")

        for picture in parser.pictures:
            picture_count += 1
            sources = picture["sources"]
            fallbacks = picture["fallbacks"]
            if len(sources) != 1 or len(fallbacks) != 1:
                fail(
                    f"{page.name}: responsive picture must contain exactly one WebP source "
                    "and one marked JPEG fallback."
                )
            source = sources[0]
            fallback = fallbacks[0]
            if source.get("type", "").lower() != "image/webp":
                fail(f"{page.name}: responsive picture source must declare type=image/webp.")
            if not source.get("sizes", "").strip():
                fail(f"{page.name}: responsive picture source must declare a non-empty sizes value.")

            fallback_path = fallback.get("src", "").split("?", 1)[0].split("#", 1)[0]
            source_record = source_by_path.get(fallback_path)
            if (
                source_record is None
                or fallback_path != source_record["sourceJpeg"]
                or not fallback_path.lower().endswith((".jpg", ".jpeg"))
            ):
                fail(f"{page.name}: responsive picture has an unapproved or mismatched JPEG fallback.")
            natural_width = int(source_record["naturalWidth"])
            natural_height = int(source_record["naturalHeight"])
            if (
                fallback.get("width") != str(natural_width)
                or fallback.get("height") != str(natural_height)
            ):
                fail(f"{page.name}: JPEG fallback dimensions do not match decoded source dimensions.")
            if fallback.get("decoding", "").lower() != "async":
                fail(f"{page.name}: responsive JPEG fallback must use decoding=async.")
            classes = fallback.get("class", "").split()
            is_hero = "hero__image" in classes or fallback.get("fetchpriority", "").lower() == "high"
            expected_loading = "eager" if is_hero else "lazy"
            if fallback.get("loading", "").lower() != expected_loading:
                fail(f"{page.name}: responsive image loading policy does not match its hero/supporting role.")

            raw_srcset = source.get("srcset", "").strip()
            if not raw_srcset:
                fail(f"{page.name}: responsive picture source has an empty srcset.")
            candidates: list[tuple[str, int]] = []
            seen_paths: set[str] = set()
            seen_widths: set[int] = set()
            previous_width = 0
            for raw_candidate in raw_srcset.split(","):
                pieces = raw_candidate.strip().rsplit(None, 1)
                if len(pieces) != 2:
                    fail(f"{page.name}: malformed responsive srcset candidate: {raw_candidate.strip()}")
                relative, descriptor = pieces
                match = re.fullmatch(r"([1-9][0-9]*)w", descriptor)
                if not match:
                    fail(f"{page.name}: srcset candidate must use a positive width descriptor: {descriptor}")
                declared_width = int(match.group(1))
                metadata = candidate_by_path.get(relative)
                if metadata is None:
                    fail(f"{page.name}: srcset references an unverified WebP candidate: {relative}")
                if relative in seen_paths or declared_width in seen_widths:
                    fail(f"{page.name}: srcset contains a duplicate path or width descriptor.")
                if declared_width <= previous_width:
                    fail(f"{page.name}: srcset width descriptors must be strictly increasing.")
                if declared_width != int(metadata["width"]):
                    fail(
                        f"{page.name}: srcset descriptor width {declared_width}w does not match "
                        f"decoded asset width {metadata['width']}px for {relative}."
                    )
                if declared_width == natural_width:
                    expected_relative = source_record["fullSizeWebp"]
                else:
                    source_relative = PurePosixPath(source_record["sourceJpeg"]).relative_to(
                        PurePosixPath("assets/images")
                    )
                    expected_relative = (
                        PurePosixPath("assets/images/responsive")
                        / source_relative.parent
                        / f"{source_relative.stem}-{declared_width}.webp"
                    ).as_posix()
                if relative != expected_relative:
                    fail(f"{page.name}: srcset candidate path does not match its source stem/width: {relative}")
                absolute = output / relative
                if absolute.is_symlink() or not absolute.is_file() or not is_within(absolute.resolve(), output):
                    fail(f"{page.name}: srcset candidate is missing or unsafe: {relative}")
                expected_height = max(1, round(natural_height * declared_width / natural_width))
                if int(metadata["height"]) != expected_height:
                    fail(f"{page.name}: responsive candidate aspect ratio does not match source: {relative}")
                candidates.append((relative, declared_width))
                seen_paths.add(relative)
                seen_widths.add(declared_width)
                previous_width = declared_width

            source_relative = PurePosixPath(source_record["sourceJpeg"]).relative_to(
                PurePosixPath("assets/images")
            )
            expected_candidates = [
                (
                    (
                        PurePosixPath("assets/images/responsive")
                        / source_relative.parent
                        / f"{source_relative.stem}-{width}.webp"
                    ).as_posix(),
                    width,
                )
                for width in responsive_widths
                if width < natural_width
            ]
            expected_candidates.append((source_record["fullSizeWebp"], natural_width))
            if candidates != expected_candidates:
                fail(
                    f"{page.name}: srcset candidates must include the verified responsive widths "
                    "in ascending order and the full-size WebP candidate last."
                )
            candidate_count += len(candidates)

    if picture_count == 0:
        fail("No responsive picture markup was found in the generated preview package.")
    return {
        "status": "PASS",
        "responsivePictureCount": picture_count,
        "validatedSrcsetCandidateCount": candidate_count,
        "widthDescriptorsMatchDecodedPixels": True,
        "jpegFallbackDimensionsMatchSource": True,
    }




class DocumentContractParser(HTMLParser):
    """Collect route-level SEO metadata and accessible-name relationships."""

    VOID_TAGS = {
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[dict] = []
        self.html_languages: list[str] = []
        self.title_nodes: list[dict] = []
        self.h1_nodes: list[dict] = []
        self.descriptions: list[str] = []
        self.viewports: list[str] = []
        self.open_graph: dict[str, list[str]] = {}
        self.main_count = 0
        self.skip_link_hrefs: list[str] = []
        self.images: list[dict] = []
        self.links: list[dict] = []
        self.buttons: list[dict] = []
        self.controls: list[dict] = []
        self.labels: list[dict] = []
        self.nodes_by_id: dict[str, list[dict]] = {}
        self.aria_labelledby_nodes: list[dict] = []
        self._seen_ids: set[str] = set()
        self.duplicate_ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        values = {key.lower(): value or "" for key, value in attrs}
        node = {
            "tag": name,
            "attrs": values,
            "text": "",
            "imageAltText": [],
            "ancestorLabels": [entry for entry in self.stack if entry["tag"] == "label"],
        }

        identifier = values.get("id", "").strip()
        if identifier:
            if identifier in self._seen_ids:
                self.duplicate_ids.add(identifier)
            self._seen_ids.add(identifier)
            self.nodes_by_id.setdefault(identifier, []).append(node)

        if name == "html":
            self.html_languages.append(values.get("lang", "").strip())
        elif name == "title":
            self.title_nodes.append(node)
        elif name == "h1":
            self.h1_nodes.append(node)
        elif name == "main":
            self.main_count += 1
        elif name == "meta":
            meta_name = values.get("name", "").strip().lower()
            property_name = values.get("property", "").strip().lower()
            content = values.get("content", "").strip()
            if meta_name == "description":
                self.descriptions.append(content)
            elif meta_name == "viewport":
                self.viewports.append(content)
            if property_name in {"og:title", "og:description", "og:image"}:
                self.open_graph.setdefault(property_name, []).append(content)

        if name == "a" and "href" in values:
            self.links.append(node)
            if "skip-link" in values.get("class", "").split():
                self.skip_link_hrefs.append(values.get("href", "").strip())
        elif name == "button":
            self.buttons.append(node)
        elif name == "img":
            self.images.append(node)
            if (
                "alt" in values
                and values.get("alt", "").strip()
                and values.get("aria-hidden", "").lower() != "true"
                and not any(entry["attrs"].get("aria-hidden", "").lower() == "true" for entry in self.stack)
            ):
                for ancestor in self.stack:
                    if ancestor["tag"] in {"a", "button"}:
                        ancestor["imageAltText"].append(values["alt"].strip())
        elif name == "label":
            self.labels.append(node)
        elif name in {"input", "select", "textarea"}:
            self.controls.append(node)

        if values.get("aria-labelledby", "").strip():
            self.aria_labelledby_nodes.append(node)

        if name not in self.VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() not in self.VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        name = tag.lower()
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == name:
                self.stack = self.stack[:index]
                return

    def handle_data(self, data: str) -> None:
        if any(entry["attrs"].get("aria-hidden", "").lower() == "true" for entry in self.stack):
            return
        for entry in self.stack:
            entry["text"] += data

    @staticmethod
    def normalized_text(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    def labelledby_text(self, node: dict) -> str:
        tokens = node["attrs"].get("aria-labelledby", "").split()
        if not tokens:
            return ""
        parts: list[str] = []
        for token in tokens:
            matches = self.nodes_by_id.get(token, [])
            if not matches:
                return ""
            target = matches[0]
            value = (
                target.get("text", "")
                or target["attrs"].get("aria-label", "")
                or target["attrs"].get("title", "")
            )
            value = self.normalized_text(value)
            if not value:
                return ""
            parts.append(value)
        return " ".join(parts)

    def has_accessible_name(self, node: dict) -> bool:
        attrs = node["attrs"]
        return bool(
            attrs.get("aria-label", "").strip()
            or self.labelledby_text(node)
            or self.normalized_text(node.get("text", ""))
            or any(self.normalized_text(value) for value in node.get("imageAltText", []))
            or attrs.get("title", "").strip()
        )

    def control_has_label(self, node: dict) -> bool:
        attrs = node["attrs"]
        if attrs.get("type", "").lower() == "hidden":
            return True
        if (
            attrs.get("aria-label", "").strip()
            or self.labelledby_text(node)
            or attrs.get("title", "").strip()
        ):
            return True
        identifier = attrs.get("id", "").strip()
        associated = [
            label for label in self.labels
            if identifier and label["attrs"].get("for", "").strip() == identifier
        ]
        wrapped = node.get("ancestorLabels", [])
        if any(self.normalized_text(label.get("text", "")) or label["attrs"].get("aria-label", "").strip()
               for label in associated + wrapped):
            return True
        if attrs.get("type", "").lower() in {"button", "submit", "reset"}:
            return bool(attrs.get("value", "").strip())
        if attrs.get("type", "").lower() == "image":
            return bool(attrs.get("alt", "").strip())
        return False


def validate_document_contract(output: Path) -> dict:
    """Fail closed when packaged routes regress core SEO or accessible-name contracts."""
    raw_root = Path(output)
    if raw_root.is_symlink():
        fail("Document-contract root must not be a symlink.")
    root = raw_root.resolve(strict=True)
    if not root.is_dir():
        fail("Document-contract root must be a directory.")

    pages = sorted(root.glob("*.html"))
    if not pages:
        fail("Document-contract audit found no root HTML routes.")

    counters = {
        "routesScanned": len(pages),
        "imagesChecked": 0,
        "imagesMissingAlt": 0,
        "linksChecked": 0,
        "unnamedLinks": 0,
        "buttonsChecked": 0,
        "unnamedButtons": 0,
        "formControlsChecked": 0,
        "unlabelledFormControls": 0,
        "missingLanguage": 0,
        "missingTitle": 0,
        "missingDescription": 0,
        "missingViewport": 0,
        "missingH1": 0,
        "missingMain": 0,
        "missingSkipLink": 0,
        "missingOpenGraph": 0,
        "brokenAriaLabelledbyReferences": 0,
        "duplicateIds": 0,
        "duplicateTitles": 0,
        "duplicateDescriptions": 0,
    }
    errors: list[str] = []
    titles: list[str] = []
    descriptions: list[str] = []

    for page in pages:
        if page.is_symlink() or not page.is_file():
            fail(f"Document-contract route is unsafe: {page.name}")
        parser = DocumentContractParser()
        try:
            parser.feed(page.read_text(encoding="utf-8"))
            parser.close()
        except (UnicodeDecodeError, ValueError) as error:
            fail(f"Document-contract markup could not be parsed in {page.name}: {error}")

        route = page.name
        title_values = [parser.normalized_text(node["text"]) for node in parser.title_nodes]
        title_value = title_values[0] if len(title_values) == 1 else ""
        description_value = parser.descriptions[0] if len(parser.descriptions) == 1 else ""
        if len(parser.html_languages) != 1 or not parser.html_languages[0]:
            counters["missingLanguage"] += 1
            errors.append(f"{route}: html element must declare one non-empty lang attribute.")
        if len(parser.title_nodes) != 1 or not title_value:
            counters["missingTitle"] += 1
            errors.append(f"{route}: exactly one non-empty document title is required.")
        else:
            titles.append(title_value)
        if len(parser.descriptions) != 1 or not description_value:
            counters["missingDescription"] += 1
            errors.append(f"{route}: exactly one non-empty meta description is required.")
        else:
            descriptions.append(description_value)
        if len(parser.viewports) != 1 or not parser.viewports[0]:
            counters["missingViewport"] += 1
            errors.append(f"{route}: exactly one non-empty viewport meta tag is required.")
        if len(parser.h1_nodes) != 1 or not parser.normalized_text(parser.h1_nodes[0]["text"] if parser.h1_nodes else ""):
            counters["missingH1"] += 1
            errors.append(f"{route}: exactly one non-empty h1 is required.")
        if parser.main_count != 1:
            counters["missingMain"] += 1
            errors.append(f"{route}: exactly one main landmark is required.")

        if (
            len(parser.skip_link_hrefs) != 1
            or not parser.skip_link_hrefs[0].startswith("#")
            or parser.skip_link_hrefs[0][1:] not in parser.nodes_by_id
        ):
            counters["missingSkipLink"] += 1
            errors.append(f"{route}: one skip link must target an existing element ID.")

        for image in parser.images:
            counters["imagesChecked"] += 1
            if "alt" not in image["attrs"]:
                counters["imagesMissingAlt"] += 1
                errors.append(f"{route}: image missing alt attribute: {image['attrs'].get('src', '<no src>')}.")

        for link in parser.links:
            counters["linksChecked"] += 1
            if not parser.has_accessible_name(link):
                counters["unnamedLinks"] += 1
                errors.append(f"{route}: link has no accessible name: {link['attrs'].get('href', '<no href>')}.")

        for button in parser.buttons:
            counters["buttonsChecked"] += 1
            if not parser.has_accessible_name(button):
                counters["unnamedButtons"] += 1
                errors.append(f"{route}: button has no accessible name.")

        for control in parser.controls:
            if control["attrs"].get("type", "").lower() == "hidden":
                continue
            counters["formControlsChecked"] += 1
            if not parser.control_has_label(control):
                counters["unlabelledFormControls"] += 1
                errors.append(
                    f"{route}: form control has no associated label: "
                    f"{control['attrs'].get('name') or control['attrs'].get('id') or control['tag']}."
                )

        for node in parser.aria_labelledby_nodes:
            for token in node["attrs"].get("aria-labelledby", "").split():
                if token not in parser.nodes_by_id:
                    counters["brokenAriaLabelledbyReferences"] += 1
                    errors.append(f"{route}: aria-labelledby references missing ID {token!r}.")

        counters["duplicateIds"] += len(parser.duplicate_ids)
        if parser.duplicate_ids:
            errors.append(f"{route}: duplicate element IDs: {', '.join(sorted(parser.duplicate_ids)[:8])}.")

        if route != "404.html":
            required_open_graph = ("og:title", "og:description", "og:image")
            missing = [
                key for key in required_open_graph
                if len(parser.open_graph.get(key, [])) != 1 or not parser.open_graph[key][0]
            ]
            if missing:
                counters["missingOpenGraph"] += 1
                errors.append(f"{route}: required Open Graph metadata missing or duplicated: {', '.join(missing)}.")

    title_counts: dict[str, int] = {}
    for value in titles:
        title_counts[value] = title_counts.get(value, 0) + 1
    counters["duplicateTitles"] = sum(count - 1 for count in title_counts.values() if count > 1)
    if counters["duplicateTitles"]:
        errors.append("Root routes contain duplicate document titles.")

    description_counts: dict[str, int] = {}
    for value in descriptions:
        description_counts[value] = description_counts.get(value, 0) + 1
    counters["duplicateDescriptions"] = sum(count - 1 for count in description_counts.values() if count > 1)
    if counters["duplicateDescriptions"]:
        errors.append("Root routes contain duplicate meta descriptions.")

    if errors:
        fail("Packaged document accessibility/SEO contract failed:\n" + "\n".join(errors[:40]))
    return {"status": "PASS", **counters}


CSS_URL_PATTERN = re.compile(
    r"""url\(\s*(?:(?P<quote>["'])(?P<quoted>.*?)(?P=quote)|(?P<bare>[^)]*?))\s*\)""",
    re.IGNORECASE | re.DOTALL,
)
CSS_IMPORT_PATTERN = re.compile(r"""@import\s+(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)
JS_STATIC_IMPORT_FROM_PATTERN = re.compile(
    r"""(?<![\w$.])(?:import|export)\s+(?:(?!["';]).)*?\sfrom\s*(["'])(.*?)\1""",
    re.DOTALL,
)
JS_SIDE_EFFECT_IMPORT_PATTERN = re.compile(
    r"""(?<![\w$.])import\s*(["'])(.*?)\1""",
    re.DOTALL,
)
JS_DYNAMIC_IMPORT_PATTERN = re.compile(
    r"""\bimport\s*\(\s*(["'])(.*?)\1\s*\)""",
    re.DOTALL,
)
JS_NEW_URL_PATTERN = re.compile(
    r"""\bnew\s+URL\s*\(\s*(["'])(.*?)\1\s*,\s*import\.meta\.url\s*\)""",
    re.DOTALL,
)
META_IMAGE_PROPERTIES = {"og:image", "og:image:url", "twitter:image", "twitter:image:src"}


def srcset_urls(value: str) -> list[str]:
    """Extract file-like srcset candidates, including mixed data/local lists safely."""
    candidates: list[str] = []
    in_data_candidate = False
    for segment in value.split(","):
        item = segment.strip()
        if not item:
            continue
        if item.lower().startswith("data:"):
            in_data_candidate = True
        if in_data_candidate:
            # Data URLs can contain commas; resume only at a recognizable descriptor boundary.
            if re.search(r"\s+(?:[1-9][0-9]*(?:\.[0-9]+)?[wx])$", item, re.IGNORECASE):
                in_data_candidate = False
            continue
        url = item.split(None, 1)[0]
        if "/" in url or Path(url).suffix:
            candidates.append(url)
    return candidates


def css_references(text: str) -> list[tuple[str, str]]:
    """Collect CSS url() and quoted @import targets without double-counting imports."""
    references: list[tuple[str, str]] = []
    for match in CSS_URL_PATTERN.finditer(text):
        value = match.group("quoted") if match.group("quote") else match.group("bare")
        value = (value or "").strip()
        if value:
            references.append(("css-url", value))
    for match in CSS_IMPORT_PATTERN.finditer(text):
        value = match.group(2).strip()
        if value:
            references.append(("css-import", value))
    return list(dict.fromkeys(references))


def js_module_references(text: str) -> list[tuple[str, str]]:
    """Collect side-effect, from-clause, dynamic imports, re-exports and module-relative URLs."""
    patterns = (
        JS_STATIC_IMPORT_FROM_PATTERN,
        JS_SIDE_EFFECT_IMPORT_PATTERN,
        JS_DYNAMIC_IMPORT_PATTERN,
        JS_NEW_URL_PATTERN,
    )
    references: list[tuple[str, str]] = []
    for pattern in patterns:
        for match in pattern.finditer(text):
            value = match.group(2).strip()
            if value:
                references.append(("js-module", value))
    return list(dict.fromkeys(references))


class RuntimeReferenceParser(HTMLParser):
    """Collect local-file-bearing HTML attributes plus inline CSS and module references."""

    ATTRIBUTES = {"href", "src", "poster", "data", "srcset", "imagesrcset", "xlink:href"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[str, str]] = []
        self.inline_styles: list[str] = []
        self.inline_scripts: list[str] = []
        self._in_style = False
        self._in_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        values = {key.lower(): value or "" for key, value in attrs}
        for key, value in values.items():
            if not value:
                continue
            if key in {"srcset", "imagesrcset"}:
                self.references.extend((key, url) for url in srcset_urls(value))
            elif key in self.ATTRIBUTES:
                self.references.append((key, value))
            elif key == "style":
                self.inline_styles.append(value)
        if name == "meta" and values.get("content", ""):
            property_name = values.get("property", "").lower()
            name_value = values.get("name", "").lower()
            if property_name in META_IMAGE_PROPERTIES or name_value in META_IMAGE_PROPERTIES:
                self.references.append(("meta-image", values["content"]))
        if name == "style":
            self._in_style = True
        if name == "script":
            self._in_script = not bool(values.get("src"))

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "style":
            self._in_style = False
        elif tag.lower() == "script":
            self._in_script = False

    def handle_data(self, data: str) -> None:
        if self._in_style:
            self.inline_styles.append(data)
        if self._in_script:
            self.inline_scripts.append(data)


def resolve_runtime_reference(root: Path, source: Path, kind: str, reference: str) -> bool:
    """Verify a local runtime reference exists inside the package and crosses no symlink."""
    value = reference.strip()
    try:
        parsed = urlsplit(value)
    except ValueError as error:
        fail(f"{source.relative_to(root).as_posix()}: malformed local {kind} reference {value!r}: {error}")
    if parsed.scheme or parsed.netloc or not parsed.path:
        return False

    relative_path = unquote(parsed.path)
    if "\x00" in relative_path or "\\" in relative_path:
        fail(f"{source.relative_to(root).as_posix()}: unsafe local {kind} reference: {value}")
    candidate = root / relative_path.lstrip("/") if relative_path.startswith("/") else source.parent / relative_path
    candidate = Path(os.path.abspath(candidate))
    source_label = source.relative_to(root).as_posix()
    if not is_within(candidate, root):
        fail(f"{source_label}: local {kind} reference escapes package root: {value}")

    cursor = root
    for part in candidate.relative_to(root).parts:
        cursor = cursor / part
        if cursor.is_symlink():
            fail(f"{source_label}: local {kind} reference traverses a symlink: {value}")

    try:
        resolved = candidate.resolve(strict=False)
    except (OSError, RuntimeError) as error:
        fail(f"{source_label}: could not resolve local {kind} reference {value}: {error}")
    if not is_within(resolved, root):
        fail(f"{source_label}: local {kind} reference escapes package root: {value}")

    if candidate.is_dir():
        candidate = candidate / "index.html"
        if candidate.is_symlink():
            fail(f"{source_label}: local {kind} directory index is a symlink: {value}")
    if not candidate.exists() or not candidate.is_file():
        fail(f"{source_label}: broken local asset reference ({kind}): {value}")
    return True


def validate_runtime_asset_closure(output: Path) -> dict:
    """Fail closed on missing HTML/CSS/SVG/module assets after package transformations."""
    raw_root = Path(output)
    if raw_root.is_symlink():
        fail("Runtime asset-closure root must not be a symlink.")
    root = raw_root.resolve(strict=True)
    if not root.is_dir():
        fail("Runtime asset-closure root must be a directory.")
    text_suffixes = {".html", ".css", ".js", ".svg"}
    files = sorted(
        path for path in root.rglob("*")
        if path.is_file() and not path.is_symlink() and path.suffix.lower() in text_suffixes
    )
    references_checked = 0
    references_by_kind: dict[str, int] = {}
    for source in files:
        relative = source.relative_to(root).as_posix()
        if source.is_symlink():
            fail(f"Unsafe runtime reference source: {relative}")
        try:
            content = source.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            fail(f"Runtime reference source is not valid UTF-8: {relative}: {error}")

        references: list[tuple[str, str]] = []
        if source.suffix.lower() in {".html", ".svg"}:
            parser = RuntimeReferenceParser()
            try:
                parser.feed(content)
                parser.close()
            except (ValueError, AssertionError) as error:
                fail(f"Could not parse runtime markup {relative}: {error}")
            references.extend(parser.references)
            for style_text in parser.inline_styles:
                references.extend(css_references(style_text))
            for script_text in parser.inline_scripts:
                references.extend(js_module_references(script_text))
        elif source.suffix.lower() == ".css":
            references.extend(css_references(content))
        elif source.suffix.lower() == ".js":
            references.extend(js_module_references(content))

        for kind, reference in dict.fromkeys(references):
            if resolve_runtime_reference(root, source, kind, reference):
                references_checked += 1
                references_by_kind[kind] = references_by_kind.get(kind, 0) + 1

    return {
        "status": "PASS",
        "filesScanned": len(files),
        "localReferencesChecked": references_checked,
        "referencesByKind": dict(sorted(references_by_kind.items())),
        "missingLocalReferences": 0,
    }


def validate_no_legacy_image_tree_references(output: Path) -> dict:
    """Fail closed if a runtime file references the excluded legacy /img asset library."""
    raw_output = Path(output)
    if raw_output.is_symlink():
        fail("Legacy-reference audit root must not be a symlink.")
    output = raw_output.resolve(strict=True)
    if not output.is_dir():
        fail("Legacy-reference audit root must be a directory.")
    text_suffixes = {".html", ".css", ".js", ".json", ".svg", ".xml", ".txt", ".map"}
    checked = 0
    for candidate in sorted(output.rglob("*")):
        if candidate.is_symlink():
            fail(f"Unsafe package symlink while auditing legacy image references: {candidate.relative_to(output)}")
        if not candidate.is_file():
            continue
        if candidate.suffix.lower() not in text_suffixes and candidate.name != ".htaccess":
            continue
        try:
            text = candidate.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            fail(f"Runtime text asset is not valid UTF-8: {candidate.relative_to(output)}")
        match = LEGACY_IMG_REFERENCE.search(text)
        if match:
            line_number = text.count("\n", 0, match.start()) + 1
            fail(
                f"Runtime file references the source-only img/ library, which is not packaged: "
                f"{candidate.relative_to(output)}:{line_number}. Move the asset into assets/ "
                "or explicitly design a reviewed runtime asset migration."
            )
        checked += 1
    if (output / "img").exists():
        fail("The source-only img/ library must not be copied into the runtime package.")
    return {"status": "PASS", "textFilesChecked": checked, "legacyImageReferences": 0}


def legacy_source_image_inventory() -> dict:
    """Measure the Git-retained legacy image library without copying it into the website package."""
    root = ROOT / "img"
    if not root.exists():
        return {"path": "img/", "fileCount": 0, "bytesExcluded": 0}
    if root.is_symlink() or not root.is_dir():
        fail("The legacy source image path must be a real directory.")
    count = 0
    total_bytes = 0
    for candidate in sorted(root.rglob("*")):
        if candidate.is_symlink():
            fail(f"Symlink in legacy source image library: {candidate.relative_to(ROOT)}")
        if candidate.is_dir() or not candidate.is_file() or candidate.name == ".gitkeep":
            continue
        count += 1
        total_bytes += candidate.stat().st_size
    return {"path": "img/", "fileCount": count, "bytesExcluded": total_bytes}


def package_size_metrics(entries: list[dict], legacy_inventory: dict,
                         budget_bytes: int = MAX_UNCOMPRESSED_PACKAGE_BYTES) -> dict:
    """Enforce a deterministic uncompressed payload budget and report archive-scope savings."""
    if not isinstance(budget_bytes, int) or isinstance(budget_bytes, bool) or budget_bytes <= 0:
        fail("Package size budget must be a positive integer.")
    total = 0
    for entry in entries:
        amount = entry.get("bytes")
        if not isinstance(amount, int) or isinstance(amount, bool) or amount < 0:
            fail("Package inventory contains an invalid byte count.")
        total += amount
    if total > budget_bytes:
        fail(
            f"Uncompressed staging payload exceeds its {budget_bytes}-byte budget: "
            f"{total} bytes. Review runtime assets; do not raise the budget without a measured reason."
        )
    utilization = round((total / budget_bytes) * 100, 2)
    return {
        "uncompressedPayloadBytes": total,
        "uncompressedBudgetBytes": budget_bytes,
        "budgetUtilizationPercent": utilization,
        "sizeBudgetPassed": True,
        "sourceOnlyImageLibraryExcluded": legacy_inventory,
    }


def checked_paths() -> list[Path]:
    """Select only browser runtime files and explicit release-safety policy files."""
    files: set[Path] = set()
    for candidate in ROOT.glob("*.html"):
        if candidate.is_symlink() or not candidate.is_file():
            fail(f"Root HTML route must be a regular file: {candidate.name}")
        if not ROOT_PAGE_PATTERN.fullmatch(candidate.name):
            fail(f"Unexpected root HTML filename: {candidate.name}")
        files.add(candidate)

    route_contract_path = ROOT / "content" / "staging-route-contract.json"
    if route_contract_path.is_symlink() or not route_contract_path.is_file():
        fail("Missing safe core route contract: content/staging-route-contract.json")
    route_contract = json.loads(route_contract_path.read_text(encoding="utf-8"))
    routes = route_contract.get("routes")
    if route_contract.get("schemaVersion") != 1 or not isinstance(routes, list) or not routes:
        fail("The core route contract is malformed or unsupported.")
    route_names: set[str] = set()
    for route in routes:
        filename = route.get("file") if isinstance(route, dict) else None
        if not isinstance(filename, str) or not ROOT_PAGE_PATTERN.fullmatch(filename):
            fail("The core route contract contains an unsafe route filename.")
        if filename in route_names:
            fail(f"The core route contract has a duplicate route: {filename}")
        route_names.add(filename)
        route_path = ROOT / filename
        if route_path.is_symlink() or not route_path.is_file():
            fail(f"Core route is missing or unsafe: {filename}")
        files.add(route_path)

    config_path = ROOT / "content" / "site-config.json"
    if config_path.is_symlink() or not config_path.is_file():
        fail("The public runtime configuration is missing or unsafe.")
    files.add(config_path)

    for filename in RUNTIME_ROOT_FILES:
        path = ROOT / filename
        if path.is_symlink() or not path.is_file():
            fail(f"Required runtime/policy file is missing or unsafe: {filename}")
        files.add(path)

    for directory_name in RUNTIME_DIRECTORIES:
        directory = ROOT / directory_name
        if not directory.exists():
            continue
        if directory.is_symlink() or not directory.is_dir():
            fail(f"Runtime directory is not a safe directory: {directory_name}")
        for candidate in sorted(directory.rglob("*")):
            if candidate.is_symlink():
                fail(f"Symlinks are not allowed in the staging package: {candidate.relative_to(ROOT)}")
            if candidate.is_dir() or not candidate.is_file() or candidate.name == ".gitkeep":
                continue
            files.add(candidate)

    return sorted(files, key=lambda item: item.relative_to(ROOT).as_posix())


def validate_staging_policy(source_config: dict, source_robots: str, source_sitemap: str,
                            htaccess: str, empty_sitemap: str, staging_robots: str) -> None:
    site = source_config.get("site")
    if not isinstance(site, dict) or site.get("canonicalHostApproved") is not False:
        fail("Staging package blocked: canonicalHostApproved must remain false.")
    if not re.search(r"(?m)^\s*User-agent:\s*\*\s*$", source_robots, re.IGNORECASE):
        fail("robots.txt must explicitly apply its rule to all user agents.")
    if not re.search(r"(?m)^\s*Disallow:\s*/\s*$", source_robots, re.IGNORECASE):
        fail("robots.txt must block crawling for this staging preview.")
    if re.search(r"(?mi)^\s*Sitemap\s*:", source_robots):
        fail("robots.txt must not advertise a sitemap before owner approval.")

    def loc_count(xml_text: str, label: str) -> int:
        try:
            root = ElementTree.fromstring(xml_text)
        except ElementTree.ParseError as exc:
            fail(f"{label} is invalid XML: {exc}")
        return sum(1 for element in root.iter() if element.tag.rsplit("}", 1)[-1].lower() == "loc")

    if loc_count(source_sitemap, "sitemap.xml") != 0:
        fail("Staging package blocked: sitemap.xml contains a public URL.")
    if loc_count(empty_sitemap, "sitemap-empty.xml") != 0:
        fail("sitemap-empty.xml must remain URL-empty.")
    if not re.search(r"Disallow:\s*/", staging_robots, re.IGNORECASE):
        fail("robots-staging.txt must disallow crawling.")
    if not re.search(r"robots-staging\.txt", htaccess) or not re.search(r"sitemap-empty\.xml", htaccess):
        fail(".htaccess must preserve non-canonical staging robots/sitemap overrides.")
    if not re.search(r'X-Robots-Tag\s+"noindex, nofollow"', htaccess, re.IGNORECASE):
        fail(".htaccess must preserve the noindex header for non-canonical hosts.")


def copy_runtime_files(files: list[Path], output: Path) -> list[dict]:
    manifest_entries: list[dict] = []
    for source in files:
        relative = source.relative_to(ROOT).as_posix()
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        payload = destination.read_bytes()
        manifest_entries.append({
            "path": relative,
            "bytes": len(payload),
            "sha256": digest_bytes(payload),
        })
    return manifest_entries


def inventory_package_files(output: Path) -> list[dict]:
    """Hash every payload file after transformations, excluding the manifest itself."""
    entries: list[dict] = []
    for source in sorted(output.rglob("*")):
        relative = source.relative_to(output).as_posix()
        if source.is_symlink():
            fail(f"Unsafe packaged file: {relative}")
        if source.is_dir():
            continue
        if not source.is_file():
            fail(f"Unsafe packaged file: {relative}")
        if relative == "RELEASE-MANIFEST.json":
            continue
        payload = source.read_bytes()
        entries.append({
            "path": relative,
            "bytes": len(payload),
            "sha256": digest_bytes(payload),
        })
    return entries


def apply_responsive_image_delivery(output: Path) -> dict:
    """Generate and verify WebP variants against real source photos in the temporary package."""
    generator_path = ROOT / "scripts" / "rewrite_image_refs.py"
    spec = importlib.util.spec_from_file_location("staging_preview_image_generator", generator_path)
    if spec is None or spec.loader is None:
        fail("Could not load the existing responsive image generator.")
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)

    rewritten = generator.rewrite_site(output, "responsive")
    sources = (
        "rest3.jpg",
        "courtyard.jpg",
        "scarlet.jpg",
        "tent.jpg",
        "legacy/camel-day.jpg",
        "legacy/camel-sunset.jpg",
        "legacy/fort-temple-spires.jpg",
        "rooms/rising-sun.jpg",
        "rooms/opium.jpg",
        "rooms/red-maharani.jpg",
        "rooms/green.jpg",
        "rooms/bluesky.jpg",
        "experiences/cultural-programme.jpg",
        "experiences/swiss-tent-detail.jpeg",
        "experiences/heritage-architecture.jpg",
        "gallery/desert/camp-evening.jpeg",
        "gallery/desert/camp-from-above.jpeg",
        "dining/rooftop-candlelit-table.jpg",
    )
    generated_files: list[dict] = []
    image_sources: list[dict] = []
    for filename in sources:
        stem = Path(filename).stem
        source = output / "assets" / "images" / Path(filename)
        full_size = source.with_suffix(".webp")
        if source.is_symlink() or not source.is_file():
            fail(f"Responsive source photo is missing or unsafe: {filename}")
        if full_size.is_symlink() or not full_size.is_file():
            fail(f"Generator did not create the full-size WebP output for {filename}.")
        with generator.Image.open(source) as opened:
            opened.load()
            natural = generator.ImageOps.exif_transpose(opened)
            width, height = natural.size
        with generator.Image.open(full_size) as converted:
            converted.load()
            if converted.format != "WEBP" or converted.size != (width, height):
                fail(f"Full-size WebP failed decoded format/dimension verification: {full_size.name}")
        source_bytes = source.stat().st_size
        full_size_bytes = full_size.stat().st_size
        if full_size_bytes >= source_bytes:
            fail(f"Verified full-size WebP is not smaller than its source JPEG: {filename}")
        image_sources.append({
            "sourceJpeg": (PurePosixPath("assets/images") / PurePosixPath(filename)).as_posix(),
            "naturalWidth": width,
            "naturalHeight": height,
            "sourceBytes": source_bytes,
            "fullSizeWebp": full_size.relative_to(output).as_posix(),
            "fullSizeBytes": full_size_bytes,
            "fullSizeSavingsBytes": source_bytes - full_size_bytes,
        })
        candidates = [full_size]
        responsive_dir = output / "assets" / "images" / "responsive" / Path(filename).parent
        if responsive_dir.is_dir():
            candidates.extend(sorted(responsive_dir.glob(f"{Path(filename).stem}-*.webp")))
        for candidate in candidates:
            with generator.Image.open(candidate) as converted:
                converted.load()
                if converted.format != "WEBP":
                    fail(f"Responsive image candidate is not WebP: {candidate.relative_to(output)}")
                candidate_width, candidate_height = converted.size
            if candidate_width < 1 or candidate_height < 1 or candidate_width > width or candidate_height > height:
                fail(f"Responsive image candidate has unsafe dimensions: {candidate.relative_to(output)}")
            payload = candidate.read_bytes()
            generated_files.append({
                "path": candidate.relative_to(output).as_posix(),
                "bytes": len(payload),
                "sha256": digest_bytes(payload),
                "width": candidate_width,
                "height": candidate_height,
            })

    markup_validation = validate_responsive_markup(
        output, generated_files, image_sources, tuple(generator.RESPONSIVE_WIDTHS)
    )
    source_jpeg_bytes = sum(item["sourceBytes"] for item in image_sources)
    full_size_webp_bytes = sum(item["fullSizeBytes"] for item in image_sources)
    responsive_variants = [
        item for item in generated_files
        if item["path"].startswith("assets/images/responsive/")
    ]
    responsive_variant_bytes = sum(item["bytes"] for item in responsive_variants)
    savings_bytes = source_jpeg_bytes - full_size_webp_bytes
    savings_percent = round((savings_bytes / source_jpeg_bytes) * 100, 2) if source_jpeg_bytes else 0
    return {
        "enabled": True,
        "generationTarget": "isolated staging package; source checkout remains unchanged",
        "sourceImageCount": len(image_sources),
        "sourceJpegBytes": source_jpeg_bytes,
        "fullSizeWebpBytes": full_size_webp_bytes,
        "fullSizeSavingsBytes": savings_bytes,
        "fullSizeSavingsPercent": savings_percent,
        "responsiveVariantCount": len(responsive_variants),
        "responsiveVariantBytes": responsive_variant_bytes,
        "sourceImages": image_sources,
        "generatedWebpFileCount": len(generated_files),
        "generatedWebpFiles": sorted(generated_files, key=lambda item: item["path"]),
        "responsiveMarkupValidation": markup_validation,
        "rewrittenHtmlRoutes": [path.relative_to(output).as_posix() for path in rewritten],
    }


def validate_packaged_routes(output: Path) -> dict:
    """Reuse the existing route-integrity checker against the package, not the checkout."""
    checker_path = ROOT / "scripts" / "check-site.py"
    spec = importlib.util.spec_from_file_location("staging_package_site_integrity", checker_path)
    if spec is None or spec.loader is None:
        fail("Could not load the existing static-site integrity checker.")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    report = checker.audit_pages(output)
    errors = report.get("errors", [])
    if errors:
        preview = "\n".join(str(error) for error in errors[:25])
        fail("Packaged route integrity failed:\n" + preview)
    if report.get("pagesChecked", 0) < 9:
        fail(f"Expected at least nine root routes including 404.html; checked {report.get('pagesChecked', 0)}.")
    return {
        "pagesChecked": report["pagesChecked"],
        "errors": 0,
    }


def _validate_archive_member_path(path: object, label: str) -> str:
    """Require a normalized, relative POSIX path with no traversal or platform separators."""
    if (
        not isinstance(path, str)
        or not path
        or "\\" in path
        or "\x00" in path
        or ":" in path
    ):
        fail(f"{label} contains an unsafe archive member path: {path!r}")
    normalized = PurePosixPath(path)
    if (
        normalized.is_absolute()
        or str(normalized) != path
        or any(part in {"", ".", ".."} for part in path.split("/"))
    ):
        fail(f"{label} contains an unsafe archive member path: {path!r}")
    return path


def deterministic_archive(output: Path, archive: Path) -> None:
    """Create a reproducible ZIP and verify its exact payload against the release manifest."""
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for source in sorted(output.rglob("*")):
            relative = source.relative_to(output).as_posix()
            if source.is_symlink():
                fail(f"Unsafe packaged file: {relative}")
            if source.is_dir():
                continue
            if not source.is_file():
                fail(f"Unsafe packaged file: {relative}")
            _validate_archive_member_path(relative, "Package")
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100644 & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)

    with zipfile.ZipFile(archive, "r") as package:
        bad_member = package.testzip()
        if bad_member is not None:
            fail(f"Staging archive failed integrity validation at {bad_member}.")

        member_names = [info.filename for info in package.infolist()]
        if len(member_names) != len(set(member_names)):
            fail("Staging archive contains duplicate member paths.")
        for name in member_names:
            _validate_archive_member_path(name, "Archive")

        names = set(member_names)
        if "RELEASE-MANIFEST.json" not in names:
            fail("The staging archive does not contain RELEASE-MANIFEST.json.")
        try:
            manifest = json.loads(package.read("RELEASE-MANIFEST.json").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            fail(f"Release manifest is not valid UTF-8 JSON: {error}")
        if not isinstance(manifest, dict):
            fail("Release manifest must be a JSON object.")
        metrics = manifest.get("packageMetrics")
        if not isinstance(metrics, dict) or metrics.get("sizeBudgetPassed") is not True:
            fail("The release manifest must record a passing package-size budget.")
        if metrics.get("uncompressedPayloadBytes", MAX_UNCOMPRESSED_PACKAGE_BYTES + 1) > metrics.get("uncompressedBudgetBytes", 0):
            fail("The package payload exceeds its declared uncompressed-size budget.")
        closure = manifest.get("runtimeAssetClosure")
        if not isinstance(closure, dict) or closure.get("status") != "PASS":
            fail("The release manifest must record a passing runtime asset-closure audit.")
        closure_files = closure.get("filesScanned")
        closure_references = closure.get("localReferencesChecked")
        closure_missing = closure.get("missingLocalReferences")
        for field, value in (("filesScanned", closure_files), ("localReferencesChecked", closure_references), ("missingLocalReferences", closure_missing)):
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                fail(f"Runtime asset-closure metric is invalid: {field}.")
        if closure_files == 0 or closure_missing != 0:
            fail("The release manifest must record a completed asset-closure audit with zero missing local references.")

        document_contract = manifest.get("documentContract")
        if not isinstance(document_contract, dict) or document_contract.get("status") != "PASS":
            fail("The release manifest must record a passing document accessibility/SEO contract.")
        contract_fields = (
            "routesScanned", "imagesChecked", "imagesMissingAlt", "linksChecked", "unnamedLinks",
            "buttonsChecked", "unnamedButtons", "formControlsChecked", "unlabelledFormControls",
            "missingLanguage", "missingTitle", "missingDescription", "missingViewport", "missingH1",
            "missingMain", "missingSkipLink", "missingOpenGraph", "brokenAriaLabelledbyReferences",
            "duplicateIds", "duplicateTitles", "duplicateDescriptions",
        )
        for field in contract_fields:
            value = document_contract.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                fail(f"Document accessibility/SEO metric is invalid: {field}.")
            if field != "routesScanned" and field not in {"imagesChecked", "linksChecked", "buttonsChecked", "formControlsChecked"} and value != 0:
                fail(f"Document accessibility/SEO metric must be zero: {field}.")
        if document_contract["routesScanned"] == 0:
            fail("The release manifest must record a completed document accessibility/SEO audit.")

        if any(name.startswith("img/") for name in names):
            fail("The staging archive must not contain the source-only img/ asset library.")
        if manifest.get("deploymentPerformed") is not False:
            fail("The staging archive must explicitly state that no deployment was performed.")
        if manifest.get("releaseStatus") != "BLOCKED_PENDING_MANUAL_UAT":
            fail("The staging archive release status must remain blocked pending manual UAT.")
        if manifest.get("qualityGate") != "PASS":
            fail("The staging archive must include successful quality-gate provenance.")

        entries = manifest.get("files")
        if not isinstance(entries, list):
            fail("Release manifest files must be an array.")
        manifest_paths: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                fail("Release manifest contains a malformed file entry.")
            path = _validate_archive_member_path(entry.get("path"), "Manifest")
            if path == "RELEASE-MANIFEST.json":
                fail("Release manifest must not list itself as a payload file.")
            if path in manifest_paths:
                fail(f"Release manifest contains a duplicate file path: {path}")
            if path not in names:
                fail(f"Manifest file is missing from archive: {path}")
            byte_count = entry.get("bytes")
            if not isinstance(byte_count, int) or isinstance(byte_count, bool) or byte_count < 0:
                fail(f"Manifest byte count is invalid for packaged file: {path}")
            expected_sha = entry.get("sha256")
            if not isinstance(expected_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
                fail(f"Manifest SHA-256 is invalid for packaged file: {path}")
            data = package.read(path)
            if len(data) != byte_count or digest_bytes(data) != expected_sha:
                fail(f"Manifest digest mismatch for packaged file: {path}")
            manifest_paths.add(path)

        payload_names = names - {"RELEASE-MANIFEST.json"}
        unlisted = sorted(payload_names - manifest_paths)
        if unlisted:
            preview = ", ".join(unlisted[:10])
            fail(f"Archive contains payload files not listed in RELEASE-MANIFEST.json: {preview}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Temporary package webroot, outside the checkout.")
    parser.add_argument("--archive", type=Path, required=True, help="Output ZIP path, outside the checkout.")
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--event-name", choices=("pull_request", "push", "workflow_dispatch"), required=True)
    parser.add_argument("--quality-passed", action="store_true", required=True,
                        help="Required acknowledgement: run only after the full quality suite passes.")
    args = parser.parse_args()

    if not SHA_PATTERN.fullmatch(args.commit_sha):
        fail("--commit-sha must be a full hexadecimal commit SHA.")
    if not re.fullmatch(r"\d+", args.run_id):
        fail("--run-id must be numeric.")
    if not args.source_ref.strip() or "\n" in args.source_ref or "\r" in args.source_ref:
        fail("--source-ref must be a single non-empty ref string.")

    if args.output.exists() and args.output.is_symlink():
        fail("The package output path must not be a symlink.")
    if args.archive.exists() and args.archive.is_symlink():
        fail("The archive output path must not be a symlink.")
    output = args.output.resolve()
    archive = args.archive.resolve()
    if (
        is_within(output, ROOT) or is_within(ROOT, output)
        or is_within(archive, ROOT) or is_within(ROOT, archive)
    ):
        fail("Package output and archive must be outside, and must not contain, the repository checkout.")
    if output == archive or is_within(archive, output) or is_within(output, archive):
        fail("The archive path must be separate from and not contain the package webroot.")
    if output.exists():
        shutil.rmtree(output)
    if archive.exists():
        archive.unlink()
    output.mkdir(parents=True)

    files = checked_paths()
    source_config = json.loads((ROOT / "content" / "site-config.json").read_text(encoding="utf-8"))
    validate_staging_policy(
        source_config,
        (ROOT / "robots.txt").read_text(encoding="utf-8"),
        (ROOT / "sitemap.xml").read_text(encoding="utf-8"),
        (ROOT / ".htaccess").read_text(encoding="utf-8"),
        (ROOT / "sitemap-empty.xml").read_text(encoding="utf-8"),
        (ROOT / "robots-staging.txt").read_text(encoding="utf-8"),
    )
    copy_runtime_files(files, output)
    legacy_reference_report = validate_no_legacy_image_tree_references(output)
    responsive_report = apply_responsive_image_delivery(output)
    asset_closure_report = validate_runtime_asset_closure(output)
    runtime_asset_report = {**legacy_reference_report, **asset_closure_report}
    route_report = validate_packaged_routes(output)
    document_contract_report = validate_document_contract(output)
    entries = inventory_package_files(output)
    legacy_inventory = legacy_source_image_inventory()
    package_metrics = package_size_metrics(entries, legacy_inventory)
    manifest = {
        "schemaVersion": 1,
        "artifactType": "static-site-staging-preview",
        "qualityGate": "PASS",
        "sourceCommit": args.commit_sha.lower(),
        "sourceRef": args.source_ref,
        "workflowRunId": args.run_id,
        "workflowEvent": args.event_name,
        "runtimeRouteCount": route_report["pagesChecked"],
        "sourceRouteCount": len(json.loads((ROOT / "content" / "staging-route-contract.json").read_text(encoding="utf-8"))["routes"]),
        "payloadFileCount": len(entries),
        "files": entries,
        "packageMetrics": package_metrics,
        "runtimeAssetClosure": runtime_asset_report,
        "documentContract": document_contract_report,
        "responsiveImageDelivery": responsive_report,
        "releaseStatus": "BLOCKED_PENDING_MANUAL_UAT",
        "canonicalHostApproved": False,
        "publicIndexingEnabled": False,
        "robotsPolicy": "DISALLOW_ALL",
        "sitemapUrlCount": 0,
        "deploymentPerformed": False,
    }
    (output / "RELEASE-MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    deterministic_archive(output, archive)
    archive_bytes = archive.stat().st_size
    print("PASS: guarded staging preview package created after the full quality suite.")
    print(f"Routes checked: {route_report['pagesChecked']}")
    print(f"Runtime files: {len(entries)}")
    print(f"Legacy source image library excluded: {legacy_inventory['fileCount']} files / {legacy_inventory['bytesExcluded']} bytes")
    print(f"Uncompressed payload: {package_metrics['uncompressedPayloadBytes']} / {package_metrics['uncompressedBudgetBytes']} bytes ({package_metrics['budgetUtilizationPercent']}% of budget)")
    print(f"Responsive source photos optimized: {responsive_report['sourceImageCount']}")
    print(f"Verified responsive WebP files: {responsive_report['generatedWebpFileCount']}")
    print(f"Downscaled responsive variants: {responsive_report['responsiveVariantCount']} ({responsive_report['responsiveVariantBytes']} bytes)")
    print(f"Full-size WebP savings: {responsive_report['fullSizeSavingsBytes']} bytes ({responsive_report['fullSizeSavingsPercent']}%) across source photos")
    print(f"Archive: {archive.name} ({archive_bytes} bytes)")
    print(f"SHA-256: {digest_bytes(archive.read_bytes())}")
    print("Release status: BLOCKED_PENDING_MANUAL_UAT (no deployment or indexing activation).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
