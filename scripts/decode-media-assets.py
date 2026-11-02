#!/usr/bin/env python3
"""Decode bounded local image candidates with pinned Playwright/Chromium.

This helper accepts only repository-relative assets/images or img paths on stdin,
loads bytes as data URLs in a blank page, and never performs network requests
or writes into the repository.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import pathlib
import sys
from urllib.parse import urlsplit

MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_TOTAL_BYTES = 100 * 1024 * 1024
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
    raw_parts = relative.split("/")
    allowed_prefix = relative.startswith("assets/images/") or relative.startswith("img/")
    if (
        not relative
        or "\\" in relative
        or parsed.is_absolute()
        or ".." in parsed.parts
        or not allowed_prefix
        or any(part in ("", ".", "..") for part in raw_parts)
    ):
        raise ValueError("path must stay within assets/images or img/")
    current = root
    for part in parsed.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("symlinks are not permitted")
    target = current.resolve(strict=True)
    assets_root = (
        root / (pathlib.Path("assets") / "images" if relative.startswith("assets/images/") else pathlib.Path("img"))
    ).resolve(strict=True)
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
        expected_width_value = item.get("width")
        expected_height_value = item.get("height")
        if (expected_width_value is None) != (expected_height_value is None):
            raise ValueError("expected width and height must be supplied together")
        expected_width = int(expected_width_value) if expected_width_value is not None else None
        expected_height = int(expected_height_value) if expected_height_value is not None else None
        if expected_width is not None and (
            expected_width <= 0
            or expected_height <= 0
            or expected_width * expected_height > MAX_PIXELS
        ):
            raise ValueError("declared image dimensions exceed the decoder safety limit")
        image_bytes = target.read_bytes()
        encoded = base64.b64encode(image_bytes).decode("ascii")
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
        if width <= 0 or height <= 0 or width * height > MAX_PIXELS:
            raise ValueError("decoded image dimensions exceed the decoder safety limit")
        if expected_width is not None and (width != expected_width or height != expected_height):
            raise ValueError(
                f"decoded dimensions {width}x{height} differ from expected "
                f"{expected_width}x{expected_height}"
            )
        return {
            "path": relative,
            "status": "verified",
            "width": width,
            "height": height,
            "sha256": hashlib.sha256(image_bytes).hexdigest(),
        }
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
    total_bytes = 0
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
                relative = str(item.get("path", ""))
                try:
                    target = safe_asset_path(root, relative)
                    size = target.stat().st_size
                    if total_bytes + size > MAX_TOTAL_BYTES:
                        results.append({
                            "path": relative,
                            "status": "failed",
                            "error": "aggregate image decode budget exceeded",
                        })
                        continue
                    total_bytes += size
                    results.append(await decode_one(page, root, item))
                except Exception as error:
                    results.append({"path": relative, "status": "failed", "error": str(error)[:300]})
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
