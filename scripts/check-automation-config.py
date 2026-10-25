#!/usr/bin/env python3
"""Dependency-free guardrails for scheduled automation configuration."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
checks = {
    ".github/workflows/site-checks.yml": [
        "pull_request:",
        "./scripts/check-site.sh",
        "scripts/check-automation-config.py",
    ],
    ".github/workflows/autonomous-development.yml": [
        "*/30 * * * *",
        "vars.AUTOMATION_ENABLED == 'true'",
        "openai/codex-action@v1",
        'permission-profile: ":workspace"',
        "cancel-in-progress: false",
        "AUTOMATION_GITHUB_TOKEN",
        "scripts/guard-agent-diff.py",
        "actions/upload-artifact@v4",
    ],
    ".github/workflows/strategy-audit.yml": [
        "23 */2 * * *",
        "vars.STRATEGY_AUDIT_ENABLED == 'true'",
        "openai/codex-action@v1",
        'permission-profile: ":read-only"',
        "Scheduled Strategy Review",
        "actions/upload-artifact@v4",
    ],
    "prompts/development-orchestrator.md": [
        "Hard safety boundaries",
        "docs/agent-state.md",
        "Never push",
    ],
    "prompts/strategy-auditor.md": [
        "Non-negotiable read-only boundary",
        "Do not edit tracked or untracked project files",
        "Required ending",
    ],
    "docs/agent-state.md": [
        "Prioritized backlog",
        "Risks and blockers",
        "Next action",
    ],
}

errors: list[str] = []
for relpath, needles in checks.items():
    path = ROOT / relpath
    if not path.is_file():
        errors.append(f"missing required file: {relpath}")
        continue
    content = path.read_text(encoding="utf-8")
    for needle in needles:
        if needle not in content:
            errors.append(f"{relpath}: missing required guard/config text: {needle}")

development = (ROOT / ".github/workflows/autonomous-development.yml").read_text(encoding="utf-8")
audit = (ROOT / ".github/workflows/strategy-audit.yml").read_text(encoding="utf-8")
if "contents: write" in development.split("publish-proposal:", 1)[0]:
    errors.append("the development agent job must not receive contents: write")
if "pull-requests: write" in development.split("publish-proposal:", 1)[0]:
    errors.append("the development agent job must not receive pull-requests: write")
audit_agent = audit.split("publish-report:", 1)[0]
if "contents: write" in audit_agent or "pull-requests: write" in audit_agent or "issues: write" in audit_agent:
    errors.append("the strategy agent job must remain read-only")

if errors:
    print(f"FAIL: {len(errors)} automation configuration issue(s)")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print(f"PASS: {len(checks)} automation configuration files/requirements verified.")
