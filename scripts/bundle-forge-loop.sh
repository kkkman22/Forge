#!/usr/bin/env bash
set -euo pipefail

# Bundle forge-loop SDK into Tauri app Resources
# Copies dist/ and production node_modules from forge-loop package

FORGE_LOOP_DIR="${1:-.}"  # Root of forge project
RESOURCES_DIR="${2:-apps/forge-loop-desktop/src-tauri/resources}"

DEST="${RESOURCES_DIR}/forge-loop"

echo "==> Bundling forge-loop SDK..."

# Build forge-loop if needed
if [ ! -d "${FORGE_LOOP_DIR}/dist" ]; then
    echo "  Building forge-loop..."
    (cd "${FORGE_LOOP_DIR}" && npm run build)
fi

# Copy dist
echo "  Copying dist/..."
rm -rf "${DEST}"
mkdir -p "${DEST}"
cp -r "${FORGE_LOOP_DIR}/dist" "${DEST}/dist"

# Copy production dependencies
if [ -f "${FORGE_LOOP_DIR}/package.json" ]; then
    echo "  Copying package.json..."
    cp "${FORGE_LOOP_DIR}/package.json" "${DEST}/"

    echo "  Installing production dependencies..."
    (cd "${DEST}" && npm ci --production --ignore-scripts 2>/dev/null || npm install --production --ignore-scripts)
fi

SIZE=$(du -sh "${DEST}" | cut -f1)
echo "  forge-loop bundle size: ${SIZE}"
echo "==> Done"
