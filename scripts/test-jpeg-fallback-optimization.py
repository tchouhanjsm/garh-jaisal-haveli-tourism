#!/usr/bin/env python3
"""Regression tests for package-only JPEG compatibility fallback optimization."""
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "jpeg_fallback_optimizer", ROOT / "scripts" / "optimize_jpeg_fallbacks.py"
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load the JPEG fallback optimizer")
optimizer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(optimizer)


def make_fixture_jpeg(path: Path, quality: int = 98) -> tuple[bytes, tuple[int, int]]:
    image = Image.new("RGB", (720, 480), (185, 150, 105))
    draw = ImageDraw.Draw(image)
    for x in range(0, 720, 12):
        draw.line((x, 0, 719 - x // 3, 479), fill=(x % 255, (x * 2) % 255, 125), width=2)
    for y in range(0, 480, 18):
        draw.rectangle((0, y, 719, min(y + 4, 479)), fill=((y * 2) % 255, 185, 135))
    exif = Image.Exif()
    exif[274] = 1
    icc = b"fixture-profile-preserved-byte-for-byte"
    image.save(path, format="JPEG", quality=quality, icc_profile=icc, exif=exif)
    return icc, image.size


with tempfile.TemporaryDirectory(prefix="garh-jpeg-fallback-optimizer-") as temporary:
    root = Path(temporary)
    image_path = root / "assets" / "images" / "fixture.jpg"
    image_path.parent.mkdir(parents=True)
    icc, dimensions = make_fixture_jpeg(image_path)
    original_bytes = image_path.stat().st_size
    source_records = [{"sourceJpeg": "assets/images/fixture.jpg"}]
    report = optimizer.optimize_jpeg_fallbacks(root, source_records)
    result = report["files"][0]
    assert report["status"] == "PASS"
    assert report["optimizedFallbackCount"] == 1
    assert result["status"] == "OPTIMIZED"
    assert result["savedBytes"] >= original_bytes * 0.05
    assert result["psnrDb"] >= optimizer.MINIMUM_PSNR_DB
    assert result["quality"] == 98, "The optimizer must try the highest quality candidate first."
    assert optimizer.QUALITY_LADDER[-1] == 70, "The quality ladder must test all high-quality candidates down to 70."
    assert source_records[0]["fallbackBytes"] == image_path.stat().st_size
    assert source_records[0]["fallbackSha256"] == result["optimizedSha256"]
    with Image.open(image_path) as optimized:
        optimized.load()
        assert optimized.format == "JPEG"
        assert optimized.size == dimensions
        assert optimized.info.get("icc_profile") == icc
        assert optimized.getexif().get(274) == 1

with tempfile.TemporaryDirectory(prefix="garh-jpeg-fallback-protected-") as temporary:
    root = Path(temporary)
    image_path = root / "assets" / "images" / "hero.jpg"
    image_path.parent.mkdir(parents=True)
    make_fixture_jpeg(image_path)
    original = image_path.read_bytes()
    report = optimizer.optimize_jpeg_fallbacks(
        root, [{"sourceJpeg": "assets/images/hero.jpg", "heroDeliveryWebp": "assets/images/hero.webp"}]
    )
    assert report["protectedFallbackCount"] == 1
    assert report["files"][0]["status"] == "SKIPPED_PROTECTED_SOURCE"
    assert image_path.read_bytes() == original

with tempfile.TemporaryDirectory(prefix="garh-jpeg-fallback-avif-protected-") as temporary:
    root = Path(temporary)
    image_path = root / "assets" / "images" / "courtyard.jpg"
    image_path.parent.mkdir(parents=True)
    make_fixture_jpeg(image_path)
    original = image_path.read_bytes()
    report = optimizer.optimize_jpeg_fallbacks(
        root, [{"sourceJpeg": "assets/images/courtyard.jpg", "heroDeliveryAvif": {"path": "assets/images/courtyard.avif"}}]
    )
    assert report["protectedFallbackCount"] == 1
    assert image_path.read_bytes() == original

with tempfile.TemporaryDirectory(prefix="garh-jpeg-fallback-no-candidate-") as temporary:
    root = Path(temporary)
    image_path = root / "assets" / "images" / "low-quality.jpg"
    image_path.parent.mkdir(parents=True)
    make_fixture_jpeg(image_path, quality=70)
    original = image_path.read_bytes()
    records = [{"sourceJpeg": "assets/images/low-quality.jpg"}]
    report = optimizer.optimize_jpeg_fallbacks(root, records)
    assert report["unchangedFallbackCount"] == 1
    assert report["optimizedFallbackCount"] == 0
    assert report["files"][0]["status"] == "SKIPPED_NO_QUALIFYING_CANDIDATE"
    assert image_path.read_bytes() == original
    assert records[0]["fallbackBytes"] == len(original)
    assert records[0]["fallbackSha256"] is not None

with tempfile.TemporaryDirectory(prefix="garh-jpeg-fallback-path-") as temporary:
    root = Path(temporary)
    try:
        optimizer.optimize_jpeg_fallbacks(root, [{"sourceJpeg": "../outside.jpg"}])
    except ValueError:
        pass
    else:
        raise AssertionError("JPEG optimizer must reject unsafe source paths")

print(
    "PASS: staged JPEG fallback compression preserves dimensions/ICC/EXIF, meets quality and savings floors, "
    "protects hero/source-provenance assets, and leaves source checkout files untouched."
)
