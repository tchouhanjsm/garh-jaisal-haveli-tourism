#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Static website integrity =="
bash scripts/check-site.sh
node scripts/test-content-ux.js
node scripts/test-room-finder.js
node scripts/test-dining-journey.js
node scripts/test-experience-details.js
node scripts/test-experience-discovery.js
node scripts/test-guest-enquiry-conversion.js
node scripts/test-experience-carousel.js
node scripts/test-media-manifest.js
node scripts/test-page-media-performance.js
node scripts/test-public-image-uniqueness-contract.js
node scripts/test-public-image-uniqueness.js
node scripts/test-seo-publication-safeguards-contract.js
node scripts/test-seo-publication-safeguards.js

echo "== Shared public-route and staging evidence contract =="
python3 scripts/test-public-route-contract.py

echo "== Staging preflight safety/report contract tests =="
python3 scripts/test-staging-preflight-contract.py
python3 scripts/test-staging-visual-review.py

echo "== Static accessibility contract across public HTML routes =="
python3 scripts/test-static-accessibility-contract.py
python3 scripts/test-static-accessibility.py

echo "== Real Chromium browser guest-journey smoke tests =="
python3 scripts/test-browser-smoke.py

echo "== Deterministic static content renderer =="
node scripts/build-content-pages.js --check
node scripts/test-content-renderer.js
echo "== Registry-safe Content Studio pack importer =="
node --check scripts/import-content-pack.js
node scripts/test-content-pack-import.js
echo "== Verified enquiry channel behavior =="
node scripts/test-enquiry-flow.js

echo "== Launch readiness safeguard checks (not live integration proof) =="
node scripts/test-launch-readiness.js

echo "== Content contract =="
node scripts/validate-content.js
node scripts/test-content-contract.js

if [[ -f scripts/test-site-js.js ]] && ! grep -Fq "test-site-js.js" scripts/check-site.sh; then
  echo "== Navigation behavior tests =="
  node scripts/test-site-js.js
fi

if [[ -f scripts/test_localize_images.py ]] && ! grep -Fq "test_localize_images.py" scripts/check-site.sh; then
  echo "== Image localization regression tests =="
  python3 scripts/test_localize_images.py
fi

echo "== Python source compilation =="
python3 -m py_compile scripts/*.py

echo "== Shell syntax =="
for script in scripts/*.sh; do
  [[ -f "$script" ]] || continue
  bash -n "$script"
done

echo "PASS: local project validation completed."
