#!/usr/bin/env python3
"""Generate responsive WebP variants and safely rewrite known site image references."""

from __future__ import annotations

import argparse
import hashlib
import math
import os
from pathlib import Path, PurePosixPath
import re
import tempfile

from PIL import Image, ImageChops, ImageOps, ImageStat

# Explicitly allow only source photos confirmed in current runtime routes.
# Art-directed pictures are included only with a source-backed WebP override below.
IMAGE_NAMES = (
    "rest3.jpg",
    "courtyard.jpg",
    "scarlet.jpg",
    "tent.jpg",
    "legacy/camel-day.jpg",
    "legacy/camel-sunset.jpg",
    "legacy/fort-temple-spires.jpg",
    "rooms/rising-sun.jpg",
    "rooms/opium.jpg",
    "rooms/haveli-interior.jpg",
    "rooms/sweet-purple.jpg",
    "rooms/red-maharani.jpg",
    "rooms/green.jpg",
    "rooms/bluesky.jpg",
    "experiences/cultural-programme.jpg",
    "experiences/half-day-jaisalmer-tour.jpg",
    "experiences/sleep-under-stars-shelter.jpeg",
    "experiences/sleep-under-stars-dusk-camp.jpeg",
    "experiences/open-air-sleeping-setup.jpeg",
    "experiences/swiss-tent-detail.jpeg",
    "experiences/heritage-architecture.jpg",
    "gallery/desert/camp-evening.jpeg",
    "gallery/desert/camp-from-above.jpeg",
    "gallery/hotel/fort-from-roof.jpg",
    "dining/rooftop-candlelit-table.jpg",
    "directions/haveli-facade.jpg",
)
# Sweet Purple, the Rooms hero and the rooftop panorama use source-backed WebP assets.
# Their JPEGs are compatibility fallbacks; never regenerate over the original WebP files.
RESPONSIVE_SOURCE_OVERRIDES = {
    "rooms/sweet-purple.jpg": "rooms/sweet-purple.webp",
    "rooms/haveli-interior.jpg": "rooms/haveli-sitting-room.webp",
    "gallery/hotel/fort-from-roof.jpg": "gallery/hotel/fort-from-roof.webp",
}
SOURCE_PREFIX = (
    "https://raw.githubusercontent.com/"
    "tchouhanjsm/garh-jaisal-website/main/img/"
)
RESPONSIVE_WIDTHS = (320, 480, 768, 1200, 1600)
# M27 first-view evidence showed 1200px-to-1600px jumps for two-column cards
# at high DPR. Add a 1280px bridge only for the three measured Gallery assets.
RESPONSIVE_WIDTH_OVERRIDES = {
    "courtyard.jpg": (320, 480, 768, 1200, 1280, 1600),
    "gallery/hotel/fort-from-roof.jpg": (320, 480, 768, 800, 1200, 1280, 1600),
    "legacy/camel-day.jpg": (320, 480, 768, 1200, 1280, 1600),
    "legacy/fort-temple-spires.jpg": (320, 480, 768, 1200, 1280, 1600),
    "rooms/haveli-interior.jpg": (320, 480, 768, 800, 1200, 1280),
}
MAX_PIXELS = 64_000_000
WEBP_QUALITY = 82
# Mirrors quality_overrides in the authoritative source repository's
# responsive-image-assets-manifest.json for these JPEG-derived images.
SOURCE_QUALITY_OVERRIDES = {
    "courtyard.jpg": 70,
    "directions/haveli-facade.jpg": 70,
}
# Byte ceilings protect high-value responsive candidates without changing
# JPEG fallbacks or independently source-backed WebP originals.
RESPONSIVE_VARIANT_MAX_BYTES = {
    "assets/images/responsive/courtyard-1200.webp": 250_000,
    "assets/images/responsive/courtyard-1600.webp": 250_000,
    "assets/images/responsive/courtyard-1280.webp": 145_000,
    "assets/images/responsive/rooms/haveli-interior-800.webp": 95_000,
    "assets/images/responsive/rooms/haveli-interior-1200.webp": 180_000,
    "assets/images/responsive/rooms/haveli-interior-1280.webp": 190_000,
    "assets/images/responsive/rooms/haveli-interior-1600.webp": 240_000,
    "assets/images/responsive/rooms/sweet-purple-320.webp": 30_000,
    "assets/images/responsive/rooms/sweet-purple-480.webp": 50_000,
    "assets/images/responsive/rooms/sweet-purple-768.webp": 100_000,
    "assets/images/responsive/rooms/sweet-purple-1200.webp": 180_000,
    "assets/images/responsive/rooms/sweet-purple-1600.webp": 240_000,
    "assets/images/responsive/rooms/rising-sun-320.webp": 30_000,
    "assets/images/responsive/rooms/rising-sun-480.webp": 50_000,
    "assets/images/responsive/rooms/rising-sun-768.webp": 95_000,
    "assets/images/responsive/rooms/red-maharani-320.webp": 30_000,
    "assets/images/responsive/rooms/red-maharani-480.webp": 55_000,
    "assets/images/responsive/rooms/red-maharani-768.webp": 110_000,
    "assets/images/responsive/directions/haveli-facade-320.webp": 50_000,
    "assets/images/responsive/directions/haveli-facade-480.webp": 90_000,
    "assets/images/responsive/directions/haveli-facade-768.webp": 200_000,
    "assets/images/responsive/directions/haveli-facade-1200.webp": 250_000,
    "assets/images/responsive/legacy/camel-day-1200.webp": 170_000,
    "assets/images/responsive/legacy/camel-day-1280.webp": 185_000,
    "assets/images/responsive/legacy/fort-temple-spires-1200.webp": 100_000,
    "assets/images/responsive/legacy/fort-temple-spires-1280.webp": 105_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-320.webp": 20_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-480.webp": 35_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-768.webp": 80_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-800.webp": 80_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-1200.webp": 170_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-1280.webp": 180_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-1600.webp": 250_000,
    "assets/images/responsive/gallery/hotel/fort-from-roof-2000.webp": 260_000,
}
# JPEG-derived WebPs with explicit ceilings may be regenerated in the isolated package;
# original JPEG fallbacks remain unchanged.
FULL_SIZE_WEBP_MAX_BYTES = {
    "assets/images/courtyard.webp": 450_000,
    "assets/images/directions/haveli-facade.webp": 400_000,
    "assets/images/legacy/camel-day.webp": 210_000,
    "assets/images/legacy/fort-temple-spires.webp": 120_000,
}
BUDGET_QUALITY_FLOOR = 58
BUDGET_QUALITY_STEP = 2

# These same-dimension derivatives are generated from verified JPEG fallbacks.
# Original source-backed WebPs remain untouched and continue serving non-hero references.
HERO_DELIVERY_VARIANTS = {
    "gallery/hotel/fort-from-roof.jpg": {
        "quality": 84,
        "minPsnrDb": 35.0,
        "minimumSavingsPercent": 10.0,
        "maxBytesByWidth": {2000: 260_000},
    },
    "rooms/haveli-interior.jpg": {
        "quality": 84,
        "minPsnrDb": 35.0,
        "minimumSavingsPercent": 10.0,
        "maxBytesByWidth": {1600: 240_000},
    },
}


AVIF_HERO_DELIVERY_VARIANTS = {
    "courtyard.jpg": {
        "quality": 54,
        "sourceGitBlobSha": "13c01ff7ca772a3fc6909698c82e4edab6485295",
        "minPsnrDb": 35.0,
        "minimumSavingsPercent": 10.0,
        "media": "(min-width: 1160px) and (min-resolution: 1.5dppx)",
        "webpPreloadMedia": "not all and (min-width: 1160px) and (min-resolution: 1.5dppx)",
    },
}


def _resolve_site_root(root: Path) -> Path:
    """Resolve an existing site root without accepting a symlink as the root itself."""
    candidate = Path(os.path.abspath(os.fspath(root)))
    if candidate.is_symlink():
        raise ValueError(f"Refusing symlinked site root: {candidate}")
    if not candidate.is_dir():
        raise NotADirectoryError(f"site root is not a directory: {candidate}")
    return candidate.resolve()


def _safe_directory(root: Path, relative: Path, *, create: bool = False) -> Path:
    """Walk a repository-relative directory without following symlink components."""
    root = _resolve_site_root(root)
    relative = Path(relative)
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        raise ValueError(f"Unsafe relative image directory: {relative}")

    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing symlinked image directory: {current}")
        if current.exists():
            if not current.is_dir():
                raise ValueError(f"Image path component is not a directory: {current}")
        elif create:
            current.mkdir()
        else:
            raise FileNotFoundError(f"Missing image directory: {current}")

        resolved = current.resolve()
        if not resolved.is_relative_to(root):
            raise ValueError(f"Image directory escapes site root: {current}")
    return current
IMG_PATTERN = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
SOURCE_TAG_PATTERN = re.compile(r"<source\b[^>]*>", re.IGNORECASE)
PICTURE_PATTERN = re.compile(r"<picture\b[^>]*>[\s\S]*?</picture\s*>", re.IGNORECASE)
LINK_PATTERN = re.compile(r"<link\b[^>]*>", re.IGNORECASE)


def get_attribute(tag: str, name: str) -> str | None:
    """Read one quoted or unquoted HTML attribute from a start tag."""
    match = re.search(
        rf"(?<![\w:-]){re.escape(name)}\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))",
        tag,
        re.IGNORECASE,
    )
    if not match:
        return None
    return next((value for value in match.groups() if value is not None), "")


def set_attribute(tag: str, name: str, value: str) -> str:
    """Set an HTML attribute without creating duplicates."""
    pattern = re.compile(
        rf"(?<![\w:-]){re.escape(name)}\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)",
        re.IGNORECASE,
    )
    replacement = f'{name}="{value}"'
    if pattern.search(tag):
        return pattern.sub(replacement, tag, count=1)
    return tag[:-1].rstrip() + " " + replacement + ">"


def _save_webp(
    image: Image.Image,
    target: Path,
    icc_profile: bytes | None,
    *,
    preserve_different_existing: bool = False,
    quality: int = WEBP_QUALITY,
    max_bytes: int | None = None,
) -> dict:
    """Write a verified WebP; budgeted variants keep the highest quality that fits."""
    if target.parent.is_symlink():
        raise ValueError(f"Refusing to write through a symlinked image directory: {target.parent}")
    if isinstance(quality, bool) or not isinstance(quality, int) or not 1 <= quality <= 100:
        raise ValueError(f"Invalid WebP quality: {quality!r}")
    if max_bytes is not None and (
        isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or max_bytes < 1
    ):
        raise ValueError(f"Invalid responsive image byte budget: {max_bytes!r}")
    if max_bytes is not None and quality < BUDGET_QUALITY_FLOOR:
        raise ValueError("Budget quality floor exceeds the starting WebP quality")

    qualities = (
        [quality]
        if max_bytes is None
        else list(range(quality, BUDGET_QUALITY_FLOOR - 1, -BUDGET_QUALITY_STEP))
    )
    attempts: list[dict] = []
    temporary = target.with_name(target.name + ".tmp")
    for candidate_quality in qualities:
        for candidate in (target, temporary):
            if candidate.is_symlink():
                raise ValueError(f"Refusing to replace a symlinked image output: {candidate}")
            if candidate.exists() and not candidate.is_file():
                raise ValueError(f"Image output is not a regular file: {candidate}")
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            kwargs = {"quality": candidate_quality, "method": 6}
            if icc_profile:
                kwargs["icc_profile"] = icc_profile
            image.save(temporary, format="WEBP", **kwargs)
            with Image.open(temporary) as check:
                check.load()
                if check.format != "WEBP" or check.size != image.size:
                    raise RuntimeError(f"WebP verification mismatch: {target}")
            candidate_bytes = temporary.stat().st_size
            attempts.append({"quality": candidate_quality, "bytes": candidate_bytes})
            if max_bytes is not None and candidate_bytes > max_bytes:
                temporary.unlink(missing_ok=True)
                continue

            if target.is_file():
                if target.read_bytes() == temporary.read_bytes():
                    temporary.unlink()
                elif preserve_different_existing:
                    raise FileExistsError(
                        f"Refusing to overwrite an existing WebP source with a generated derivative: {target}"
                    )
                else:
                    temporary.replace(target)
            else:
                temporary.replace(target)
            return {
                "quality": candidate_quality,
                "qualityAttempts": attempts,
                "maxBytes": max_bytes,
            }
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

    attempt_summary = ", ".join(
        f"q{item['quality']}={item['bytes']}B" for item in attempts
    )
    raise RuntimeError(
        f"Responsive WebP cannot meet the {max_bytes}-byte budget at or above "
        f"quality {BUDGET_QUALITY_FLOOR}: {target} ({attempt_summary})"
    )

def _psnr_db(reference: Image.Image, candidate: Image.Image) -> float:
    """Measure RGB PSNR between same-dimension source and encoded candidate images."""
    left = reference.convert("RGB")
    right = candidate.convert("RGB")
    if left.size != right.size:
        raise ValueError(f"PSNR dimensions differ: {left.size} vs {right.size}")
    rms = ImageStat.Stat(ImageChops.difference(left, right)).rms
    mse = sum(channel * channel for channel in rms) / len(rms)
    return float("inf") if mse == 0 else 20 * math.log10(255 / math.sqrt(mse))


def _validate_source_image_header(image: Image.Image, filename: str) -> None:
    """Reject unexpected formats and excessive pixel counts before decoding bytes."""
    expected_format = "WEBP" if PurePosixPath(filename).suffix.lower() == ".webp" else "JPEG"
    if image.format != expected_format:
        raise ValueError(f"Responsive image source format must be {expected_format}: {filename}")
    if image.width < 1 or image.height < 1 or image.width * image.height > MAX_PIXELS:
        raise ValueError(f"Source image dimensions exceed safe bounds: {filename}")


def _validated_image_relative_path(filename: str) -> Path:
    """Accept only canonical JPEG paths beneath assets/images."""
    relative = PurePosixPath(filename)
    if (
        not filename
        or relative.is_absolute()
        or relative.as_posix() != filename
        or any(part in {"", ".", ".."} for part in relative.parts)
        or relative.suffix.lower() not in {".jpg", ".jpeg", ".webp"}
    ):
        raise ValueError(f"Unsafe responsive image source path: {filename}")
    return Path(*relative.parts)


def _source_url(filename: str) -> str:
    """Return the stable public URL for an approved source JPEG."""
    relative = PurePosixPath(filename)
    return (PurePosixPath("assets/images") / relative).as_posix()


def _full_size_webp_url(filename: str) -> str:
    """Return the full-size candidate without replacing an independently sourced WebP."""
    override = RESPONSIVE_SOURCE_OVERRIDES.get(filename)
    if override:
        return (PurePosixPath("assets/images") / PurePosixPath(override)).as_posix()
    relative = PurePosixPath(filename)
    return (
        PurePosixPath("assets/images")
        / relative.parent
        / f"{relative.stem}.webp"
    ).as_posix()


def _responsive_source_filename(filename: str) -> str:
    """Return the actual image used to build candidates; overrides are explicit and source-backed."""
    return RESPONSIVE_SOURCE_OVERRIDES.get(filename, filename)


def _responsive_webp_url(filename: str, width: int) -> str:
    """Store generated widths under responsive/ while retaining source-directory identity."""
    relative = PurePosixPath(filename)
    return (
        PurePosixPath("assets/images/responsive")
        / relative.parent
        / f"{relative.stem}-{width}.webp"
    ).as_posix()


def _image_source_file(root: Path, filename: str) -> Path:
    """Resolve an approved image through every directory without following symlinks."""
    relative = _validated_image_relative_path(filename)
    parent = _safe_directory(root, Path("assets/images") / relative.parent)
    return parent / relative.name


def _image_name_for_reference(reference: str) -> str | None:
    """Map only exact source/full-size URLs back to an approved source record."""
    value = reference.split("?", 1)[0].split("#", 1)[0]
    for filename in IMAGE_NAMES:
        if value in {_source_url(filename), _full_size_webp_url(filename)}:
            return filename
    return None


def generate_responsive_variants(
    root: Path, image_names: tuple[str, ...] = IMAGE_NAMES
) -> dict[str, dict]:
    """Generate verified full-size and downscaled WebP files for approved source paths."""
    root = _resolve_site_root(root)
    output: dict[str, dict] = {}
    _safe_directory(root, Path("assets/images/responsive"), create=True)
    seen_paths: set[str] = set()
    for filename in image_names:
        if filename not in IMAGE_NAMES:
            raise ValueError(f"Image is outside the responsive allowlist: {filename}")
        relative = _validated_image_relative_path(filename)
        if filename in seen_paths:
            raise ValueError(f"Duplicate responsive image source: {filename}")
        seen_paths.add(filename)
        source_filename = _responsive_source_filename(filename)
        source = _image_source_file(root, source_filename)
        fallback = _image_source_file(root, filename)
        if source.is_symlink() or not source.is_file() or source.stat().st_size <= 0:
            raise FileNotFoundError(f"Missing safe source image: {source}")
        if fallback.is_symlink() or not fallback.is_file() or fallback.stat().st_size <= 0:
            raise FileNotFoundError(f"Missing safe JPEG fallback: {fallback}")
        with Image.open(source) as opened:
            _validate_source_image_header(opened, source_filename)
            opened.load()
            icc_profile = opened.info.get("icc_profile")
            image = ImageOps.exif_transpose(opened)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            width, height = image.size
            full_size = root / _full_size_webp_url(filename)
            full_size_relative = full_size.relative_to(root).as_posix()
            full_size_max_bytes = None
            full_size_encoding = None
            if source_filename == filename:
                full_size_max_bytes = FULL_SIZE_WEBP_MAX_BYTES.get(full_size_relative)
                full_size_encoding = _save_webp(
                    image,
                    full_size,
                    icc_profile,
                    quality=SOURCE_QUALITY_OVERRIDES.get(filename, WEBP_QUALITY),
                    # Only an explicitly budgeted JPEG-derived output may be replaced.
                    preserve_different_existing=full_size_max_bytes is None,
                    max_bytes=full_size_max_bytes,
                )
                if full_size.stat().st_size >= source.stat().st_size:
                    raise RuntimeError(f"WebP derivative is not smaller than its JPEG source: {filename}")
            elif full_size != source:
                raise RuntimeError(f"Source-backed WebP override is invalid: {source_filename}")
            generated: list[dict] = []
            responsive_parent = _safe_directory(
                root,
                Path("assets/images/responsive") / relative.parent,
                create=True,
            )
            target_widths = RESPONSIVE_WIDTH_OVERRIDES.get(filename, RESPONSIVE_WIDTHS)
            for target_width in target_widths:
                if target_width >= width:
                    continue
                target_height = max(1, round(height * target_width / width))
                resized = image.resize(
                    (target_width, target_height),
                    Image.Resampling.LANCZOS,
                )
                target = responsive_parent / f"{relative.stem}-{target_width}.webp"
                target_relative = target.relative_to(root).as_posix()
                max_bytes = RESPONSIVE_VARIANT_MAX_BYTES.get(target_relative)
                encoding = _save_webp(
                    resized,
                    target,
                    icc_profile,
                    quality=SOURCE_QUALITY_OVERRIDES.get(filename, WEBP_QUALITY),
                    max_bytes=max_bytes,
                )
                generated.append(
                    {
                        "width": target_width,
                        "height": target_height,
                        "path": target_relative,
                        "bytes": target.stat().st_size,
                        "quality": encoding["quality"],
                        "qualityAttempts": encoding["qualityAttempts"],
                        "maxBytes": max_bytes,
                    }
                )

            hero_delivery_variant = None
            hero_config = HERO_DELIVERY_VARIANTS.get(filename)
            if hero_config:
                hero_relative = PurePosixPath(_hero_delivery_relative_path(filename, width))
                if hero_relative.is_absolute() or any(part in {"", ".", ".."} for part in hero_relative.parts):
                    raise ValueError(f"Unsafe hero delivery path for {filename}: {hero_relative}")
                hero_target = root / Path(*hero_relative.parts)
                hero_max_bytes = hero_config["maxBytesByWidth"].get(width)
                if hero_max_bytes is None:
                    hero_max_bytes = max(
                        1,
                        int(full_size.stat().st_size * (1 - float(hero_config["minimumSavingsPercent"]) / 100)),
                    )
                with Image.open(fallback) as fallback_opened:
                    _validate_source_image_header(fallback_opened, filename)
                    fallback_opened.load()
                    hero_icc_profile = fallback_opened.info.get("icc_profile")
                    hero_image = ImageOps.exif_transpose(fallback_opened)
                    if hero_image.size != (width, height):
                        raise ValueError(f"Hero JPEG fallback dimensions differ from source-backed WebP: {filename}")
                    if hero_image.mode not in ("RGB", "RGBA"):
                        hero_image = hero_image.convert("RGBA" if "A" in hero_image.getbands() else "RGB")
                    hero_encoding = _save_webp(
                        hero_image,
                        hero_target,
                        hero_icc_profile,
                        quality=hero_config["quality"],
                        max_bytes=hero_max_bytes,
                    )
                    with Image.open(hero_target) as hero_candidate:
                        hero_candidate.load()
                        if hero_candidate.format != "WEBP" or hero_candidate.size != (width, height):
                            raise RuntimeError(f"Hero delivery WebP verification mismatch: {hero_target}")
                        measured_psnr = _psnr_db(hero_image, hero_candidate)
                minimum_psnr = float(hero_config["minPsnrDb"])
                if measured_psnr < minimum_psnr:
                    raise RuntimeError(
                        f"Hero delivery candidate fails the {minimum_psnr:.2f} dB PSNR floor: "
                        f"{hero_config['path']} ({measured_psnr:.3f} dB)"
                    )
                source_webp_bytes = full_size.stat().st_size
                saved_percent = (
                    (source_webp_bytes - hero_target.stat().st_size) / source_webp_bytes * 100
                    if source_webp_bytes else 0.0
                )
                minimum_savings = float(hero_config["minimumSavingsPercent"])
                if saved_percent < minimum_savings:
                    raise RuntimeError(
                        f"Hero delivery candidate saves less than {minimum_savings:.1f}% "
                        f"against its preserved source WebP: {hero_config['path']}"
                    )
                hero_delivery_variant = {
                    "width": width,
                    "height": height,
                    "path": hero_relative.as_posix(),
                    "bytes": hero_target.stat().st_size,
                    "quality": hero_encoding["quality"],
                    "qualityAttempts": hero_encoding["qualityAttempts"],
                    "maxBytes": hero_max_bytes,
                    "psnrDb": round(measured_psnr, 3),
                    "minPsnrDb": minimum_psnr,
                    "minimumSavingsPercent": minimum_savings,
                    "savedPercent": round(saved_percent, 3),
                }

            hero_delivery_avif = None
            hero_delivery_avif_skipped_reason = None
            avif_config = AVIF_HERO_DELIVERY_VARIANTS.get(filename)
            actual_source_git_blob_sha = _git_blob_sha1(fallback) if avif_config else None
            if avif_config and actual_source_git_blob_sha != avif_config["sourceGitBlobSha"]:
                hero_delivery_avif_skipped_reason = "source-provenance-mismatch"
                avif_config = None
            if avif_config:
                if source_filename != filename:
                    raise RuntimeError(f"AVIF hero delivery requires the exact approved JPEG source: {filename}")
                avif_relative = PurePosixPath(_hero_avif_delivery_relative_path(filename, width))
                if avif_relative.is_absolute() or any(part in {"", ".", ".."} for part in avif_relative.parts):
                    raise ValueError(f"Unsafe AVIF hero delivery path for {filename}: {avif_relative}")
                avif_target = root / Path(*avif_relative.parts)
                with Image.open(fallback) as fallback_opened:
                    _validate_source_image_header(fallback_opened, filename)
                    fallback_opened.load()
                    avif_icc_profile = fallback_opened.info.get("icc_profile")
                    avif_image = ImageOps.exif_transpose(fallback_opened)
                    if avif_image.size != (width, height):
                        raise ValueError(f"AVIF hero fallback dimensions differ from source: {filename}")
                    if avif_image.mode not in ("RGB", "RGBA"):
                        avif_image = avif_image.convert("RGBA" if "A" in avif_image.getbands() else "RGB")
                    avif_encoding = _save_avif(
                        avif_image,
                        avif_target,
                        avif_icc_profile,
                        quality=int(avif_config["quality"]),
                    )
                    with Image.open(avif_target) as avif_candidate:
                        avif_candidate.load()
                        if avif_candidate.format != "AVIF" or avif_candidate.size != (width, height):
                            raise RuntimeError(f"AVIF hero delivery verification mismatch: {avif_target}")
                        measured_avif_psnr = _psnr_db(avif_image, avif_candidate)
                minimum_avif_psnr = float(avif_config["minPsnrDb"])
                if measured_avif_psnr < minimum_avif_psnr:
                    raise RuntimeError(
                        f"AVIF hero candidate fails the {minimum_avif_psnr:.2f} dB PSNR floor: "
                        f"{avif_relative.as_posix()} ({measured_avif_psnr:.3f} dB)"
                    )
                source_webp_bytes = full_size.stat().st_size
                saved_avif_percent = (
                    (source_webp_bytes - avif_target.stat().st_size) / source_webp_bytes * 100
                    if source_webp_bytes else 0.0
                )
                minimum_avif_savings = float(avif_config["minimumSavingsPercent"])
                if saved_avif_percent < minimum_avif_savings:
                    raise RuntimeError(
                        f"AVIF hero candidate saves less than {minimum_avif_savings:.1f}% "
                        f"against its preserved source WebP: {avif_relative.as_posix()}"
                    )
                avif_max_bytes = int(source_webp_bytes * (1 - minimum_avif_savings / 100))
                hero_delivery_avif = {
                    "width": width,
                    "height": height,
                    "path": avif_relative.as_posix(),
                    "sourceGitBlobSha": actual_source_git_blob_sha,
                    "bytes": avif_target.stat().st_size,
                    "quality": avif_encoding["quality"],
                    "qualityAttempts": [{"quality": avif_encoding["quality"], "bytes": avif_encoding["bytes"]}],
                    "maxBytes": avif_max_bytes,
                    "psnrDb": round(measured_avif_psnr, 3),
                    "minPsnrDb": minimum_avif_psnr,
                    "minimumSavingsPercent": minimum_avif_savings,
                    "savedPercent": round(saved_avif_percent, 3),
                    "media": avif_config["media"],
                    "webpPreloadMedia": avif_config["webpPreloadMedia"],
                }

            source_format = "WEBP" if source_filename != filename else "JPEG"
            output[filename] = {
                "width": width,
                "height": height,
                "sourcePath": (PurePosixPath("assets/images") / PurePosixPath(source_filename)).as_posix(),
                "sourceFormat": source_format,
                "sourceBytes": source.stat().st_size,
                "fallbackBytes": fallback.stat().st_size,
                "fullSizePath": full_size.relative_to(root).as_posix(),
                "fullSizeBytes": full_size.stat().st_size,
                "fullSizeSavingsBytes": (
                    source.stat().st_size - full_size.stat().st_size
                    if source_format == "JPEG" else 0
                ),
                "fullSizeQuality": full_size_encoding["quality"] if full_size_encoding else None,
                "fullSizeQualityAttempts": full_size_encoding["qualityAttempts"] if full_size_encoding else [],
                "fullSizeMaxBytes": full_size_encoding["maxBytes"] if full_size_encoding else None,
                "heroDeliveryVariant": hero_delivery_variant,
                "heroDeliveryAvif": hero_delivery_avif,
                "heroDeliveryAvifSkippedReason": hero_delivery_avif_skipped_reason,
                "variants": generated,
            }
    return output


_VOID_HTML_CONTEXT_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
})
_HTML_CONTEXT_TOKEN_PATTERN = re.compile(
    r"<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?</script\s*>|"
    r"<style\b[^>]*>[\s\S]*?</style\s*>|</?[a-z][^>]*>",
    re.IGNORECASE,
)


def _ancestor_classes_before(text: str, offset: int) -> set[str]:
    """Collect real HTML ancestor classes, ignoring markup-like script/style text."""
    stack: list[tuple[str, set[str]]] = []
    for match in _HTML_CONTEXT_TOKEN_PATTERN.finditer(text, 0, offset):
        token = match.group(0)
        if token.startswith("<!--") or re.match(r"<(?:script|style)\b", token, re.IGNORECASE):
            continue
        tag_match = re.match(r"</?([a-z][\w:-]*)\b", token, re.IGNORECASE)
        if tag_match is None:
            continue
        name = tag_match.group(1).lower()
        if token.startswith("</"):
            for index in range(len(stack) - 1, -1, -1):
                if stack[index][0] == name:
                    del stack[index:]
                    break
            continue
        classes = set((get_attribute(token, "class") or "").split())
        if name not in _VOID_HTML_CONTEXT_TAGS and not token.rstrip().endswith("/>"):
            stack.append((name, classes))
    return {class_name for _tag, classes in stack for class_name in classes}


def _responsive_sizes(tag: str, ancestor_classes: set[str] | None = None) -> str:
    """Describe the rendered image slot from the verified layout contract."""
    classes = set((get_attribute(tag, "class") or "").split())
    ancestors = ancestor_classes or set()
    if (
        "hero__image" in classes
        or (get_attribute(tag, "fetchpriority") or "").lower() == "high"
        or bool(ancestors & {"page-hero", "page-hero__picture"})
    ):
        return "100vw"

    if "home-room-grid" in ancestors:
        desktop = "calc((min(100vw - 64px, 1280px) - clamp(36px, 5vw, 68px)) / 3)"
        if "home-room-card--wide" in ancestors:
            return (
                "(max-width: 640px) calc(100vw - 28px), "
                "(max-width: 980px) calc(100vw - 64px), " + desktop
            )
        return (
            "(max-width: 640px) calc(100vw - 28px), "
            "(max-width: 980px) calc((100vw - 64px - clamp(18px, 2.5vw, 34px)) / 2), " + desktop
        )

    if "experience-option-grid" in ancestors:
        return (
            "(max-width: 760px) calc(100vw - 36px), "
            "(max-width: 900px) calc((100vw - 84px) / 2), "
            "calc((min(100vw, 1304px) - 104px) / 3)"
        )
    if "room-card-grid--catalog" in ancestors:
        return (
            "(max-width: 760px) calc(100vw - 36px), "
            "(max-width: 1050px) calc((100vw - 82px) / 2), "
            "calc((min(100vw, 1304px) - 100px) / 3)"
        )
    if ancestors & {"room-gallery-grid", "room-reference-grid"}:
        return (
            "(max-width: 600px) calc(100vw - 36px), "
            "(max-width: 900px) calc((100vw - 84px) / 2), "
            "calc((min(100vw, 1304px) - 104px) / 3)"
        )
    if "gallery-grid" in ancestors:
        return (
            "(max-width: 760px) calc(100vw - 36px), "
            "calc((min(100vw, 1304px) - 88px) / 2)"
        )
    if "content-depth__grid" in ancestors:
        return (
            "(max-width: 760px) calc(100vw - 36px), "
            "calc((min(100vw, 1304px) - 82px) / 2)"
        )
    if "experience-grid" in ancestors:
        if "experience-card--large" in ancestors:
            return (
                "(max-width: 760px) calc(100vw - 36px), "
                "(max-width: 1050px) calc((100vw - 82px) / 2), "
                "min(445px, 34vw)"
            )
        return (
            "(max-width: 760px) calc(100vw - 36px), "
            "(max-width: 1050px) calc((100vw - 82px) / 2), "
            "min(380px, 30vw)"
        )
    if "feature-photo" in ancestors:
        return (
            "(max-width: 760px) calc(100vw - 72px), "
            "(max-width: 900px) calc(100vw - 100px), "
            "min(610px, 44vw)"
        )
    if "story-image" in ancestors and "dining-restaurant__panel" in ancestors:
        return "(max-width: 760px) calc(100vw - 56px), min(600px, 43vw)"
    if "story-image" in ancestors:
        return "(max-width: 760px) calc(100vw - 36px), min(600px, 43vw)"
    if "experience-detail-media--portrait" in ancestors:
        # The portrait frame is capped by its CSS aspect-ratio/max-height pair:
        # 5:4 at <=900px (375px wide at the 300px height cap), then 4:5
        # above 900px (336px wide at the 420px height cap).
        return "(max-width: 900px) min(375px, calc(100vw - 76px)), 336px"
    if "experience-detail-media" in ancestors:
        return (
            "(max-width: 900px) min(620px, calc(100vw - 76px)), "
            "min(460px, 36vw)"
        )
    if "arrival-visual__media" in ancestors:
        return (
            "(max-width: 760px) min(380px, calc(100vw - 36px)), "
            "min(420px, 40vw)"
        )
    if "room-feature__image" in ancestors:
        return (
            "(max-width: 760px) calc(100vw - 36px), "
            "(max-width: 1050px) 48vw, 510px"
        )
    if "intro__image" in ancestors:
        return (
            "(max-width: 760px) calc(100vw - 36px), "
            "(max-width: 1050px) 40vw, min(432px, 33vw)"
        )

    # Retain the conservative fallback for unclassified markup; core public
    # photo layouts above are aligned to their actual CSS grid breakpoints.
    return "(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 50vw"


def _srcset_urls(value: str) -> list[str]:
    """Return URL tokens from a srcset without interpreting their descriptors."""
    urls: list[str] = []
    for candidate in value.split(","):
        pieces = candidate.strip().rsplit(None, 1)
        if pieces and pieces[0]:
            urls.append(pieces[0])
    return urls


def _rewrite_existing_picture_sources(text: str, root: Path) -> str:
    """Upgrade existing full-size WebP picture sources to verified responsive candidates."""
    def rewrite_picture(match: re.Match[str]) -> str:
        picture = match.group(0)
        image_match = IMG_PATTERN.search(picture)
        if image_match is None:
            return picture
        image_tag = image_match.group(0)
        fallback_name = _image_name_for_reference(get_attribute(image_tag, "src") or "")
        if fallback_name is None:
            return picture
        full_size_url = _full_size_webp_url(fallback_name)
        source_match = next(
            (
                item for item in SOURCE_TAG_PATTERN.finditer(picture)
                if full_size_url in _srcset_urls(get_attribute(item.group(0), "srcset") or "")
            ),
            None,
        )
        if source_match is None:
            return picture
        image_offset = match.start() + image_match.start()
        sizes = _responsive_sizes(
            image_tag,
            _ancestor_classes_before(text, image_offset),
        )
        source_tag = source_match.group(0)
        updated = set_attribute(source_tag, "data-responsive-image", "true")
        updated = set_attribute(updated, "type", "image/webp")
        hero = _is_hero_image(image_tag, _ancestor_classes_before(text, image_offset))
        updated = set_attribute(updated, "srcset", _srcset(root, fallback_name, hero=hero))
        updated = set_attribute(updated, "sizes", sizes)
        return picture[:source_match.start()] + updated + picture[source_match.end():]

    return PICTURE_PATTERN.sub(rewrite_picture, text)


def _natural_dimensions(root: Path, filename: str) -> tuple[int, int]:
    """Read EXIF-corrected dimensions from the JPEG fallback's approved source image."""
    source_filename = _responsive_source_filename(filename)
    source = _image_source_file(root, source_filename)
    if source.is_symlink() or not source.is_file() or source.stat().st_size <= 0:
        raise FileNotFoundError(f"Missing safe source image: {source}")
    with Image.open(source) as opened:
        _validate_source_image_header(opened, source_filename)
        opened.load()
        image = ImageOps.exif_transpose(opened)
        width, height = image.size
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise ValueError(f"Source image dimensions exceed safe bounds: {source.name}")
    return width, height


def _is_hero_image(tag: str, ancestor_classes: set[str] | None = None) -> bool:
    """Identify the first-view image contract from markup and its verified layout ancestors."""
    classes = set((get_attribute(tag, "class") or "").split())
    ancestors = ancestor_classes or set()
    return (
        "hero__image" in classes
        or (get_attribute(tag, "fetchpriority") or "").lower() == "high"
        or bool(ancestors & {"page-hero", "page-hero__picture"})
    )


def _hero_delivery_relative_path(filename: str, natural_width: int) -> str:
    relative = _validated_image_relative_path(filename)
    return (
        PurePosixPath("assets/images/responsive")
        / relative.parent
        / f"{relative.stem}-{natural_width}.webp"
    ).as_posix()


def _git_blob_sha1(path: Path) -> str:
    payload = path.read_bytes()
    header = f"blob {len(payload)}\0".encode("ascii")
    return hashlib.sha1(header + payload).hexdigest()


def _hero_avif_delivery_relative_path(filename: str, natural_width: int) -> str:
    relative = _validated_image_relative_path(filename)
    return (
        PurePosixPath("assets/images/responsive")
        / relative.parent
        / f"{relative.stem}-{natural_width}.avif"
    ).as_posix()


def _save_avif(
    image: Image.Image,
    target: Path,
    icc_profile: bytes | None,
    *,
    quality: int = 50,
) -> dict:
    """Write a verified AVIF derivative without replacing an existing source asset."""
    if target.parent.is_symlink():
        raise ValueError(f"Refusing to write through a symlinked image directory: {target.parent}")
    if isinstance(quality, bool) or not isinstance(quality, int) or not 1 <= quality <= 100:
        raise ValueError(f"Invalid AVIF quality: {quality!r}")
    temporary = target.with_name(target.name + ".tmp")
    for candidate in (target, temporary):
        if candidate.is_symlink():
            raise ValueError(f"Refusing to replace a symlinked AVIF output: {candidate}")
        if candidate.exists() and not candidate.is_file():
            raise ValueError(f"AVIF output is not a regular file: {candidate}")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        kwargs = {"quality": quality, "speed": 6}
        if icc_profile:
            kwargs["icc_profile"] = icc_profile
        image.save(temporary, format="AVIF", **kwargs)
        with Image.open(temporary) as check:
            check.load()
            if check.format != "AVIF" or check.size != image.size:
                raise RuntimeError(f"AVIF verification mismatch: {target}")
        if target.is_file():
            if target.read_bytes() == temporary.read_bytes():
                temporary.unlink()
            else:
                raise FileExistsError(f"Refusing to overwrite an existing AVIF source: {target}")
        else:
            temporary.replace(target)
        return {"quality": quality, "bytes": target.stat().st_size}
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def _avif_srcset(root: Path, filename: str) -> str:
    """Return the verified full-resolution AVIF candidate for an approved hero."""
    if filename not in AVIF_HERO_DELIVERY_VARIANTS:
        return ""
    relative_source = _validated_image_relative_path(filename)
    source_path = root / Path("assets/images") / Path(*relative_source.parts)
    expected_source_sha = AVIF_HERO_DELIVERY_VARIANTS[filename]["sourceGitBlobSha"]
    if _git_blob_sha1(source_path) != expected_source_sha:
        return ""
    width, height = _natural_dimensions(root, filename)
    relative = _hero_avif_delivery_relative_path(filename, width)
    target = root / relative
    if target.is_symlink() or not target.is_file() or target.stat().st_size <= 0:
        raise FileNotFoundError(f"Missing quality-gated AVIF hero candidate: {target}")
    with Image.open(target) as decoded:
        decoded.load()
        if decoded.format != "AVIF" or decoded.size != (width, height):
            raise ValueError(f"AVIF hero candidate dimensions do not match source: {target}")
    return f"{relative} {width}w"


def _srcset(root: Path, filename: str, *, hero: bool = False) -> str:
    """Build a verified width-descriptor srcset, using a quality-gated hero derivative when applicable."""
    root = _resolve_site_root(root)
    source_filename = _responsive_source_filename(filename)
    source = _image_source_file(root, source_filename)
    if source.is_symlink() or not source.is_file():
        raise FileNotFoundError(f"Missing safe responsive image source: {source}")
    with Image.open(source) as image:
        _validate_source_image_header(image, source_filename)
        image.load()
        oriented = ImageOps.exif_transpose(image)
        natural_width, natural_height = oriented.size
    relative = _validated_image_relative_path(filename)
    responsive_parent = _safe_directory(
        root, Path("assets/images/responsive") / relative.parent
    )
    paths = [
        f"{_responsive_webp_url(filename, width)} {width}w"
        for width in RESPONSIVE_WIDTH_OVERRIDES.get(filename, RESPONSIVE_WIDTHS)
        if width < natural_width
        and (responsive_parent / f"{relative.stem}-{width}.webp").is_file()
        and not (responsive_parent / f"{relative.stem}-{width}.webp").is_symlink()
    ]
    full_size = root / _full_size_webp_url(filename)
    if full_size.is_symlink() or not full_size.is_file():
        raise FileNotFoundError(f"Missing full-size WebP source: {full_size}")
    hero_config = HERO_DELIVERY_VARIANTS.get(filename) if hero else None
    if hero_config:
        hero_relative = PurePosixPath(_hero_delivery_relative_path(filename, natural_width))
        hero_candidate = root / Path(*hero_relative.parts)
        if hero_candidate.is_symlink() or not hero_candidate.is_file():
            raise FileNotFoundError(f"Missing quality-gated hero delivery candidate: {hero_candidate}")
        with Image.open(hero_candidate) as decoded:
            decoded.load()
            if decoded.format != "WEBP" or decoded.size != (natural_width, natural_height):
                raise ValueError(f"Hero delivery candidate dimensions do not match source: {hero_candidate}")
        paths.append(f"{hero_relative.as_posix()} {natural_width}w")
    else:
        paths.append(f"{_full_size_webp_url(filename)} {natural_width}w")
    return ", ".join(paths)

def rewrite_html_text(text: str, extension: str, root: Path | None = None) -> str:
    """Rewrite known references to JPG, WebP, or responsive WebP with a JPEG fallback."""
    if extension not in {"jpg", "webp", "responsive"}:
        raise ValueError("extension must be 'jpg', 'webp', or 'responsive'")
    root = _resolve_site_root(root or Path.cwd())

    protected_sources: list[tuple[str, str]] = []
    if extension == "responsive":
        source_pattern = re.compile(
            r"<source\b[^>]*\bdata-responsive-image\s*=\s*(['\"])true\1[^>]*>",
            re.IGNORECASE,
        )

        def protect_source(match: re.Match[str]) -> str:
            token = f"__GARH_RESPONSIVE_SOURCE_{len(protected_sources)}__"
            while token in text:
                token += "_"
            protected_sources.append((token, match.group(0)))
            return token

        text = source_pattern.sub(protect_source, text)

    for name in IMAGE_NAMES:
        source_url = _source_url(name)
        full_size_url = _full_size_webp_url(name)
        destination = source_url if extension in {"jpg", "responsive"} else full_size_url
        # Remote legacy URLs are only approved for the four original root-level assets.
        if "/" not in name:
            remote_pattern = re.escape(SOURCE_PREFIX + name) + r"""(?:\?[^"'\s>]*)?"""
            text = re.sub(remote_pattern, destination, text)
        references = [source_url]
        # In responsive mode, keep existing full-size WebP references intact until
        # their containing picture can be upgraded to the generated responsive srcset.
        if extension != "responsive":
            references.append(full_size_url)
        reference_pattern = "(?:" + "|".join(re.escape(item) for item in references) + ")"
        local_pattern = rf"(?<![\w:/]){reference_pattern}(?![\w.-])"
        text = re.sub(local_pattern, destination, text)

    if extension != "responsive":
        return text

    text = _rewrite_existing_picture_sources(text, root)

    def rewrite_image(match: re.Match[str]) -> str:
        tag = match.group(0)
        src = get_attribute(tag, "src") or ""
        image_name = _image_name_for_reference(src)
        if image_name is None:
            return tag
        fallback = _source_url(image_name)
        natural_width, natural_height = _natural_dimensions(root, image_name)
        is_hero = _is_hero_image(tag, _ancestor_classes_before(text, match.start()))
        tag = set_attribute(tag, "src", fallback)
        # Reserve intrinsic space from decoded bytes to reduce layout shift.
        tag = set_attribute(tag, "width", str(natural_width))
        tag = set_attribute(tag, "height", str(natural_height))
        tag = set_attribute(tag, "decoding", "async")
        tag = set_attribute(tag, "loading", "eager" if is_hero else "lazy")
        if get_attribute(tag, "data-responsive-image-fallback") == "true":
            return tag
        prefix = text[: match.start()]
        picture_start = prefix.lower().rfind("<picture")
        picture_end = prefix.lower().rfind("</picture")
        if picture_start > picture_end:
            picture_prefix = prefix[picture_start:]
            expected_source_urls = {_full_size_webp_url(image_name)}
            hero_config = HERO_DELIVERY_VARIANTS.get(image_name) if is_hero else None
            if hero_config:
                hero_width, _ = _natural_dimensions(root, image_name)
                expected_source_urls.add(_hero_delivery_relative_path(image_name, hero_width))
            has_mapped_source = any(
                (get_attribute(source_match.group(0), "data-responsive-image") or "").lower() == "true"
                and bool(
                    expected_source_urls.intersection(
                        _srcset_urls(get_attribute(source_match.group(0), "srcset") or "")
                    )
                )
                for source_match in SOURCE_TAG_PATTERN.finditer(picture_prefix)
            )
            if has_mapped_source:
                return set_attribute(tag, "data-responsive-image-fallback", "true")
        srcset = _srcset(root, image_name, hero=is_hero)
        ancestor_classes = _ancestor_classes_before(text, match.start())
        sizes = _responsive_sizes(tag, ancestor_classes)
        source = (
            '<source data-responsive-image="true" type="image/webp" srcset="'
            + srcset
            + '" sizes="'
            + sizes
            + '">'
        )
        if is_hero and image_name in AVIF_HERO_DELIVERY_VARIANTS:
            avif_srcset = _avif_srcset(root, image_name)
            if avif_srcset:
                avif_source = (
                    '<source data-responsive-image="true" type="image/avif" media="'
                    + AVIF_HERO_DELIVERY_VARIANTS[image_name]["media"]
                    + '" srcset="'
                    + avif_srcset
                    + '" sizes="100vw">'
                )
                source = avif_source + source
        tag = set_attribute(tag, "data-responsive-image-fallback", "true")
        if picture_start > picture_end:
            return source + tag
        return '<picture class="responsive-image">' + source + tag + "</picture>"

    text = IMG_PATTERN.sub(rewrite_image, text)

    def rewrite_preload(match: re.Match[str]) -> str:
        tag = match.group(0)
        if (get_attribute(tag, "rel") or "").lower() != "preload":
            return tag
        if (get_attribute(tag, "as") or "").lower() != "image":
            return tag
        href = get_attribute(tag, "href") or ""
        image_name = _image_name_for_reference(href)
        if image_name is None:
            return tag
        matching_image_match = next(
            (
                image_match
                for image_match in IMG_PATTERN.finditer(text)
                if _image_name_for_reference(
                    get_attribute(image_match.group(0), "src") or ""
                ) == image_name
            ),
            None,
        )
        matching_image = matching_image_match.group(0) if matching_image_match else ""
        sizes = (
            _responsive_sizes(
                matching_image,
                _ancestor_classes_before(text, matching_image_match.start()),
            )
            if matching_image_match
            else "100vw"
        )
        is_hero = (
            _is_hero_image(
                matching_image,
                _ancestor_classes_before(text, matching_image_match.start()),
            )
            if matching_image_match
            else (get_attribute(tag, "fetchpriority") or "").lower() == "high"
        )
        preload_href = _full_size_webp_url(image_name)
        if is_hero and HERO_DELIVERY_VARIANTS.get(image_name):
            natural_width, _ = _natural_dimensions(root, image_name)
            preload_href = _hero_delivery_relative_path(image_name, natural_width)
        webp_tag = set_attribute(tag, "href", preload_href)
        webp_tag = set_attribute(
            set_attribute(
                set_attribute(webp_tag, "imagesrcset", _srcset(root, image_name, hero=is_hero)),
                "imagesizes",
                sizes,
            ),
            "type",
            "image/webp",
        )
        avif_config = AVIF_HERO_DELIVERY_VARIANTS.get(image_name) if is_hero else None
        if avif_config:
            avif_srcset = _avif_srcset(root, image_name)
            if avif_srcset:
                webp_tag = set_attribute(webp_tag, "media", avif_config["webpPreloadMedia"])
                avif_href = avif_srcset.rsplit(None, 1)[0]
                avif_tag = set_attribute(tag, "href", avif_href)
                avif_tag = set_attribute(
                    set_attribute(
                        set_attribute(avif_tag, "imagesrcset", avif_srcset),
                        "imagesizes",
                        "100vw",
                    ),
                    "type",
                    "image/avif",
                )
                avif_tag = set_attribute(avif_tag, "media", avif_config["media"])
                return avif_tag + webp_tag
        return webp_tag

    text = LINK_PATTERN.sub(rewrite_preload, text)
    for token, source in protected_sources:
        text = text.replace(token, source)
    return text


def rewrite_site(
    root: Path,
    extension: str,
    *,
    return_report: bool = False,
    image_names: tuple[str, ...] = IMAGE_NAMES,
) -> list[Path] | tuple[list[Path], dict[str, dict]]:
    """Rewrite regular root-level HTML pages; optionally return responsive generation evidence."""
    root = _resolve_site_root(root)
    generation_report: dict[str, dict] = {}
    pages = sorted(root.glob("*.html"))
    for page in pages:
        if page.is_symlink() or not page.is_file():
            raise ValueError(f"Refusing symlinked or non-regular HTML page: {page.name}")

    if extension == "responsive":
        generation_report = generate_responsive_variants(root, image_names)

    # Render every page before writing any of them. A bad later page must not leave a
    # partially rewritten site, and a symlinked route must never redirect writes outside root.
    pending: list[tuple[Path, str, str, int]] = []
    for page in pages:
        if page.is_symlink() or not page.is_file():
            raise ValueError(f"Refusing symlinked or non-regular HTML page: {page.name}")
        original = page.read_text(encoding="utf-8")
        updated = rewrite_html_text(original, extension, root=root)
        if updated != original:
            pending.append((page, original, updated, page.stat().st_mode & 0o777))

    if not pending:
        return ([], generation_report) if return_report else []

    staged: list[tuple[Path, Path, str, int]] = []
    replaced: list[tuple[Path, str, int]] = []
    try:
        for page, original, updated, mode in pending:
            if page.is_symlink() or not page.is_file():
                raise ValueError(f"Refusing symlinked or non-regular HTML page: {page.name}")
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{page.name}.", suffix=".tmp", dir=root
            )
            temporary = Path(temporary_name)
            staged.append((temporary, page, original, mode))
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as output:
                output.write(updated)
            os.chmod(temporary, mode)

        # Re-check every destination immediately before replacing any page.
        for _, page, _, _ in staged:
            if page.is_symlink() or not page.is_file():
                raise ValueError(f"Refusing symlinked or non-regular HTML page: {page.name}")

        try:
            for temporary, page, original, mode in staged:
                os.replace(temporary, page)
                replaced.append((page, original, mode))
        except Exception as error:
            rollback_errors: list[str] = []
            for page, original, mode in reversed(replaced):
                rollback_path: Path | None = None
                try:
                    descriptor, rollback_name = tempfile.mkstemp(
                        prefix=f".{page.name}.rollback.", suffix=".tmp", dir=root
                    )
                    rollback_path = Path(rollback_name)
                    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as output:
                        output.write(original)
                    os.chmod(rollback_path, mode)
                    os.replace(rollback_path, page)
                except Exception as rollback_error:
                    rollback_errors.append(f"{page.name}: {rollback_error}")
                finally:
                    if rollback_path is not None:
                        rollback_path.unlink(missing_ok=True)
            if rollback_errors:
                raise RuntimeError(
                    "HTML rewrite failed and rollback was incomplete: " + "; ".join(rollback_errors)
                ) from error
            raise

        rewritten_pages = [page for page, _, _, _ in pending]
        return (rewritten_pages, generation_report) if return_report else rewritten_pages
    finally:
        for temporary, _, _, _ in staged:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--extension", choices=("jpg", "webp", "responsive"), required=True)
    args = parser.parse_args()
    changed = rewrite_site(args.root, args.extension)
    if args.extension == "responsive":
        print("PASS: responsive WebP variants decoded and checked before HTML references changed.")
    print(f"Updated {len(changed)} HTML page(s) to use {args.extension} image delivery.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
