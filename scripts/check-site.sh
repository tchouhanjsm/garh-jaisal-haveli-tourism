#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
python3 scripts/check-site.py
python3 scripts/test_localize_images.py
if command -v node >/dev/null 2>&1; then node --check assets/site.js; else echo "NOTE: Node.js not found; skipped JavaScript syntax check."; fi
bash -n scripts/create-github-repo.sh scripts/localize-images.sh
echo "PASS: site integrity, image-localization regression tests, and available JavaScript/shell checks completed."
