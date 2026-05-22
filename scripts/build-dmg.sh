#!/usr/bin/env bash
set -euo pipefail

# Build DMG for Forge Loop Desktop
# Full pipeline: bundle → build → sign → notarize → staple

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${PROJECT_ROOT}/apps/forge-loop-desktop"

echo "==> Forge Loop Desktop — DMG Build Pipeline"

# Step 1: Bundle resources
echo "==> Step 1: Bundling resources..."
bash "${SCRIPT_DIR}/bundle-node.sh" "${APP_DIR}/src-tauri/resources" || true
bash "${SCRIPT_DIR}/bundle-forge-loop.sh" "${PROJECT_ROOT}" "${APP_DIR}/src-tauri/resources" || true

# Step 2: Build frontend
echo "==> Step 2: Building frontend..."
cd "${APP_DIR}" && npm run build

# Step 3: Build Tauri app
echo "==> Step 3: Building Tauri app..."
cd "${APP_DIR}/src-tauri"

if [ "${1:-}" = "--release" ]; then
    echo "  Release build with signing..."
    # For signed builds, set these env vars:
    # APPLE_SIGNING_IDENTITY — Developer ID Application certificate
    # APPLE_ID — Apple ID email
    # APPLE_PASSWORD — app-specific password
    # APPLE_TEAM_ID — Team ID
    cargo tauri build --target universal-apple-darwin
else
    echo "  Development build (ad-hoc signing)..."
    cargo tauri build
fi

echo "==> DMG build complete"
ls -lh "${APP_DIR}/src-tauri/target/release/bundle/dmg/" 2>/dev/null || \
ls -lh "${APP_DIR}/src-tauri/target/universal-apple-darwin/release/bundle/dmg/" 2>/dev/null || \
echo "  DMG location may vary by target"
