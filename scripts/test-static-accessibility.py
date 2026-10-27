#!/usr/bin/env python3
"""Dependency-free static accessibility contract for public HTML routes."""
from __future__ import annotations

from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
import os
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
GENERIC_ALT = re.compile(r"^(?:image|photo|picture|img)\s*\d*$", re.IGNORECASE)
BOOLEAN_ARIA = {"aria-expanded", "aria-hidden"}


class Node:
    def __init__(self, tag: str, attrs: dict[str, str], parent: Node | None = None):
        self.tag = tag
        self.attrs = attrs
        self.parent = parent
        self.parts: list[Node | str] = []

    def text_alternative(self) -> str:
        if self.attrs.get("aria-hidden", "").strip().lower() == "true":
            return ""
        if self.tag in {"script", "style", "template", "noscript"}:
            return ""
        if self.tag == "img":
            return self.attrs.get("alt", "")
        if self.tag == "br":
            return " "
        pieces = [
            part.text_alternative() if isinstance(part, Node) else part
            for part in self.parts
        ]
        return re.sub(r"\s+", " ", "".join(pieces)).strip()


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("#document", {})
        self.stack = [self.root]
        self.nodes: list[Node] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized = {key.lower(): (value or "") for key, value in attrs}
        node = Node(tag.lower(), normalized, self.stack[-1])
        self.stack[-1].parts.append(node)
        self.nodes.append(node)
        if tag.lower() not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].parts.append(data)


def public_html_files(root: Path) -> list[Path]:
    pages = list(root.glob("*.html"))
    for directory_name in ("tours", "blogs"):
        directory = root / directory_name
        if not directory.is_dir():
            continue
        for current, subdirs, filenames in os.walk(directory, followlinks=False):
            subdirs[:] = [
                name for name in subdirs
                if not (Path(current) / name).is_symlink()
            ]
            pages.extend(
                Path(current) / name for name in filenames
                if name.lower().endswith(".html")
                and (Path(current) / name).is_file()
                and not (Path(current) / name).is_symlink()
            )
    return sorted(path for path in pages if path.is_file() and not path.is_symlink())


def is_focusable(node: Node) -> bool:
    attrs = node.attrs
    if "tabindex" in attrs:
        try:
            int(attrs["tabindex"])
            # tabindex="-1" is out of sequential tab order but remains programmatically focusable.
            return True
        except ValueError:
            pass
    if node.tag == "a":
        return "href" in attrs
    if node.tag in {"button", "select", "textarea", "summary", "iframe"}:
        return True
    if node.tag == "input":
        return attrs.get("type", "").lower() != "hidden"
    return attrs.get("contenteditable", "").lower() in {"", "true", "plaintext-only"} and "contenteditable" in attrs


def has_hidden_ancestor(node: Node) -> bool:
    current: Node | None = node
    while current is not None:
        if "hidden" in current.attrs or "inert" in current.attrs:
            return True
        current = current.parent
    return False


def accessible_name(node: Node, ids: dict[str, list[Node]], labels_for: dict[str, list[Node]]) -> str:
    attrs = node.attrs
    aria_label = attrs.get("aria-label", "").strip()
    if aria_label:
        return aria_label
    labelledby = attrs.get("aria-labelledby", "").split()
    if labelledby:
        return " ".join(
            ids[token][0].text_alternative()
            for token in labelledby if token in ids and ids[token]
        ).strip()
    if node.tag in {"input", "select", "textarea"}:
        labels = []
        if attrs.get("id"):
            for label in labels_for.get(attrs["id"], []):
                labels.append(label.text_alternative())
        current = node.parent
        while current is not None:
            if current.tag == "label":
                labels.append(current.text_alternative())
                break
            current = current.parent
        label_text = " ".join(part for part in labels if part.strip()).strip()
        if label_text:
            return label_text
        if node.tag == "input" and attrs.get("type", "").lower() in {"button", "submit", "reset", "image"}:
            return attrs.get("alt", "") or attrs.get("value", "").strip()
    title = attrs.get("title", "").strip()
    if title:
        return title
    return node.text_alternative()


def audit_accessibility(root_directory: str | Path) -> dict:
    root = Path(root_directory).resolve()
    errors: list[str] = []
    pages = public_html_files(root)
    controls_checked = 0

    def fail(page_label: str, message: str) -> None:
        errors.append(f"{page_label}: {message}")

    if not pages:
        return {"errors": ["no public HTML pages found"], "pagesChecked": 0, "controlsChecked": 0}

    for page in pages:
        label = page.relative_to(root).as_posix()
        parser = PageParser()
        try:
            parser.feed(page.read_text(encoding="utf-8"))
            parser.close()
        except Exception as error:
            fail(label, f"HTML parse failed: {type(error).__name__}: {error}")
            continue

        ids: dict[str, list[Node]] = defaultdict(list)
        labels_for: dict[str, list[Node]] = defaultdict(list)
        for node in parser.nodes:
            identifier = node.attrs.get("id", "").strip()
            if identifier:
                ids[identifier].append(node)
        for identifier, nodes in ids.items():
            if len(nodes) > 1:
                fail(label, f"duplicate id {identifier!r}")

        # Label associations are collected after the complete document is parsed.
        for node in parser.nodes:
            if node.tag == "label" and node.attrs.get("for", "").strip():
                target_id = node.attrs["for"].strip()
                if target_id not in ids:
                    fail(label, f"label for={target_id!r} has no matching control id")
                else:
                    labels_for[target_id].append(node)

        for node in parser.nodes:
            attrs = node.attrs
            for aria_name in BOOLEAN_ARIA:
                if aria_name in attrs and attrs[aria_name].strip().lower() not in {"true", "false"}:
                    fail(label, f"{aria_name} must be true or false")
            if "aria-label" in attrs and not attrs["aria-label"].strip():
                fail(label, "aria-label must not be empty")
            for ref_attribute in ("aria-controls", "aria-labelledby", "aria-describedby", "aria-owns"):
                for token in attrs.get(ref_attribute, "").split():
                    if token not in ids:
                        fail(label, f"{ref_attribute} references missing id {token!r}")
            if node.tag == "img":
                if "alt" not in attrs:
                    fail(label, f"image missing alt attribute: {attrs.get('src', '(missing src)')}")
                elif attrs["alt"].strip() and GENERIC_ALT.fullmatch(attrs["alt"].strip()):
                    fail(label, f"image has generic alt text: {attrs.get('src', '(missing src)')}")
            if "tabindex" in attrs:
                try:
                    if int(attrs["tabindex"]) > 0:
                        fail(label, f"positive tabindex is not allowed: {attrs['tabindex']}")
                except ValueError:
                    fail(label, f"tabindex must be an integer: {attrs['tabindex']!r}")

            if node.tag == "a" and "href" in attrs:
                controls_checked += 1
                name = accessible_name(node, ids, labels_for)
                if not name:
                    fail(label, f"link has no accessible name: {attrs.get('href', '')}")
                if attrs.get("target", "").lower() == "_blank":
                    rel = {token.lower() for token in attrs.get("rel", "").split()}
                    if "noopener" not in rel:
                        fail(label, f"target=_blank link must include rel=noopener: {attrs.get('href', '')}")
            elif node.tag == "button":
                controls_checked += 1
                name = accessible_name(node, ids, labels_for)
                if not name:
                    fail(label, "button has no accessible name")
                if attrs.get("type", "").lower() not in {"button", "submit", "reset"}:
                    fail(label, "button must declare type=button, submit, or reset")
            elif node.tag in {"input", "select", "textarea"}:
                if node.tag == "input" and attrs.get("type", "").lower() == "hidden":
                    continue
                controls_checked += 1
                name = accessible_name(node, ids, labels_for)
                if not name:
                    fail(label, f"{node.tag} control has no accessible name")
            elif node.tag == "summary":
                controls_checked += 1
                if not accessible_name(node, ids, labels_for):
                    fail(label, "summary control has no accessible name")

            if is_focusable(node):
                current: Node | None = node
                while current is not None:
                    if current.attrs.get("aria-hidden", "").strip().lower() == "true":
                        if not has_hidden_ancestor(node):
                            fail(label, f"focusable {node.tag} is inside aria-hidden content without hidden/inert protection")
                        break
                    current = current.parent

        mains = [node for node in parser.nodes if node.tag == "main"]
        if len(mains) != 1 or mains[0].attrs.get("id") != "main":
            fail(label, "expected exactly one main element with id=main")
        skip_links = [
            node for node in parser.nodes
            if node.tag == "a"
            and node.attrs.get("href", "").strip() == "#main"
            and "skip-link" in node.attrs.get("class", "").split()
        ]
        if not skip_links:
            fail(label, "missing a skip-link anchor to #main")
        elif not any(accessible_name(node, ids, labels_for) for node in skip_links):
            fail(label, "skip-link anchor has no accessible name")

    return {"errors": errors, "pagesChecked": len(pages), "controlsChecked": controls_checked}


def main() -> int:
    result = audit_accessibility(ROOT)
    if result["errors"]:
        print(f"FAIL: {len(result['errors'])} static accessibility contract issue(s) across {result['pagesChecked']} public page(s).")
        for error in result["errors"]:
            print(" - " + error)
        return 1
    print(
        f"PASS: static accessibility contract checked {result['pagesChecked']} public page(s) "
        f"and {result['controlsChecked']} links/controls for names, label references, focus safety and new-tab protection."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
