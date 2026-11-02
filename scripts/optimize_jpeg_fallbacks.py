#!/usr/bin/env python3
"""Optimize only staged JPEG compatibility fallbacks with measurable quality safeguards.

Original repository images are never modified: this module is called against the
isolated staging package after WebP/AVIF candidates have been generated.
"""
from __future__ import annotations

import hashlib
import io
import math
import os
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any

from PIL import Image, ImageChops, ImageStat

QUALITY_LADDER = tuple(range(98, 69, -2))
MINIMUM_PSNR_DB = 35.0
MINIMUM_SAVINGS_PERCENT = 5.0
MAX_PIXELS = 64_000_000


def _psnr_db(reference: Image.Image, candidate: Image.Image) -> float:
    left = reference.convert("RGB")
    right = candidate.convert("RGB")
    if left.size != right.size:
        raise ValueError("JPEG fallback optimization changed image dimensions")
    rms = ImageStat.Stat(ImageChops.difference(left, right)).rms
    mse = sum(channel * channel for channel in rms) / len(rms)
    return float("inf") if mse == 0 else 20 * math.log10(255 / math.sqrt(mse))


def _safe_fallback_path(root: Path, relative: str) -> Path:
    if not isinstance(relative, str):
        raise ValueError(f"Unsafe JPEG fallback path: {relative!r}")
    value = PurePosixPath(relative)
    if (
        not relative
        or value.is_absolute()
        or value.as_posix() != relative
        or any(part in {"", ".", ".."} for part in value.parts)
        or not relative.startswith("assets/images/")
        or value.suffix.lower() not in {".jpg", ".jpeg"}
    ):
        raise ValueError(f"Unsafe JPEG fallback path: {relative!r}")
    root_path = Path(os.path.abspath(os.fspath(root)))
    if root_path.is_symlink() or not root_path.is_dir():
        raise ValueError("JPEG optimization root must be an existing non-symlink directory")
    candidate = root_path.joinpath(*value.parts)
    current = root_path
    for part in value.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing symlinked JPEG fallback path: {relative}")
    if not candidate.is_file() or not candidate.resolve().is_relative_to(root_path.resolve()):
        raise FileNotFoundError(f"Missing or escaping JPEG fallback: {relative}")
    return candidate


def optimize_jpeg_fallbacks(root: Path, image_sources: list[dict[str, Any]]) -> dict:
    """Re-encode safe non-hero JPEG fallbacks only when both quality and size gates pass.

    WebP/AVIF generation and validation must run before this function. Files with
    hero delivery or AVIF source-provenance bindings are left byte-identical.
    Retained counterparts of package-pruned exact duplicates are immutable too.
    """
    root_path = Path(os.path.abspath(os.fspath(root)))
    if root_path.is_symlink() or not root_path.is_dir():
        raise ValueError("JPEG optimization root must be an existing non-symlink directory")

    records: list[dict] = []
    original_total = 0
    optimized_total = 0
    optimized_count = 0
    protected_count = 0
    unchanged_count = 0

    for source_record in image_sources:
        if not isinstance(source_record, dict):
            raise ValueError("JPEG fallback source metadata must be an object")
        relative = source_record.get("sourceJpeg")
        path = _safe_fallback_path(root_path, relative)
        original_bytes = path.read_bytes()
        original_size = len(original_bytes)
        original_total += original_size
        original_sha256 = hashlib.sha256(original_bytes).hexdigest()

        protected_reason = None
        if source_record.get("preserveSourceIdentity") is True:
            protected_reason = "retained-duplicate-source-identity"
        elif source_record.get("heroDeliveryAvif"):
            protected_reason = "source-provenance-bound-avif"
        elif source_record.get("heroDeliveryWebp"):
            protected_reason = "hero-delivery-quality-protected"

        if protected_reason:
            source_record["fallbackBytes"] = original_size
            source_record["fallbackSha256"] = original_sha256
            optimized_total += original_size
            protected_count += 1
            records.append({
                "path": relative,
                "status": "SKIPPED_PROTECTED_DUPLICATE_IDENTITY" if protected_reason == "retained-duplicate-source-identity" else "SKIPPED_PROTECTED_SOURCE",
                "reason": protected_reason,
                "originalBytes": original_size,
                "optimizedBytes": original_size,
                "savedBytes": 0,
                "originalSha256": original_sha256,
            })
            continue

        with Image.open(path) as opened:
            if opened.format != "JPEG":
                raise ValueError(f"Approved fallback is not JPEG: {relative}")
            if opened.width < 1 or opened.height < 1 or opened.width * opened.height > MAX_PIXELS:
                raise ValueError(f"JPEG fallback exceeds safe decoded pixel bounds: {relative}")
            if opened.mode != "RGB":
                source_record["fallbackBytes"] = original_size
                source_record["fallbackSha256"] = original_sha256
                optimized_total += original_size
                unchanged_count += 1
                records.append({
                    "path": relative,
                    "status": "SKIPPED_UNSUPPORTED_COLOR_MODE",
                    "originalBytes": original_size,
                    "optimizedBytes": original_size,
                    "savedBytes": 0,
                    "originalSha256": original_sha256,
                    "mode": opened.mode,
                })
                continue
            original = opened.copy()
            original.load()
            icc_profile = opened.info.get("icc_profile")
            exif = opened.info.get("exif")
            original_dimensions = original.size
            original_orientation = opened.getexif().get(274)
            reference_rgb = original.convert("RGB")

        chosen: tuple[int, bytes, float, bool, bool] | None = None
        for quality in QUALITY_LADDER:
            buffer = io.BytesIO()
            options: dict[str, Any] = {
                "quality": quality,
                "optimize": True,
                "progressive": True,
            }
            if icc_profile:
                options["icc_profile"] = icc_profile
            if exif:
                options["exif"] = exif
            original.save(buffer, format="JPEG", **options)
            payload = buffer.getvalue()
            if len(payload) > original_size * (1 - MINIMUM_SAVINGS_PERCENT / 100):
                continue

            with Image.open(io.BytesIO(payload)) as candidate_opened:
                candidate_opened.load()
                if candidate_opened.format != "JPEG" or candidate_opened.size != original_dimensions:
                    raise RuntimeError(f"Optimized JPEG failed format/dimension validation: {relative}")
                candidate_icc = candidate_opened.info.get("icc_profile")
                candidate_exif = candidate_opened.info.get("exif")
                candidate_orientation = candidate_opened.getexif().get(274)
                icc_preserved = candidate_icc == icc_profile
                exif_preserved = candidate_orientation == original_orientation and (
                    not exif or candidate_exif == exif
                )
                if not icc_preserved or not exif_preserved:
                    raise RuntimeError(f"Optimized JPEG metadata changed: {relative}")
                candidate_rgb = candidate_opened.convert("RGB")
                measured_psnr = _psnr_db(reference_rgb, candidate_rgb)
            if measured_psnr >= MINIMUM_PSNR_DB:
                chosen = (quality, payload, measured_psnr, icc_preserved, exif_preserved)
                break

        if chosen is None:
            source_record["fallbackBytes"] = original_size
            source_record["fallbackSha256"] = original_sha256
            optimized_total += original_size
            unchanged_count += 1
            records.append({
                "path": relative,
                "status": "SKIPPED_NO_QUALIFYING_CANDIDATE",
                "originalBytes": original_size,
                "optimizedBytes": original_size,
                "savedBytes": 0,
                "originalSha256": original_sha256,
                "minimumPsnrDb": MINIMUM_PSNR_DB,
                "minimumSavingsPercent": MINIMUM_SAVINGS_PERCENT,
            })
            continue

        quality, payload, measured_psnr, icc_preserved, exif_preserved = chosen
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".optimized.tmp", dir=path.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(payload)
            if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root_path.resolve()):
                raise ValueError(f"JPEG fallback changed or became unsafe during optimization: {relative}")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

        optimized_size = path.stat().st_size
        optimized_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        saved_bytes = original_size - optimized_size
        saved_percent = (saved_bytes / original_size * 100) if original_size else 0.0
        if saved_bytes < 1 or saved_percent < MINIMUM_SAVINGS_PERCENT:
            raise RuntimeError(f"JPEG fallback did not meet the required byte savings after write: {relative}")
        source_record["fallbackBytes"] = optimized_size
        source_record["fallbackSha256"] = optimized_sha256
        optimized_total += optimized_size
        optimized_count += 1
        records.append({
            "path": relative,
            "status": "OPTIMIZED",
            "originalBytes": original_size,
            "optimizedBytes": optimized_size,
            "savedBytes": saved_bytes,
            "savedPercent": round(saved_percent, 3),
            "quality": quality,
            "psnrDb": round(measured_psnr, 3),
            "minimumPsnrDb": MINIMUM_PSNR_DB,
            "minimumSavingsPercent": MINIMUM_SAVINGS_PERCENT,
            "originalSha256": original_sha256,
            "optimizedSha256": optimized_sha256,
            "iccProfilePreserved": icc_preserved,
            "exifOrientationPreserved": exif_preserved,
            "dimensionsPreserved": True,
        })

    saved_bytes = original_total - optimized_total
    return {
        "status": "PASS",
        "scope": "isolated-staging-package-jpeg-compatibility-fallbacks-only",
        "sourceRepositoryMutated": False,
        "fallbackCount": len(records),
        "optimizedFallbackCount": optimized_count,
        "protectedFallbackCount": protected_count,
        "unchangedFallbackCount": unchanged_count,
        "originalBytes": original_total,
        "optimizedBytes": optimized_total,
        "savedBytes": saved_bytes,
        "savedPercent": round(saved_bytes / original_total * 100, 3) if original_total else 0.0,
        "minimumPsnrDb": MINIMUM_PSNR_DB,
        "minimumSavingsPercent": MINIMUM_SAVINGS_PERCENT,
        "qualityLadder": list(QUALITY_LADDER),
        "files": records,
    }
