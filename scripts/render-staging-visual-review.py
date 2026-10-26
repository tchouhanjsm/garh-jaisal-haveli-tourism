#!/usr/bin/env python3
"""Render an offline, integrity-checked HTML index for staging screenshots.

This utility reads saved evidence only. It never contacts the staging host and
never clears the manual UAT or release gates.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import ipaddress
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PAGES = [
    ("index.html", "Home"),
    ("rooms.html", "Rooms"),
    ("experiences.html", "Experiences"),
    ("dining.html", "Dining"),
    ("about.html", "About"),
    ("directions.html", "Directions"),
    ("gallery.html", "Gallery"),
]
VIEWPORTS = [(360, 800, "Mobile"), (768, 1024, "Tablet"), (1440, 900, "Desktop")]
SHA_PATTERN = re.compile(r"[0-9a-f]{64}")
URL_PATTERN = re.compile(r"""https?://[^\s<>'"]+""", re.IGNORECASE)


def expected_names() -> list[str]:
    return [f"{Path(page).stem}-{width}px.png" for width, _height, _label in VIEWPORTS for page, _title in PAGES]


def inside_checkout(path: Path) -> bool:
    resolved = path.expanduser().resolve()
    return resolved == ROOT or ROOT in resolved.parents


def validate_paths(report_path: str, screenshots_path: str, output_path: str) -> tuple[Path, Path, Path]:
    report = Path(report_path).expanduser().resolve()
    screenshots = Path(screenshots_path).expanduser().resolve()
    output = Path(output_path).expanduser().resolve()
    if report.suffix.lower() != ".json" or not report.is_file():
        raise ValueError("report must be an existing JSON file")
    if inside_checkout(report):
        raise ValueError("read the JSON report from outside the repository checkout")
    if not screenshots.is_dir():
        raise ValueError("screenshot directory must already exist")
    if inside_checkout(screenshots):
        raise ValueError("read screenshots from outside the repository checkout")
    if output.suffix.lower() != ".html":
        raise ValueError("output must end in .html")
    if inside_checkout(output):
        raise ValueError("write the HTML review outside the repository checkout")
    if output == report or output.parent != screenshots.parent:
        raise ValueError("HTML output must be separate from the JSON report and beside the screenshot directory")
    if output == screenshots or screenshots in output.parents:
        raise ValueError("HTML output must not be inside the screenshot directory")
    return report, screenshots, output


def png_dimensions(payload: bytes) -> tuple[int, int]:
    if len(payload) < 24 or payload[:8] != PNG_SIGNATURE or payload[12:16] != b"IHDR":
        raise ValueError("invalid PNG signature or IHDR")
    width, height = int.from_bytes(payload[16:20], "big"), int.from_bytes(payload[20:24], "big")
    if width <= 0 or height <= 0:
        raise ValueError("invalid PNG geometry")
    return width, height


def safe_origin(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parts = urlsplit(value.strip())
        if (parts.scheme.lower() != "https" or not parts.hostname
                or parts.username is not None or parts.password is not None
                or parts.path not in ("", "/") or parts.query or parts.fragment):
            return None
        host = parts.hostname.lower()
        if host == "localhost" or host.endswith((".localhost", ".local")):
            return None
        try:
            ipaddress.ip_address(host)
            return None
        except ValueError:
            pass
        if ":" in host:
            host = f"[{host}]"
        port = parts.port
        if port is not None and port != 443:
            host += f":{port}"
        return f"https://{host}"
    except ValueError:
        return None


def redact_urls(value: object) -> str:
    def redact(match: re.Match[str]) -> str:
        raw = match.group(0)
        suffix = ""
        while raw and raw[-1] in ".,;:!)]}":
            suffix = raw[-1] + suffix
            raw = raw[:-1]
        try:
            parts = urlsplit(raw)
            if not parts.hostname:
                return "[URL redacted]" + suffix
            host = parts.hostname.lower()
            if ":" in host:
                host = f"[{host}]"
            port = parts.port
            default_port = 80 if parts.scheme.lower() == "http" else 443
            if port is not None and port != default_port:
                host += f":{port}"
            return f"{parts.scheme.lower()}://{host}{parts.path or '/'}" + suffix
        except ValueError:
            return "[URL redacted]" + suffix
    return URL_PATTERN.sub(redact, str(value))


def production_origins() -> set[str]:
    try:
        config = json.loads((ROOT / "content/site-config.json").read_text(encoding="utf-8"))
        site = config.get("site", {})
        return {origin for value in (site.get("legacyProductionUrl"), site.get("newStaticSiteCanonicalHost"))
                if (origin := safe_origin(value))}
    except (OSError, json.JSONDecodeError, AttributeError):
        return set()


def load_report(path: Path) -> dict:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read valid JSON report ({type(error).__name__})") from error
    if not isinstance(report, dict) or report.get("schemaVersion") != 3:
        raise ValueError("expected a schema-version 3 report")
    if report.get("mode") != "staging-read-only":
        raise ValueError("report must come from staging-read-only mode")
    return report


def inspect_bundle(report: dict, screenshots: Path) -> tuple[list[dict], list[str]]:
    issues: list[str] = []
    origin = safe_origin(report.get("targetUrl"))
    if origin is None:
        issues.append("Target origin is invalid; it is withheld from the HTML.")
    elif origin in production_origins():
        issues.append("Report names a configured production origin, not an accepted staging origin.")
    expected_pages = [page for page, _title in PAGES]
    expected_widths = [width for width, _height, _label in VIEWPORTS]
    if report.get("pagesPlanned") != expected_pages:
        issues.append("Planned routes do not match the seven expected site pages.")
    if report.get("pagesAttempted") != expected_pages:
        issues.append("The report does not record attempts for all seven routes in the expected order.")
    if report.get("pagesWithHttp200OnTargetOrigin") != expected_pages:
        issues.append("The report does not record target-origin HTTP 200 responses for all seven routes.")
    if report.get("plannedViewportWidthsCssPixels") != expected_widths:
        issues.append("Planned viewport widths do not match 360, 768 and 1440 CSS pixels.")
    if report.get("completedResponsiveViewportWidthsCssPixels") != expected_widths:
        issues.append("The report does not record completion of all planned responsive viewport widths.")
    coverage = report.get("evidenceCoverage")
    if not isinstance(coverage, dict) or coverage.get("complete") is not True:
        issues.append("Report does not declare complete route, HTTP and viewport coverage.")
    evidence = report.get("visualEvidence")
    if not isinstance(evidence, dict):
        evidence = {}
        issues.append("Report is missing visualEvidence.")
    records = evidence.get("capturedFiles")
    if not isinstance(records, list):
        records = []
        issues.append("capturedFiles is not a list.")
    names = [item.get("filename") if isinstance(item, dict) else None for item in records]
    expected = expected_names()
    if names != expected:
        issues.append("Report does not list the exact 21 screenshot names in the planned order.")
    if evidence.get("complete") is not True or evidence.get("capturedScreenshotCount") != 21:
        issues.append("Report does not declare complete 21-image visual evidence.")
    if report.get("automatedResult") not in ("PASS", "FAIL"):
        issues.append("Report has no recognized automatedResult.")
    if report.get("automatedResult") == "PASS" and report.get("automatedFailures"):
        issues.append("Report claims automated PASS but contains automated failures.")
    manual = report.get("manualReleaseChecks")
    expected_ids = [f"STG-{number:02d}" for number in range(1, 18)]
    if (not isinstance(manual, list) or len(manual) != 17
            or [item.get("id") for item in manual if isinstance(item, dict)] != expected_ids
            or any(not isinstance(item, dict) or item.get("result") != "NOT RUN" for item in manual)):
        issues.append("Manual release checks are missing or changed; release remains blocked.")

    by_name: dict[str, list[dict]] = {}
    for record in records:
        if isinstance(record, dict) and isinstance(record.get("filename"), str):
            by_name.setdefault(record["filename"], []).append(record)

    page_map = {Path(page).stem: (page, title) for page, title in PAGES}
    viewport_map = {width: (height, label) for width, height, label in VIEWPORTS}
    results: list[dict] = []
    for filename in expected:
        match = re.fullmatch(r"([a-z-]+)-(360|768|1440)px\.png", filename)
        assert match is not None
        page_stem, width_text = match.groups()
        width = int(width_text)
        page_file, page_title = page_map[page_stem]
        viewport_height, viewport_label = viewport_map[width]
        result = {"filename": filename, "pageFile": page_file, "pageTitle": page_title,
                  "width": width, "viewportHeight": viewport_height, "viewportLabel": viewport_label,
                  "valid": False, "issue": None, "bytes": None, "imageWidth": None,
                  "imageHeight": None, "sha256": None}
        matches = by_name.get(filename, [])
        if len(matches) != 1:
            result["issue"] = "Missing or duplicate screenshot record."
            issues.append(f"{result['issue']} {filename}")
            results.append(result)
            continue
        record = matches[0]
        if (record.get("viewportWidthCssPixels") != width
                or record.get("viewportHeightCssPixels") != viewport_height
                or record.get("imageWidthPixels") != width
                or not isinstance(record.get("imageHeightPixels"), int)
                or record.get("imageHeightPixels", 0) <= 0
                or record.get("fullPage") is not True
                or not isinstance(record.get("bytes"), int) or record.get("bytes", 0) <= 0
                or not isinstance(record.get("sha256"), str)
                or SHA_PATTERN.fullmatch(record.get("sha256", "")) is None):
            result["issue"] = "Screenshot metadata is incomplete or invalid."
            issues.append(f"{result['issue']} {filename}")
            results.append(result)
            continue

        raw_path = screenshots / filename
        if raw_path.is_symlink():
            result["issue"] = "Screenshot must not be a symbolic link."
            issues.append(f"{result['issue']} {filename}")
            results.append(result)
            continue
        image_path = raw_path.resolve()
        if image_path.parent != screenshots or not image_path.is_file():
            result["issue"] = "Screenshot file is missing or escapes the selected directory."
            issues.append(f"{result['issue']} {filename}")
            results.append(result)
            continue
        payload = image_path.read_bytes()
        try:
            image_width, image_height = png_dimensions(payload)
        except ValueError:
            result["issue"] = "Screenshot PNG header is invalid."
            issues.append(f"{result['issue']} {filename}")
            results.append(result)
            continue
        mismatch = []
        if len(payload) != record["bytes"]:
            mismatch.append("byte count mismatch")
        if hashlib.sha256(payload).hexdigest() != record["sha256"]:
            mismatch.append("SHA-256 mismatch")
        if image_width != width or image_height != record["imageHeightPixels"]:
            mismatch.append("PNG geometry mismatch")
        if mismatch:
            result["issue"] = "Screenshot integrity mismatch: " + ", ".join(mismatch) + "."
            issues.append(f"{result['issue']} {filename}")
            results.append(result)
            continue
        result.update({"valid": True, "bytes": len(payload), "imageWidth": image_width,
                       "imageHeight": image_height, "sha256": hashlib.sha256(payload).hexdigest()})
        results.append(result)
    return results, list(dict.fromkeys(issues))


def build_html(report: dict, screenshots: Path, results: list[dict], issues: list[str]) -> str:
    origin = safe_origin(report.get("targetUrl"))
    if origin in production_origins():
        origin = None
    origin_text = html.escape(origin or "Origin withheld — invalid or configured production origin")
    operator = html.escape(str(report.get("operator") or "Not recorded"))
    recorded = html.escape(str(report.get("recordedAtAsiaKolkata") or "Not recorded"))
    browser = report.get("browser") if isinstance(report.get("browser"), dict) else {}
    browser_text = html.escape(f"{browser.get('name', 'Unknown')} {browser.get('version', 'Unknown')}")
    automated = report.get("automatedResult")
    if automated not in ("PASS", "FAIL"):
        automated = "UNKNOWN"
    verified = sum(item["valid"] for item in results)
    bundle_ok = not issues and verified == 21
    bundle_text = "PASS — 21 files verified" if bundle_ok else f"FAIL — evidence issues; {verified}/21 screenshots verified"
    bundle_class = "pass" if bundle_ok else "fail"
    automated_class = "pass" if automated == "PASS" else "fail"
    folder = quote(screenshots.name, safe="-._~")
    generated = html.escape(datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"))
    by_name = {item["filename"]: item for item in results}
    sections = []
    for page_file, page_title in PAGES:
        stem = Path(page_file).stem
        cards = []
        for width, _height, label in VIEWPORTS:
            filename = f"{stem}-{width}px.png"
            item = by_name[filename]
            title = f"{page_title} · {label} · {width} CSS pixels"
            if item["valid"]:
                src = html.escape(f"{folder}/{quote(filename, safe='-._~')}", quote=True)
                image = (f'<a href="{src}" target="_blank" rel="noopener" aria-label="Open full-size {html.escape(title, quote=True)}">'
                         f'<img src="{src}" alt="Full-page screenshot of {html.escape(page_title, quote=True)} at {width} CSS pixels" '
                         f'width="{item["imageWidth"]}" height="{item["imageHeight"]}" loading="lazy" decoding="async"></a>')
                details = (f'<dl><div><dt>PNG geometry</dt><dd>{item["imageWidth"]} × {item["imageHeight"]} px</dd></div>'
                           f'<div><dt>Bytes</dt><dd>{item["bytes"]:,}</dd></div>'
                           f'<div><dt>SHA-256</dt><dd><code>{item["sha256"]}</code></dd></div></dl>')
                status = '<span class="pass">Integrity verified</span>'
            else:
                image = f'<div class="placeholder" role="status">{html.escape(item["issue"] or "Evidence missing.")}</div>'
                details = ""
                status = '<span class="fail">Not verified</span>'
            cards.append(f'<article class="card"><header><h3>{html.escape(label)} · {width}px</h3>{status}</header>'
                         f'{image}<p class="filename">{html.escape(filename)}</p>{details}</article>')
        anchor = f"page-{stem}"
        sections.append(f'<section id="{anchor}" aria-labelledby="{anchor}-title"><div class="page-heading">'
                        f'<div><p class="eyebrow">{html.escape(page_file)}</p><h2 id="{anchor}-title">{html.escape(page_title)}</h2></div>'
                        f'<a href="#top">Back to summary ↑</a></div><div class="grid">{"".join(cards)}</div></section>')
    issues_html = ""
    if issues:
        issues_html = '<section class="issues"><h2>Evidence integrity issues</h2><ul>' + "".join(
            f"<li>{html.escape(issue)}</li>" for issue in issues) + "</ul></section>"
    failures = report.get("automatedFailures")
    failures = failures if isinstance(failures, list) else []
    failures_html = ""
    if failures:
        failures_html = '<section class="issues"><h2>Automated browser findings</h2><ul>' + "".join(
            f"<li>{html.escape(redact_urls(item))}</li>" for item in failures[:100]) + "</ul></section>"
    nav = "".join(f'<a href="#page-{Path(page).stem}">{html.escape(title)}</a>' for page, title in PAGES)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><title>Garh Jaisal Haveli — Staging visual review</title>
<style>
:root{{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#29251f;background:#f4efe5;line-height:1.5}}
*{{box-sizing:border-box}}body{{margin:0}}main{{max-width:1800px;margin:auto;padding:clamp(1rem,3vw,2.5rem)}}
.hero{{background:#e7ddcc;border:1px solid #c9b89e;padding:clamp(1.2rem,3vw,2.2rem);border-radius:1rem}}
h1,h2,h3,p{{margin-top:0}}h1{{font-size:clamp(2rem,4vw,3.5rem);line-height:1.08;margin-bottom:1rem}}h2{{font-size:clamp(1.5rem,2.5vw,2.1rem);margin-bottom:.4rem}}h3{{font-size:1rem;margin:0}}
.eyebrow{{font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:#655541;margin-bottom:.45rem}}
.summary{{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem;margin:1.4rem 0}}
.metric{{padding:1rem;background:#fffdf8;border:1px solid #d8cbb8;border-radius:.65rem;overflow-wrap:anywhere}}.metric strong{{display:block;font-size:1.05rem;margin-top:.25rem}}
.pass{{color:#17633b;font-weight:700}}.fail{{color:#9a2525;font-weight:700}}.notice{{padding:1rem;border-left:4px solid #8a5d27;background:#fff7e6;margin:1rem 0}}
nav{{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.2rem 0 2rem}}nav a,.page-heading a{{color:#624321;text-underline-offset:.2em}}nav a{{padding:.45rem .7rem;background:#fffdf8;border:1px solid #d8cbb8;border-radius:999px}}
section{{margin:2rem 0 3rem;scroll-margin-top:1rem}}.page-heading{{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:1rem}}
.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;align-items:start}}
.card{{min-width:0;background:#fffdf8;border:1px solid #d8cbb8;border-radius:.7rem;padding:.75rem;box-shadow:0 2px 8px #392c1a0c}}
.card header{{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.6rem}}img{{display:block;width:100%;height:auto;max-width:100%}}
.card a{{display:block;border:1px solid #e1d7c8;background:#eee7dc}}a:focus-visible{{outline:3px solid #8b5b20;outline-offset:3px}}
.filename{{font-size:.78rem;color:#625b52;overflow-wrap:anywhere;margin:.6rem 0}}dl{{font-size:.75rem;margin:.5rem 0 0}}dl div{{margin:.35rem 0}}dt{{color:#6c6257}}dd{{margin:0;overflow-wrap:anywhere;word-break:break-word}}
.placeholder{{min-height:8rem;display:grid;place-items:center;text-align:center;padding:1rem;background:#f8e8e4;color:#8b2727;border:1px dashed #b87970}}
.issues{{background:#fff5f2;border:1px solid #d7a69d;border-radius:.7rem;padding:1rem;margin:1.5rem 0}}.issues li{{overflow-wrap:anywhere;margin:.35rem 0}}
footer{{border-top:1px solid #c9b89e;padding-top:1rem;color:#5f574d;font-size:.9rem}}
@media(max-width:900px){{.grid{{grid-template-columns:1fr 1fr}}}}@media(max-width:560px){{main{{padding:.8rem}}.grid{{grid-template-columns:1fr}}.page-heading{{align-items:start;flex-direction:column}}}}
@media print{{body{{background:white}}main{{max-width:none;padding:0}}nav{{display:none}}section{{break-inside:avoid}}.grid{{gap:.4rem}}.card{{box-shadow:none}}.notice{{break-inside:avoid}}}}
</style></head><body><main id="top">
<header class="hero"><p class="eyebrow">Garh Jaisal Haveli · Offline QA artifact</p><h1>Staging visual review</h1>
<p>Compare the seven-page guest journey at mobile, tablet and desktop widths. This page uses saved evidence only and does not contact the staging host.</p>
<div class="summary" aria-label="Evidence summary">
<div class="metric">Automated browser result<strong class="{automated_class}">{html.escape(automated)}</strong></div>
<div class="metric">Evidence integrity<strong class="{bundle_class}">{html.escape(bundle_text)}</strong></div>
<div class="metric">Target origin<strong>{origin_text}</strong></div><div class="metric">Operator<strong>{operator}</strong></div>
<div class="metric">Recorded at (Asia/Kolkata)<strong>{recorded}</strong></div><div class="metric">Browser<strong>{browser_text}</strong></div>
<div class="metric">Human release status<strong class="fail">BLOCKED — manual UAT required</strong></div></div>
<div class="notice"><strong>Release guard:</strong> A verified screenshot bundle is not staging UAT or launch approval. Human booking/contact checks, owner fact confirmation, canonical/DNS/SSL approval, backup/rollback and deployment authorization remain separate.</div>
<p>Review index generated at {generated}. Image links use relative filenames only; no local filesystem path is embedded in this HTML.</p></header>
<nav aria-label="Jump to page screenshots">{nav}</nav>{issues_html}{failures_html}
{"".join(sections)}
<footer><p>Local review only. No booking, payment, guest-data submission, WhatsApp message, phone call or email was initiated.</p>
<p>This page never clears human release gates; STG-01 through STG-17 remain blocked pending real operator evidence.</p></footer>
</main></body></html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render an offline HTML review for a saved staging screenshot bundle.")
    parser.add_argument("--report", required=True, help="Existing schema-v3 staging JSON report outside the checkout")
    parser.add_argument("--screenshots-dir", required=True, help="Directory containing the screenshot PNGs, outside the checkout")
    parser.add_argument("--output", required=True, help="HTML output beside the screenshot directory and outside the checkout")
    args = parser.parse_args(argv)
    try:
        report_path, screenshots, output = validate_paths(args.report, args.screenshots_dir, args.output)
        report = load_report(report_path)
        results, issues = inspect_bundle(report, screenshots)
        output.write_text(build_html(report, screenshots, results, issues), encoding="utf-8")
    except (ValueError, OSError) as error:
        print(f"BLOCKED: visual review was not generated ({type(error).__name__}): {redact_urls(error)}", file=sys.stderr)
        return 2
    verified = sum(item["valid"] for item in results)
    if issues or verified != 21 or report.get("automatedResult") != "PASS":
        print(f"FAIL: HTML review written; screenshot integrity {verified}/21; automated result {report.get('automatedResult')}; manual UAT remains blocked.")
        return 1
    print("PASS: offline HTML review written; all 21 screenshots match report byte counts, SHA-256 and PNG geometry. Manual UAT remains blocked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
