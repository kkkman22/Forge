#!/usr/bin/env bash
# ============================================================================
# check-frozen.sh — PreToolUse hook for frozen file protection
#
# Called before Write/Edit operations on .forge/ files.
# Reads the target file's YAML frontmatter and blocks writes to files
# with status "locked" or "approved".
#
# Input: The tool use context is available via environment or stdin.
#        This script checks all .forge/specs/, .forge/plans/, .forge/config.md
#        files that might be targeted.
#
# Exit: Always exits 0 (hook output is read by the agent, not exit code).
#       Prints a blocking message if the write should be prevented.
# ============================================================================

set -euo pipefail

# The hook receives the file path being written as an argument or via context.
# In Claude Code hooks, the tool input is available in the hook output context.
# We scan for .forge/ files with frozen status proactively.

TARGET_FILE="${1:-}"

# If no argument, try to detect from recent tool context (fallback: do nothing)
if [[ -z "${TARGET_FILE}" ]]; then
  exit 0
fi

# Only check files under .forge/
case "${TARGET_FILE}" in
  .forge/specs/*|.forge/plans/*|.forge/config.md)
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
    ;;
  approved)
    echo "🔒 写入被阻断：${TARGET_FILE} 状态为 \"approved\"，属于冻结区。"
    echo "需要用户明确解锁后才能修改。请勿重试此写入操作。"
    ;;
esac
