#!/usr/bin/env python3
"""Regression tests for deterministic, repeatable image-reference rewriting."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from rewrite_image_refs import rewrite_html_text, rewrite_site


SOURCE_PREFIX = (
    "https://raw.githubusercontent.com/"
    "tchouhanjsm/garh-jaisal-website/main/img/"
)


class RewriteImageReferencesTests(unittest.TestCase):
    def test_webp_rewrites_local_and_legacy_remote_references(self) -> None:
        html = (
            '<img src="assets/images/rest3.jpg">'
            '<img srcset="assets/images/scarlet.webp 2x">'
            f'<meta content="{SOURCE_PREFIX}tent.jpg?raw=1">'
            '<img src="https://example.com/assets/images/courtyard.jpg">'
            '<img src="assets/images/unrelated.jpg">'
        )

        result = rewrite_html_text(html, "webp")

        self.assertIn('src="assets/images/rest3.webp"', result)
        self.assertIn('srcset="assets/images/scarlet.webp 2x"', result)
        self.assertIn('content="assets/images/tent.webp"', result)
        self.assertIn(
            'src="https://example.com/assets/images/courtyard.jpg"', result
        )
        self.assertIn('src="assets/images/unrelated.jpg"', result)
        self.assertNotIn(SOURCE_PREFIX, result)

    def test_jpg_fallback_rewrites_existing_webp_and_remote_references(self) -> None:
        html = (
            '<img src="assets/images/rest3.webp">'
            f'<img src="{SOURCE_PREFIX}courtyard.jpg">'
        )

        result = rewrite_html_text(html, "jpg")

        self.assertIn('src="assets/images/rest3.jpg"', result)
        self.assertIn('src="assets/images/courtyard.jpg"', result)
        self.assertNotIn(SOURCE_PREFIX, result)

    def test_site_rewrite_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "index.html"
            rooms = root / "rooms.html"
            home.write_text(
                '<img src="assets/images/rest3.jpg">', encoding="utf-8"
            )
            rooms.write_text(
                f'<img src="{SOURCE_PREFIX}scarlet.jpg?raw=1">',
                encoding="utf-8",
            )

            first = rewrite_site(root, "webp")
            first_contents = (
                home.read_text(encoding="utf-8"),
                rooms.read_text(encoding="utf-8"),
            )
            second = rewrite_site(root, "webp")
            second_contents = (
                home.read_text(encoding="utf-8"),
                rooms.read_text(encoding="utf-8"),
            )

            self.assertEqual(
                {path.name for path in first}, {"index.html", "rooms.html"}
            )
            self.assertEqual(second, [])
            self.assertEqual(first_contents, second_contents)
            self.assertIn("assets/images/rest3.webp", first_contents[0])
            self.assertIn("assets/images/scarlet.webp", first_contents[1])

    def test_invalid_extension_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            rewrite_html_text('<img src="assets/images/rest3.jpg">', "png")


if __name__ == "__main__":
    unittest.main(verbosity=2)
