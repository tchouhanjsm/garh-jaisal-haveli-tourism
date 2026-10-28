#!/usr/bin/env python3
"""Decode local image candidates with pinned Playwright/Chromium.

This helper accepts only repository-relative assets/images paths on stdin,
loads bytes as data URLs in a blank page, and never performs network requests
or writes into the repository.
"""
from __future__ import annotations

import asyncio
import base64
import json
import pathlib
import sys
from urllib.parse import urlsplit

MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 64_000_000
MIME_TYPES = {
    ".avif": "image/avif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def safe_asset_path(root: pathlib.Path, relative: str) -> pathlib.Path:
    parsed = pathlib.PurePosixPath(relative)
    if parsed.is_absolute() or ".." in parsed.parts or not relative.startswith("assets/images/"):
        raise ValueError("path must stay within assets/images")
    if any(part in ("", ".") for part in parsed.parts):
        raise ValueError("path has unsafe components")
    current = root
    for part in parsed.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("symlinks are not permitted")
    target = current.resolve(strict=True)
    assets_root = (root / "assets" / "images").resolve(strict=True)
    if not target.is_relative_to(assets_root) or not target.is_file():
        raise ValueError("path is not a regular local image")
    return target


async def decode_one(page, root: pathlib.Path, item: dict) -> dict:
    relative = str(item.get("path", ""))
    try:
        target = safe_asset_path(root, relative)
        extension = target.suffix.lower()
        if extension not in MIME_TYPES:
            raise ValueError("unsupported media format")
        size = target.stat().st_size
        if size <= 0 or size > MAX_FILE_BYTES:
            raise ValueError("file is empty or exceeds the decoder read limit")
        expected_width = int(item.get("width") or 0)
        expected_height = int(item.get("height") or 0)
        if expected_width <= 0 or expected_height <= 0:
            raise ValueError("header dimensions are unavailable")
        if expected_width * expected_height > MAX_PIXELS:
            raise ValueError("declared image area exceeds the decoder pixel safety limit")
        encoded = base64.b64encode(target.read_bytes()).decode("ascii")
        decoded = await asyncio.wait_for(
            page.evaluate(
                """async ({ encoded, mime }) => {
                  const image = new Image();
                  image.decoding = 'sync';
                  image.src = 'data:' + mime + ';base64,' + encoded;
                  await image.decode();
                  if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) {
                    throw new Error('decoded image has no natural dimensions');
                  }
                  return { width: image.naturalWidth, height: image.naturalHeight };
                }""",
                {"encoded": encoded, "mime": MIME_TYPES[extension]},
            ),
            timeout=15,
        )
        width, height = int(decoded["width"]), int(decoded["height"])
        if width != expected_width or height != expected_height:
            raise ValueError(
                f"decoded dimensions {width}x{height} differ from header "
                f"{expected_width}x{expected_height}"
            )
        return {"path": relative, "status": "verified", "width": width, "height": height}
    except Exception as error:  # A single bad asset must be reported, not abort the inventory.
        return {"path": relative, "status": "failed", "error": str(error)[:300]}


async def main() -> int:
    root = pathlib.Path(sys.argv[1]).resolve(strict=True)
    items = json.load(sys.stdin)
    if not isinstance(items, list):
        raise ValueError("stdin must contain a JSON array")
    try:
        from playwright.async_api import async_playwright
    except Exception as error:
        print(json.dumps({"ok": False, "error": f"Playwright unavailable: {error}", "results": []}))
        return 2

    results = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            async def block_network(route):
                if urlsplit(route.request.url).scheme in ("http", "https", "ws", "wss"):
                    await route.abort()
                else:
                    await route.continue_()
            await page.route("**/*", block_network)
            await page.goto("about:blank")
            for item in items:
                if not isinstance(item, dict):
                    results.append({"path": "", "status": "failed", "error": "invalid item record"})
                    continue
                results.append(await decode_one(page, root, item))
        finally:
            await browser.close()
    print(json.dumps({"ok": True, "results": results}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)[:300], "results": []}))
        sys.exit(2)
