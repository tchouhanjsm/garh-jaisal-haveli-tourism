#!/usr/bin/env python3
"""Rewrite known site image references to the selected local format."""

from __future__ import annotations

import argparse
from pathlib import Path
import re

IMAGE_NAMES = ("rest3.jpg", "courtyard.jpg", "scarlet.jpg", "tent.jpg")
SOURCE_PREFIX = (
    "https://raw.githubusercontent.com/"
    "tchouhanjsm/garh-jaisal-website/main/img/"
)


def rewrite_html_text(text: str, extension: str) -> str:
    """Point known local and legacy remote image references at one format."""
    if extension not in {"jpg", "webp"}:
        raise ValueError("extension must be 'jpg' or 'webp'")

    for name in IMAGE_NAMES:
        stem = Path(name).stem
        destination = f"assets/images/{stem}.{extension}"

        remote_pattern = (
            re.escape(SOURCE_PREFIX + name)
            + r"""(?:\?[^"'\s>]*)?"""
        )
        text = re.sub(remote_pattern, destination, text)

        local_pattern = (
            rf"(?<![\w:/])assets/images/{re.escape(stem)}\.(?:jpg|webp)"
            rf"(?![\w.-])"
        )
        text = re.sub(local_pattern, destination, text)

    return text


def rewrite_site(root: Path, extension: str) -> list[Path]:
    """Rewrite root-level HTML pages and return only files that changed."""
    root = Path(root)
    if not root.is_dir():
        raise NotADirectoryError(f"site root is not a directory: {root}")

    changed: list[Path] = []
    for page in sorted(root.glob("*.html")):
        original = page.read_text(encoding="utf-8")
        updated = rewrite_html_text(original, extension)
        if updated != original:
            page.write_text(updated, encoding="utf-8")
            changed.append(page)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--extension", choices=("jpg", "webp"), required=True)
    args = parser.parse_args()

    changed = rewrite_site(args.root, args.extension)
    print(
        f"Updated {len(changed)} HTML page(s) to use local .{args.extension} "
        "image references."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
