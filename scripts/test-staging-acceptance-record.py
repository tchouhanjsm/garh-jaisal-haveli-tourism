#!/usr/bin/env python3
"""Contract tests for the operator-run staging acceptance record template."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / "docs" / "STAGING-ACCEPTANCE-RECORD.md"
CHECKLIST = ROOT / "docs" / "LAUNCH-READINESS-CHECKLIST.md"
README = ROOT / "README.md"

record = RECORD.read_text(encoding="utf-8")
checklist = CHECKLIST.read_text(encoding="utf-8")
readme = README.read_text(encoding="utf-8")

required_fields = (
    "Intended staging URL",
    "Main commit SHA under test",
    "Date/time (Asia/Kolkata)",
    "Operator",
    "Browser and version",
    "Device / OS / viewport",
    "Overall result",
    "Evidence / notes",
    "Follow-up owner",
    "Automated JSON report path and SHA-256",
    "Screenshot bundle location",
    "Offline visual review HTML location",
)
for field in required_fields:
    assert field in record, f"acceptance record is missing required field: {field}"

assert "NOT ENTERED — fill only after the owner approves the exact HTTPS staging origin" in record
assert "| Overall result | NOT RUN |" in record
assert "| Overall release status | BLOCKED_PENDING_MANUAL_UAT |" in record
assert "No real reservation" in record or "Do not submit a real reservation" in record
assert "Do not commit screenshots" in record
assert "do not book or pay" in record.lower()
assert "canonical URLs or sitemap entries" in record
assert "guest enquiries server-side" in record

expected_stg = [f"STG-{number:02d}" for number in range(1, 19)]
stg_rows = []
for line in record.splitlines():
    if re.match(r"^\| STG-\d{2} \|", line):
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        assert len(cells) == 9, f"STG row must have nine cells: {line}"
        assert cells[6] == "NOT RUN", f"manual gate must default to NOT RUN: {cells[0]}"
        stg_rows.append(cells[0])
assert stg_rows == expected_stg, f"STG rows must be complete, unique and ordered: {stg_rows}"

expected_owner = [f"OWN-{number:02d}" for number in range(1, 10)]
owner_rows = []
for line in record.splitlines():
    if re.match(r"^\| OWN-\d{2} \|", line):
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        assert len(cells) == 5, f"owner gate row must have five cells: {line}"
        assert cells[3] == "NOT RUN", f"owner gate must default to NOT RUN: {cells[0]}"
        owner_rows.append(cells[0])
assert owner_rows == expected_owner, f"owner gates must be complete, unique and ordered: {owner_rows}"

assert "STAGING-ACCEPTANCE-RECORD.md" in checklist, "launch checklist must link to the per-run record"
assert "STAGING-ACCEPTANCE-RECORD.md" in readme, "README must link to the per-run record"
assert not re.search(r"https://(?:www\.)?hotelgarhjaisal\.com", record, re.I), (
    "template must not preselect an unapproved production hostname"
)
assert not re.search(r"https://staging\.[^\s|)]+", record, re.I), (
    "template must not invent a staging hostname"
)

print(
    "PASS: staging acceptance template captures URL/build/date/operator/browser/evidence, "
    "and all 18 manual checks plus nine owner gates default to NOT RUN."
)
