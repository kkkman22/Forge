#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# smoke-activate-pack.sh — Pack activation for smoke tests (CI-only)
#
# WARNING: Modifies .forge/config.md to enable pack feature flags.
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
    PACK_DIR="${FORGE_ROOT}/packs/pms"
    if [[ ! -d "$PACK_DIR" ]]; then
      echo "::warning::PMS pack directory not found at ${PACK_DIR}, creating stub"
      mkdir -p "$PACK_DIR"
    fi
    # Write activation flag that gen-plugin-commands.mjs reads
    CONFIG="${FORGE_ROOT}/.forge/config.md"
    if ! grep -q "mutation_critical_modules" "$CONFIG" 2>/dev/null; then
      echo "" >> "$CONFIG"
      echo "## Smoke Test: PMS Pack Activation" >> "$CONFIG"
      echo "feature_flags:" >> "$CONFIG"
      echo "  - mutation_critical_modules" >> "$CONFIG"
    fi
    echo "[smoke-activate-pack] pms: activated"
    ;;
  *)
    echo "::error::Unknown pack: ${PACK}. Expected: pms, none"
    exit 1
    ;;
esac
