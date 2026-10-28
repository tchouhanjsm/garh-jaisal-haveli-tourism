#!/usr/bin/env python3
"""Build a verified, non-deploying staging preview package after CI quality gates."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIRECTORIES = ("assets", "img", "blogs", "tours", "gallery")
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


def deterministic_archive(output: Path, archive: Path) -> None:
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for source in sorted(output.rglob("*")):
            if source.is_dir():
                continue
            relative = source.relative_to(output).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100644 & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)

    with zipfile.ZipFile(archive, "r") as package:
        bad_member = package.testzip()
        if bad_member is not None:
            fail(f"Staging archive failed integrity validation at {bad_member}.")
        names = set(package.namelist())
        if "RELEASE-MANIFEST.json" not in names:
            fail("The staging archive does not contain RELEASE-MANIFEST.json.")
        manifest = json.loads(package.read("RELEASE-MANIFEST.json").decode("utf-8"))
        if manifest.get("deploymentPerformed") is not False:
            fail("The staging archive must explicitly state that no deployment was performed.")
        if manifest.get("releaseStatus") != "BLOCKED_PENDING_MANUAL_UAT":
            fail("The staging archive release status must remain blocked pending manual UAT.")
        if manifest.get("qualityGate") != "PASS":
            fail("The staging archive must include successful quality-gate provenance.")
        for entry in manifest.get("files", []):
            path = entry["path"]
            if path not in names:
                fail(f"Manifest file is missing from archive: {path}")
            data = package.read(path)
            if len(data) != entry["bytes"] or digest_bytes(data) != entry["sha256"]:
                fail(f"Manifest digest mismatch for packaged file: {path}")


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

    output = args.output.resolve()
    archive = args.archive.resolve()
    if is_within(output, ROOT) or is_within(archive, ROOT):
        fail("Package output and archive must be placed outside the repository checkout.")
    if output == archive or is_within(archive, output):
        fail("The archive path must be separate from the package webroot.")
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
    entries = copy_runtime_files(files, output)
    route_report = validate_packaged_routes(output)
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
