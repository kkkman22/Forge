#!/usr/bin/env bash
set -euo pipefail

# Bundle forge-loop SDK into Tauri app Resources
# Copies dist/ and production node_modules from Forge monorepo

FORGE_ROOT="${1:-.}"
RESOURCES_DIR="${2:-apps/forge-loop-desktop/src-tauri/resources}"

DEST="${RESOURCES_DIR}/tinkerman-loop"

echo "==> Bundling forge-loop SDK from ${FORGE_ROOT}..."

# Build forge if needed
if [ ! -f "${FORGE_ROOT}/dist/src/forge-loop-cli.js" ]; then
    echo "  Building forge..."
    (cd "${FORGE_ROOT}" && npm run build)
fi

if [ ! -f "${FORGE_ROOT}/dist/src/forge-loop-cli.js" ]; then
    echo "  ERROR: forge-loop-cli.js not found after build"
    exit 1
fi

# Clean and recreate destination
rm -rf "${DEST}"
mkdir -p "${DEST}"

# Copy dist
echo "  Copying dist/..."
cp -r "${FORGE_ROOT}/dist" "${DEST}/dist"

# Copy package.json + package-lock.json for dependency resolution
echo "  Copying package metadata..."
cp "${FORGE_ROOT}/package.json" "${DEST}/"
if [ -f "${FORGE_ROOT}/package-lock.json" ]; then
    cp "${FORGE_ROOT}/package-lock.json" "${DEST}/"
fi

# Install production dependencies only
echo "  Installing production dependencies..."
(cd "${DEST}" && npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts 2>/dev/null || true)

# Remove unnecessary files to reduce size
rm -rf "${DEST}/dist/src"/*.map 2>/dev/null || true
rm -rf "${DEST}/node_modules"/**/README* 2>/dev/null || true
rm -rf "${DEST}/node_modules"/**/CHANGELOG* 2>/dev/null || true
rm -rf "${DEST}/node_modules"/**/.github 2>/dev/null || true
rm -rf "${DEST}/node_modules"/**/test 2>/dev/null || true
rm -rf "${DEST}/node_modules"/**/tests 2>/dev/null || true

# Exclude platform-specific claude binary (~200MB)
# forge-loop uses claude-agent-sdk which ships a native claude CLI.
# Desktop app expects claude CLI on system PATH instead of bundling it.
rm -rf "${DEST}/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64"
rm -rf "${DEST}/node_modules/@anthropic-ai/claude-agent-sdk-darwin-x64"
rm -rf "${DEST}/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64"

SIZE=$(du -sh "${DEST}" | cut -f1)
echo "  forge-loop bundle size: ${SIZE}"

# Verify CLI entry point
if [ -f "${DEST}/dist/src/forge-loop-cli.js" ]; then
    echo "  ✓ forge-loop-cli.js present"
else
    echo "  ✗ forge-loop-cli.js MISSING"
    exit 1
fi

echo "==> Done"
