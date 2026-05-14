#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# smoke-activate-pack.sh — Pack activation for smoke tests (CI-only)
#
# WARNING: Modifies pack.yaml to set enabled: true.
# Intended for CI ephemeral environments only.
#
# Enables the specified pack's feature flags so gen-plugin-commands.mjs
# registers conditional skills (e.g., forge-mutate).
#
# Usage:
#   bash scripts/smoke-activate-pack.sh <pack>
#   pack: pms | none
# ============================================================================

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: scripts/smoke-activate-pack.sh <pack>"
  echo ""
  echo "Packs:"
  echo "  pms   - Enable PMS pack (mutation_critical_modules feature flag)"
  echo "  none  - No pack activation (default state)"
  exit 0
fi

PACK="${1:-none}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

case "$PACK" in
  none)
    echo "[smoke-activate-pack] none: no pack activation"
    ;;
  pms)
    echo "[smoke-activate-pack] pms: activating PMS pack..."
    PACK_FILE="${FORGE_ROOT}/packs/pms/pack.yaml"
    if [[ ! -f "$PACK_FILE" ]]; then
      echo "::error::PMS pack.yaml not found at ${PACK_FILE}"
      exit 1
    fi
    # gen-plugin-commands.mjs treats packs without 'enabled:' as enabled by default,
    # so pms pack is already active. Just verify the file exists.
    echo "[smoke-activate-pack] pms: pack.yaml verified, activation not needed (default-enabled)"
    ;;
  *)
    echo "::error::Unknown pack: ${PACK}. Expected: pms, none"
    exit 1
    ;;
esac
