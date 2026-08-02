#!/usr/bin/env bash
# OpenChamber RU Uninstaller (Linux)
#
# Usage:
#   ./uninstall-desktop-ru.sh /path/to/resources/web-dist/assets
#   ./uninstall-desktop-ru.sh /path/to/OpenChamber-*.AppImage  (repacks without ru)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCHER="$SCRIPT_DIR/patch/openchamber-ru-patch.mjs"

die() { echo "[ru-installer] ERROR: $*" >&2; exit 1; }

find_js_runtime() {
  if command -v node >/dev/null 2>&1; then echo node; return; fi
  if command -v bun >/dev/null 2>&1; then echo bun; return; fi
  return 1
}

RUNTIME="$(find_js_runtime)" || die "Node.js (or bun) is required."

if [ $# -lt 1 ]; then
  die "Usage: $0 <assets-dir | OpenChamber.AppImage>"
fi
INPUT="$1"

if [ -f "$INPUT" ] && [[ "$INPUT" == *.AppImage ]]; then
  die "For AppImages, repack by running install-desktop-ru.sh with the original (non-ru) AppImage, or patch an extracted squashfs-root directory."
else
  [ -d "$INPUT" ] || die "Not a directory: $INPUT"
  "$RUNTIME" "$PATCHER" uninstall "$INPUT"
  echo "[ru-installer] Done. Original files restored."
fi
