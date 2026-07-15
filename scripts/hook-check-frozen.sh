#!/bin/bash
set -euo pipefail
# category: internal-only
# hook-check-frozen.sh — Wrapper for frozen-zone protection hooks.
#
# Dispatches to structured JSON hook or legacy TS-based hook based on
# the FORGE_STRUCTURED_FROZEN feature flag.
#
# When FORGE_STRUCTURED_FROZEN=1 (default):
#   Reads CC hook event from stdin, delegates to hook-check-frozen-structured.sh
#
# When FORGE_STRUCTURED_FROZEN=0:
#   Legacy mode: delegates to check-frozen.js with exit-code-based blocking
#
# Exit codes (structured mode):
#   0 — JSON decision emitted (deny with diagnostic, or silent allow)
#   2 — catastrophic error
#
# Exit codes (legacy mode):
#   0 — file is allowed (not frozen, or check passed)
#   1 — file is blocked (frozen zone violation)
#   2 — fatal: node not in PATH or check-frozen.js missing
set -e

script_dir="$(cd "$(dirname "$0")" && pwd)"

if [[ "${FORGE_STRUCTURED_FROZEN:-1}" = "1" ]]; then
  # Structured JSON mode — read stdin and delegate
  if [[ -f "${script_dir}/hook-check-frozen-structured.sh" ]]; then
    exec bash "${script_dir}/hook-check-frozen-structured.sh" "$@"
  fi
fi

# Legacy mode or structured hook not found — use TS-based check
FILE="$1"

# Node must be available
if ! command -v node >/dev/null 2>&1; then
  echo "[forge-hook] FATAL: node not in PATH — cannot run check-frozen" >&2
  exit 2
fi

# Search for check-frozen.js in known locations
for candidate in \
  "${script_dir}/../dist/src/check-frozen.js" \
  "forge/dist/src/check-frozen.js" \
  "$HOME/.claude/skills/forge/dist/src/check-frozen.js"; do
  if [ -f "$candidate" ]; then
    exec node "$candidate" "$FILE"
  fi
done

echo "[forge-hook] FATAL: check-frozen.js not found in any known location" >&2
exit 2
