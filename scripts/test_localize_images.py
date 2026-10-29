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
                    'import "./side-effect.js"; '
                    'import { ready } from "./module.js"; '
                    'export { ready } from "./re-export.js"; '
                    'import("./module.js"); '
                    'const icon = new URL("./icons.svg", import.meta.url);'
                ),
                "assets/js/side-effect.js": "export const sideEffect = true;",
                "assets/js/module.js": "export const ready = true;",
                "assets/js/re-export.js": "export const ready = true;",
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

            index_path.write_text(files["index.html"], encoding="utf-8")
            script_path = root / "assets" / "js" / "site.js"
            script_path.write_text(
                'import { missing } from "./missing-static.js";',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "broken local asset reference.*missing-static.js"):
                _PACKAGE_PREVIEW.validate_runtime_asset_closure(root)

            script_path.write_text(
                'export { missing } from "./missing-re-export.js";',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "broken local asset reference.*missing-re-export.js"):
                _PACKAGE_PREVIEW.validate_runtime_asset_closure(root)


    def test_packaged_document_contract_checks_accessibility_and_seo(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index_html = (
                '<!doctype html><html lang="en"><head>'
                '<meta name="viewport" content="width=device-width, initial-scale=1">'
                '<title>Example home</title>'
                '<meta name="description" content="Example home description">'
                '<meta property="og:title" content="Example home">'
                '<meta property="og:description" content="Example home description">'
                '<meta property="og:image" content="assets/room.webp">'
                '</head><body><a class="skip-link" href="#main">Skip to content</a>'
                '<main id="main"><h1>Example home</h1>'
                '<img src="assets/room.webp" alt="A heritage room">'
                '<a href="#main">Back to top</a>'
                '<button type="button" aria-label="Open menu"></button>'
                '<label for="email">Email</label><input id="email" type="email">'
                '</main></body></html>'
            )
            not_found_html = (
                '<!doctype html><html lang="en"><head>'
                '<meta name="viewport" content="width=device-width, initial-scale=1">'
                '<title>Page not found</title>'
                '<meta name="description" content="This page could not be found">'
                '</head><body><a class="skip-link" href="#main">Skip to content</a>'
                '<main id="main"><h1>Page not found</h1><a href="#main">Home</a></main></body></html>'
            )
            index_path = root / "index.html"
            index_path.write_text(index_html, encoding="utf-8")
            (root / "404.html").write_text(not_found_html, encoding="utf-8")

            report = _PACKAGE_PREVIEW.validate_document_contract(root)
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["routesScanned"], 2)
            self.assertEqual(report["imagesMissingAlt"], 0)
            self.assertEqual(report["unlabelledFormControls"], 0)

            index_path.write_text(index_html.replace(' alt="A heritage room"', ""), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "image missing alt attribute"):
                _PACKAGE_PREVIEW.validate_document_contract(root)

            index_path.write_text(
                index_html.replace(
                    '<a href="#main">Back to top</a>',
                    '<a href="#main"><span aria-hidden="true">↗</span></a>',
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "link has no accessible name"):
                _PACKAGE_PREVIEW.validate_document_contract(root)

            index_path.write_text(
                index_html.replace(
                    '<meta property="og:description" content="Example home description">',
                    "",
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "Open Graph metadata missing"):
                _PACKAGE_PREVIEW.validate_document_contract(root)

    def test_package_audits_reject_symlinked_output_roots(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "preview"
            root.mkdir()
            linked_root = base / "preview-link"
            linked_root.symlink_to(root, target_is_directory=True)

            for audit in (
                _PACKAGE_PREVIEW.validate_runtime_asset_closure,
                _PACKAGE_PREVIEW.validate_no_legacy_image_tree_references,
                _PACKAGE_PREVIEW.validate_document_contract,
            ):
                with self.subTest(audit=audit.__name__):
                    with self.assertRaisesRegex(RuntimeError, "root must not be a symlink"):
                        audit(linked_root)

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
                "documentContract": {
                    "status": "PASS",
                    "routesScanned": 1,
                    "imagesChecked": 0,
                    "imagesMissingAlt": 0,
                    "linksChecked": 1,
                    "unnamedLinks": 0,
                    "buttonsChecked": 1,
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

            manifest["documentContract"]["status"] = "FAIL"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "passing document accessibility/SEO contract"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["documentContract"]["status"] = "PASS"
            manifest["documentContract"]["unnamedLinks"] = 1
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "Document accessibility/SEO metric must be zero: unnamedLinks"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["documentContract"]["unnamedLinks"] = 0
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

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



    def test_responsive_sizes_follow_verified_layout_contexts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_names = (
                "rest3.jpg",
                "experiences/swiss-tent-detail.jpeg",
                "rooms/rising-sun.jpg",
                "tent.jpg",
                "dining/rooftop-candlelit-table.jpg",
            )
            for name in source_names:
                create_jpeg(root, name, (1200, 800))
            generate_responsive_variants(root, source_names)

            html = (
                '<script>const fakeMarkup = \'<div class="gallery-grid">\';</script>'
                '<section class="page-hero"><picture class="page-hero__picture">'
                '<img src="assets/images/rest3.jpg" alt="Rooftop">'
                '</picture></section>'
                '<head><link rel="preload" as="image" '
                'href="assets/images/experiences/swiss-tent-detail.jpeg"></head>'
                '<section><div class="experience-option-grid"><article>'
                '<figure class="experience-option__media">'
                '<img src="assets/images/experiences/swiss-tent-detail.jpeg" alt="Desert tent">'
                '</figure></article></div></section>'
                '<section><div class="room-card-grid room-card-grid--catalog"><article>'
                '<div class="room-card__image"><img src="assets/images/rooms/rising-sun.jpg" '
                'alt="Purple room"></div></article></div></section>'
                '<section><div class="gallery-grid"><figure class="gallery-card">'
                '<div class="gallery-card__media"><img src="assets/images/tent.jpg" '
                'alt="Desert sleeping setup"></div></figure></div></section>'
                '<div class="dining-restaurant__panel"><section class="section wrap">'
                '<div class="story-grid"><figure class="story-image">'
                '<img src="assets/images/dining/rooftop-candlelit-table.jpg" alt="Dining">'
                '</figure></div></section></div>'
            )
            result = rewrite_html_text(html, "responsive", root=root)

            experience_sizes = (
                '(max-width: 760px) calc(100vw - 36px), '
                '(max-width: 900px) calc((100vw - 84px) / 2), '
                'calc((min(100vw, 1304px) - 104px) / 3)'
            )
            room_sizes = (
                '(max-width: 760px) calc(100vw - 36px), '
                '(max-width: 1050px) calc((100vw - 82px) / 2), '
                'calc((min(100vw, 1304px) - 100px) / 3)'
            )
            gallery_sizes = (
                '(max-width: 760px) calc(100vw - 36px), '
                'calc((min(100vw, 1304px) - 88px) / 2)'
            )
            self.assertIn('sizes="100vw"', result)
            self.assertIn(f'sizes="{experience_sizes}"', result)
            self.assertIn(f'imagesizes="{experience_sizes}"', result)
            self.assertIn(f'sizes="{room_sizes}"', result)
            self.assertIn(f'sizes="{gallery_sizes}"', result)
            self.assertIn(
                'sizes="(max-width: 760px) calc(100vw - 56px), min(600px, 43vw)"',
                result,
            )
            self.assertEqual(rewrite_html_text(result, "responsive", root=root), result)

    def test_browser_smoke_contract_exercises_hidden_responsive_images(self) -> None:
        smoke_path = Path(__file__).with_name("test-browser-smoke.py")
        source = smoke_path.read_text(encoding="utf-8")
        start = source.index("def run_responsive_image_preview_smoke")
        end = source.index("\ndef load_visible_images", start)
        browser_check = source[start:end]

        # The packaged smoke must not silently skip hidden carousel/gallery pictures.
        self.assertNotIn("if not image.is_visible():", browser_check)
        self.assertIn("img.loading = 'eager'", browser_check)
        self.assertIn('production_loading.lower() == expected_loading', browser_check)
        self.assertIn('endswith((".jpg", ".jpeg"))', browser_check)
        self.assertIn("responsive source must declare sizes", browser_check)
        self.assertIn("for width, height in RESPONSIVE_AUDIT_VIEWPORTS:", browser_check)
        self.assertIn("for device_scale_factor in (1, 2):", browser_check)
        self.assertIn("selected_width <= required_pixels * 1.9", browser_check)

if __name__ == "__main__":
    unittest.main(verbosity=2)
