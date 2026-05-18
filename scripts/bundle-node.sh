#!/usr/bin/env bash
set -euo pipefail

# Bundle Node.js runtime into Tauri app Resources
# Downloads macOS binary matching current architecture

NODE_VERSION="v24.15.0"
PLATFORM="darwin"
ARCH=$(uname -m)  # arm64 or x86_64
BASE_URL="https://nodejs.org/dist/${NODE_VERSION}"
TAR_NAME="node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
RESOURCES_DIR="${1:-apps/forge-loop-desktop/src-tauri/resources}"

NODE_DIR="${RESOURCES_DIR}/node"

echo "==> Bundling Node.js ${NODE_VERSION} for macOS ${ARCH}..."

# Download if not cached
CACHE_DIR="${HOME}/.cache/forge-loop-desktop"
mkdir -p "${CACHE_DIR}"

if [ ! -f "${CACHE_DIR}/${TAR_NAME}" ]; then
    echo "  Downloading ${TAR_NAME}..."
    curl -fSL -o "${CACHE_DIR}/${TAR_NAME}" "${BASE_URL}/${TAR_NAME}"
fi

# Extract
echo "  Extracting to ${NODE_DIR}..."
rm -rf "${NODE_DIR}"
mkdir -p "${NODE_DIR}"
tar xzf "${CACHE_DIR}/${TAR_NAME}" -C "${NODE_DIR}" --strip-components=1

# Strip unnecessary files to reduce size
echo "  Stripping unnecessary files..."
rm -rf "${NODE_DIR}/include"
rm -rf "${NODE_DIR}/share"
rm -rf "${NODE_DIR}/lib/node_modules/npm"
rm -rf "${NODE_DIR}/lib/node_modules/corepack"
rm -rf "${NODE_DIR}/bin/corepack"
rm -rf "${NODE_DIR}/bin/npx"
rm -rf "${NODE_DIR}/bin/npm"

SIZE=$(du -sh "${NODE_DIR}" | cut -f1)
echo "  Node.js bundle size: ${SIZE}"

# Verify
if [ -x "${NODE_DIR}/bin/node" ]; then
    echo "  ✓ node binary present ($(file "${NODE_DIR}/bin/node" | cut -d: -f2 | xargs))"
else
    echo "  ✗ node binary MISSING"
    exit 1
fi

echo "==> Done"
