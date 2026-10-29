#!/usr/bin/env python3
"""Regression tests for safe image localization and responsive WebP generation."""

from __future__ import annotations

from pathlib import Path
import importlib.util
import json
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from PIL import Image, ImageDraw

from rewrite_image_refs import (
    IMAGE_NAMES,
    generate_responsive_variants,
    rewrite_html_text,
    rewrite_site,
)

_PACKAGE_SPEC = importlib.util.spec_from_file_location(
    "package_staging_preview", Path(__file__).with_name("package-staging-preview.py")
)
if _PACKAGE_SPEC is None or _PACKAGE_SPEC.loader is None:
    raise RuntimeError("could not load responsive preview package validator")
_PACKAGE_PREVIEW = importlib.util.module_from_spec(_PACKAGE_SPEC)
_PACKAGE_SPEC.loader.exec_module(_PACKAGE_PREVIEW)

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

    def test_symlinked_image_paths_are_rejected_before_any_write(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "site"
            outside = base / "outside"
            (root / "assets").mkdir(parents=True)
            outside.mkdir()
            (root / "assets" / "images").symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(ValueError, "symlink"):
                generate_responsive_variants(root, ("rest3.jpg",))
            self.assertEqual(list(outside.iterdir()), [])

        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "site"
            create_jpeg(root, "rest3.jpg", (1200, 800))
            outside = base / "outside"
            outside.mkdir()
            (root / "assets" / "images" / "responsive").symlink_to(
                outside, target_is_directory=True
            )

            with self.assertRaisesRegex(ValueError, "symlink"):
                generate_responsive_variants(root, ("rest3.jpg",))
            self.assertFalse((root / "assets" / "images" / "rest3.webp").exists())
            self.assertEqual(list(outside.iterdir()), [])

        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "site"
            create_jpeg(root, "rest3.jpg", (1200, 800))
            protected = base / "protected.webp"
            protected.write_bytes(b"keep-this-file-unchanged")
            (root / "assets" / "images" / "rest3.webp").symlink_to(protected)

            with self.assertRaisesRegex(ValueError, "symlink"):
                generate_responsive_variants(root, ("rest3.jpg",))
            self.assertEqual(protected.read_bytes(), b"keep-this-file-unchanged")

    def test_oversized_jpeg_headers_are_rejected_before_decode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_jpeg(root, "rest3.jpg", (20, 20))

            for operation in ("generate", "rewrite"):
                with self.subTest(operation=operation):
                    opened = MagicMock()
                    opened.__enter__.return_value = opened
                    opened.__exit__.return_value = False
                    opened.format = "JPEG"
                    opened.width = 8000
                    opened.height = 8001

                    with patch("rewrite_image_refs.Image.open", return_value=opened):
                        with self.assertRaisesRegex(ValueError, "safe bounds"):
                            if operation == "generate":
                                generate_responsive_variants(root, ("rest3.jpg",))
                            else:
                                rewrite_html_text(
                                    '<img src="assets/images/rest3.jpg" alt="Rooftop">',
                                    "responsive",
                                    root=root,
                                )
                    opened.load.assert_not_called()

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
                'fetchpriority="high"></section>'
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
            self.assertIn('loading="eager"', result)
            self.assertIn('width="900"', result)
            self.assertIn('height="600"', result)
            self.assertIn('loading="lazy"', result)
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

    def test_nested_photo_paths_preserve_identity_and_packaged_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = create_jpeg(root, "gallery/desert/camp-evening.jpeg", (1200, 800))
            generated = generate_responsive_variants(root, ("gallery/desert/camp-evening.jpeg",))
            entry = generated["gallery/desert/camp-evening.jpeg"]
            self.assertEqual(entry["fullSizePath"], "assets/images/gallery/desert/camp-evening.webp")
            self.assertEqual(
                entry["variants"][0]["path"],
                "assets/images/responsive/gallery/desert/camp-evening-480.webp",
            )
            self.assertEqual(entry["sourceBytes"], source.stat().st_size)

            html = (
                '<link rel="preload" as="image" href="assets/images/gallery/desert/camp-evening.jpeg">'
                '<img src="assets/images/gallery/desert/camp-evening.jpeg" alt="Camp evening in the Thar desert">'
            )
            rewritten = rewrite_html_text(html, "responsive", root=root)
            self.assertIn(
                "assets/images/responsive/gallery/desert/camp-evening-480.webp 480w",
                rewritten,
            )
            self.assertIn('href="assets/images/gallery/desert/camp-evening.webp"', rewritten)
            self.assertIn('src="assets/images/gallery/desert/camp-evening.jpeg"', rewritten)
            self.assertEqual(rewrite_html_text(rewritten, "responsive", root=root), rewritten)

            page = root / "rooms.html"
            page.write_text(rewritten, encoding="utf-8")
            candidate_paths = [entry["fullSizePath"], *(item["path"] for item in entry["variants"])]
            generated_files = []
            for relative in candidate_paths:
                target = root / relative
                with Image.open(target) as decoded:
                    decoded.load()
                    generated_files.append({
                        "path": relative,
                        "bytes": target.stat().st_size,
                        "sha256": "0" * 64,
                        "width": decoded.width,
                        "height": decoded.height,
                    })
            source_record = [{
                "sourceJpeg": "assets/images/gallery/desert/camp-evening.jpeg",
                "naturalWidth": entry["width"],
                "naturalHeight": entry["height"],
                "fullSizeWebp": entry["fullSizePath"],
            }]
            report = _PACKAGE_PREVIEW.validate_responsive_markup(
                root, generated_files, source_record, (480, 768, 1200, 1600)
            )
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["responsivePictureCount"], 1)
            self.assertTrue(report["widthDescriptorsMatchDecodedPixels"])

    def test_packaged_srcset_width_descriptors_match_decoded_webp_assets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = create_jpeg(root, "rest3.jpg", (1200, 800))
            generated = generate_responsive_variants(root, ("rest3.jpg",))
            html = (
                '<section class="hero"><img class="hero__image" '
                'src="assets/images/rest3.jpg" alt="Rooftop terrace" fetchpriority="high"></section>'
            )
            page = root / "index.html"
            page.write_text(rewrite_html_text(html, "responsive", root=root), encoding="utf-8")

            entry = generated["rest3.jpg"]
            candidate_paths = [entry["fullSizePath"], *(item["path"] for item in entry["variants"])]
            generated_files = []
            for relative in candidate_paths:
                target = root / relative
                with Image.open(target) as decoded:
                    decoded.load()
                    generated_files.append({
                        "path": relative,
                        "bytes": target.stat().st_size,
                        "sha256": "0" * 64,
                        "width": decoded.width,
                        "height": decoded.height,
                    })
            image_sources = [{
                "sourceJpeg": "assets/images/rest3.jpg",
                "naturalWidth": entry["width"],
                "naturalHeight": entry["height"],
                "fullSizeWebp": entry["fullSizePath"],
            }]

            result = _PACKAGE_PREVIEW.validate_responsive_markup(
                root, generated_files, image_sources, (480, 768, 1200, 1600)
            )
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["responsivePictureCount"], 1)
            self.assertTrue(result["widthDescriptorsMatchDecodedPixels"])

            page.write_text(
                page.read_text(encoding="utf-8").replace("rest3-480.webp 480w", "rest3-480.webp 481w"),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "descriptor width 481w does not match decoded asset width 480px"):
                _PACKAGE_PREVIEW.validate_responsive_markup(
                    root, generated_files, image_sources, (480, 768, 1200, 1600)
                )

    def test_packaged_runtime_asset_closure_checks_html_css_srcset_and_modules(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "preview"
            (root / "assets" / "images").mkdir(parents=True)
            (root / "assets" / "css").mkdir(parents=True)
            (root / "assets" / "js").mkdir(parents=True)

            files = {
                "index.html": (
                    '<link rel="stylesheet" href="/assets/css/site.css">'
                    '<meta property="og:image" content="assets/images/room.jpg">'
                    '<script type="module" src="assets/js/site.js"></script>'
                    '<img src="assets/images/room.jpg" '
                    'srcset="assets/images/room-480.webp 480w, assets/images/room.webp 1200w" alt="Room">'
                    '<a href="/rooms.html">Rooms</a>'
                    '<img src="https://cdn.example.test/remote.jpg" alt="External">'
                ),
                "rooms.html": '<a href="/index.html">Home</a>',
                "assets/css/site.css": (
                    '@import "./theme.css"; '
                    '.hero{background-image:url("../images/background.webp");'
                    'mask-image:url("../images/mask.svg#shape")}'
                ),
                "assets/css/theme.css": (
                    '@import url("./tokens.css"); '
                    'body{background-image:url("../images/pattern.svg")}'
                ),
                "assets/css/tokens.css": ":root{--asset-closure-test:1}",
                "assets/js/site.js": (
                    'import("./module.js"); '
                    'const icon = new URL("./icons.svg", import.meta.url);'
                ),
                "assets/js/module.js": "export const ready = true;",
                "assets/js/icons.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                "assets/images/room.jpg": "jpeg",
                "assets/images/room-480.webp": "webp-480",
                "assets/images/room.webp": "webp-full",
                "assets/images/background.webp": "background",
                "assets/images/mask.svg": '<svg xmlns="http://www.w3.org/2000/svg"><path id="shape"/></svg>',
                "assets/images/pattern.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            }
            for relative, content in files.items():
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")

            report = _PACKAGE_PREVIEW.validate_runtime_asset_closure(root)
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["missingLocalReferences"], 0)
            self.assertGreaterEqual(report["localReferencesChecked"], 12)
            self.assertIn("css-url", report["referencesByKind"])
            self.assertIn("srcset", report["referencesByKind"])
            self.assertIn("js-module", report["referencesByKind"])

            css_path = root / "assets" / "css" / "site.css"
            css_path.write_text('.hero{background:url("../images/missing.webp")}', encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "broken local asset reference.*missing.webp"):
                _PACKAGE_PREVIEW.validate_runtime_asset_closure(root)

            css_path.write_text(files["assets/css/site.css"], encoding="utf-8")
            index_path = root / "index.html"
            index_path.write_text(files["index.html"].replace(
                'href="/rooms.html"', 'href="../escape.html"'
            ), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "escapes package root"):
                _PACKAGE_PREVIEW.validate_runtime_asset_closure(root)

    def test_release_archive_manifest_covers_every_safe_payload_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            output = base / "preview"
            output.mkdir()
            archive = base / "preview.zip"
            payload = b"<html>guarded preview</html>"
            (output / "index.html").write_bytes(payload)
            manifest = {
                "deploymentPerformed": False,
                "releaseStatus": "BLOCKED_PENDING_MANUAL_UAT",
                "qualityGate": "PASS",
                "packageMetrics": {
                    "uncompressedPayloadBytes": len(payload),
                    "uncompressedBudgetBytes": 18 * 1024 * 1024,
                    "sizeBudgetPassed": True,
                },
                "runtimeAssetClosure": {
                    "status": "PASS",
                    "filesScanned": 1,
                    "localReferencesChecked": 1,
                    "missingLocalReferences": 0,
                },
                "files": [{
                    "path": "index.html",
                    "bytes": len(payload),
                    "sha256": _PACKAGE_PREVIEW.digest_bytes(payload),
                }],
            }
            manifest_path = output / "RELEASE-MANIFEST.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            # A complete manifest and matching payload must remain packageable.
            _PACKAGE_PREVIEW.deterministic_archive(output, archive)

            manifest["runtimeAssetClosure"]["status"] = "FAIL"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "passing runtime asset-closure audit"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["runtimeAssetClosure"]["status"] = "PASS"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            (output / "unmanifested.txt").write_text("not represented in release evidence", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "not listed in RELEASE-MANIFEST.json"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)

            (output / "unmanifested.txt").unlink()
            manifest["files"] = [{
                "path": "../escape.txt",
                "bytes": 0,
                "sha256": "0" * 64,
            }]
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "unsafe archive member path"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)

    def test_package_inventory_rejects_symlinked_directories(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            output = base / "preview"
            output.mkdir()
            outside = base / "outside"
            outside.mkdir()
            (outside / "unpackaged.txt").write_text("outside package", encoding="utf-8")
            (output / "linked-directory").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "Unsafe packaged file: linked-directory"):
                _PACKAGE_PREVIEW.inventory_package_files(output)

    def test_rewrite_site_rejects_symlinked_root_and_pages_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            site = base / "site"
            site.mkdir()
            linked_root = base / "site-link"
            linked_root.symlink_to(site, target_is_directory=True)

            with self.assertRaisesRegex(ValueError, "symlinked site root"):
                rewrite_site(linked_root, "jpg")

        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "site"
            root.mkdir()
            index = root / "index.html"
            index_before = f'<img src="{SOURCE_PREFIX}rest3.jpg">'
            index.write_text(index_before, encoding="utf-8")

            protected = base / "protected.html"
            protected_before = f'<img src="{SOURCE_PREFIX}scarlet.jpg">'
            protected.write_text(protected_before, encoding="utf-8")
            (root / "rooms.html").symlink_to(protected)

            # The symlinked route is detected before the earlier-sorted index page
            # can be rewritten, and the external target remains untouched.
            with self.assertRaisesRegex(ValueError, "symlinked or non-regular HTML page"):
                rewrite_site(root, "jpg")

            self.assertEqual(index.read_text(encoding="utf-8"), index_before)
            self.assertEqual(protected.read_text(encoding="utf-8"), protected_before)

    def test_site_rewrite_is_idempotent_after_responsive_generation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in IMAGE_NAMES:
                size = (1200, 800) if Path(name).name in {"rest3.jpg", "courtyard.jpg"} else (900, 600)
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
