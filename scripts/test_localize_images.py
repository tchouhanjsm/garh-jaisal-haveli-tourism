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
    FULL_SIZE_WEBP_MAX_BYTES,
    HERO_DELIVERY_VARIANTS,
    IMAGE_NAMES,
    RESPONSIVE_SOURCE_OVERRIDES,
    RESPONSIVE_VARIANT_MAX_BYTES,
    SOURCE_QUALITY_OVERRIDES,
    RESPONSIVE_WIDTHS,
    RESPONSIVE_WIDTH_OVERRIDES,
    _save_webp,
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


def create_webp(
    root: Path,
    filename: str,
    size: tuple[int, int],
    color: tuple[int, int, int] = (55, 95, 120),
) -> Path:
    target = root / "assets" / "images" / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    draw.rectangle((size[0] // 4, size[1] // 4, size[0] * 3 // 4, size[1] * 3 // 4), fill=(180, 130, 75))
    image.save(target, format="WEBP", quality=90, method=6)
    return target


def create_webp_from_jpeg(
    root: Path,
    source_filename: str,
    output_filename: str,
    quality: int = 90,
) -> Path:
    """Create a source-backed WebP fixture from the exact JPEG fallback pixels."""
    source = root / "assets" / "images" / source_filename
    target = root / "assets" / "images" / output_filename
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.save(target, format="WEBP", quality=quality, method=6)
    return target


def generated_candidate_records(root: Path, entry: dict) -> list[dict]:
    """Build the byte/dimension/quality evidence shape consumed by the package validator."""
    variants = {item["path"]: item for item in entry["variants"]}
    hero = entry.get("heroDeliveryVariant")
    paths = [entry["fullSizePath"], *(item["path"] for item in entry["variants"])]
    if hero:
        paths.append(hero["path"])
    records = []
    for relative in paths:
        target = root / relative
        with Image.open(target) as decoded:
            decoded.load()
            record = {
                "path": relative,
                "bytes": target.stat().st_size,
                "sha256": "0" * 64,
                "width": decoded.width,
                "height": decoded.height,
            }
        metadata = variants.get(relative)
        if metadata is None and hero and relative == hero["path"]:
            metadata = hero
        if metadata and metadata.get("maxBytes") is not None:
            record.update({
                "quality": metadata["quality"],
                "qualityAttempts": metadata["qualityAttempts"],
                "maxBytes": metadata["maxBytes"],
            })
        if hero and relative == hero["path"]:
            record.update({
                "psnrDb": hero["psnrDb"],
                "minPsnrDb": hero["minPsnrDb"],
                "minimumSavingsPercent": hero["minimumSavingsPercent"],
            })
        if relative == entry["fullSizePath"] and entry.get("fullSizeMaxBytes") is not None:
            record.update({
                "quality": entry["fullSizeQuality"],
                "qualityAttempts": entry["fullSizeQualityAttempts"],
                "maxBytes": entry["fullSizeMaxBytes"],
            })
        records.append(record)
    return records


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
            self.assertEqual(
                [item["width"] for item in entry["variants"]],
                [width for width in RESPONSIVE_WIDTHS if width < entry["width"]],
            )
            self.assertIn(320, [item["width"] for item in entry["variants"]],
                          "narrow mobile layouts require a real 320px source candidate")
            for item in entry["variants"]:
                target = root / item["path"]
                with Image.open(target) as decoded:
                    decoded.load()
                    self.assertEqual(decoded.format, "WEBP")
                    self.assertEqual(decoded.size, (item["width"], item["height"]))
                self.assertGreater(item["bytes"], 0)
                self.assertLess(item["bytes"], entry["fullSizeBytes"])

    def test_gallery_two_column_assets_use_targeted_1280_candidates_and_package_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_sizes = {
                "courtyard.jpg": (2200, 1467),
                "legacy/camel-day.jpg": (1366, 768),
                "legacy/fort-temple-spires.jpg": (1366, 768),
            }
            expected_widths = (320, 480, 768, 1200, 1280, 1600)
            for filename, dimensions in source_sizes.items():
                create_jpeg(root, filename, dimensions)

            generated = generate_responsive_variants(root, tuple(source_sizes))
            html_parts = ['<section class="gallery-grid">']
            generated_files = []
            source_records = []
            expected_candidate_count = 0

            for filename in source_sizes:
                self.assertEqual(RESPONSIVE_WIDTH_OVERRIDES[filename], expected_widths)
                entry = generated[filename]
                expected_generated_widths = [
                    width for width in expected_widths if width < entry["width"]
                ]
                self.assertEqual(
                    [item["width"] for item in entry["variants"]],
                    expected_generated_widths,
                )
                candidate = next(item for item in entry["variants"] if item["width"] == 1280)
                self.assertEqual(
                    candidate["maxBytes"],
                    RESPONSIVE_VARIANT_MAX_BYTES[candidate["path"]],
                )
                self.assertLessEqual(candidate["bytes"], candidate["maxBytes"])
                self.assertEqual(candidate["qualityAttempts"][-1]["bytes"], candidate["bytes"])
                html_parts.append(
                    f'<figure class="gallery-card"><img src="assets/images/{filename}" '
                    f'alt="Verified source photograph for {filename}"></figure>'
                )

                candidate_paths = [
                    entry["fullSizePath"],
                    *(item["path"] for item in entry["variants"]),
                ]
                variant_by_path = {item["path"]: item for item in entry["variants"]}
                for relative in candidate_paths:
                    target = root / relative
                    with Image.open(target) as decoded:
                        decoded.load()
                        record = {
                            "path": relative,
                            "bytes": target.stat().st_size,
                            "sha256": "0" * 64,
                            "width": decoded.width,
                            "height": decoded.height,
                        }
                    variant_metadata = variant_by_path.get(relative)
                    if variant_metadata and variant_metadata["maxBytes"] is not None:
                        record.update({
                            "quality": variant_metadata["quality"],
                            "qualityAttempts": variant_metadata["qualityAttempts"],
                            "maxBytes": variant_metadata["maxBytes"],
                        })
                    if relative == entry["fullSizePath"] and entry["fullSizeMaxBytes"] is not None:
                        record.update({
                            "quality": entry["fullSizeQuality"],
                            "qualityAttempts": entry["fullSizeQualityAttempts"],
                            "maxBytes": entry["fullSizeMaxBytes"],
                        })
                    generated_files.append(record)

                source_records.append({
                    "sourceJpeg": f"assets/images/{filename}",
                    "sourceFormat": "JPEG",
                    "sourceWebp": "",
                    "naturalWidth": entry["width"],
                    "naturalHeight": entry["height"],
                    "fullSizeWebp": entry["fullSizePath"],
                })
                expected_candidate_count += len(candidate_paths)

            html_parts.append("</section>")
            rewritten = rewrite_html_text("".join(html_parts), "responsive", root=root)
            page = root / "gallery.html"
            page.write_text(rewritten, encoding="utf-8")
            self.assertEqual(rewritten.count('data-responsive-image="true"'), 3)
            for filename in source_sizes:
                self.assertIn(f"{Path(filename).stem}-1280.webp 1280w", rewritten)

            report = _PACKAGE_PREVIEW.validate_responsive_markup(
                root,
                generated_files,
                source_records,
                RESPONSIVE_WIDTHS,
                RESPONSIVE_WIDTH_OVERRIDES,
            )
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["responsivePictureCount"], 3)
            self.assertEqual(report["validatedSrcsetCandidateCount"], expected_candidate_count)

    def test_budgeted_responsive_variant_uses_highest_quality_that_fits_and_package_revalidates_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_jpeg(root, "rest3.jpg", (1200, 800))
            baseline = generate_responsive_variants(root, ("rest3.jpg",))
            baseline_variant = next(
                item for item in baseline["rest3.jpg"]["variants"] if item["width"] == 480
            )
            budget_path = "assets/images/responsive/rest3-480.webp"
            byte_budget = baseline_variant["bytes"] - 1
            full_size_path = baseline["rest3.jpg"]["fullSizePath"]
            full_size_budget = baseline["rest3.jpg"]["fullSizeBytes"] - 1
            self.assertEqual(FULL_SIZE_WEBP_MAX_BYTES["assets/images/courtyard.webp"], 450_000)
            self.assertEqual(FULL_SIZE_WEBP_MAX_BYTES["assets/images/legacy/camel-day.webp"], 210_000)
            self.assertEqual(FULL_SIZE_WEBP_MAX_BYTES["assets/images/legacy/fort-temple-spires.webp"], 120_000)
            self.assertEqual(RESPONSIVE_VARIANT_MAX_BYTES["assets/images/responsive/courtyard-1600.webp"], 250_000)
            self.assertEqual(RESPONSIVE_VARIANT_MAX_BYTES["assets/images/responsive/legacy/camel-day-1200.webp"], 170_000)
            self.assertEqual(RESPONSIVE_VARIANT_MAX_BYTES["assets/images/responsive/legacy/fort-temple-spires-1200.webp"], 100_000)
            page = root / "index.html"
            page.write_text(
                '<img src="assets/images/rest3.jpg" alt="Rooftop terrace">',
                encoding="utf-8",
            )

            with patch(
                "rewrite_image_refs.RESPONSIVE_VARIANT_MAX_BYTES",
                {budget_path: byte_budget},
            ), patch(
                "rewrite_image_refs.FULL_SIZE_WEBP_MAX_BYTES",
                {full_size_path: full_size_budget},
            ):
                rewritten_pages, generation = rewrite_site(
                    root, "responsive", return_report=True, image_names=("rest3.jpg",)
                )

            self.assertEqual([item.name for item in rewritten_pages], ["index.html"])
            entry = generation["rest3.jpg"]
            variant = next(item for item in entry["variants"] if item["path"] == budget_path)
            self.assertEqual(variant["maxBytes"], byte_budget)
            self.assertLess(variant["quality"], 82)
            self.assertGreater(len(variant["qualityAttempts"]), 1)
            self.assertEqual(variant["qualityAttempts"][0]["quality"], 82)
            self.assertEqual(variant["qualityAttempts"][-1]["quality"], variant["quality"])
            self.assertEqual(variant["qualityAttempts"][-1]["bytes"], variant["bytes"])
            self.assertLessEqual(variant["bytes"], byte_budget)
            self.assertEqual(entry["fullSizeMaxBytes"], full_size_budget)
            self.assertLess(entry["fullSizeQuality"], 82)
            self.assertGreater(len(entry["fullSizeQualityAttempts"]), 1)
            self.assertEqual(entry["fullSizeQualityAttempts"][0]["quality"], 82)
            self.assertEqual(entry["fullSizeQualityAttempts"][-1]["quality"], entry["fullSizeQuality"])
            self.assertEqual(entry["fullSizeQualityAttempts"][-1]["bytes"], entry["fullSizeBytes"])
            self.assertLessEqual(entry["fullSizeBytes"], full_size_budget)

            candidate_paths = [
                entry["fullSizePath"],
                *(item["path"] for item in entry["variants"]),
            ]
            variant_by_path = {item["path"]: item for item in entry["variants"]}
            generated_files = []
            for relative in candidate_paths:
                target = root / relative
                with Image.open(target) as decoded:
                    decoded.load()
                    record = {
                        "path": relative,
                        "bytes": target.stat().st_size,
                        "sha256": "0" * 64,
                        "width": decoded.width,
                        "height": decoded.height,
                    }
                variant_metadata = variant_by_path.get(relative)
                if variant_metadata and variant_metadata["maxBytes"] is not None:
                    record.update({
                        "quality": variant_metadata["quality"],
                        "qualityAttempts": variant_metadata["qualityAttempts"],
                        "maxBytes": variant_metadata["maxBytes"],
                    })
                if relative == entry["fullSizePath"] and entry["fullSizeMaxBytes"] is not None:
                    record.update({
                        "quality": entry["fullSizeQuality"],
                        "qualityAttempts": entry["fullSizeQualityAttempts"],
                        "maxBytes": entry["fullSizeMaxBytes"],
                    })
                generated_files.append(record)

            source_record = [{
                "sourceJpeg": "assets/images/rest3.jpg",
                "naturalWidth": entry["width"],
                "naturalHeight": entry["height"],
                "fullSizeWebp": entry["fullSizePath"],
                "fullSizeQuality": entry["fullSizeQuality"],
                "fullSizeQualityAttempts": entry["fullSizeQualityAttempts"],
                "fullSizeMaxBytes": entry["fullSizeMaxBytes"],
            }]
            packaged = _PACKAGE_PREVIEW.validate_responsive_markup(
                root, generated_files, source_record, RESPONSIVE_WIDTHS
            )
            self.assertEqual(packaged["status"], "PASS")
            self.assertEqual(packaged["responsivePictureCount"], 1)

            full_size_record = next(
                item for item in generated_files if item["path"] == entry["fullSizePath"]
            )
            actual_full_size_bytes = full_size_record["bytes"]
            actual_final_attempt_bytes = full_size_record["qualityAttempts"][-1]["bytes"]
            full_size_record["bytes"] = actual_full_size_bytes - 1
            full_size_record["qualityAttempts"][-1]["bytes"] = actual_full_size_bytes - 1
            with self.assertRaisesRegex(RuntimeError, "byte metadata does not match the actual file"):
                _PACKAGE_PREVIEW.validate_responsive_markup(
                    root, generated_files, source_record, RESPONSIVE_WIDTHS
                )
            full_size_record["bytes"] = actual_full_size_bytes
            full_size_record["qualityAttempts"][-1]["bytes"] = actual_final_attempt_bytes
            full_size_record["maxBytes"] = actual_full_size_bytes - 1
            with self.assertRaisesRegex(RuntimeError, "exceeds its"):
                _PACKAGE_PREVIEW.validate_responsive_markup(
                    root, generated_files, source_record, RESPONSIVE_WIDTHS
                )
            full_size_record["maxBytes"] = full_size_budget

            first_attempt_bytes = full_size_record["qualityAttempts"][0]["bytes"]
            full_size_record["qualityAttempts"][0]["bytes"] = full_size_budget - 1
            with self.assertRaisesRegex(RuntimeError, "quality-ladder evidence"):
                _PACKAGE_PREVIEW.validate_responsive_markup(
                    root, generated_files, source_record, RESPONSIVE_WIDTHS
                )
            full_size_record["qualityAttempts"][0]["bytes"] = first_attempt_bytes

            budgeted_record = next(item for item in generated_files if item["path"] == budget_path)
            budgeted_record["maxBytes"] = budgeted_record["bytes"] - 1
            with self.assertRaisesRegex(RuntimeError, "exceeds its"):
                _PACKAGE_PREVIEW.validate_responsive_markup(
                    root, generated_files, source_record, RESPONSIVE_WIDTHS
                )

    def test_budget_failure_preserves_existing_responsive_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "assets" / "images" / "responsive" / "rest3-480.webp"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"previous-generated-output")
            original = target.read_bytes()
            image = Image.new("RGB", (480, 320), (55, 95, 120))

            with self.assertRaisesRegex(RuntimeError, "cannot meet the 1-byte budget"):
                _save_webp(image, target, None, max_bytes=1)

            self.assertEqual(target.read_bytes(), original)
            self.assertFalse(target.with_name(target.name + ".tmp").exists())

    def test_source_backed_art_direction_webp_is_preserved_and_responsive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fallback = create_jpeg(root, "rooms/sweet-purple.jpg", (2000, 1333))
            source_webp = create_webp(root, "rooms/sweet-purple.webp", (2000, 1333))
            original_webp = source_webp.read_bytes()

            generated = generate_responsive_variants(root, ("rooms/sweet-purple.jpg",))
            entry = generated["rooms/sweet-purple.jpg"]
            self.assertEqual(source_webp.read_bytes(), original_webp)
            self.assertEqual(entry["sourceFormat"], "WEBP")
            self.assertEqual(entry["sourcePath"], "assets/images/rooms/sweet-purple.webp")
            self.assertEqual(entry["fullSizePath"], "assets/images/rooms/sweet-purple.webp")
            self.assertEqual(entry["fullSizeSavingsBytes"], 0)
            self.assertEqual(entry["fallbackBytes"], fallback.stat().st_size)

            html = (
                '<picture><source type="image/webp" srcset="assets/images/rooms/sweet-purple.webp">'
                '<img src="assets/images/rooms/sweet-purple.jpg" alt="Sweet Purple Room"></picture>'
            )
            rewritten = rewrite_html_text(html, "responsive", root=root)
            self.assertEqual(rewritten.count("<source"), 1)
            self.assertIn('data-responsive-image="true"', rewritten)
            self.assertIn('sizes="(max-width: 760px) 100vw', rewritten)
            self.assertIn("assets/images/responsive/rooms/sweet-purple-320.webp 320w", rewritten)
            self.assertIn("assets/images/rooms/sweet-purple.webp 2000w", rewritten)
            self.assertIn('data-responsive-image-fallback="true"', rewritten)
            self.assertIn('src="assets/images/rooms/sweet-purple.jpg"', rewritten)
            self.assertIn('width="2000"', rewritten)
            self.assertIn('height="1333"', rewritten)
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
                "sourceJpeg": "assets/images/rooms/sweet-purple.jpg",
                "sourceFormat": "WEBP",
                "sourceWebp": "assets/images/rooms/sweet-purple.webp",
                "naturalWidth": entry["width"],
                "naturalHeight": entry["height"],
                "fullSizeWebp": entry["fullSizePath"],
            }]
            report = _PACKAGE_PREVIEW.validate_responsive_markup(
                root, generated_files, source_record, RESPONSIVE_WIDTHS
            )
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["responsivePictureCount"], 1)
            self.assertTrue(report["widthDescriptorsMatchDecodedPixels"])
            self.assertEqual(source_webp.read_bytes(), original_webp)

    def test_source_backed_rooms_hero_webp_is_responsive_and_preloaded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fallback = create_jpeg(root, "rooms/haveli-interior.jpg", (1600, 1066))
            source_webp = create_webp_from_jpeg(
                root, "rooms/haveli-interior.jpg", "rooms/haveli-sitting-room.webp"
            )
            original_webp = source_webp.read_bytes()

            generated = generate_responsive_variants(root, ("rooms/haveli-interior.jpg",))
            entry = generated["rooms/haveli-interior.jpg"]
            hero = entry["heroDeliveryVariant"]
            self.assertEqual(source_webp.read_bytes(), original_webp)
            self.assertEqual(entry["sourceFormat"], "WEBP")
            self.assertEqual(entry["sourcePath"], "assets/images/rooms/haveli-sitting-room.webp")
            self.assertEqual(entry["fullSizePath"], "assets/images/rooms/haveli-sitting-room.webp")
            self.assertEqual(entry["fullSizeSavingsBytes"], 0)
            self.assertEqual(entry["fallbackBytes"], fallback.stat().st_size)
            self.assertEqual(entry["sourceBytes"], source_webp.stat().st_size)
            self.assertEqual(hero["path"], HERO_DELIVERY_VARIANTS["rooms/haveli-interior.jpg"]["path"])
            self.assertEqual((hero["width"], hero["height"]), (1600, 1066))
            self.assertLessEqual(hero["bytes"], 240_000)
            self.assertGreaterEqual(hero["psnrDb"], 35.0)
            self.assertGreaterEqual(hero["savedPercent"], 10.0)
            self.assertEqual([item["width"] for item in entry["variants"]], [320, 480, 768, 800, 1200, 1280])
            for width, budget in ((800, 95_000), (1200, 180_000), (1280, 190_000)):
                relative = f"assets/images/responsive/rooms/haveli-interior-{width}.webp"
                candidate = next(item for item in entry["variants"] if item["width"] == width)
                self.assertEqual(RESPONSIVE_VARIANT_MAX_BYTES[relative], budget)
                self.assertLessEqual(candidate["bytes"], budget)

            html = (
                '<link rel="preload" as="image" href="assets/images/rooms/haveli-interior.jpg" '
                'type="image/jpeg" fetchpriority="high">'
                '<picture class="page-hero__picture">'
                '<source type="image/webp" srcset="assets/images/rooms/haveli-sitting-room.webp">'
                '<img src="assets/images/rooms/haveli-interior.jpg" '
                'alt="Traditional sandstone sitting area with carved wooden furniture and patterned textiles inside the haveli" '
                'width="1600" height="1066" fetchpriority="high" loading="eager" decoding="async">'
                '</picture>'
            )
            rewritten = rewrite_html_text(html, "responsive", root=root)
            self.assertEqual(rewritten.count("<source"), 1)
            self.assertIn('data-responsive-image="true"', rewritten)
            self.assertIn("assets/images/responsive/rooms/haveli-interior-800.webp 800w", rewritten)
            self.assertIn("assets/images/responsive/rooms/haveli-interior-1280.webp 1280w", rewritten)
            self.assertIn(f'{hero["path"]} 1600w', rewritten)
            self.assertNotIn("assets/images/rooms/haveli-sitting-room.webp 1600w", rewritten)
            self.assertIn('sizes="100vw"', rewritten)
            self.assertIn('src="assets/images/rooms/haveli-interior.jpg"', rewritten)
            self.assertIn('data-responsive-image-fallback="true"', rewritten)
            self.assertIn('href="assets/images/rooms/haveli-sitting-room.webp"', rewritten)
            self.assertIn('imagesizes="100vw"', rewritten)

            nonhero = rewrite_html_text(
                '<img src="assets/images/rooms/haveli-interior.jpg" alt="Room detail" loading="lazy">',
                "responsive",
                root=root,
            )
            self.assertIn("assets/images/rooms/haveli-sitting-room.webp 1600w", nonhero)
            self.assertNotIn(hero["path"], nonhero)

            page = root / "rooms.html"
            page.write_text(rewritten, encoding="utf-8")
            generated_files = generated_candidate_records(root, entry)
            source_record = [{
                "sourceJpeg": "assets/images/rooms/haveli-interior.jpg",
                "sourceFormat": "WEBP",
                "sourceWebp": "assets/images/rooms/haveli-sitting-room.webp",
                "naturalWidth": entry["width"],
                "naturalHeight": entry["height"],
                "fullSizeWebp": entry["fullSizePath"],
                "heroDeliveryWebp": hero["path"],
            }]
            report = _PACKAGE_PREVIEW.validate_responsive_markup(
                root, generated_files, source_record, RESPONSIVE_WIDTHS,
                RESPONSIVE_WIDTH_OVERRIDES,
            )
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["responsivePictureCount"], 1)
            self.assertEqual(report["validatedSrcsetCandidateCount"], len(entry["variants"]) + 1)
            self.assertTrue(report["widthDescriptorsMatchDecodedPixels"])
            hero_record = next(item for item in generated_files if item["path"] == hero["path"])
            original_psnr = hero_record["psnrDb"]
            hero_record["psnrDb"] = 34.0
            with self.assertRaisesRegex(RuntimeError, "PSNR/quality evidence"):
                _PACKAGE_PREVIEW.validate_responsive_markup(
                    root, generated_files, source_record, RESPONSIVE_WIDTHS,
                    RESPONSIVE_WIDTH_OVERRIDES,
                )
            hero_record["psnrDb"] = original_psnr
            self.assertEqual(source_webp.read_bytes(), original_webp)
            self.assertEqual(rewrite_html_text(rewritten, "responsive", root=root), rewritten)

    def test_rooftop_panorama_source_backed_webp_is_responsive_and_preloaded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            filename = "gallery/hotel/fort-from-roof.jpg"
            fallback = create_jpeg(root, filename, (2000, 1333))
            source_webp = create_webp_from_jpeg(
                root, filename, "gallery/hotel/fort-from-roof.webp"
            )
            original_webp = source_webp.read_bytes()

            self.assertIn(filename, IMAGE_NAMES)
            self.assertEqual(
                RESPONSIVE_SOURCE_OVERRIDES[filename],
                "gallery/hotel/fort-from-roof.webp",
            )
            generated = generate_responsive_variants(root, (filename,))
            entry = generated[filename]
            hero = entry["heroDeliveryVariant"]
            self.assertEqual(source_webp.read_bytes(), original_webp)
            self.assertEqual(entry["sourceFormat"], "WEBP")
            self.assertEqual(entry["sourcePath"], "assets/images/gallery/hotel/fort-from-roof.webp")
            self.assertEqual(entry["fullSizePath"], "assets/images/gallery/hotel/fort-from-roof.webp")
            self.assertEqual(entry["fullSizeSavingsBytes"], 0)
            self.assertEqual(entry["fallbackBytes"], fallback.stat().st_size)
            self.assertEqual(entry["sourceBytes"], source_webp.stat().st_size)
            self.assertEqual(hero["path"], HERO_DELIVERY_VARIANTS[filename]["path"])
            self.assertEqual((hero["width"], hero["height"]), (2000, 1333))
            self.assertLessEqual(hero["bytes"], 260_000)
            self.assertGreaterEqual(hero["psnrDb"], 35.0)
            self.assertGreaterEqual(hero["savedPercent"], 10.0)

            expected_budgets = (
                (320, 20_000),
                (480, 35_000),
                (768, 80_000),
                (800, 80_000),
                (1200, 170_000),
                (1280, 180_000),
                (1600, 250_000),
            )
            for width, budget in expected_budgets:
                relative = f"assets/images/responsive/gallery/hotel/fort-from-roof-{width}.webp"
                self.assertEqual(RESPONSIVE_VARIANT_MAX_BYTES[relative], budget)
                candidate = next(item for item in entry["variants"] if item["width"] == width)
                self.assertEqual(candidate["maxBytes"], budget)
                self.assertLessEqual(candidate["bytes"], budget)
                self.assertEqual(candidate["quality"], 82)
                self.assertEqual(candidate["qualityAttempts"][-1]["quality"], 82)
                self.assertEqual(candidate["qualityAttempts"][-1]["bytes"], candidate["bytes"])

            html = (
                '<head><link rel="preload" as="image" '
                'href="assets/images/gallery/hotel/fort-from-roof.jpg" '
                'type="image/jpeg" fetchpriority="high"></head>'
                '<section class="page-hero"><img class="hero__image" '
                'src="assets/images/gallery/hotel/fort-from-roof.jpg" '
                'alt="Carved sandstone rooftop terrace looking across Jaisalmer Fort and the surrounding city at dusk" '
                'fetchpriority="high" loading="eager" decoding="async"></section>'
            )
            rewritten = rewrite_html_text(html, "responsive", root=root)
            self.assertEqual(rewritten.count("<source"), 1)
            self.assertIn('data-responsive-image="true"', rewritten)
            self.assertIn("assets/images/responsive/gallery/hotel/fort-from-roof-800.webp 800w", rewritten)
            self.assertIn("assets/images/responsive/gallery/hotel/fort-from-roof-1280.webp 1280w", rewritten)
            self.assertIn(f'{hero["path"]} 2000w', rewritten)
            self.assertNotIn("assets/images/gallery/hotel/fort-from-roof.webp 2000w", rewritten)
            self.assertIn('src="assets/images/gallery/hotel/fort-from-roof.jpg"', rewritten)
            self.assertIn('href="assets/images/gallery/hotel/fort-from-roof.webp"', rewritten)
            self.assertIn('imagesizes="100vw"', rewritten)
            self.assertEqual(rewrite_html_text(rewritten, "responsive", root=root), rewritten)

            page = root / "about.html"
            page.write_text(rewritten, encoding="utf-8")
            generated_files = generated_candidate_records(root, entry)
            source_record = [{
                "sourceJpeg": "assets/images/gallery/hotel/fort-from-roof.jpg",
                "sourceFormat": "WEBP",
                "sourceWebp": "assets/images/gallery/hotel/fort-from-roof.webp",
                "naturalWidth": entry["width"],
                "naturalHeight": entry["height"],
                "fullSizeWebp": entry["fullSizePath"],
                "heroDeliveryWebp": hero["path"],
            }]
            report = _PACKAGE_PREVIEW.validate_responsive_markup(
                root, generated_files, source_record, RESPONSIVE_WIDTHS,
                RESPONSIVE_WIDTH_OVERRIDES,
            )
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["responsivePictureCount"], 1)
            self.assertEqual(report["validatedSrcsetCandidateCount"], len(entry["variants"]) + 1)
            self.assertTrue(report["widthDescriptorsMatchDecodedPixels"])
            self.assertEqual(source_webp.read_bytes(), original_webp)

    def test_gallery_hero_webp_uses_authoritative_jpeg_quality_override(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fallback = create_jpeg(root, "directions/haveli-facade.jpg", (1333, 2000))
            fallback_bytes = fallback.read_bytes()
            existing_webp = create_webp(root, "directions/haveli-facade.webp", (1333, 2000))
            previous_webp_bytes = existing_webp.read_bytes()

            self.assertIn("directions/haveli-facade.jpg", IMAGE_NAMES)
            self.assertNotIn("directions/haveli-facade.jpg", RESPONSIVE_SOURCE_OVERRIDES)
            self.assertEqual(SOURCE_QUALITY_OVERRIDES["courtyard.jpg"], 70)
            self.assertEqual(SOURCE_QUALITY_OVERRIDES["directions/haveli-facade.jpg"], 70)
            self.assertEqual(
                FULL_SIZE_WEBP_MAX_BYTES["assets/images/directions/haveli-facade.webp"],
                400_000,
            )
            self.assertEqual(
                RESPONSIVE_VARIANT_MAX_BYTES["assets/images/responsive/directions/haveli-facade-1200.webp"],
                250_000,
            )

            generated = generate_responsive_variants(root, ("directions/haveli-facade.jpg",))
            entry = generated["directions/haveli-facade.jpg"]
            full_size = root / entry["fullSizePath"]
            self.assertEqual(entry["sourceFormat"], "JPEG")
            self.assertEqual(entry["sourcePath"], "assets/images/directions/haveli-facade.jpg")
            self.assertEqual(entry["fullSizePath"], "assets/images/directions/haveli-facade.webp")
            self.assertEqual(entry["fullSizeQuality"], 70)
            self.assertEqual(entry["fullSizeMaxBytes"], 400_000)
            self.assertLessEqual(entry["fullSizeBytes"], 400_000)
            self.assertGreater(entry["fullSizeSavingsBytes"], 0)
            self.assertNotEqual(full_size.read_bytes(), previous_webp_bytes)
            self.assertEqual(fallback.read_bytes(), fallback_bytes)
            self.assertEqual(entry["sourceBytes"], fallback.stat().st_size)
            self.assertEqual(entry["fallbackBytes"], fallback.stat().st_size)

            expected_budgets = (
                (320, 50_000),
                (480, 90_000),
                (768, 200_000),
                (1200, 250_000),
            )
            for width, budget in expected_budgets:
                relative = f"assets/images/responsive/directions/haveli-facade-{width}.webp"
                self.assertEqual(RESPONSIVE_VARIANT_MAX_BYTES[relative], budget)
                candidate = next(item for item in entry["variants"] if item["width"] == width)
                self.assertLessEqual(candidate["bytes"], budget)
                self.assertEqual(candidate["maxBytes"], budget)
                self.assertEqual(candidate["qualityAttempts"][-1]["quality"], candidate["quality"])
                self.assertEqual(candidate["qualityAttempts"][-1]["bytes"], candidate["bytes"])

            preload_srcset = ", ".join(
                [f"{item['path']} {item['width']}w" for item in entry["variants"]]
                + [f"{entry['fullSizePath']} {entry['width']}w"]
            )
            html = (
                '<link rel="preload" as="image" href="assets/images/directions/haveli-facade.webp" '
                f'type="image/webp" imagesrcset="{preload_srcset}" imagesizes="100vw" fetchpriority="high">'
                '<picture class="page-hero__picture">'
                '<source type="image/webp" srcset="assets/images/directions/haveli-facade.webp 1333w" sizes="100vw">'
                '<img src="assets/images/directions/haveli-facade.jpg" '
                'alt="Carved sandstone facade of Hotel Garh Jaisal, with the hotel name visible beside the entrance" '
                'width="1333" height="2000" fetchpriority="high" loading="eager" decoding="async" '
                'data-responsive-image-fallback="true"></picture>'
            )
            rewritten = rewrite_html_text(html, "responsive", root=root)
            self.assertEqual(rewritten.count("<source"), 1)
            self.assertIn('data-responsive-image="true"', rewritten)
            self.assertIn(f'srcset="{preload_srcset}"', rewritten)
            self.assertIn(f'imagesrcset="{preload_srcset}"', rewritten)
            self.assertIn('imagesizes="100vw"', rewritten)
            self.assertIn('src="assets/images/directions/haveli-facade.jpg"', rewritten)
            self.assertIn('data-responsive-image-fallback="true"', rewritten)
            self.assertIn('href="assets/images/directions/haveli-facade.webp"', rewritten)

            page = root / "gallery.html"
            page.write_text(rewritten, encoding="utf-8")
            candidate_paths = [entry["fullSizePath"], *(item["path"] for item in entry["variants"])]
            variant_by_path = {item["path"]: item for item in entry["variants"]}
            generated_files = []
            for relative in candidate_paths:
                target = root / relative
                with Image.open(target) as decoded:
                    decoded.load()
                    record = {
                        "path": relative,
                        "bytes": target.stat().st_size,
                        "sha256": "0" * 64,
                        "width": decoded.width,
                        "height": decoded.height,
                    }
                variant_metadata = variant_by_path.get(relative)
                if variant_metadata and variant_metadata["maxBytes"] is not None:
                    record.update({
                        "quality": variant_metadata["quality"],
                        "qualityAttempts": variant_metadata["qualityAttempts"],
                        "maxBytes": variant_metadata["maxBytes"],
                    })
                if relative == entry["fullSizePath"]:
                    record.update({
                        "quality": entry["fullSizeQuality"],
                        "qualityAttempts": entry["fullSizeQualityAttempts"],
                        "maxBytes": entry["fullSizeMaxBytes"],
                    })
                generated_files.append(record)

            source_record = [{
                "sourceJpeg": "assets/images/directions/haveli-facade.jpg",
                "sourceFormat": "JPEG",
                "naturalWidth": entry["width"],
                "naturalHeight": entry["height"],
                "fullSizeWebp": entry["fullSizePath"],
                "fullSizeQuality": entry["fullSizeQuality"],
                "fullSizeQualityAttempts": entry["fullSizeQualityAttempts"],
                "fullSizeMaxBytes": entry["fullSizeMaxBytes"],
            }]
            report = _PACKAGE_PREVIEW.validate_responsive_markup(
                root, generated_files, source_record, RESPONSIVE_WIDTHS
            )
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["responsivePictureCount"], 1)
            self.assertEqual(report["validatedSrcsetCandidateCount"], len(candidate_paths))
            self.assertTrue(report["widthDescriptorsMatchDecodedPixels"])
            self.assertEqual(fallback.read_bytes(), fallback_bytes)
            self.assertEqual(rewrite_html_text(rewritten, "responsive", root=root), rewritten)

    def test_responsive_delivery_evidence_classifies_candidate_bytes_as_lab_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_jpeg(root, "rest3.jpg", (1200, 800))
            generated = generate_responsive_variants(root, ("rest3.jpg",))
            entry = generated["rest3.jpg"]
            evidence = {
                "measurementClass": "packaged-chromium-laboratory-diagnostic",
                "fieldDataAvailable": False,
                "candidateBytesAreTransferMeasurements": False,
                "candidateSavingsVersusJpegFallbackInferred": False,
                "responsiveCandidateCount": len(entry["variants"]),
                "responsiveCandidateBytes": sum(item["bytes"] for item in entry["variants"]),
            }
            self.assertEqual(evidence["measurementClass"], "packaged-chromium-laboratory-diagnostic")
            self.assertIs(evidence["fieldDataAvailable"], False)
            self.assertIs(evidence["candidateBytesAreTransferMeasurements"], False)
            self.assertIs(evidence["candidateSavingsVersusJpegFallbackInferred"], False)
            self.assertGreater(evidence["responsiveCandidateCount"], 0)
            self.assertGreater(evidence["responsiveCandidateBytes"], 0)

    def test_generated_jpeg_derivative_refuses_to_overwrite_an_unmapped_webp_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_jpeg(root, "rest3.jpg", (1200, 800))
            existing_webp = create_webp(root, "rest3.webp", (1200, 800), (15, 40, 90))
            original_webp = existing_webp.read_bytes()

            with self.assertRaisesRegex(FileExistsError, "Refusing to overwrite an existing WebP source"):
                generate_responsive_variants(root, ("rest3.jpg",))

            self.assertEqual(existing_webp.read_bytes(), original_webp)
            self.assertFalse((root / "assets" / "images" / "rest3.webp.tmp").exists())

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
            self.assertIn('imagesrcset="assets/images/responsive/rest3-320.webp 320w', result)
            self.assertIn("assets/images/responsive/rest3-480.webp 480w", result)
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
                "assets/images/responsive/gallery/desert/camp-evening-320.webp",
            )
            self.assertEqual(entry["sourceBytes"], source.stat().st_size)

            html = (
                '<link rel="preload" as="image" href="assets/images/gallery/desert/camp-evening.jpeg">'
                '<img src="assets/images/gallery/desert/camp-evening.jpeg" alt="Camp evening in the Thar desert">'
            )
            rewritten = rewrite_html_text(html, "responsive", root=root)
            self.assertIn(
                "assets/images/responsive/gallery/desert/camp-evening-320.webp 320w",
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
                root, generated_files, source_record, RESPONSIVE_WIDTHS
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
                root, generated_files, image_sources, RESPONSIVE_WIDTHS
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
                    root, generated_files, image_sources, RESPONSIVE_WIDTHS
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
                    'const icon = new URL("./icons.svg", import.meta.url);\n'
                    '// import "./comment-only-missing.js";\n'
                    '/* export { missing } from "./comment-export-only.js"; */\n'
                    "const example = 'import \"./string-only-missing.js\"';\n"
                    "const template = " + chr(96) + 'import("./template-only-missing.js")' + chr(96) + ";"
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

            script_path.write_text(
                'import("./missing-dynamic.js");',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "broken local asset reference.*missing-dynamic.js"):
                _PACKAGE_PREVIEW.validate_runtime_asset_closure(root)

            script_path.write_text(
                'const icon = new URL("./missing-icon.svg", import.meta.url);',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "broken local asset reference.*missing-icon.svg"):
                _PACKAGE_PREVIEW.validate_runtime_asset_closure(root)

            script_path.write_text(
                "const template = " + chr(96) + "$" +
                "{import(\"./missing-template-expression.js\")}" + chr(96) + ";",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                RuntimeError,
                "broken local asset reference.*missing-template-expression.js",
            ):
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

    def test_hosting_delivery_contract_requires_safe_headers_bounded_caches_and_compression(self) -> None:
        htaccess = (Path(__file__).resolve().parents[1] / ".htaccess").read_text(encoding="utf-8")
        report = _PACKAGE_PREVIEW.validate_hosting_delivery_contract(htaccess)
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["htmlCachePolicy"], "NO_CACHE_MUST_REVALIDATE")
        self.assertTrue(report["nonCanonicalHostNoIndex"])
        self.assertEqual(report["cacheLifetimesSeconds"]["text/html"], 0)
        self.assertEqual(report["cacheLifetimesSeconds"]["image/webp"], 30 * 24 * 60 * 60)
        self.assertEqual(len(report["securityHeaders"]), 3)
        self.assertIn("application/javascript", report["compressionMimeTypes"])

        invalid_policies = (
            (
                htaccess.replace('  Header always set X-Content-Type-Options "nosniff"\n', ""),
                "Hosting security header is missing or unsafe: X-Content-Type-Options.",
            ),
            (
                htaccess.replace(
                    'Header always set Cache-Control "no-cache, must-revalidate"',
                    'Header always set Cache-Control "public, max-age=31536000"',
                ),
                "HTML responses must use no-cache, must-revalidate",
            ),
            (
                htaccess.replace(
                    'ExpiresByType image/webp "access plus 30 days"',
                    'ExpiresByType image/webp "access plus 1 year"',
                ),
                "Hosting cache lifetime for image/webp must be 30 days",
            ),
            (
                htaccess.replace(
                    "AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json image/svg+xml application/xml",
                    "AddOutputFilterByType DEFLATE text/html text/plain text/css application/json image/svg+xml application/xml",
                ),
                "Hosting compression directive is missing required MIME types: application/javascript",
            ),
        )
        for invalid_htaccess, expected_error in invalid_policies:
            with self.subTest(expected_error=expected_error):
                with self.assertRaisesRegex(RuntimeError, expected_error):
                    _PACKAGE_PREVIEW.validate_hosting_delivery_contract(invalid_htaccess)

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
                "responsiveImageDelivery": {
                    "deliveryEvidence": {
                        "measurementClass": "packaged-chromium-laboratory-diagnostic",
                        "fieldDataAvailable": False,
                        "candidateBytesAreTransferMeasurements": False,
                        "candidateSavingsVersusJpegFallbackInferred": False,
                    }
                },
                "editorialDraftIsolation": {
                    "status": "PASS",
                    "previewDirectoryExcluded": True,
                    "draftSourceRecordsExcluded": True,
                    "previewAssetsExcluded": True,
                    "generatedBlogHtmlRoutes": 0,
                },
                "packageMetrics": {
                    "uncompressedPayloadBytes": len(payload),
                    "uncompressedBudgetBytes": 18 * 1024 * 1024,
                    "sizeBudgetPassed": True,
                },
                "hostingDelivery": _PACKAGE_PREVIEW.validate_hosting_delivery_contract(
                    (Path(__file__).resolve().parents[1] / ".htaccess").read_text(encoding="utf-8")
                ),
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

            # The release gate must reject evidence that mislabels candidate sizes as field or transfer measurements.
            manifest["responsiveImageDelivery"]["deliveryEvidence"]["fieldDataAvailable"] = True
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "distinguish packaged candidate sizes"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["responsiveImageDelivery"]["deliveryEvidence"]["fieldDataAvailable"] = False
            manifest["responsiveImageDelivery"]["deliveryEvidence"]["candidateBytesAreTransferMeasurements"] = True
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "distinguish packaged candidate sizes"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["responsiveImageDelivery"]["deliveryEvidence"]["candidateBytesAreTransferMeasurements"] = False
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            # A complete manifest and matching payload must remain packageable.
            _PACKAGE_PREVIEW.deterministic_archive(output, archive)

            manifest["editorialDraftIsolation"]["previewAssetsExcluded"] = False
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "draft editorial content and preview assets are excluded"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["editorialDraftIsolation"]["previewAssetsExcluded"] = True
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

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

            manifest["hostingDelivery"]["status"] = "FAIL"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "passing hosting security, caching and compression contract"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["hostingDelivery"]["status"] = "PASS"
            manifest["hostingDelivery"]["securityHeaders"]["X-Content-Type-Options"] = "unsafe"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "hosting security header is invalid: X-Content-Type-Options"):
                _PACKAGE_PREVIEW.deterministic_archive(output, archive)
            manifest["hostingDelivery"]["securityHeaders"]["X-Content-Type-Options"] = "nosniff"
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
            create_webp(root, "rooms/sweet-purple.webp", (900, 600))
            create_webp(root, "rooms/haveli-sitting-room.webp", (900, 600))
            create_webp(root, "directions/haveli-facade.webp", (900, 600))
            create_webp(root, "gallery/hotel/fort-from-roof.webp", (900, 600))
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
                "legacy/camel-sunset.jpg",
                "experiences/open-air-sleeping-setup.jpeg",
                "experiences/sleep-under-stars-dusk-camp.jpeg",
                "experiences/sleep-under-stars-shelter.jpeg",
                "experiences/half-day-jaisalmer-tour.jpg",
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
                '<section class="experience-detail-section experience-detail-section--visual">'
                '<figure class="experience-detail-media"><img src="assets/images/legacy/camel-sunset.jpg" '
                'alt="Camel caravan"></figure></section>'
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
            detail_sizes = (
                '(max-width: 900px) min(620px, calc(100vw - 76px)), '
                'min(460px, 36vw)'
            )
            self.assertIn('sizes="100vw"', result)
            self.assertIn(f'sizes="{experience_sizes}"', result)
            self.assertIn(f'imagesizes="{experience_sizes}"', result)
            self.assertIn(f'sizes="{room_sizes}"', result)
            self.assertIn(f'sizes="{gallery_sizes}"', result)
            self.assertIn(f'sizes="{detail_sizes}"', result)
            self.assertIn('assets/images/responsive/legacy/camel-sunset-320.webp 320w', result)
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
