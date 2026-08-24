#!/usr/bin/env bash
# OpenChamber RU installer — macOS (DMG/.app bundle) one-liner entry point.
#
#   curl -fsSL https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install-macos.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install-macos.sh | bash -s -- --uninstall
#   curl -fsSL https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install-macos.sh | bash -s -- /Applications/OpenChamber.app
#
# Downloads the patcher + Russian dictionary from the repo into a temp dir and
# applies them to a detected (or explicitly passed) OpenChamber .app bundle.
# Requires node (or bun).

set -euo pipefail

REPO="vitebc/openchamber-ru-installer"
BASE="https://raw.githubusercontent.com/${REPO}/main"
MODE="install"
INPUT=""

for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    *) INPUT="$arg" ;;
  esac
done

die() { echo "[ru-installer] ERROR: $*" >&2; exit 1; }

find_js_runtime() {
  if command -v node >/dev/null 2>&1; then echo node; return; fi
  if command -v bun >/dev/null 2>&1; then echo bun; return; fi
  return 1
}

download_patcher() {
  local tmp="$1"
  echo "[ru-installer] downloading patcher from ${REPO}..."
  curl -fsSL "$BASE/patch/openchamber-ru-patch.mjs" -o "$tmp/openchamber-ru-patch.mjs" || die "failed to download patcher"
  curl -fsSL "$BASE/patch/ru-ruinstaller.js" -o "$tmp/ru-ruinstaller.js" || die "failed to download Russian dictionary"
}

is_assets_dir() {
  local d="$1"
  [ -d "$d" ] && ls "$d"/useAppFontEffects-*.js >/dev/null 2>&1
}

find_assets_dir() {
  local app_path="$1"
  local assets_dir

  # Standard locations inside .app bundle
  for assets_dir in \
    "$app_path/Contents/Resources/web-dist/assets" \
    "$app_path/Contents/Resources/app.asar.unpacked/web-dist/assets"; do
    if is_assets_dir "$assets_dir"; then
      echo "$assets_dir"
      return 0
    fi
  done

  return 1
}

detect_assets() {
  local app_path cand

  # Explicit input takes priority
  if [ -n "$INPUT" ] && [ -d "$INPUT" ]; then
    cand=$(find_assets_dir "$INPUT") && { echo "$cand"; return 0; }
  fi

  # Common installation locations for OpenChamber.app
  for app_path in \
    "/Applications/OpenChamber.app" \
    "$HOME/Applications/OpenChamber.app" \
    "/Applications/OpenChamber.app/Contents/Resources" \
    "$HOME/Applications/OpenChamber.app/Contents/Resources"; do
    cand=$(find_assets_dir "$app_path") && { echo "$cand"; return 0; }
  done

  # Search common locations for OpenChamber.app bundle
  for root in "/Applications" "$HOME/Applications"; do
    local found
    found=$(find "$root" -maxdepth 2 -name "OpenChamber.app" -type d 2>/dev/null | head -1)
    if [ -n "$found" ]; then
      cand=$(find_assets_dir "$found") && { echo "$cand"; return 0; }
    fi
  done

  return 1
}

RUNTIME="$(find_js_runtime)" || { echo "[ru-installer] ERROR: Node.js (or bun) is required. Install Node.js and retry." >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

download_patcher() {
  local tmp="$1"
  echo "[ru-installer] downloading patcher from ${REPO}..."
  curl -fsSL "$BASE/patch/openchamber-ru-patch.mjs" -o "$tmp/openchamber-ru-patch.mjs" || die "failed to download patcher"
  curl -fsSL "$BASE/patch/ru-ruinstaller.js" -o "$tmp/ru-ruinstaller.js" || die "failed to download Russian dictionary"
}

if [ "$MODE" = "uninstall" ]; then
  download_patcher "$TMP"
  if [ -n "$INPUT" ] && [ -d "$INPUT" ]; then
    ASSETS=$(find_assets_dir "$INPUT") || die "Could not find assets directory in $INPUT"
    echo "[ru-installer] Assets: $ASSETS"
    "$RUNTIME" "$TMP/openchamber-ru-patch.mjs" uninstall "$ASSETS"
    echo "[ru-installer] Done. Original files restored."
  else
    ASSETS=$(detect_assets) || die "OpenChamber install not found. Pass the .app path explicitly: $0 /path/to/OpenChamber.app"
    echo "[ru-installer] Assets: $ASSETS"
    "$RUNTIME" "$TMP/openchamber-ru-patch.mjs" uninstall "$ASSETS"
    echo "[ru-installer] Done. Original files restored."
  fi
  exit 0
fi

download_patcher "$TMP"

if [ -n "$INPUT" ]; then
  if [ -d "$INPUT" ]; then
    ASSETS=$(find_assets_dir "$INPUT") || die "Could not find assets directory in $INPUT"
  else
    die "Input must be a directory (path to OpenChamber.app)"
  fi
else
  ASSETS=$(detect_assets) || die "OpenChamber install not found. Pass the .app path explicitly: $0 /path/to/OpenChamber.app"
fi

echo "[ru-installer] Assets: $ASSETS"
"$RUNTIME" "$TMP/openchamber-ru-patch.mjs" install "$ASSETS"
echo "[ru-installer] Done. Restart OpenChamber, then Settings -> Appearance -> Language -> Russian."