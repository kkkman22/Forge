#!/usr/bin/env bash
# category: internal-only
#
# Phase Transition Guard — PostToolUse Hook
#
# Detects phase transitions in .forge/status.md and outputs a §2.7
# reminder to the AI context, enforcing the auto-advance protocol.
#
# Design: fail-open. All error paths exit 0 silently.
# Spec: .forge/specs/phase-auto-advance-enforcement/requirements.md

set -uo pipefail

STATUS_FILE=".forge/status.md"
CACHE_FILE="/tmp/forge-last-phase"

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/forge-helpers.sh
source "$SCRIPT_DIR/lib/forge-helpers.sh" 2>/dev/null || true

# Fallback read_field if forge-helpers.sh is unavailable
if ! type read_field &>/dev/null; then
  read_field() {
    local file="$1"
    local field="$2"
    if [ ! -f "$file" ]; then
      echo ""
      return
    fi
    grep "^${field}:" "$file" 2>/dev/null | sed -n "1s/^${field}: *\"\\{0,1\\}//;s/\"\\{0,1\\} *$//p" || echo ""
  }
fi

# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

# Exit silently if no status file
if [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

# Read current phase from status.md
current_phase=$(read_field "$STATUS_FILE" "phase")

# Exit silently if no phase field
if [ -z "$current_phase" ]; then
  exit 0
fi

# Read last phase from cache (default: empty = first run)
last_phase=""
if [ -f "$CACHE_FILE" ]; then
  last_phase=$(cat "$CACHE_FILE" 2>/dev/null || echo "")
fi

# Detect transition: phase changed AND target is not "completed"
if [ "$current_phase" != "$last_phase" ] && [ "$current_phase" != "completed" ] && [ -n "$last_phase" ]; then
  cat <<EOF
⚠️ §2.7 铁律触发：phase 已从 ${last_phase} 过渡到 ${current_phase}。
必须立即调用 Skill(skill="forge", args="<next>")。
不得只输出过渡文字而不实际调用 Skill。
→ 详见 shared/next-step-protocol.md
EOF
fi

# Atomically update cache file
echo "$current_phase" > "${CACHE_FILE}.tmp" 2>/dev/null && mv -f "${CACHE_FILE}.tmp" "$CACHE_FILE" 2>/dev/null || true

exit 0
