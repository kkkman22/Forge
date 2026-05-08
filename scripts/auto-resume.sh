#!/usr/bin/env bash
# category: internal-only
#
# Forge Auto-Resume — SessionStart Hook
#
# Detects unfinished tasks in .forge/status.md and automatically injects
# context so the user doesn't need to manually run /forge resume.

set -euo pipefail

FORGE_DIR=".forge"
STATUS_FILE="$FORGE_DIR/status.md"
STALE_THRESHOLD_MINUTES=120

# Exit silently if no .forge directory
if [ ! -d "$FORGE_DIR" ]; then
  exit 0
fi

# Exit silently if no status file
if [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

# Check if status file is stale (>2 hours old)
stale_count=$(find "$STATUS_FILE" -mmin "+${STALE_THRESHOLD_MINUTES}" 2>/dev/null | wc -l | tr -d ' ')
if [ "$stale_count" -gt 0 ]; then
  exit 0
fi

# Read fields from status.md
read_field() {
  local file="$1"
  local field="$2"
  grep "^${field}:" "$file" 2>/dev/null | head -1 | sed "s/^${field}: *\"\\{0,1\\}//;s/\"\\{0,1\\} *$//" || echo ""
}

current_task=$(read_field "$STATUS_FILE" "current_task")
tier=$(read_field "$STATUS_FILE" "tier")
phase=$(read_field "$STATUS_FILE" "phase")
task_type=$(read_field "$STATUS_FILE" "task_type")
project_phase=$(read_field "$STATUS_FILE" "project_phase")

# Exit if no active task or task is completed
if [ -z "$current_task" ] || [ "$phase" = "completed" ]; then
  exit 0
fi

# Build context summary
echo "🔄 检测到未完成的 Forge 任务，自动恢复上下文。"
echo ""
echo "━━━ 任务状态 ━━━"
echo "  任务：$current_task"
echo "  档位：$tier"
echo "  阶段：$phase"
[ -n "$task_type" ] && echo "  类型：$task_type"
[ -n "$project_phase" ] && echo "  阶段：$project_phase"
echo ""

# Show progress if available
progress_files=$(ls "$FORGE_DIR"/progress/*.md 2>/dev/null || true)
if [ -n "$progress_files" ]; then
  completed=$(grep -c '\- \[x\]' $FORGE_DIR/progress/*.md 2>/dev/null || echo 0)
  pending=$(grep -c '\- \[ \]' $FORGE_DIR/progress/*.md 2>/dev/null || echo 0)
  echo "  进度：已完成 $completed / 待完成 $pending"
  echo ""
fi

# Show latest handoff if available
latest_handoff=$(find "$FORGE_DIR/handoffs" -maxdepth 1 -name '*.md' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
if [ -n "$latest_handoff" ]; then
  echo "━━━ 最近的 Handoff ━━━"
  # Show only the Decided section (most important for context recovery)
  sed -n '/### Decided/,/### /p' "$latest_handoff" 2>/dev/null | head -10
  echo ""
fi

# Show review status if in review/test/ship phase
if [ "$phase" = "review" ] || [ "$phase" = "test" ] || [ "$phase" = "ship" ]; then
  latest_review=$(find "$FORGE_DIR/reviews" -maxdepth 1 -name '*.md' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
  if [ -n "$latest_review" ]; then
    result=$(read_field "$latest_review" "result")
    p0=$(read_field "$latest_review" "p0_count")
    p1=$(read_field "$latest_review" "p1_count")
    echo "━━━ 评审状态 ━━━"
    echo "  结果：$result（P0: ${p0:-0}, P1: ${p1:-0}）"
    echo ""
  fi
fi

echo "继续当前任务，或输入 /forge abort 中止。"
