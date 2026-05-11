#!/usr/bin/env bash
# category: internal-only
# hook-check-frozen-post.sh — PostToolUse defence-in-depth hook.
#
# After a Write/Edit/MultiEdit tool succeeds, re-checks the target path
# against Zone_Registry. If the path is frozen but a write succeeded
# (e.g. race condition, hook bug), emits updatedToolOutput with a breach
# warning and logs the event.
#
# This hook does NOT undo the write — it only reports.
# File system reversal is left to the user or CC's /rewind.
#
# Feature flag: only active when FORGE_STRUCTURED_FROZEN=1 (default).
set -euo pipefail

# Feature flag check
if [[ "${FORGE_STRUCTURED_FROZEN:-1}" = "0" ]]; then
  exit 0
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
source "${script_dir}/zone-registry.sh"

# Read hook event from stdin
INPUT=""
INPUT=$(cat)

# Parse fields
TOOL_NAME=""
FILE_PATH=""
TOOL_SUCCESS=""

if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || TOOL_NAME=""
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || FILE_PATH=""
  TOOL_SUCCESS=$(printf '%s' "$INPUT" | jq -r '.tool_response.success // false' 2>/dev/null) || TOOL_SUCCESS="false"
else
  TOOL_NAME=$(printf '%s' "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4) || TOOL_NAME=""
  FILE_PATH=$(printf '%s' "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4) || FILE_PATH=""
  TOOL_SUCCESS=$(printf '%s' "$INPUT" | grep -o '"success":true' > /dev/null 2>&1 && echo "true" || echo "false")
fi

export TOOL_NAME

# Only re-check if tool succeeded
[[ "$TOOL_SUCCESS" != "true" ]] && exit 0

# Only apply to write-class tools
case "$TOOL_NAME" in
  Write|Edit|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

[[ -z "$FILE_PATH" ]] && exit 0

# Re-classify the path
result=$(classify_path "$FILE_PATH")
category="${result%% *}"
reason_code="${result#* }"

case "$category" in
  frozen-*)
    # Defence-in-depth breach detected
    diagnostic=$(emit_frozen_diagnostic "$FILE_PATH" "$category" "$reason_code")

    warning=$(printf '⚠ Post-hoc frozen-zone violation detected\n\n%s' \
      "$(printf '%s' "$diagnostic" | grep -o '"message_md":"[^"]*"' | head -1 | sed 's/"message_md":"//;s/"$//' 2>/dev/null || echo "Frozen zone breach: $FILE_PATH")")

    # Output hook-specific override
    if command -v jq >/dev/null 2>&1; then
      jq -n --arg w "$warning" '{hookSpecificOutput: {updatedToolOutput: $w}}'
    else
      printf '{"hookSpecificOutput":{"updatedToolOutput":"%s"}}\n' "$(_json_escape "$warning")"
    fi

    log_event "post" "$FILE_PATH" "$category" "$reason_code" "breached"
    ;;
  *)
    # Not frozen — pass through
    exit 0
    ;;
esac
