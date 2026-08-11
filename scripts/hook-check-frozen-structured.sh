#!/usr/bin/env bash
# category: internal-only
# hook-check-frozen-structured.sh — PreToolUse hook with structured JSON output.
#
# Reads CC hook event from stdin, classifies the target path against
# Zone_Registry, and outputs a JSON deny decision with Frozen_Diagnostic
# or silently allows (exit 0, no output).
#
# Feature flag: FORGE_STRUCTURED_FROZEN=1 (default) enables this mode.
# Set to 0 to fall back to legacy exit-code blocking.
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"

# Feature flag check
if [[ "${FORGE_STRUCTURED_FROZEN:-1}" = "0" ]]; then
  # Legacy scripts expect file path as $1 — parse from stdin
  _legacy_input=""
  _legacy_input=$(cat)
  _legacy_file_path=""
  if command -v jq >/dev/null 2>&1; then
    _legacy_file_path=$(printf '%s' "$_legacy_input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || _legacy_file_path=""
  else
    _legacy_file_path=$(printf '%s' "$_legacy_input" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4) || _legacy_file_path=""
  fi
  if [[ -f "${script_dir}/hook-check-frozen-legacy.sh" ]]; then
    exec bash "${script_dir}/hook-check-frozen-legacy.sh" "$_legacy_file_path"
  fi
  exec bash "${script_dir}/hook-check-frozen.sh" "$_legacy_file_path"
fi

source "${script_dir}/zone-registry.sh"

# ---------------------------------------------------------------------------
# Helper functions (must be defined before use)
# ---------------------------------------------------------------------------

_hook_deny_frozen() {
  local path="$1" category="$2" reason_code="$3"

  local diagnostic
  diagnostic=$(emit_frozen_diagnostic "$path" "$category" "$reason_code")

  local system_message suggested_alt
  if command -v jq >/dev/null 2>&1; then
    system_message=$(printf '%s' "$diagnostic" | jq -r '.message_md' 2>/dev/null) || system_message="Frozen zone violation: $path ($category)"
    suggested_alt=$(printf '%s' "$diagnostic" | jq -r '.suggested_alternative_path // ""' 2>/dev/null) || suggested_alt=""
  else
    system_message="Frozen zone violation: $path ($category)"
    suggested_alt=""
  fi

  local additional=""
  if [[ -n "$suggested_alt" ]]; then
    additional="Consider writing to ${suggested_alt} instead. State changes go to .tinkerman/status.md."
  else
    additional="State changes go to .tinkerman/status.md."
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg sm "$system_message" --arg ac "$additional" \
      '{decision: "deny", systemMessage: $sm, additionalContext: $ac}'
  else
    printf '{"decision":"deny","systemMessage":"%s","additionalContext":"%s"}\n' \
      "$(_json_escape "$system_message")" "$(_json_escape "$additional")"
  fi

  log_event "pre" "$path" "$category" "$reason_code" "denied"
  exit 0
}

_hook_deny_guarded() {
  local path="$1" category="$2" reason_code="$3"

  local diagnostic
  diagnostic=$(emit_frozen_diagnostic "$path" "$category" "$reason_code")

  local system_message
  if command -v jq >/dev/null 2>&1; then
    system_message=$(printf '%s' "$diagnostic" | jq -r '.message_md' 2>/dev/null) || system_message="Guarded zone violation: $path ($category)"
  else
    system_message="Guarded zone violation: $path ($category)"
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg sm "$system_message" \
      '{decision: "deny", systemMessage: $sm, additionalContext: "Use Edit tool to modify specific parts instead of overwriting the entire file."}'
  else
    printf '{"decision":"deny","systemMessage":"%s","additionalContext":"Use Edit tool to modify specific parts instead of overwriting the entire file."}\n' \
      "$(_json_escape "$system_message")"
  fi

  log_event "pre" "$path" "$category" "$reason_code" "denied"
  exit 0
}

_hook_guarded_check() {
  local path="$1" tool_input="$2" tool_name="$3"

  # Edit tool is always allowed on guarded files (intrinsic modify-preserving)
  if [[ "$tool_name" == "Edit" || "$tool_name" == "MultiEdit" ]]; then
    return 0
  fi

  # For Write: check if content is a superset (append)
  guarded_append_check "$path" "$tool_input"
}

_hook_handle_bash() {
  local tool_input="$1"
  local bash_cmd=""

  if command -v jq >/dev/null 2>&1; then
    bash_cmd=$(printf '%s' "$tool_input" | jq -r '.tool_input.command // .tool_input // ""' 2>/dev/null) || bash_cmd=""
  else
    bash_cmd=$(printf '%s' "$tool_input" | grep -o '"command":"[^"]*"' | head -1 | cut -d'"' -f4) || bash_cmd=""
  fi

  [[ -z "$bash_cmd" ]] && return 0

  # Scan for frozen-zone paths in bash command
  local paths=""
  paths=$(printf '%s' "$bash_cmd" | grep -oE '\.tinkerman/(specs|plans|config\.md)[a-zA-Z0-9_./-]*' 2>/dev/null || true)
  [[ -z "$paths" ]] && return 0

  while IFS= read -r detected_path; do
    [[ -z "$detected_path" ]] && continue
    local result
    result=$(classify_path "$detected_path")
    local category="${result%% *}"
    local reason_code="${result#* }"

    case "$category" in
      frozen-*|guarded-*)
        local diagnostic
        diagnostic=$(emit_frozen_diagnostic "$detected_path" "$category" "$reason_code")
        local msg
        msg=$(printf '%s' "$diagnostic" | grep -o '"message_md":"[^"]*"' | head -1 | sed 's/"message_md":"//;s/"$//') || msg=""
        if command -v jq >/dev/null 2>&1; then
          jq -n --arg msg "$msg" '{decision: "deny", systemMessage: $msg}'
        else
          printf '{"decision":"deny","systemMessage":"%s"}\n' "$(_json_escape "$msg")"
        fi
        log_event "pre" "$detected_path" "$category" "$reason_code" "denied"
        exit 0
        ;;
    esac
  done <<< "$paths"
}

# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

# Read hook event from stdin
INPUT=""
INPUT=$(cat)

# Parse tool name and file path
TOOL_NAME=""
FILE_PATH=""

if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || TOOL_NAME=""
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || FILE_PATH=""
else
  TOOL_NAME=$(printf '%s' "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4) || TOOL_NAME=""
  FILE_PATH=$(printf '%s' "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4) || FILE_PATH=""
fi

export TOOL_NAME

case "$TOOL_NAME" in
  Write|Edit|MultiEdit|NotebookEdit) ;;
  Bash)
    _hook_handle_bash "$INPUT"
    exit 0
    ;;
  *) exit 0 ;;
esac

[[ -z "$FILE_PATH" ]] && exit 0

result=$(classify_path "$FILE_PATH")
category="${result%% *}"
reason_code="${result#* }"

case "$category" in
  frozen-*)
    _hook_deny_frozen "$FILE_PATH" "$category" "$reason_code"
    ;;
  guarded-*)
    if _hook_guarded_check "$FILE_PATH" "$INPUT" "$TOOL_NAME"; then
      log_event "pre" "$FILE_PATH" "$category" "$reason_code" "allowed"
      exit 0
    else
      _hook_deny_guarded "$FILE_PATH" "$category" "$reason_code"
    fi
    ;;
  *)
    exit 0
    ;;
esac
