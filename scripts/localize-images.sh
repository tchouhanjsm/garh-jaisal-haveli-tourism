#!/usr/bin/env bash
set -euo pipefail

owner_repo="tchouhanjsm/garh-jaisal-website"
branch="main"
image_dir="assets/images"
images=("rest3.jpg" "courtyard.jpg" "scarlet.jpg" "tent.jpg")
mkdir -p "$image_dir"

# Keep the committed/local originals intact. Download only assets that are missing.
for filename in "${images[@]}"; do
  dest="${image_dir}/${filename}"
  if [[ -s "$dest" ]]; then
    echo "Using existing image: $dest"
    continue
  fi

  url="https://raw.githubusercontent.com/${owner_repo}/${branch}/img/${filename}"
  echo "Fetching missing ${filename} from ${owner_repo}..."
  curl --fail --location --silent --show-error "$url" --output "$dest"
  if [[ ! -s "$dest" ]]; then
    echo "ERROR: downloaded file is empty: $dest" >&2
    exit 1
  fi
done

# Generate and verify every WebP derivative before switching any HTML references.
if python3 - <<'PY' >/dev/null 2>&1
from PIL import Image  # noqa: F401
PY
then
  if python3 - "$image_dir" <<'PY'
from pathlib import Path
import sys
from PIL import Image

image_dir = Path(sys.argv[1])
images = ("rest3.jpg", "courtyard.jpg", "scarlet.jpg", "tent.jpg")

for filename in images:
    source = image_dir / filename
    target = source.with_suffix(".webp")
    temporary = target.with_name(target.name + ".tmp")
    try:
        with Image.open(source) as image:
            image.save(temporary, format="WEBP", quality=82, method=6)
        with Image.open(temporary) as converted:
            if converted.format != "WEBP":
                raise RuntimeError(f"unexpected output format for {temporary}")
            converted.verify()
        if temporary.stat().st_size >= source.stat().st_size:
            raise RuntimeError(f"WebP is not smaller than its JPG source: {filename}")
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

print(f"Created and verified {len(images)} WebP derivatives.")
PY
  then
    IMAGE_EXT="webp"
  else
    echo "WARNING: WebP conversion failed; keeping JPG references." >&2
    IMAGE_EXT="jpg"
  fi
else
  echo "Pillow not found; keeping JPG assets and references."
  IMAGE_EXT="jpg"
fi

# Never point a page at a derivative that was not successfully produced.
for filename in "${images[@]}"; do
  target="${image_dir}/${filename%.jpg}.${IMAGE_EXT}"
  if [[ ! -s "$target" ]]; then
    echo "ERROR: selected image target is missing or empty: $target" >&2
    exit 1
  fi
done

# Handles current local JPG references, previous WebP references, and legacy remote URLs.
python3 scripts/rewrite_image_refs.py --root . --extension "$IMAGE_EXT"

echo "Done. Image localization is repeatable; review the diff and run ./scripts/check-site.sh before deployment."
