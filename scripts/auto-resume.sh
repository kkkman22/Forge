#!/usr/bin/env bash
# category: internal-only
#
# Forge Auto-Resume — SessionStart Hook
#
# Detects unfinished tasks in .tinkerman/status.md and automatically injects
# context so the user doesn't need to manually run /tinkerman resume.

set -euo pipefail

FORGE_DIR=".tinkerman"
STATUS_FILE="$FORGE_DIR/status.md"
STALE_THRESHOLD_MINUTES=120

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/forge-helpers.sh
source "$SCRIPT_DIR/lib/forge-helpers.sh"

# Exit silently if no .forge directory
if [ ! -d "$FORGE_DIR" ]; then
  exit 0
fi

# Exit silently if no status file
if [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

# Check if status file is stale (>2 hours old)
if ! is_fresh "$STATUS_FILE" "$STALE_THRESHOLD_MINUTES"; then
  exit 0
fi

current_task=$(read_field "$STATUS_FILE" "current_task")
tier=$(read_field "$STATUS_FILE" "tier")
phase=$(read_field "$STATUS_FILE" "phase")
task_type=$(read_field "$STATUS_FILE" "task_type")
project_phase=$(read_field "$STATUS_FILE" "project_phase")

# Exit if no active task or task is completed
if [ -z "$current_task" ] || [ "$phase" = "completed" ]; then
  exit 0
fi

# Build context summary as a single string, then emit it as Claude Code's
# hookSpecificOutput JSON (session-resume-check R3.1):
#   {"hookSpecificOutput":{"additionalContext":"<escaped-content>"}}
# R3.2/R3.3: newlines → \n, double-quotes → \", backslashes → \\.
# R3.4: emit ONLY hookSpecificOutput (no plain-text stdout, no Cursor
# additional_context) so Claude Code doesn't double-inject.

CONTEXT=""
ctx_append() {
  # Append $1 to CONTEXT with a trailing newline.
  if [ -z "$CONTEXT" ]; then
    CONTEXT="$1"
  else
    CONTEXT="$CONTEXT
$1"
  fi
}

ctx_append "🔄 检测到未完成的 Forge 任务，自动恢复上下文。"
ctx_append ""
ctx_append "━━━ 任务状态 ━━━"
ctx_append "  任务：$current_task"
ctx_append "  档位：$tier"
ctx_append "  阶段：$phase"
[ -n "$task_type" ] && ctx_append "  类型：$task_type"
[ -n "$project_phase" ] && ctx_append "  阶段：$project_phase"
ctx_append ""

# Show progress if available. Guard with a dir-exists check so a partial
# .forge setup (e.g. missing progress/) doesn't trip set -e via find's exit.
progress_count=0
if [ -d "$FORGE_DIR/progress" ]; then
  progress_count=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ' || echo 0)
fi
if [ "$progress_count" -gt 0 ]; then
  completed=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' -exec grep -c '\- \[x\]' {} + 2>/dev/null | awk '{s+=$1}END{print s}' || echo 0)
  pending=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' -exec grep -c '\- \[ \]' {} + 2>/dev/null | awk '{s+=$1}END{print s}' || echo 0)
  ctx_append "  进度：已完成 $completed / 待完成 $pending"
  ctx_append ""
fi

# Show latest handoff if available
latest_handoff=$(find_latest "$FORGE_DIR/handoffs" '*.md')
if [ -n "$latest_handoff" ]; then
  ctx_append "━━━ 最近的 Handoff ━━━"
  # Show only the Decided section (most important for context recovery)
  handoff_text=$(awk '/### Decided/{f=1} f{print; if(++n>=10) exit}' "$latest_handoff" 2>/dev/null)
  [ -n "$handoff_text" ] && ctx_append "$handoff_text"
  ctx_append ""
fi

# Show review status if in review/test/ship phase
if [ "$phase" = "review" ] || [ "$phase" = "test" ] || [ "$phase" = "ship" ]; then
  latest_review=$(find_latest "$FORGE_DIR/reviews" '*.md')
  if [ -n "$latest_review" ]; then
    # Guard each read with `|| true` so a missing/malformed field never trips
    # set -e (SessionStart hooks must stay non-disruptive).
    result=$(read_field "$latest_review" "result" || true)
    p0=$(read_field "$latest_review" "p0_count" || true)
    p1=$(read_field "$latest_review" "p1_count" || true)
    ctx_append "━━━ 评审状态 ━━━"
    ctx_append "  结果：${result:-unknown}（P0: ${p0:-0}, P1: ${p1:-0}）"
    ctx_append ""
  fi
fi

ctx_append "继续当前任务，或输入 /tinkerman abort 中止。"

# Emit the hookSpecificOutput JSON (R3.1). Prefer jq for correct escaping
# (R3.2/R3.3); fall back to a sed + while-read escaper if jq is unavailable.
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$CONTEXT" | jq -Rs '{hookSpecificOutput:{additionalContext:.}}'
else
  # Minimal JSON string escaper: backslash first, then quote; join lines with \n.
  escaped=$(printf '%s' "$CONTEXT" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | while IFS= read -r ln; do printf '%s\\n' "$ln"; done)
  printf '{"hookSpecificOutput":{"additionalContext":"%s"}}\n' "$escaped"
fi
