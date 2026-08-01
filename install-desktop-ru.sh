#!/usr/bin/env bash
# OpenChamber RU Installer (Linux)
#
# Usage:
#   ./install-desktop-ru.sh /path/to/resources/web-dist/assets
#   ./install-desktop-ru.sh /path/to/OpenChamber-*.AppImage
#
# Requires: node (or bun), and for AppImage repack: curl + appimagetool.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCHER="$SCRIPT_DIR/patch/openchamber-ru-patch.mjs"

die() { echo "[ru-installer] ERROR: $*" >&2; exit 1; }

find_js_runtime() {
  if command -v node >/dev/null 2>&1; then echo node; return; fi
  if command -v bun >/dev/null 2>&1; then echo bun; return; fi
  return 1
}

repack_appimage() {
  local appimage="$1" assets="$2" work
  command -v curl >/dev/null 2>&1 || die "curl is required to repack an AppImage."
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN
  echo "[ru-installer] Extracting AppImage..."
  ( cd "$work" && "$appimage" --appimage-extract >/dev/null )
  local root="$work/squashfs-root"
  [ -d "$root" ] || die "AppImage extraction failed."
  if [ "$assets" = "auto" ]; then
    [ -d "$root/resources/web-dist/assets" ] || die "resources/web-dist/assets not found in AppImage."
    assets="$root/resources/web-dist/assets"
  fi
  "$RUNTIME" "$PATCHER" install "$assets"
  local tool="${APPIMAGETOOL:-}"
  if [ -z "$tool" ]; then
    echo "[ru-installer] Repacking with appimagetool..."
    local out="$work/appimagetool.AppImage"
    curl -fsSL https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage -o "$out"
    chmod +x "$out"
    tool="$out"
    APPIMAGE_EXTRACT_AND_RUN=1 "$tool" "$root" "$work/OpenChamber-ru.AppImage"
  else
    "$tool" "$root" "$work/OpenChamber-ru.AppImage"
  fi
  echo "[ru-installer] Done. Russian build written to: $work/OpenChamber-ru.AppImage"
  echo "[ru-installer] (it lives in a temp dir; move it somewhere persistent before installing.)"
}

RUNTIME="$(find_js_runtime)" || die "Node.js (or bun) is required. Install Node.js and retry."

if [ $# -lt 1 ]; then
  die "Usage: $0 <assets-dir | OpenChamber.AppImage>"
fi
INPUT="$1"

if [ -f "$INPUT" ] && [[ "$INPUT" == *.AppImage ]]; then
  repack_appimage "$INPUT" auto
else
  [ -d "$INPUT" ] || die "Not a directory: $INPUT"
  "$RUNTIME" "$PATCHER" install "$INPUT"
  echo "[ru-installer] Done. Restart OpenChamber, then Settings -> Appearance -> Language -> Russian."
fi
