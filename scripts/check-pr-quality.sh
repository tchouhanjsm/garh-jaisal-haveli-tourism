#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== Static website integrity =="
bash scripts/check-site.sh

# Keep both regression suites covered when PR branches modify the same
# check-site.sh dispatcher independently. Do not run a suite twice if the
# current branch's dispatcher already invokes it.
if [[ -f scripts/test-site-js.js ]]; then
  command -v node >/dev/null 2>&1 || {
    echo "ERROR: scripts/test-site-js.js exists but Node.js is unavailable." >&2
    exit 1
  }
  if ! grep -Fq "test-site-js.js" scripts/check-site.sh; then
    echo "== Mobile navigation behavior tests =="
    node scripts/test-site-js.js
  fi
fi

if [[ -f scripts/test_localize_images.py ]]; then
  if ! grep -Fq "test_localize_images.py" scripts/check-site.sh; then
    echo "== Image localization regression tests =="
    python3 scripts/test_localize_images.py
  fi
fi

echo "== Python source compilation =="
python3 -m py_compile scripts/*.py

echo "== Shell syntax =="
for script in scripts/*.sh; do
  [[ -f "$script" ]] || continue
  bash -n "$script"
done

echo "PASS: consolidated PR quality gates completed."
