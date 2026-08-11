#!/usr/bin/env bash
set -euo pipefail

FORGE_DIR=".tinkerman"

# Check .forge directory exists
if [ ! -d "$FORGE_DIR" ]; then
  exit 0
fi

messages=()

# 1. Check status.md for active phase
if [ -f "$FORGE_DIR/status.md" ]; then
  phase=$(grep -E '^phase:' "$FORGE_DIR/status.md" 2>/dev/null | head -1 | sed 's/^phase:[[:space:]]*//' || true)
  task=$(grep -E '^current_task:' "$FORGE_DIR/status.md" 2>/dev/null | head -1 | sed 's/^current_task:[[:space:]]*//' || true)

  if [ -n "$phase" ] && [ "$phase" != "idle" ] && [ "$phase" != "completed" ]; then
    task_info=""
    if [ -n "$task" ]; then
      task_info="，当前任务: $task"
    fi
    messages+=("📌 上次会话停在 **$phase** 阶段${task_info}。输入 \`/tinkerman resume\` 恢复。")
  fi
fi

# 2. Check for feature branch with uncommitted changes
current_branch=$(git branch --show-current 2>/dev/null || true)
if [ -n "$current_branch" ] && echo "$current_branch" | grep -qE '^(forge/|feature/)'; then
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    messages+=("⚠️ 当前在 feature 分支 \`$current_branch\`，有未提交的变更。")
  fi
fi

# 3. Check for P0/P1 review reports
if ls "$FORGE_DIR/reviews/"*.md 1>/dev/null 2>&1; then
  for review_file in "$FORGE_DIR/reviews/"*.md; do
    if grep -qE '### P0 Issues' "$review_file" 2>/dev/null; then
      p0_block=$(sed -n '/### P0 Issues/,/### P[123] Issues/p' "$review_file" 2>/dev/null || true)
      if [ -n "$p0_block" ] && ! echo "$p0_block" | grep -qE '^\s*None\s*$'; then
        messages+=("🔴 存在包含 P0/P1 的 review 报告，ship 被阻断。输入 \`/tinkerman review\` 查看详情。")
        break
      fi
    fi
  done
fi

# 4. Check for draft plans
if ls "$FORGE_DIR/plans/"*.md 1>/dev/null 2>&1; then
  for plan_file in "$FORGE_DIR/plans/"*.md; do
    status=$(grep -E '^status:' "$plan_file" 2>/dev/null | head -1 | sed 's/^status:[[:space:]]*//' || true)
    if [ "$status" = "draft" ]; then
      plan_name=$(basename "$plan_file" .md)
      messages+=("📋 Plan \`$plan_name\` 状态为 draft，等待批准。输入 \`/tinkerman plan\` 继续。")
    fi
  done
fi

# === Extensible area ===
# Future checks:
# - stale worktree detection (.claude/worktrees/ older than 24h)
# - knowledge base bloat warning (.tinkerman/knowledge/ file count near limit)
# - config drift detection (config.md hash changed)
# - CI command availability (ci_check_command tool installed?)

# Output
if [ ${#messages[@]} -gt 0 ]; then
  context=""
  for msg in "${messages[@]}"; do
    context="${context}\\n${msg}"
  done

  # JSON escape: backslash, double-quote, tab
  escaped=$(printf '%s' "$context" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk '{printf "%s\\n", $0}')
  printf '{"hookSpecificOutput":{"additionalContext":"%s"}}\n' "$escaped"
else
  printf '{}'
fi

exit 0
