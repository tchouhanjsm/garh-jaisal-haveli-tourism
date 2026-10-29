#!/usr/bin/env python3
"""Build a verified, non-deploying staging preview package after CI quality gates."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
from html.parser import HTMLParser
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
# The legacy `img/` tree is retained in Git as a source/asset archive, not
# used by the static runtime. Keep it out of staging artifacts unless the site
# deliberately migrates those assets into the supported `assets/` tree.
RUNTIME_DIRECTORIES = ("assets", "blogs", "tours", "gallery")
MAX_UNCOMPRESSED_PACKAGE_BYTES = 18 * 1024 * 1024
LEGACY_IMG_REFERENCE = re.compile(r"(?<![A-Za-z0-9_.-])(?:\.\.?/)*img/", re.IGNORECASE)
RUNTIME_ROOT_FILES = (
    ".htaccess",
    "favicon.svg",
    "robots.txt",
    "robots-staging.txt",
    "sitemap.xml",
    "sitemap-empty.xml",
)
ROOT_PAGE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*\.html$", re.IGNORECASE)
SHA_PATTERN = re.compile(r"^[0-9a-f]{40,64}$", re.IGNORECASE)


def fail(message: str) -> None:
    raise RuntimeError(message)


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_within(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


class ResponsivePictureParser(HTMLParser):
    """Collect generated responsive picture/source/fallback contracts from HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.pictures: list[dict] = []
        self.orphan_responsive_sources = 0
        self.orphan_responsive_fallbacks = 0
        self._current: dict | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        values = {key.lower(): value or "" for key, value in attrs}
        if name == "picture":
            if self._current is not None:
                raise ValueError("nested picture elements are not supported in packaged markup")
            self._current = {"sources": [], "fallbacks": []}
            return
        if name == "source" and values.get("data-responsive-image", "").lower() == "true":
            if self._current is None:
                self.orphan_responsive_sources += 1
            else:
                self._current["sources"].append(values)
        elif name == "img" and values.get("data-responsive-image-fallback", "").lower() == "true":
            if self._current is None:
                self.orphan_responsive_fallbacks += 1
            else:
                self._current["fallbacks"].append(values)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "picture" or self._current is None:
            return
        if self._current["sources"] or self._current["fallbacks"]:
            self.pictures.append(self._current)
        self._current = None

    def close(self) -> None:
        super().close()
        if self._current is not None:
            raise ValueError("responsive picture element was not closed")


def validate_responsive_markup(
    output: Path,
    generated_files: list[dict],
    image_sources: list[dict],
    responsive_widths: tuple[int, ...],
) -> dict:
    """Match every generated srcset descriptor to decoded output bytes and JPEG fallback."""
    output = output.resolve(strict=True)
    candidate_by_path = {entry["path"]: entry for entry in generated_files}
    if len(candidate_by_path) != len(generated_files):
        fail("Responsive package contains duplicate generated asset paths.")
    source_by_stem = {Path(entry["sourceJpeg"]).stem: entry for entry in image_sources}
    if len(source_by_stem) != len(image_sources):
        fail("Responsive package contains duplicate source-image records.")

    picture_count = 0
    candidate_count = 0
    for page in sorted(output.glob("*.html")):
        if page.is_symlink() or not page.is_file():
            fail(f"Responsive markup route is unsafe: {page.name}")
        parser = ResponsivePictureParser()
        try:
            parser.feed(page.read_text(encoding="utf-8"))
            parser.close()
        except (UnicodeDecodeError, ValueError) as error:
            fail(f"Responsive markup could not be parsed in {page.name}: {error}")
        if parser.orphan_responsive_sources or parser.orphan_responsive_fallbacks:
            fail(f"Responsive source/fallback must be inside a picture element: {page.name}")

        for picture in parser.pictures:
            picture_count += 1
            sources = picture["sources"]
            fallbacks = picture["fallbacks"]
            if len(sources) != 1 or len(fallbacks) != 1:
                fail(
                    f"{page.name}: responsive picture must contain exactly one WebP source "
                    "and one marked JPEG fallback."
                )
            source = sources[0]
            fallback = fallbacks[0]
            if source.get("type", "").lower() != "image/webp":
                fail(f"{page.name}: responsive picture source must declare type=image/webp.")
            if not source.get("sizes", "").strip():
                fail(f"{page.name}: responsive picture source must declare a non-empty sizes value.")

            fallback_path = fallback.get("src", "").split("?", 1)[0].split("#", 1)[0]
            stem = Path(fallback_path).stem
            source_record = source_by_stem.get(stem)
            if (
                source_record is None
                or fallback_path != source_record["sourceJpeg"]
                or not fallback_path.lower().endswith((".jpg", ".jpeg"))
            ):
                fail(f"{page.name}: responsive picture has an unapproved or mismatched JPEG fallback.")
            natural_width = int(source_record["naturalWidth"])
            natural_height = int(source_record["naturalHeight"])
            if (
                fallback.get("width") != str(natural_width)
                or fallback.get("height") != str(natural_height)
            ):
                fail(f"{page.name}: JPEG fallback dimensions do not match decoded source dimensions.")
            if fallback.get("decoding", "").lower() != "async":
                fail(f"{page.name}: responsive JPEG fallback must use decoding=async.")
            classes = fallback.get("class", "").split()
            is_hero = "hero__image" in classes or fallback.get("fetchpriority", "").lower() == "high"
            expected_loading = "eager" if is_hero else "lazy"
            if fallback.get("loading", "").lower() != expected_loading:
                fail(f"{page.name}: responsive image loading policy does not match its hero/supporting role.")

            raw_srcset = source.get("srcset", "").strip()
            if not raw_srcset:
                fail(f"{page.name}: responsive picture source has an empty srcset.")
            candidates: list[tuple[str, int]] = []
            seen_paths: set[str] = set()
            seen_widths: set[int] = set()
            previous_width = 0
            for raw_candidate in raw_srcset.split(","):
                pieces = raw_candidate.strip().rsplit(None, 1)
                if len(pieces) != 2:
                    fail(f"{page.name}: malformed responsive srcset candidate: {raw_candidate.strip()}")
                relative, descriptor = pieces
                match = re.fullmatch(r"([1-9][0-9]*)w", descriptor)
                if not match:
                    fail(f"{page.name}: srcset candidate must use a positive width descriptor: {descriptor}")
                declared_width = int(match.group(1))
                metadata = candidate_by_path.get(relative)
                if metadata is None:
                    fail(f"{page.name}: srcset references an unverified WebP candidate: {relative}")
                if relative in seen_paths or declared_width in seen_widths:
                    fail(f"{page.name}: srcset contains a duplicate path or width descriptor.")
                if declared_width <= previous_width:
                    fail(f"{page.name}: srcset width descriptors must be strictly increasing.")
                if declared_width != int(metadata["width"]):
                    fail(
                        f"{page.name}: srcset descriptor width {declared_width}w does not match "
                        f"decoded asset width {metadata['width']}px for {relative}."
                    )
                expected_relative = (
                    f"assets/images/{stem}.webp"
                    if declared_width == natural_width
                    else f"assets/images/responsive/{stem}-{declared_width}.webp"
                )
                if relative != expected_relative:
                    fail(f"{page.name}: srcset candidate path does not match its source stem/width: {relative}")
                absolute = output / relative
                if absolute.is_symlink() or not absolute.is_file() or not is_within(absolute.resolve(), output):
                    fail(f"{page.name}: srcset candidate is missing or unsafe: {relative}")
                expected_height = max(1, round(natural_height * declared_width / natural_width))
                if int(metadata["height"]) != expected_height:
                    fail(f"{page.name}: responsive candidate aspect ratio does not match source: {relative}")
                candidates.append((relative, declared_width))
                seen_paths.add(relative)
                seen_widths.add(declared_width)
                previous_width = declared_width

            expected_candidates = [
                (f"assets/images/responsive/{stem}-{width}.webp", width)
                for width in responsive_widths
                if width < natural_width
            ]
            expected_candidates.append((f"assets/images/{stem}.webp", natural_width))
            if candidates != expected_candidates:
                fail(
                    f"{page.name}: srcset candidates must include the verified responsive widths "
                    "in ascending order and the full-size WebP candidate last."
                )
            candidate_count += len(candidates)

    if picture_count == 0:
        fail("No responsive picture markup was found in the generated preview package.")
    return {
        "status": "PASS",
        "responsivePictureCount": picture_count,
        "validatedSrcsetCandidateCount": candidate_count,
        "widthDescriptorsMatchDecodedPixels": True,
        "jpegFallbackDimensionsMatchSource": True,
    }


def validate_no_legacy_image_tree_references(output: Path) -> dict:
    """Fail closed if a runtime file references the excluded legacy /img asset library."""
    output = Path(output).resolve(strict=True)
    text_suffixes = {".html", ".css", ".js", ".json", ".svg", ".xml", ".txt", ".map"}
    checked = 0
    for candidate in sorted(output.rglob("*")):
        if candidate.is_symlink():
            fail(f"Unsafe package symlink while auditing legacy image references: {candidate.relative_to(output)}")
        if not candidate.is_file():
            continue
        if candidate.suffix.lower() not in text_suffixes and candidate.name != ".htaccess":
            continue
        try:
            text = candidate.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            fail(f"Runtime text asset is not valid UTF-8: {candidate.relative_to(output)}")
        match = LEGACY_IMG_REFERENCE.search(text)
        if match:
            line_number = text.count("\n", 0, match.start()) + 1
            fail(
                f"Runtime file references the source-only img/ library, which is not packaged: "
                f"{candidate.relative_to(output)}:{line_number}. Move the asset into assets/ "
                "or explicitly design a reviewed runtime asset migration."
            )
        checked += 1
    if (output / "img").exists():
        fail("The source-only img/ library must not be copied into the runtime package.")
    return {"status": "PASS", "textFilesChecked": checked, "legacyImageReferences": 0}


def legacy_source_image_inventory() -> dict:
    """Measure the Git-retained legacy image library without copying it into the website package."""
    root = ROOT / "img"
    if not root.exists():
        return {"path": "img/", "fileCount": 0, "bytesExcluded": 0}
    if root.is_symlink() or not root.is_dir():
        fail("The legacy source image path must be a real directory.")
    count = 0
    total_bytes = 0
    for candidate in sorted(root.rglob("*")):
        if candidate.is_symlink():
            fail(f"Symlink in legacy source image library: {candidate.relative_to(ROOT)}")
        if candidate.is_dir() or not candidate.is_file() or candidate.name == ".gitkeep":
            continue
        count += 1
        total_bytes += candidate.stat().st_size
    return {"path": "img/", "fileCount": count, "bytesExcluded": total_bytes}


def package_size_metrics(entries: list[dict], legacy_inventory: dict,
                         budget_bytes: int = MAX_UNCOMPRESSED_PACKAGE_BYTES) -> dict:
    """Enforce a deterministic uncompressed payload budget and report archive-scope savings."""
    if not isinstance(budget_bytes, int) or isinstance(budget_bytes, bool) or budget_bytes <= 0:
        fail("Package size budget must be a positive integer.")
    total = 0
    for entry in entries:
        amount = entry.get("bytes")
        if not isinstance(amount, int) or isinstance(amount, bool) or amount < 0:
            fail("Package inventory contains an invalid byte count.")
        total += amount
    if total > budget_bytes:
        fail(
            f"Uncompressed staging payload exceeds its {budget_bytes}-byte budget: "
            f"{total} bytes. Review runtime assets; do not raise the budget without a measured reason."
        )
    utilization = round((total / budget_bytes) * 100, 2)
    return {
        "uncompressedPayloadBytes": total,
        "uncompressedBudgetBytes": budget_bytes,
        "budgetUtilizationPercent": utilization,
        "sizeBudgetPassed": True,
        "sourceOnlyImageLibraryExcluded": legacy_inventory,
    }


def checked_paths() -> list[Path]:
    """Select only browser runtime files and explicit release-safety policy files."""
    files: set[Path] = set()
    for candidate in ROOT.glob("*.html"):
        if candidate.is_symlink() or not candidate.is_file():
            fail(f"Root HTML route must be a regular file: {candidate.name}")
        if not ROOT_PAGE_PATTERN.fullmatch(candidate.name):
            fail(f"Unexpected root HTML filename: {candidate.name}")
        files.add(candidate)

    route_contract_path = ROOT / "content" / "staging-route-contract.json"
    if route_contract_path.is_symlink() or not route_contract_path.is_file():
        fail("Missing safe core route contract: content/staging-route-contract.json")
    route_contract = json.loads(route_contract_path.read_text(encoding="utf-8"))
    routes = route_contract.get("routes")
    if route_contract.get("schemaVersion") != 1 or not isinstance(routes, list) or not routes:
        fail("The core route contract is malformed or unsupported.")
    route_names: set[str] = set()
    for route in routes:
        filename = route.get("file") if isinstance(route, dict) else None
        if not isinstance(filename, str) or not ROOT_PAGE_PATTERN.fullmatch(filename):
            fail("The core route contract contains an unsafe route filename.")
        if filename in route_names:
            fail(f"The core route contract has a duplicate route: {filename}")
        route_names.add(filename)
        route_path = ROOT / filename
        if route_path.is_symlink() or not route_path.is_file():
            fail(f"Core route is missing or unsafe: {filename}")
        files.add(route_path)

    config_path = ROOT / "content" / "site-config.json"
    if config_path.is_symlink() or not config_path.is_file():
        fail("The public runtime configuration is missing or unsafe.")
    files.add(config_path)

    for filename in RUNTIME_ROOT_FILES:
        path = ROOT / filename
        if path.is_symlink() or not path.is_file():
            fail(f"Required runtime/policy file is missing or unsafe: {filename}")
        files.add(path)

    for directory_name in RUNTIME_DIRECTORIES:
        directory = ROOT / directory_name
        if not directory.exists():
            continue
        if directory.is_symlink() or not directory.is_dir():
            fail(f"Runtime directory is not a safe directory: {directory_name}")
        for candidate in sorted(directory.rglob("*")):
            if candidate.is_symlink():
                fail(f"Symlinks are not allowed in the staging package: {candidate.relative_to(ROOT)}")
            if candidate.is_dir() or not candidate.is_file() or candidate.name == ".gitkeep":
                continue
            files.add(candidate)

    return sorted(files, key=lambda item: item.relative_to(ROOT).as_posix())


def validate_staging_policy(source_config: dict, source_robots: str, source_sitemap: str,
                            htaccess: str, empty_sitemap: str, staging_robots: str) -> None:
    site = source_config.get("site")
    if not isinstance(site, dict) or site.get("canonicalHostApproved") is not False:
        fail("Staging package blocked: canonicalHostApproved must remain false.")
    if not re.search(r"(?m)^\s*User-agent:\s*\*\s*$", source_robots, re.IGNORECASE):
        fail("robots.txt must explicitly apply its rule to all user agents.")
    if not re.search(r"(?m)^\s*Disallow:\s*/\s*$", source_robots, re.IGNORECASE):
        fail("robots.txt must block crawling for this staging preview.")
    if re.search(r"(?mi)^\s*Sitemap\s*:", source_robots):
        fail("robots.txt must not advertise a sitemap before owner approval.")

    def loc_count(xml_text: str, label: str) -> int:
        try:
            root = ElementTree.fromstring(xml_text)
        except ElementTree.ParseError as exc:
            fail(f"{label} is invalid XML: {exc}")
        return sum(1 for element in root.iter() if element.tag.rsplit("}", 1)[-1].lower() == "loc")

    if loc_count(source_sitemap, "sitemap.xml") != 0:
        fail("Staging package blocked: sitemap.xml contains a public URL.")
    if loc_count(empty_sitemap, "sitemap-empty.xml") != 0:
        fail("sitemap-empty.xml must remain URL-empty.")
    if not re.search(r"Disallow:\s*/", staging_robots, re.IGNORECASE):
        fail("robots-staging.txt must disallow crawling.")
    if not re.search(r"robots-staging\.txt", htaccess) or not re.search(r"sitemap-empty\.xml", htaccess):
        fail(".htaccess must preserve non-canonical staging robots/sitemap overrides.")
    if not re.search(r'X-Robots-Tag\s+"noindex, nofollow"', htaccess, re.IGNORECASE):
        fail(".htaccess must preserve the noindex header for non-canonical hosts.")


def copy_runtime_files(files: list[Path], output: Path) -> list[dict]:
    manifest_entries: list[dict] = []
    for source in files:
        relative = source.relative_to(ROOT).as_posix()
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        payload = destination.read_bytes()
        manifest_entries.append({
            "path": relative,
            "bytes": len(payload),
            "sha256": digest_bytes(payload),
        })
    return manifest_entries


def inventory_package_files(output: Path) -> list[dict]:
    """Hash every payload file after transformations, excluding the manifest itself."""
    entries: list[dict] = []
    for source in sorted(output.rglob("*")):
        relative = source.relative_to(output).as_posix()
        if source.is_symlink():
            fail(f"Unsafe packaged file: {relative}")
        if source.is_dir():
            continue
        if not source.is_file():
            fail(f"Unsafe packaged file: {relative}")
        if relative == "RELEASE-MANIFEST.json":
            continue
        payload = source.read_bytes()
        entries.append({
            "path": relative,
            "bytes": len(payload),
            "sha256": digest_bytes(payload),
        })
    return entries


def apply_responsive_image_delivery(output: Path) -> dict:
    """Generate and verify WebP variants against real source photos in the temporary package."""
    generator_path = ROOT / "scripts" / "rewrite_image_refs.py"
    spec = importlib.util.spec_from_file_location("staging_preview_image_generator", generator_path)
    if spec is None or spec.loader is None:
        fail("Could not load the existing responsive image generator.")
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)

    rewritten = generator.rewrite_site(output, "responsive")
    sources = ("rest3.jpg", "courtyard.jpg", "scarlet.jpg", "tent.jpg")
    generated_files: list[dict] = []
    image_sources: list[dict] = []
    for filename in sources:
        stem = Path(filename).stem
        source = output / "assets" / "images" / filename
        full_size = output / "assets" / "images" / f"{stem}.webp"
        if source.is_symlink() or not source.is_file():
            fail(f"Responsive source photo is missing or unsafe: {filename}")
        if full_size.is_symlink() or not full_size.is_file():
            fail(f"Generator did not create the full-size WebP output for {filename}.")
        with generator.Image.open(source) as opened:
            opened.load()
            natural = generator.ImageOps.exif_transpose(opened)
            width, height = natural.size
        with generator.Image.open(full_size) as converted:
            converted.load()
            if converted.format != "WEBP" or converted.size != (width, height):
                fail(f"Full-size WebP failed decoded format/dimension verification: {full_size.name}")
        image_sources.append({
            "sourceJpeg": f"assets/images/{filename}",
            "naturalWidth": width,
            "naturalHeight": height,
            "fullSizeWebp": f"assets/images/{stem}.webp",
        })
        candidates = [full_size]
        responsive_dir = output / "assets" / "images" / "responsive"
        if responsive_dir.is_dir():
            candidates.extend(sorted(responsive_dir.glob(f"{stem}-*.webp")))
        for candidate in candidates:
            with generator.Image.open(candidate) as converted:
                converted.load()
                if converted.format != "WEBP":
                    fail(f"Responsive image candidate is not WebP: {candidate.relative_to(output)}")
                candidate_width, candidate_height = converted.size
            if candidate_width < 1 or candidate_height < 1 or candidate_width > width or candidate_height > height:
                fail(f"Responsive image candidate has unsafe dimensions: {candidate.relative_to(output)}")
            payload = candidate.read_bytes()
            generated_files.append({
                "path": candidate.relative_to(output).as_posix(),
                "bytes": len(payload),
                "sha256": digest_bytes(payload),
                "width": candidate_width,
                "height": candidate_height,
            })

    markup_validation = validate_responsive_markup(
        output, generated_files, image_sources, tuple(generator.RESPONSIVE_WIDTHS)
    )
    return {
        "enabled": True,
        "generationTarget": "isolated staging package; source checkout remains unchanged",
        "sourceImages": image_sources,
        "generatedWebpFileCount": len(generated_files),
        "generatedWebpFiles": sorted(generated_files, key=lambda item: item["path"]),
        "responsiveMarkupValidation": markup_validation,
        "rewrittenHtmlRoutes": [path.relative_to(output).as_posix() for path in rewritten],
    }


def validate_packaged_routes(output: Path) -> dict:
    """Reuse the existing route-integrity checker against the package, not the checkout."""
    checker_path = ROOT / "scripts" / "check-site.py"
    spec = importlib.util.spec_from_file_location("staging_package_site_integrity", checker_path)
    if spec is None or spec.loader is None:
        fail("Could not load the existing static-site integrity checker.")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    report = checker.audit_pages(output)
    errors = report.get("errors", [])
    if errors:
        preview = "\n".join(str(error) for error in errors[:25])
        fail("Packaged route integrity failed:\n" + preview)
    if report.get("pagesChecked", 0) < 9:
        fail(f"Expected at least nine root routes including 404.html; checked {report.get('pagesChecked', 0)}.")
    return {
        "pagesChecked": report["pagesChecked"],
        "errors": 0,
    }


def _validate_archive_member_path(path: object, label: str) -> str:
    """Require a normalized, relative POSIX path with no traversal or platform separators."""
    if (
        not isinstance(path, str)
        or not path
        or "\\" in path
        or "\x00" in path
        or ":" in path
    ):
        fail(f"{label} contains an unsafe archive member path: {path!r}")
    normalized = PurePosixPath(path)
    if (
        normalized.is_absolute()
        or str(normalized) != path
        or any(part in {"", ".", ".."} for part in path.split("/"))
    ):
        fail(f"{label} contains an unsafe archive member path: {path!r}")
    return path


def deterministic_archive(output: Path, archive: Path) -> None:
    """Create a reproducible ZIP and verify its exact payload against the release manifest."""
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for source in sorted(output.rglob("*")):
            relative = source.relative_to(output).as_posix()
            if source.is_symlink():
                fail(f"Unsafe packaged file: {relative}")
            if source.is_dir():
                continue
            if not source.is_file():
                fail(f"Unsafe packaged file: {relative}")
            _validate_archive_member_path(relative, "Package")
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100644 & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)

    with zipfile.ZipFile(archive, "r") as package:
        bad_member = package.testzip()
        if bad_member is not None:
            fail(f"Staging archive failed integrity validation at {bad_member}.")

        member_names = [info.filename for info in package.infolist()]
        if len(member_names) != len(set(member_names)):
            fail("Staging archive contains duplicate member paths.")
        for name in member_names:
            _validate_archive_member_path(name, "Archive")

        names = set(member_names)
        if "RELEASE-MANIFEST.json" not in names:
            fail("The staging archive does not contain RELEASE-MANIFEST.json.")
        try:
            manifest = json.loads(package.read("RELEASE-MANIFEST.json").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            fail(f"Release manifest is not valid UTF-8 JSON: {error}")
        if not isinstance(manifest, dict):
            fail("Release manifest must be a JSON object.")
        metrics = manifest.get("packageMetrics")
        if not isinstance(metrics, dict) or metrics.get("sizeBudgetPassed") is not True:
            fail("The release manifest must record a passing package-size budget.")
        if metrics.get("uncompressedPayloadBytes", MAX_UNCOMPRESSED_PACKAGE_BYTES + 1) > metrics.get("uncompressedBudgetBytes", 0):
            fail("The package payload exceeds its declared uncompressed-size budget.")
        if any(name.startswith("img/") for name in names):
            fail("The staging archive must not contain the source-only img/ asset library.")
        if manifest.get("deploymentPerformed") is not False:
            fail("The staging archive must explicitly state that no deployment was performed.")
        if manifest.get("releaseStatus") != "BLOCKED_PENDING_MANUAL_UAT":
            fail("The staging archive release status must remain blocked pending manual UAT.")
        if manifest.get("qualityGate") != "PASS":
            fail("The staging archive must include successful quality-gate provenance.")

        entries = manifest.get("files")
        if not isinstance(entries, list):
            fail("Release manifest files must be an array.")
        manifest_paths: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                fail("Release manifest contains a malformed file entry.")
            path = _validate_archive_member_path(entry.get("path"), "Manifest")
            if path == "RELEASE-MANIFEST.json":
                fail("Release manifest must not list itself as a payload file.")
            if path in manifest_paths:
                fail(f"Release manifest contains a duplicate file path: {path}")
            if path not in names:
                fail(f"Manifest file is missing from archive: {path}")
            byte_count = entry.get("bytes")
            if not isinstance(byte_count, int) or isinstance(byte_count, bool) or byte_count < 0:
                fail(f"Manifest byte count is invalid for packaged file: {path}")
            expected_sha = entry.get("sha256")
            if not isinstance(expected_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
                fail(f"Manifest SHA-256 is invalid for packaged file: {path}")
            data = package.read(path)
            if len(data) != byte_count or digest_bytes(data) != expected_sha:
                fail(f"Manifest digest mismatch for packaged file: {path}")
            manifest_paths.add(path)

        payload_names = names - {"RELEASE-MANIFEST.json"}
        unlisted = sorted(payload_names - manifest_paths)
        if unlisted:
            preview = ", ".join(unlisted[:10])
            fail(f"Archive contains payload files not listed in RELEASE-MANIFEST.json: {preview}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Temporary package webroot, outside the checkout.")
    parser.add_argument("--archive", type=Path, required=True, help="Output ZIP path, outside the checkout.")
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--event-name", choices=("pull_request", "push", "workflow_dispatch"), required=True)
    parser.add_argument("--quality-passed", action="store_true", required=True,
                        help="Required acknowledgement: run only after the full quality suite passes.")
    args = parser.parse_args()

    if not SHA_PATTERN.fullmatch(args.commit_sha):
        fail("--commit-sha must be a full hexadecimal commit SHA.")
    if not re.fullmatch(r"\d+", args.run_id):
        fail("--run-id must be numeric.")
    if not args.source_ref.strip() or "\n" in args.source_ref or "\r" in args.source_ref:
        fail("--source-ref must be a single non-empty ref string.")

    if args.output.exists() and args.output.is_symlink():
        fail("The package output path must not be a symlink.")
    if args.archive.exists() and args.archive.is_symlink():
        fail("The archive output path must not be a symlink.")
    output = args.output.resolve()
    archive = args.archive.resolve()
    if (
        is_within(output, ROOT) or is_within(ROOT, output)
        or is_within(archive, ROOT) or is_within(ROOT, archive)
    ):
        fail("Package output and archive must be outside, and must not contain, the repository checkout.")
    if output == archive or is_within(archive, output) or is_within(output, archive):
        fail("The archive path must be separate from and not contain the package webroot.")
    if output.exists():
        shutil.rmtree(output)
    if archive.exists():
        archive.unlink()
    output.mkdir(parents=True)

    files = checked_paths()
    source_config = json.loads((ROOT / "content" / "site-config.json").read_text(encoding="utf-8"))
    validate_staging_policy(
        source_config,
        (ROOT / "robots.txt").read_text(encoding="utf-8"),
        (ROOT / "sitemap.xml").read_text(encoding="utf-8"),
        (ROOT / ".htaccess").read_text(encoding="utf-8"),
        (ROOT / "sitemap-empty.xml").read_text(encoding="utf-8"),
        (ROOT / "robots-staging.txt").read_text(encoding="utf-8"),
    )
    copy_runtime_files(files, output)
    legacy_reference_report = validate_no_legacy_image_tree_references(output)
    responsive_report = apply_responsive_image_delivery(output)
    route_report = validate_packaged_routes(output)
    entries = inventory_package_files(output)
    legacy_inventory = legacy_source_image_inventory()
    package_metrics = package_size_metrics(entries, legacy_inventory)
    manifest = {
        "schemaVersion": 1,
        "artifactType": "static-site-staging-preview",
        "qualityGate": "PASS",
        "sourceCommit": args.commit_sha.lower(),
        "sourceRef": args.source_ref,
        "workflowRunId": args.run_id,
        "workflowEvent": args.event_name,
        "runtimeRouteCount": route_report["pagesChecked"],
        "sourceRouteCount": len(json.loads((ROOT / "content" / "staging-route-contract.json").read_text(encoding="utf-8"))["routes"]),
        "payloadFileCount": len(entries),
        "files": entries,
        "packageMetrics": package_metrics,
        "runtimeAssetClosure": legacy_reference_report,
        "responsiveImageDelivery": responsive_report,
        "releaseStatus": "BLOCKED_PENDING_MANUAL_UAT",
        "canonicalHostApproved": False,
        "publicIndexingEnabled": False,
        "robotsPolicy": "DISALLOW_ALL",
        "sitemapUrlCount": 0,
        "deploymentPerformed": False,
    }
    (output / "RELEASE-MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    deterministic_archive(output, archive)
    archive_bytes = archive.stat().st_size
    print("PASS: guarded staging preview package created after the full quality suite.")
    print(f"Routes checked: {route_report['pagesChecked']}")
    print(f"Runtime files: {len(entries)}")
    print(f"Legacy source image library excluded: {legacy_inventory['fileCount']} files / {legacy_inventory['bytesExcluded']} bytes")
    print(f"Uncompressed payload: {package_metrics['uncompressedPayloadBytes']} / {package_metrics['uncompressedBudgetBytes']} bytes ({package_metrics['budgetUtilizationPercent']}% of budget)")
    print(f"Verified responsive WebP files: {responsive_report['generatedWebpFileCount']}")
    print(f"Archive: {archive.name} ({archive_bytes} bytes)")
    print(f"SHA-256: {digest_bytes(archive.read_bytes())}")
    print("Release status: BLOCKED_PENDING_MANUAL_UAT (no deployment or indexing activation).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
