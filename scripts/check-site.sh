#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
python3 scripts/check-site.py
if command -v node >/dev/null 2>&1; then node --check assets/site.js; node scripts/test-site-js.js; else echo "NOTE: Node.js not found; skipped JavaScript syntax and behavior checks."; fi
bash -n scripts/create-github-repo.sh scripts/localize-images.sh
echo "PASS: JavaScript and shell syntax checks completed."
