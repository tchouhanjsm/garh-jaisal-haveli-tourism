#!/usr/bin/env python3
"""Block autonomous proposals that touch protected paths or exceed a reviewable size."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import PurePosixPath

if len(sys.argv) != 2:
    print("Usage: guard-agent-diff.py <base-sha>", file=sys.stderr)
    raise SystemExit(2)

base = sys.argv[1]


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


changed = [p for p in git("diff", "--name-only", "--no-renames", base, "--").splitlines() if p]
deleted = [p for p in git("diff", "--diff-filter=D", "--name-only", base, "--").splitlines() if p]

def is_allowed(path: str) -> bool:
    p = PurePosixPath(path)
    if len(p.parts) == 1 and p.suffix.lower() == ".html":
        return True
    if path in {
        "assets/site.css",
        "assets/site.js",
        "favicon.svg",
        "docs/agent-state.md",
        "docs/CONTENT-AND-CONVERSION.md",
        "docs/LAUNCH-CHECKLIST.md",
        "docs/TESTIMONIAL-COLLECTION.md",
    }:
        return True
    if path.startswith("assets/images/") and len(p.parts) >= 3:
        return True
    return False

blocked = [p for p in changed if not is_allowed(p)]
if deleted:
    blocked.extend(f"{p} (deletion is not allowed)" for p in deleted)

if blocked:
    print("BLOCKED: autonomous proposal touched protected paths:")
    for path in sorted(set(blocked)):
        print(f" - {path}")
    print("This workflow intentionally requires human review for workflow, script, hosting, indexing, security, or deployment changes.")
    raise SystemExit(1)

numstat = git("diff", "--numstat", base, "--").splitlines()
total_added = 0
for line in numstat:
    parts = line.split("\t", 2)
    if len(parts) >= 2 and parts[0].isdigit():
        total_added += int(parts[0])
if total_added > 1500:
    print(f"BLOCKED: proposal adds {total_added} text lines; limit is 1500 additions per PR.", file=sys.stderr)
    raise SystemExit(1)

diff = git("diff", "--no-ext-diff", base, "--")
secret_patterns = [
    r"sk-[A-Za-z0-9_-]{20,}",
    r"gh[pousr]_[A-Za-z0-9]{20,}",
    r"github_pat_[A-Za-z0-9_]{20,}",
    r"AKIA[0-9A-Z]{16}",
]
for pattern in secret_patterns:
    if re.search(pattern, diff):
        print("BLOCKED: likely credential material found in the proposed diff.", file=sys.stderr)
        raise SystemExit(1)

print(f"PASS: {len(changed)} changed path(s) are within the allowlist; {total_added} text line addition(s).")
