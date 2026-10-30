#!/usr/bin/env python3
"""Generate responsive WebP variants and safely rewrite known site image references."""

from __future__ import annotations

import argparse
import os
from pathlib import Path, PurePosixPath
import re
import tempfile

from PIL import Image, ImageOps

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
    "dining/rooftop-candlelit-table.jpg",
)
# Sweet Purple and the Rooms hero have separately source-backed WebP assets.
# Their JPEGs are compatibility fallbacks; never regenerate over the originals.
RESPONSIVE_SOURCE_OVERRIDES = {
    "rooms/sweet-purple.jpg": "rooms/sweet-purple.webp",
    "rooms/haveli-interior.jpg": "rooms/haveli-sitting-room.webp",
}
SOURCE_PREFIX = (
    "https://raw.githubusercontent.com/"
    "tchouhanjsm/garh-jaisal-website/main/img/"
)
RESPONSIVE_WIDTHS = (320, 480, 768, 1200, 1600)
MAX_PIXELS = 64_000_000
WEBP_QUALITY = 82
# Byte ceilings protect high-value responsive candidates without changing
# JPEG fallbacks or independently source-backed WebP originals.
RESPONSIVE_VARIANT_MAX_BYTES = {
    "assets/images/responsive/courtyard-1200.webp": 250_000,
    "assets/images/responsive/courtyard-1600.webp": 250_000,
    "assets/images/responsive/rooms/haveli-interior-1200.webp": 250_000,
    "assets/images/responsive/rooms/sweet-purple-1200.webp": 250_000,
}
# The Directions hero's 2200px JPEG-derived WebP is generated in the isolated
# package and may be quality-adjusted; the source JPEG remains the fallback.
FULL_SIZE_WEBP_MAX_BYTES = {
    "assets/images/courtyard.webp": 450_000,
}
BUDGET_QUALITY_FLOOR = 58
BUDGET_QUALITY_STEP = 2


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
            for target_width in RESPONSIVE_WIDTHS:
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
                    resized, target, icc_profile, max_bytes=max_bytes
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
    """Upgrade only explicitly mapped art-direction sources, preserving their source image."""
    def rewrite_picture(match: re.Match[str]) -> str:
        picture = match.group(0)
        for fallback_name, source_name in RESPONSIVE_SOURCE_OVERRIDES.items():
            source_url = (PurePosixPath("assets/images") / PurePosixPath(source_name)).as_posix()
            image_match = IMG_PATTERN.search(picture)
            if image_match is None:
                continue
            image_tag = image_match.group(0)
            if _image_name_for_reference(get_attribute(image_tag, "src") or "") != fallback_name:
                continue
            source_match = next(
                (
                    item for item in SOURCE_TAG_PATTERN.finditer(picture)
                    if source_url in _srcset_urls(get_attribute(item.group(0), "srcset") or "")
                ),
                None,
            )
            if source_match is None:
                continue
            image_offset = match.start() + image_match.start()
            sizes = _responsive_sizes(
                image_tag,
                _ancestor_classes_before(text, image_offset),
            )
            source_tag = source_match.group(0)
            updated = set_attribute(source_tag, "data-responsive-image", "true")
            updated = set_attribute(updated, "type", "image/webp")
            updated = set_attribute(updated, "srcset", _srcset(root, fallback_name))
            updated = set_attribute(updated, "sizes", sizes)
            return picture[:source_match.start()] + updated + picture[source_match.end():]
        return picture

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


def _srcset(root: Path, filename: str) -> str:
    """Build a verified width-descriptor srcset for a path-aware image identity."""
    root = _resolve_site_root(root)
    source_filename = _responsive_source_filename(filename)
    source = _image_source_file(root, source_filename)
    if source.is_symlink() or not source.is_file():
        raise FileNotFoundError(f"Missing safe source image: {source}")
    with Image.open(source) as image:
        _validate_source_image_header(image, source_filename)
        image.load()
        oriented = ImageOps.exif_transpose(image)
        natural_width = oriented.width
    relative = _validated_image_relative_path(filename)
    responsive_parent = _safe_directory(
        root, Path("assets/images/responsive") / relative.parent
    )
    paths = [
        f"{_responsive_webp_url(filename, width)} {width}w"
        for width in RESPONSIVE_WIDTHS
        if width < natural_width
        and (responsive_parent / f"{relative.stem}-{width}.webp").is_file()
        and not (responsive_parent / f"{relative.stem}-{width}.webp").is_symlink()
    ]
    full_size = root / _full_size_webp_url(filename)
    if full_size.is_symlink() or not full_size.is_file():
        raise FileNotFoundError(f"Missing full-size WebP source: {full_size}")
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
        if not (extension == "responsive" and name in RESPONSIVE_SOURCE_OVERRIDES):
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
        classes = (get_attribute(tag, "class") or "").split()
        is_hero = (
            "hero__image" in classes
            or (get_attribute(tag, "fetchpriority") or "").lower() == "high"
        )
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
            has_mapped_source = any(
                (get_attribute(source_match.group(0), "data-responsive-image") or "").lower() == "true"
                and _full_size_webp_url(image_name) in _srcset_urls(
                    get_attribute(source_match.group(0), "srcset") or ""
                )
                for source_match in SOURCE_TAG_PATTERN.finditer(picture_prefix)
            )
            if has_mapped_source:
                return set_attribute(tag, "data-responsive-image-fallback", "true")
        srcset = _srcset(root, image_name)
        ancestor_classes = _ancestor_classes_before(text, match.start())
        sizes = _responsive_sizes(tag, ancestor_classes)
        source = (
            '<source data-responsive-image="true" type="image/webp" srcset="'
            + srcset
            + '" sizes="'
            + sizes
            + '">'
        )
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
        tag = set_attribute(tag, "href", _full_size_webp_url(image_name))
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
        sizes = (
            _responsive_sizes(
                matching_image_match.group(0),
                _ancestor_classes_before(text, matching_image_match.start()),
            )
            if matching_image_match
            else "100vw"
        )
        return set_attribute(
            set_attribute(
                set_attribute(tag, "imagesrcset", _srcset(root, image_name)),
                "imagesizes",
                sizes,
            ),
            "type",
            "image/webp",
        )

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
