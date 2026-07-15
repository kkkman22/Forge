#!/usr/bin/env bash
set -uo pipefail
# category: user-facing
# ============================================================================
# update-vendor-axe.sh — Download axe-core minified bundle
#
# Downloads axe-core from unpkg.com and writes to scripts/vendor/axe.min.js.
# Pinned default: 4.10.x (latest patch).
#
# Usage:
#   bash scripts/update-vendor-axe.sh [--version VERSION]
#
# Exit codes:
#   0  Success
#   1  Error (network, invalid version, etc.)
# ============================================================================

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/update-vendor-axe.sh [--version VERSION]"
  echo ""
  echo "Description:"
  echo "  Downloads axe-core minified bundle from unpkg.com and writes to"
  echo "  scripts/vendor/axe.min.js. Pinned default: 4.10.x (latest patch)."
  echo ""
  echo "Options:"
  echo "  --version VERSION   Pin to specific version (e.g. 4.10.2)"
  echo "  -h, --help          Show this help"
  echo ""
  echo "Examples:"
  echo "  bash scripts/update-vendor-axe.sh                # fetch latest 4.10.x"
  echo "  bash scripts/update-vendor-axe.sh --version 4.10.2"
  echo ""
  echo "Side Effects:"
  echo "  - Writes scripts/vendor/axe.min.js"
  echo "  - Requires network access to unpkg.com"
  echo "  - Updates version comment in file header"
  exit 0
fi

VERSION="${2:-4.10}"
if [[ $# -ge 2 && "$1" == "--version" ]]; then
  VERSION="$2"
elif [[ $# -ge 1 && "$1" != "--version" ]]; then
  echo "Unknown argument: $1"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${SCRIPT_DIR}/vendor/axe.min.js"
URL="https://unpkg.com/axe-core@${VERSION}/axe.min.js"

if ! command -v curl &>/dev/null; then
  echo "Error: curl is required but not found in PATH."
  exit 1
fi

echo "Downloading axe-core@${VERSION} from ${URL} ..."

HTTP_CODE=$(curl -sSL -w "%{http_code}" -o "${TARGET}.tmp" "${URL}" 2>/dev/null) || {
  echo "Error: network required to fetch axe-core. Check connection or use --version to pin existing local version."
  rm -f "${TARGET}.tmp"
  exit 1
}

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "Error: HTTP ${HTTP_CODE} fetching axe-core@${VERSION}. Check version number."
  rm -f "${TARGET}.tmp"
  exit 1
fi

# Detect actual version from downloaded content
ACTUAL_VERSION=$(grep -oP 'axe-core v\K[0-9.]+' "${TARGET}.tmp" 2>/dev/null || echo "${VERSION}")

# Prepend version header — preserve existing timestamp if content unchanged
EXISTING_BODY=""
if [[ -f "${TARGET}" ]]; then
  EXISTING_BODY=$(sed '1,/^ \*\/$/d' "${TARGET}" 2>/dev/null || true)
fi
NEW_BODY=$(cat "${TARGET}.tmp")

if [[ "${EXISTING_BODY}" == "${NEW_BODY}" ]]; then
  rm -f "${TARGET}.tmp"
  echo "OK: scripts/vendor/axe.min.js unchanged (axe-core@${ACTUAL_VERSION})"
  exit 0
fi

{
  echo "/*! axe-core v${ACTUAL_VERSION} - https://unpkg.com/axe-core@${ACTUAL_VERSION}/axe.min.js"
  echo " *  Accessibility testing engine by Deque Systems"
  echo " *  License: MPL-2.0"
  echo " *"
  CONTENT_HASH=$(shasum "${TARGET}.tmp" | cut -c1-12)
  echo " *  Updated: ${CONTENT_HASH}"
  echo " *  To upgrade: bash scripts/update-vendor-axe.sh"
  echo " */"
  cat "${TARGET}.tmp"
} > "${TARGET}"

rm -f "${TARGET}.tmp"

SIZE=$(wc -c < "${TARGET}" | tr -d ' ')
echo "OK: scripts/vendor/axe.min.js updated (${SIZE} bytes, axe-core@${ACTUAL_VERSION})"
