# Static Content Pack Format v1

This format targets the static HTML tourism repository. Legacy Studio packs that contain PHP wrappers or `img/` paths are not compatible; use the dedicated adapter once implemented.

## Safe workflow

1. Build a ZIP or extracted directory containing `pack.json`, one draft record per entry, and only the image files referenced by those records.
2. Preview the exact operations (no writes):
   ```bash
   node scripts/import-content-pack.js /path/to/pack.zip
   ```
3. Apply only after inspecting a successful dry run:
   ```bash
   node scripts/import-content-pack.js /path/to/pack.zip --apply
   ```
4. Run `bash scripts/check-pr-quality.sh` and inspect the branch diff. Importing never merges or deploys.

## Manifest

`pack.json` has `version: 1`, a stable `pack_id`, a real `created` date, and an `entries` array. Each entry has `type` (`tour`, `blog`, or `gallery`), `slug` (gallery uses its allowlisted category), `mode` (`new`, `update`, or `sync`), `status: "draft"`, and `files`.

Each file record declares:
- `path`: exact repository-relative path allowed by `content/paths.json`;
- `role`: `record` or the image role encoded in the filename;
- `bytes`: exact uncompressed byte length;
- `sha256`: SHA-256 of the exact file bytes;
- `prior_sha256`: `null` only for a new destination, otherwise the expected current file hash.

Only these record paths are accepted:
- `content/tours/<slug>.json`
- `content/blogs/<slug>.json`
- `content/gallery/<category>.json`

Image destinations must stay in the matching registry-approved `assets/images/` directory and use `<slug>-<role>-<nn>.webp` or `.avif`. All image references in a record must resolve to either an existing allowed asset or one included in the pack. Packed images must be referenced by that record.

## Safety behavior

- The importer validates ZIP paths, duplicate names, CRC, hashes, file sizes, schema and path allowlists before it writes.
- New slugs cannot overwrite existing records, images, or public tour/blog pages.
- Updates are limited to existing draft records and require a matching base hash for every replaced file. New images in an update use `prior_sha256: null`.
- Every imported record must be `draft`; live, hidden and approved-for-release records are refused.
- Apply is transactional: it validates the resulting content registry and checks that generated output and the sitemap remain unchanged. On failure, changed files are rolled back.
- The importer never accepts `sitemap.xml`, HTML wrappers, `.htaccess`, credentials, arbitrary code or unlisted files.
- Supported archive types: standard ZIP using stored/deflate entries. Encrypted, multi-disk and ZIP64 archives are refused.
- Images are size/signature checked and dimensions are checked from supported WebP/AVIF headers; unsupported or unverifiable dimensions are rejected. EXIF stripping must occur during image preparation, before packing.

The importer is a local source-preparation tool. It does not publish content, push branches, open PRs, merge, or deploy.
