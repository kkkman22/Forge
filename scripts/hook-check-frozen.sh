#!/bin/bash
# category: internal-only
# hook-check-frozen.sh — Wrapper for check-frozen.js that provides clear
# error diagnostics when the Node runtime or compiled script is missing.
#
# Exit codes:
#   0 — file is allowed (not frozen, or check passed)
#   1 — file is blocked (frozen zone violation)
#   2 — fatal: node not in PATH or check-frozen.js missing
#
# Integrated from: hooks/hooks.json PreToolUse section
set -e

FILE="$1"

# Node must be available
if ! command -v node >/dev/null 2>&1; then
  echo "[forge-hook] FATAL: node not in PATH — cannot run check-frozen" >&2
  exit 2
fi

# Search for check-frozen.js in known locations
for candidate in \
  "forge/dist/src/check-frozen.js" \
  "$HOME/.claude/skills/forge/dist/src/check-frozen.js"; do
  if [ -f "$candidate" ]; then
    exec node "$candidate" "$FILE"
  fi
done

echo "[forge-hook] FATAL: check-frozen.js not found in any known location" >&2
exit 2
