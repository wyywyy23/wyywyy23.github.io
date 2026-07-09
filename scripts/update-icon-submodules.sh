#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FA_DIR="$ROOT_DIR/assets/css/vendor/fontawesome"
AC_DIR="$ROOT_DIR/assets/css/vendor/academicons"
FA_PATH="assets/css/vendor/fontawesome"
AC_PATH="assets/css/vendor/academicons"

require_clean_tree() {
  local dir="$1"
  local name="$2"
  if [[ -n "$(git -C "$dir" status --porcelain)" ]]; then
    echo "Error: submodule $name has local changes. Commit/stash/discard before updating." >&2
    exit 1
  fi
}

checkout_latest_tag() {
  local dir="$1"
  local glob="$2"

  git -C "$dir" fetch --tags origin
  local latest_tag
  latest_tag="$(git -C "$dir" tag -l --sort=-v:refname "$glob" | head -n 1)"

  if [[ -z "$latest_tag" ]]; then
    echo "Error: no tags found in $dir matching '$glob'." >&2
    exit 1
  fi

  git -C "$dir" checkout "$latest_tag"
  echo "$latest_tag"
}

main() {
  require_clean_tree "$FA_DIR" "fontawesome"
  require_clean_tree "$AC_DIR" "academicons"

  local fa_tag
  local ac_tag

  # Font Awesome uses numeric semver tags for modern releases (e.g., 7.3.0).
  fa_tag="$(checkout_latest_tag "$FA_DIR" '[0-9]*.[0-9]*.[0-9]*')"
  # Academicons uses v-prefixed semver tags (e.g., v1.9.6).
  ac_tag="$(checkout_latest_tag "$AC_DIR" 'v[0-9]*.[0-9]*.[0-9]*')"

  git -C "$ROOT_DIR" add "$FA_PATH" "$AC_PATH"

  if git -C "$ROOT_DIR" diff --cached --quiet -- "$FA_PATH" "$AC_PATH"; then
    echo "Submodules are already at latest release tags."
    exit 0
  fi

  echo "Updated submodules: fontawesome=$fa_tag academicons=$ac_tag"
}

main "$@"
