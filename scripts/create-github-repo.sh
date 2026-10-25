#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <repo-name> [--private|--public]"
  echo "Example: $0 garh-jaisal-haveli-tourism --private"
}

if [[ $# -lt 1 ]]; then usage; exit 2; fi
repo_name="$1"
visibility="--private"
if [[ $# -ge 2 ]]; then
  case "$2" in
    --private|--public) visibility="$2" ;;
    *) usage; exit 2 ;;
  esac
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is required." >&2; exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ and run 'gh auth login', or create an empty GitHub repository manually." >&2
  exit 1
fi

if [[ ! -d .git ]]; then git init -b main; fi
git branch -M main
git add .
if ! git diff --cached --quiet; then
  git commit -m "feat: launch premium Garh Jaisal Haveli tourism website"
fi
gh auth status >/dev/null

if git remote get-url origin >/dev/null 2>&1; then
  echo "ERROR: an origin remote already exists ($(git remote get-url origin)). Review it before using this script; refusing to overwrite it." >&2
  exit 1
fi

gh repo create "$repo_name" "$visibility" --source=. --remote=origin --push
echo "Created and pushed the new repository. Existing website repository was not modified."
