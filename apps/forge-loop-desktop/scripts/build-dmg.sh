#!/usr/bin/env bash
set -euo pipefail

# Build Forge Loop Desktop .dmg
# Usage: scripts/build-dmg.sh [--skip-bundle]

SKIP_BUNDLE=false
if [[ "${1:-}" == "--skip-bundle" ]]; then
    SKIP_BUNDLE=true
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES_DIR="$ROOT_DIR/src-tauri/resources"

echo "==> Building Forge Loop Desktop DMG..."

# Step 1: Bundle resources
if [[ "$SKIP_BUNDLE" == "false" ]]; then
    echo "  Bundling Node.js..."
    bash "$ROOT_DIR/../../scripts/bundle-node.sh" "$RESOURCES_DIR"

    echo "  Bundling forge-loop SDK..."
    bash "$ROOT_DIR/../../scripts/bundle-forge-loop.sh" "$ROOT_DIR/../.." "$RESOURCES_DIR"
fi

# Step 2: Build frontend
echo "  Building frontend..."
cd "$ROOT_DIR"
npm run build

# Step 3: Build Tauri app (release)
echo "  Building Tauri app (release)..."
cd "$ROOT_DIR/src-tauri"
cargo tauri build 2>&1 | tail -20

# Step 4: Verify output
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"
APP_PATH="$BUNDLE_DIR/macos/Forge Loop.app"
DMG_PATH="$BUNDLE_DIR/dmg/Forge Loop.dmg"

if [ -d "$APP_PATH" ]; then
    APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
    echo "  ✓ .app built: $APP_SIZE"
else
    echo "  ✗ .app not found at $APP_PATH"
    exit 1
fi

if [ -f "$DMG_PATH" ]; then
    DMG_SIZE=$(du -sh "$DMG_PATH" | cut -f1)
    echo "  ✓ .dmg built: $DMG_SIZE"
else
    echo "  ⚠ .dmg not found (may need tauri-bundler config)"
    echo "  .app is at: $APP_PATH"
fi

echo "==> Done"
