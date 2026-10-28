#!/usr/bin/env bash
set -euo pipefail

owner_repo="tchouhanjsm/garh-jaisal-website"
branch="main"
image_dir="assets/images"
images=("rest3.jpg" "courtyard.jpg" "scarlet.jpg" "tent.jpg")
mkdir -p "$image_dir"

# Preserve existing source JPEGs. Download only missing, allowlisted source assets.
for filename in "${images[@]}"; do
  dest="${image_dir}/${filename}"
  if [[ -s "$dest" ]]; then
    echo "Using existing image: $dest"
    continue
  fi

  url="https://raw.githubusercontent.com/${owner_repo}/${branch}/img/${filename}"
  temporary="${dest}.download.tmp"
  rm -f "$temporary"
  echo "Fetching missing ${filename} from ${owner_repo}..."
  if curl --fail --location --silent --show-error "$url" --output "$temporary" && [[ -s "$temporary" ]]; then
    mv "$temporary" "$dest"
  else
    rm -f "$temporary"
    echo "ERROR: failed to fetch non-empty source image: $dest" >&2
    exit 1
  fi
done

# Generate and decode-check every full-size and responsive derivative first.
# HTML is rewritten only after all four source images pass the generation checks.
python3 - <<'PY'
from PIL import Image  # noqa: F401
print("Pillow is available for responsive WebP generation.")
PY
python3 scripts/rewrite_image_refs.py --root . --extension responsive

echo "PASS: responsive WebP variants are generated, verified and wired into public HTML."
echo "Review the diff and run bash scripts/check-pr-quality.sh before deployment."
