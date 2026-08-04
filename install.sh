#!/usr/bin/env bash
# OpenChamber RU installer — self-contained one-liner entry point.
#
#   curl -fsSL https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install.sh | bash -s -- --uninstall
#   curl -fsSL https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install.sh | bash -s -- /path/to/OpenChamber-*.AppImage
#
# Downloads the patcher + Russian dictionary from the repo into a temp dir and
# applies them to a detected (or explicitly passed) OpenChamber web UI assets
# dir. Requires node (or bun); AppImage repack additionally needs curl+appimagetool.

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

is_assets() {
  local d="$1"
  [ -d "$d" ] && ls "$d"/useAppFontEffects-*.js >/dev/null 2>&1
}

detect_assets() {
  local cand root
  # Статические пути веб/CLI-установок (npm/bun глобальные, локальные node_modules).
  for cand in \
    "${HOME}/.bun/install/global/node_modules/@openchamber/web/dist/assets" \
    "${HOME}/.bun/install/global/node_modules/openchamber/dist/assets" \
    "/usr/local/lib/node_modules/@openchamber/web/dist/assets" \
    "/usr/lib/node_modules/@openchamber/web/dist/assets" \
    "/usr/local/lib/node_modules/openchamber/dist/assets" \
    "/usr/lib/node_modules/openchamber/dist/assets" \
    "${PWD}/node_modules/@openchamber/web/dist/assets" \
    "${PWD}/node_modules/openchamber/dist/assets"; do
    if is_assets "$cand"; then
      echo "$cand"
      return 0
    fi
  done
  # npm root -g fallback
  if command -v npm >/dev/null 2>&1; then
    cand="$(npm root -g 2>/dev/null)/@openchamber/web/dist/assets"
    if is_assets "$cand"; then echo "$cand"; return 0; fi
    cand="$(npm root -g 2>/dev/null)/openchamber/dist/assets"
    if is_assets "$cand"; then echo "$cand"; return 0; fi
  fi
  # Поиск по распространённым корням: Electron (resources/web-dist) и web (dist).
  for root in "$HOME/.bun" "$HOME/.local" "$HOME/Applications" "$HOME/bin" /opt /usr /usr/local; do
    cand="$(find "$root" -maxdepth 6 -type d \
      \( -path '*resources/web-dist/assets' -o -path '*/@openchamber/web/dist/assets' -o -path '*/openchamber/dist/assets' \) \
      2>/dev/null | head -1)"
    if [ -n "$cand" ]; then
      echo "$cand"
      return 0
    fi
  done
  return 1
}

repack_appimage() {
  local appimage="$1" tmp="$2" assets="$3" work
  command -v curl >/dev/null 2>&1 || die "curl is required to repack an AppImage."
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  echo "[ru-installer] extracting AppImage..."
  ( cd "$work" && "$appimage" --appimage-extract >/dev/null )
  local root="$work/squashfs-root"
  [ -d "$root" ] || die "AppImage extraction failed."
  if [ "$assets" = "auto" ]; then
    [ -d "$root/resources/web-dist/assets" ] || die "resources/web-dist/assets not found in AppImage."
    assets="$root/resources/web-dist/assets"
  fi
  "$RUNTIME" "$tmp/openchamber-ru-patch.mjs" "$MODE" "$assets"
  local tool="${APPIMAGETOOL:-}"
  if [ -z "$tool" ]; then
    echo "[ru-installer] repacking with appimagetool..."
    local out="$work/appimagetool.AppImage"
    curl -fsSL https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage -o "$out"
    chmod +x "$out"
    tool="$out"
    APPIMAGE_EXTRACT_AND_RUN=1 "$tool" "$root" "$work/OpenChamber-ru.AppImage"
  else
    "$tool" "$root" "$work/OpenChamber-ru.AppImage"
  fi
  echo "[ru-installer] Done. Russian build: $work/OpenChamber-ru.AppImage"
  echo "[ru-installer] Move it to a persistent location before installing (AppImages need write access for updates)."
}

RUNTIME="$(find_js_runtime)" || die "Node.js (or bun) is required. Install Node.js and retry."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ "$MODE" = "uninstall" ]; then
  download_patcher "$TMP"
  if [ -n "$INPUT" ]; then
    [ -d "$INPUT" ] || die "Not a directory: $INPUT"
    "$RUNTIME" "$TMP/openchamber-ru-patch.mjs" uninstall "$INPUT"
    echo "[ru-installer] Done. Original files restored."
  else
    ASSETS="$(detect_assets)" || die "OpenChamber install not found. Pass the assets dir explicitly."
    echo "[ru-installer] Assets: $ASSETS"
    "$RUNTIME" "$TMP/openchamber-ru-patch.mjs" uninstall "$ASSETS"
    echo "[ru-installer] Done. Original files restored."
  fi
  exit 0
fi

download_patcher "$TMP"

if [ -n "$INPUT" ] && [ -f "$INPUT" ] && [[ "$INPUT" == *.AppImage ]]; then
  repack_appimage "$INPUT" "$TMP" auto
elif [ -n "$INPUT" ]; then
  [ -d "$INPUT" ] || die "Not a directory: $INPUT"
  "$RUNTIME" "$TMP/openchamber-ru-patch.mjs" install "$INPUT"
  echo "[ru-installer] Done. Restart OpenChamber, then Settings -> Appearance -> Language -> Russian."
else
  ASSETS="$(detect_assets)" || die "OpenChamber install not found. Pass the assets dir or an AppImage as an argument."
  echo "[ru-installer] Assets: $ASSETS"
  "$RUNTIME" "$TMP/openchamber-ru-patch.mjs" install "$ASSETS"
  echo "[ru-installer] Done. Restart OpenChamber, then Settings -> Appearance -> Language -> Russian."
fi
