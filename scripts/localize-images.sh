#!/usr/bin/env bash
set -euo pipefail

owner_repo="tchouhanjsm/garh-jaisal-website"
branch="main"
image_dir="assets/images"
mkdir -p "$image_dir"
images=("rest3.jpg" "courtyard.jpg" "scarlet.jpg" "tent.jpg")

for filename in "${images[@]}"; do
  url="https://raw.githubusercontent.com/${owner_repo}/${branch}/img/${filename}"
  dest="${image_dir}/${filename}"
  echo "Fetching ${filename} from ${owner_repo}..."
  curl --fail --location --silent --show-error "$url" --output "$dest"
  if [[ ! -s "$dest" ]]; then echo "ERROR: downloaded file is empty: $dest" >&2; exit 1; fi
done

# Use Pillow if it is installed, otherwise retain valid source JPGs.
if python3 - <<'PY' >/dev/null 2>&1
from PIL import Image  # noqa: F401
PY
then
python3 - <<'PY'
from pathlib import Path
from PIL import Image

image_dir = Path('assets/images')
for jpg in image_dir.glob('*.jpg'):
    with Image.open(jpg) as image:
        image.save(jpg.with_suffix('.webp'), 'WEBP', quality=82, method=6)
print('Created WebP derivatives with Pillow.')
PY
  IMAGE_EXT="webp"
else
  echo "Pillow not found; keeping JPG assets. Install Pillow later to create WebP derivatives."
  IMAGE_EXT="jpg"
fi

python3 - "$IMAGE_EXT" <<'PY'
from pathlib import Path
import sys

ext = sys.argv[1]
source_prefix = 'https://raw.githubusercontent.com/tchouhanjsm/garh-jaisal-website/main/img/'
for html in Path('.').glob('*.html'):
    text = html.read_text(encoding='utf-8')
    for name in ('rest3.jpg', 'courtyard.jpg', 'scarlet.jpg', 'tent.jpg'):
        local_name = name.rsplit('.', 1)[0] + '.' + ext
        text = text.replace(source_prefix + name, 'assets/images/' + local_name)
    html.write_text(text, encoding='utf-8')
print(f'Updated pages to use self-hosted .{ext} photos.')
PY

echo "Done. Confirm the photo set and run the mobile/performance checklist before deployment."
