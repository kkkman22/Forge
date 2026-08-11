#!/usr/bin/env bash
# category: internal-only
# ============================================================================
# check-frozen.sh — PreToolUse hook for frozen file protection
#
# Thin wrapper that delegates to the TypeScript implementation when available.
# Falls back to the original shell-based parsing if node is not available or
# the compiled JS file does not exist.
#
# Exit: Exits 1 for files with status "locked" or "approved" (hard block).
#       Exits 0 for all other cases (non-frozen files, no status, etc.).
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Try the TypeScript-compiled version first
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(dirname "$0")"
JS_FILE="${SCRIPT_DIR}/../dist/src/check-frozen.js"

if command -v node &>/dev/null && [[ -f "${JS_FILE}" ]]; then
  exec node "${JS_FILE}" "$@"
fi

# ---------------------------------------------------------------------------
# Fallback: original shell-based parsing
# ---------------------------------------------------------------------------

TARGET_FILE="${1:-}"

# If no argument, nothing to check
if [[ -z "${TARGET_FILE}" ]]; then
  exit 0
fi

# Only check files under .tinkerman/
case "${TARGET_FILE}" in
  .tinkerman/specs/*|.tinkerman/plans/*|.tinkerman/config.md)
    ;;
  *)
    # Not a frozen zone file, allow
    exit 0
    ;;
esac

# Check if the file exists (new files are always allowed)
if [[ ! -f "${TARGET_FILE}" ]]; then
  exit 0
fi

# Extract status from YAML frontmatter
STATUS=""
if head -20 "${TARGET_FILE}" 2>/dev/null | grep -q '^---'; then
  STATUS=$(sed -n '/^---$/,/^---$/p' "${TARGET_FILE}" 2>/dev/null \
    | grep -E '^status:' \
    | head -1 \
    | sed 's/status:[[:space:]]*//' \
    | sed 's/^"//;s/"$//' \
    | tr -d '[:space:]')
fi

case "${STATUS}" in
  locked)
    echo "🔒 写入被阻断：${TARGET_FILE} 状态为 \"locked\"，属于冻结区。"
    echo "需要用户明确解锁后才能修改。请勿重试此写入操作。"
    exit 1
    ;;
  approved)
    echo "🔒 写入被阻断：${TARGET_FILE} 状态为 \"approved\"，属于冻结区。"
    echo "需要用户明确解锁后才能修改。请勿重试此写入操作。"
    exit 1
    ;;
esac
