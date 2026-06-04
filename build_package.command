#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--clean" ]]; then
  shift
  (cd src-tauri && cargo clean)
fi

npm run tauri -- build --bundles app "$@"

VERSION="$(node -p "require('./package.json').version")"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ARCH="aarch64" ;;
esac

APP_DIR="$ROOT_DIR/src-tauri/target/release/bundle/macos/KindEdit.app"
DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
DMG_PATH="$DMG_DIR/KindEdit_${VERSION}_${ARCH}.dmg"

mkdir -p "$DMG_DIR"
STAGE_DIR="$(mktemp -d "$DMG_DIR/stage.XXXXXX")"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

if [[ ! -d "$APP_DIR" ]]; then
  echo "Missing app bundle: $APP_DIR" >&2
  exit 1
fi

cp -a "$APP_DIR" "$STAGE_DIR/"
ln -s /Applications "$STAGE_DIR/Applications"

hdiutil create \
  -volname "KindEdit" \
  -srcfolder "$STAGE_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "Built app: $APP_DIR"
echo "Built dmg: $DMG_PATH"
