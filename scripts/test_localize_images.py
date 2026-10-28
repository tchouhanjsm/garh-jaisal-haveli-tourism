#!/usr/bin/env python3
"""Regression tests for safe image localization and responsive WebP generation."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw

from rewrite_image_refs import (
    generate_responsive_variants,
    rewrite_html_text,
    rewrite_site,
)

SOURCE_PREFIX = (
    "https://raw.githubusercontent.com/"
    "tchouhanjsm/garh-jaisal-website/main/img/"
)


def create_jpeg(root: Path, filename: str, size: tuple[int, int]) -> Path:
    target = root / "assets" / "images" / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", size, (225, 190, 135))
    draw = ImageDraw.Draw(image)
    for x in range(0, size[0], max(1, size[0] // 40)):
        draw.line((x, 0, size[0] - x // 2, size[1]), fill=(40, 75, 65), width=3)
    image.save(target, format="JPEG", quality=90, optimize=True)
    return target


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
        self.assertIn('src="https://example.com/assets/images/courtyard.jpg"', result)
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

    def test_responsive_variants_have_real_dimensions_and_webp_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_jpeg(root, "rest3.jpg", (1200, 800))
            generated = generate_responsive_variants(root, ("rest3.jpg",))
            entry = generated["rest3.jpg"]
            self.assertEqual((entry["width"], entry["height"]), (1200, 800))
            self.assertTrue((root / entry["fullSizePath"]).is_file())
            self.assertEqual([item["width"] for item in entry["variants"]], [480, 768])
            for item in entry["variants"]:
                target = root / item["path"]
                with Image.open(target) as decoded:
                    decoded.load()
                    self.assertEqual(decoded.format, "WEBP")
                    self.assertEqual(decoded.size, (item["width"], item["height"]))
                self.assertGreater(item["bytes"], 0)
                self.assertLess(item["bytes"], entry["fullSizeBytes"])

    def test_responsive_markup_preserves_jpeg_fallback_and_preloads_selected_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_jpeg(root, "rest3.jpg", (1200, 800))
            create_jpeg(root, "scarlet.jpg", (900, 600))
            generate_responsive_variants(root, ("rest3.jpg", "scarlet.jpg"))
            html = (
                '<head><meta property="og:image" content="assets/images/rest3.jpg">'
                '<meta property="og:image:type" content="image/jpeg">'
                '<link rel="preload" as="image" href="assets/images/rest3.jpg" '
                'type="image/jpeg" fetchpriority="high">'
                '<link rel="preload" as="image" href="assets/images/scarlet.jpg">'
                '</head>'
                '<section class="hero"><img class="hero__image" '
                'src="assets/images/rest3.jpg" alt="Rooftop terrace at dusk" '
                'fetchpriority="high" loading="eager"></section>'
                '<img src="assets/images/scarlet.jpg" alt="Scarlet room">'
            )
            result = rewrite_html_text(html, "responsive", root=root)
            self.assertIn('<picture class="responsive-image">', result)
            self.assertIn('type="image/webp"', result)
            self.assertIn("assets/images/responsive/rest3-480.webp 480w", result)
            self.assertIn("assets/images/responsive/rest3-768.webp 768w", result)
            self.assertIn('src="assets/images/rest3.jpg"', result)
            self.assertIn('width="1200"', result)
            self.assertIn('height="800"', result)
            self.assertIn('decoding="async"', result)
            self.assertIn('width="900"', result)
            self.assertIn('height="600"', result)
            self.assertIn('<meta property="og:image" content="assets/images/rest3.jpg">', result)
            self.assertIn('<meta property="og:image:type" content="image/jpeg">', result)
            self.assertNotIn('<meta property="og:image" content="assets/images/rest3.webp">', result)
            self.assertIn('href="assets/images/rest3.webp"', result)
            self.assertIn('type="image/webp"', result)
            self.assertIn('imagesrcset="assets/images/responsive/rest3-480.webp 480w', result)
            self.assertIn("assets/images/rest3.webp 1200w", result)
            self.assertIn('imagesizes="100vw"', result)
            self.assertIn(
                'imagesizes="(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 50vw"',
                result,
            )
            self.assertEqual(rewrite_html_text(result, "responsive", root=root), result)

    def test_site_rewrite_is_idempotent_after_responsive_generation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, size in (
                ("rest3.jpg", (1200, 800)),
                ("courtyard.jpg", (1200, 800)),
                ("scarlet.jpg", (900, 600)),
                ("tent.jpg", (750, 750)),
            ):
                create_jpeg(root, name, size)
            home = root / "index.html"
            rooms = root / "rooms.html"
            home.write_text(
                '<link rel="preload" as="image" href="assets/images/rest3.jpg">'
                '<img class="hero__image" src="assets/images/rest3.jpg" alt="Rooftop">',
                encoding="utf-8",
            )
            rooms.write_text(
                f'<img src="{SOURCE_PREFIX}scarlet.jpg?raw=1" alt="Scarlet room">',
                encoding="utf-8",
            )
            first = rewrite_site(root, "responsive")
            first_contents = (home.read_text(encoding="utf-8"), rooms.read_text(encoding="utf-8"))
            second = rewrite_site(root, "responsive")
            second_contents = (home.read_text(encoding="utf-8"), rooms.read_text(encoding="utf-8"))
            self.assertEqual({path.name for path in first}, {"index.html", "rooms.html"})
            self.assertEqual(second, [])
            self.assertEqual(first_contents, second_contents)
            self.assertIn("responsive/rest3-480.webp 480w", first_contents[0])
            self.assertIn('src="assets/images/scarlet.jpg"', first_contents[1])


if __name__ == "__main__":
    unittest.main(verbosity=2)
