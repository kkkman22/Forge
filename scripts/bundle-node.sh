#!/usr/bin/env bash
set -euo pipefail

# Bundle Node.js runtime into Tauri app Resources
# Produces a universal (arm64 + x86_64) binary on macOS via lipo.

NODE_VERSION="v24.15.0"
PLATFORM="darwin"
BASE_URL="https://nodejs.org/dist/${NODE_VERSION}"
RESOURCES_DIR="${1:-apps/forge-loop-desktop/src-tauri/resources}"
UNIVERSAL="${2:-true}"

NODE_DIR="${RESOURCES_DIR}/node"
CACHE_DIR="${HOME}/.cache/forge-loop-desktop"
mkdir -p "${CACHE_DIR}"

if [[ "$UNIVERSAL" == "true" && "$(uname -s)" == "Darwin" ]]; then
    echo "==> Bundling Node.js ${NODE_VERSION} universal (arm64 + x86_64)..."

    for ARCH in arm64 x86_64; do
        TAR_NAME="node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
        EXTRACT_DIR="${CACHE_DIR}/node-${NODE_VERSION}-${PLATFORM}-${ARCH}"

        if [ ! -f "${CACHE_DIR}/${TAR_NAME}" ]; then
            echo "  Downloading ${TAR_NAME}..."
            curl -fSL -o "${CACHE_DIR}/${TAR_NAME}" "${BASE_URL}/${TAR_NAME}"
        fi

        if [ ! -d "${EXTRACT_DIR}" ]; then
            echo "  Extracting ${ARCH}..."
            mkdir -p "${EXTRACT_DIR}"
            tar xzf "${CACHE_DIR}/${TAR_NAME}" -C "${EXTRACT_DIR}" --strip-components=1
        fi
    done

    # Start from arm64 extraction, then lipo the node binary
    ARM64_DIR="${CACHE_DIR}/node-${NODE_VERSION}-${PLATFORM}-arm64"
    X86_DIR="${CACHE_DIR}/node-${NODE_VERSION}-${PLATFORM}-x86_64"

    rm -rf "${NODE_DIR}"
    cp -r "${ARM64_DIR}" "${NODE_DIR}"

    echo "  Creating universal node binary..."
    lipo -create \
        "${ARM64_DIR}/bin/node" \
        "${X86_DIR}/bin/node" \
        -output "${NODE_DIR}/bin/node"

    # Strip unnecessary files to reduce size
    echo "  Stripping unnecessary files..."
    rm -rf "${NODE_DIR}/include"
    rm -rf "${NODE_DIR}/share"
    rm -rf "${NODE_DIR}/lib/node_modules/npm"
    rm -rf "${NODE_DIR}/lib/node_modules/corepack"
    rm -rf "${NODE_DIR}/bin/corepack"
    rm -rf "${NODE_DIR}/bin/npx"
    rm -rf "${NODE_DIR}/bin/npm"
else
    ARCH=$(uname -m)
    TAR_NAME="node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
    echo "==> Bundling Node.js ${NODE_VERSION} for ${ARCH} (single-arch)..."

    if [ ! -f "${CACHE_DIR}/${TAR_NAME}" ]; then
        echo "  Downloading ${TAR_NAME}..."
        curl -fSL -o "${CACHE_DIR}/${TAR_NAME}" "${BASE_URL}/${TAR_NAME}"
    fi

    rm -rf "${NODE_DIR}"
    mkdir -p "${NODE_DIR}"
    tar xzf "${CACHE_DIR}/${TAR_NAME}" -C "${NODE_DIR}" --strip-components=1

    echo "  Stripping unnecessary files..."
    rm -rf "${NODE_DIR}/include"
    rm -rf "${NODE_DIR}/share"
    rm -rf "${NODE_DIR}/lib/node_modules/npm"
    rm -rf "${NODE_DIR}/lib/node_modules/corepack"
    rm -rf "${NODE_DIR}/bin/corepack"
    rm -rf "${NODE_DIR}/bin/npx"
    rm -rf "${NODE_DIR}/bin/npm"
fi

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
