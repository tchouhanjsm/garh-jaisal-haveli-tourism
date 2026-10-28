#!/usr/bin/env python3
"""Generate responsive WebP variants and safely rewrite known site image references."""

from __future__ import annotations

import argparse
from pathlib import Path
import re

from PIL import Image, ImageOps

IMAGE_NAMES = ("rest3.jpg", "courtyard.jpg", "scarlet.jpg", "tent.jpg")
SOURCE_PREFIX = (
    "https://raw.githubusercontent.com/"
    "tchouhanjsm/garh-jaisal-website/main/img/"
)
RESPONSIVE_WIDTHS = (480, 768, 1200, 1600)
MAX_PIXELS = 64_000_000
WEBP_QUALITY = 82
IMG_PATTERN = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
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


def _save_webp(image: Image.Image, target: Path, icc_profile: bytes | None) -> None:
    """Write and decode-check a WebP output before replacing an existing file."""
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".tmp")
    try:
        kwargs = {"quality": WEBP_QUALITY, "method": 6}
        if icc_profile:
            kwargs["icc_profile"] = icc_profile
        image.save(temporary, format="WEBP", **kwargs)
        with Image.open(temporary) as check:
            check.load()
            if check.format != "WEBP" or check.size != image.size:
                raise RuntimeError(f"WebP verification mismatch: {target}")
        if target.is_file() and target.read_bytes() == temporary.read_bytes():
            temporary.unlink()
        else:
            temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise




def _validate_source_image_header(image: Image.Image, filename: str) -> None:
    """Reject unexpected formats and excessive pixel counts before decoding bytes."""
    if image.format != "JPEG":
        raise ValueError(f"Responsive image source is not a JPEG: {filename}")
    if image.width < 1 or image.height < 1 or image.width * image.height > MAX_PIXELS:
        raise ValueError(f"Source image dimensions exceed safe bounds: {filename}")


def generate_responsive_variants(
    root: Path, image_names: tuple[str, ...] = IMAGE_NAMES
) -> dict[str, dict]:
    """Generate full-size and downscaled WebP files from approved local source paths."""
    root = Path(root).resolve()
    output: dict[str, dict] = {}
    image_root = root / "assets" / "images"
    for filename in image_names:
        if filename not in IMAGE_NAMES:
            raise ValueError(f"Image is outside the responsive allowlist: {filename}")
        source = image_root / filename
        if source.is_symlink() or not source.is_file() or source.stat().st_size <= 0:
            raise FileNotFoundError(f"Missing safe source image: {source}")
        with Image.open(source) as opened:
            _validate_source_image_header(opened, filename)
            opened.load()
            icc_profile = opened.info.get("icc_profile")
            image = ImageOps.exif_transpose(opened)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            width, height = image.size
            full_size = image_root / f"{Path(filename).stem}.webp"
            _save_webp(image, full_size, icc_profile)
            if full_size.stat().st_size >= source.stat().st_size:
                raise RuntimeError(f"WebP derivative is not smaller than its JPEG source: {filename}")
            generated: list[dict] = []
            for target_width in RESPONSIVE_WIDTHS:
                if target_width >= width:
                    continue
                target_height = max(1, round(height * target_width / width))
                resized = image.resize(
                    (target_width, target_height),
                    Image.Resampling.LANCZOS,
                )
                target = image_root / "responsive" / f"{Path(filename).stem}-{target_width}.webp"
                _save_webp(resized, target, icc_profile)
                generated.append(
                    {
                        "width": target_width,
                        "height": target_height,
                        "path": target.relative_to(root).as_posix(),
                        "bytes": target.stat().st_size,
                    }
                )
            output[filename] = {
                "width": width,
                "height": height,
                "fullSizePath": full_size.relative_to(root).as_posix(),
                "fullSizeBytes": full_size.stat().st_size,
                "variants": generated,
            }
    return output


def _responsive_sizes(tag: str) -> str:
    classes = (get_attribute(tag, "class") or "").split()
    if "hero__image" in classes or (get_attribute(tag, "fetchpriority") or "").lower() == "high":
        return "100vw"
    return "(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 50vw"


def _natural_dimensions(root: Path, stem: str) -> tuple[int, int]:
    """Read the EXIF-corrected intrinsic dimensions for a safe allowlisted JPEG."""
    source = root / "assets" / "images" / f"{stem}.jpg"
    if source.is_symlink() or not source.is_file() or source.stat().st_size <= 0:
        raise FileNotFoundError(f"Missing safe source image: {source}")
    with Image.open(source) as opened:
        _validate_source_image_header(opened, source.name)
        opened.load()
        image = ImageOps.exif_transpose(opened)
        width, height = image.size
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise ValueError(f"Source image dimensions exceed safe bounds: {source.name}")
    return width, height


def _srcset(root: Path, stem: str) -> str:
    source = root / "assets" / "images" / f"{stem}.jpg"
    with Image.open(source) as image:
        _validate_source_image_header(image, source.name)
        image.load()
        oriented = ImageOps.exif_transpose(image)
        natural_width = oriented.width
    paths = [
        f"assets/images/responsive/{stem}-{width}.webp {width}w"
        for width in RESPONSIVE_WIDTHS
        if width < natural_width
        and (root / "assets" / "images" / "responsive" / f"{stem}-{width}.webp").is_file()
    ]
    full_size = root / "assets" / "images" / f"{stem}.webp"
    if not full_size.is_file():
        raise FileNotFoundError(f"Missing full-size WebP source: {full_size}")
    paths.append(f"assets/images/{stem}.webp {natural_width}w")
    return ", ".join(paths)


def rewrite_html_text(text: str, extension: str, root: Path | None = None) -> str:
    """Rewrite known references to JPG, WebP, or responsive WebP with a JPEG fallback."""
    if extension not in {"jpg", "webp", "responsive"}:
        raise ValueError("extension must be 'jpg', 'webp', or 'responsive'")
    root = Path(root or Path.cwd()).resolve()

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
        stem = Path(name).stem
        destination = f"assets/images/{stem}.{'jpg' if extension in {'jpg', 'responsive'} else 'webp'}"
        remote_pattern = re.escape(SOURCE_PREFIX + name) + r"""(?:\?[^"'\s>]*)?"""
        text = re.sub(remote_pattern, destination, text)
        local_pattern = (
            rf"(?<![\w:/])assets/images/{re.escape(stem)}\.(?:jpg|webp)"
            rf"(?![\w.-])"
        )
        text = re.sub(local_pattern, destination, text)

    if extension != "responsive":
        return text

    def rewrite_image(match: re.Match[str]) -> str:
        tag = match.group(0)
        src = get_attribute(tag, "src") or ""
        filename = Path(src.split("?", 1)[0]).name
        stem = Path(filename).stem
        if filename not in {f"{name[:-4]}.{suffix}" for name in IMAGE_NAMES for suffix in ("jpg", "webp")}:
            return tag
        fallback = f"assets/images/{stem}.jpg"
        natural_width, natural_height = _natural_dimensions(root, stem)
        classes = (get_attribute(tag, "class") or "").split()
        is_hero = (
            "hero__image" in classes
            or (get_attribute(tag, "fetchpriority") or "").lower() == "high"
        )
        tag = set_attribute(tag, "src", fallback)
        # Reserve the image's real, EXIF-corrected aspect ratio before it downloads.
        # Keep dimensions sourced from decoded bytes, not guesses from filenames or CSS.
        tag = set_attribute(tag, "width", str(natural_width))
        tag = set_attribute(tag, "height", str(natural_height))
        tag = set_attribute(tag, "decoding", "async")
        tag = set_attribute(tag, "loading", "eager" if is_hero else "lazy")
        if get_attribute(tag, "data-responsive-image-fallback") == "true":
            return tag
        srcset = _srcset(root, stem)
        sizes = _responsive_sizes(tag)
        source = (
            '<source data-responsive-image="true" type="image/webp" srcset="'
            + srcset
            + '" sizes="'
            + sizes
            + '">'
        )
        tag = set_attribute(tag, "data-responsive-image-fallback", "true")
        # If the source img already sits in a picture, inject rather than nest another picture.
        prefix = text[: match.start()]
        if prefix.lower().rfind("<picture") > prefix.lower().rfind("</picture"):
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
        filename = Path(href.split("?", 1)[0]).name
        stem = Path(filename).stem
        if filename not in {f"{name[:-4]}.{suffix}" for name in IMAGE_NAMES for suffix in ("jpg", "webp")}:
            return tag
        tag = set_attribute(tag, "href", f"assets/images/{stem}.webp")
        matching_image = next(
            (
                image_match.group(0)
                for image_match in IMG_PATTERN.finditer(text)
                if Path(
                    (get_attribute(image_match.group(0), "src") or "").split("?", 1)[0]
                ).stem == stem
            ),
            None,
        )
        # Keep the preload's slot calculation aligned with its image element so the
        # browser does not waste bandwidth on an unnecessarily large candidate.
        sizes = _responsive_sizes(matching_image) if matching_image else "100vw"
        return set_attribute(
            set_attribute(
                set_attribute(tag, "imagesrcset", _srcset(root, stem)),
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


def rewrite_site(root: Path, extension: str) -> list[Path]:
    """Rewrite root-level HTML pages, generating variants before touching HTML."""
    root = Path(root).resolve()
    if not root.is_dir():
        raise NotADirectoryError(f"site root is not a directory: {root}")
    if extension == "responsive":
        generate_responsive_variants(root)

    changed: list[Path] = []
    for page in sorted(root.glob("*.html")):
        original = page.read_text(encoding="utf-8")
        updated = rewrite_html_text(original, extension, root=root)
        if updated != original:
            page.write_text(updated, encoding="utf-8")
            changed.append(page)
    return changed


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
