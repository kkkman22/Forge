#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# smoke-install.sh — Channel-based smoke test installer
#
# Sets up the Forge installation for a specific distribution channel.
# Used by the smoke-channels CI matrix.
#
# Usage:
#   bash scripts/smoke-install.sh <channel>
#   channel: clone | dist | plugin
# ============================================================================

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: scripts/smoke-install.sh <channel>"
  echo ""
  echo "Channels:"
  echo "  clone   - Use checkout as-is (no-op)"
  echo "  dist    - Build dist bundle via scripts/build-dist.sh"
  echo "  plugin  - Build dist-plugin bundle via scripts/build-dist.sh"
  exit 0
fi

CHANNEL="${1:?Usage: smoke-install.sh <clone|dist|plugin>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

case "$CHANNEL" in
  clone)
    echo "[smoke-install] clone: using checkout as-is at ${FORGE_ROOT}"
    ;;
  dist)
    echo "[smoke-install] dist: building dist bundle..."
    bash "${SCRIPT_DIR}/build-dist.sh"
    echo "[smoke-install] dist: bundle ready at ${FORGE_ROOT}/dist/"
    ;;
  plugin)
    echo "[smoke-install] plugin: building dist-plugin bundle..."
    bash "${SCRIPT_DIR}/build-dist.sh"
    echo "[smoke-install] plugin: bundle ready at ${FORGE_ROOT}/dist-plugin/"
    ;;
  *)
    echo "::error::Unknown channel: ${CHANNEL}. Expected: clone, dist, plugin"
    exit 1
    ;;
esac
