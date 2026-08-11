---
feature: session-resume-check
layout: design
created: 2026-06-04
---

# Design Document: Session Resume Check

## Overview

创建 SessionStart hook 脚本，在每次新会话启动时自动检测 `.forge/` 目录中的活跃状态，向用户提醒未完成的工作。新增 1 个脚本文件 + hook 注册。

## Architecture

新增 `hooks/session-start-resume-check.sh`（bash 脚本）。在 hook 配置中注册到 SessionStart 事件。

## Components and Interfaces

### 1. hooks/session-start-resume-check.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

FORGE_DIR=".forge"

# 检查 .forge 目录是否存在
if [ ! -d "$FORGE_DIR" ]; then
  exit 0
fi

messages=()

# 1. 检查 status.md 中的当前 phase
if [ -f "$FORGE_DIR/status.md" ]; then
  phase=$(grep -E '^phase:' "$FORGE_DIR/status.md" 2>/dev/null | head -1 | sed 's/^phase:[[:space:]]*//' || true)
  task=$(grep -E '^current_task:' "$FORGE_DIR/status.md" 2>/dev/null | head -1 | sed 's/^current_task:[[:space:]]*//' || true)

  if [ -n "$phase" ] && [ "$phase" != "idle" ] && [ "$phase" != "completed" ]; then
    messages+=("📌 上次会话停在 **$phase** 阶段$( [ -n "$task" ] && echo "，当前任务: $task" )。输入 \`/forge resume\` 恢复。")
  fi
fi

# 2. 检查是否有未合并的 feature 分支 + 未提交变更
current_branch=$(git branch --show-current 2>/dev/null || true)
if [ -n "$current_branch" ] && echo "$current_branch" | grep -qE '^(forge/|feature/)'; then
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    messages+=("⚠️ 当前在 feature 分支 \`$current_branch\`，有未提交的变更。")
  fi
fi

# 3. 检查是否有包含 P0/P1 的 review 报告
# （按 review 输出文件名约定检测）
if ls "$FORGE_DIR/reviews/"*.md 1>/dev/null 2>&1; then
  for review_file in "$FORGE_DIR/reviews/"*.md; do
    if grep -qE '### P[01] Issues' "$review_file" 2>/dev/null; then
      if ! grep -qE '### P0 Issues\s*\n\s*None' "$review_file" 2>/dev/null || \
         ! grep -qE '### P1 Issues\s*\n\s*None' "$review_file" 2>/dev/null; then
        messages+=("🔴 存在包含 P0/P1 的 review 报告，ship 被阻断。输入 \`/forge review\` 查看详情。")
        break
      fi
    fi
  done
fi

# 4. 检查是否有 draft 状态的 plan
if ls "$FORGE_DIR/plans/"*.md 1>/dev/null 2>&1; then
  for plan_file in "$FORGE_DIR/plans/"*.md; do
    status=$(grep -E '^status:' "$plan_file" 2>/dev/null | head -1 | sed 's/^status:[[:space:]]*//' || true)
    if [ "$status" = "draft" ]; then
      plan_name=$(basename "$plan_file" .md)
      messages+=("📋 Plan \`$plan_name\` 状态为 draft，等待批准。输入 \`/forge plan\` 继续。")
    fi
  done
fi

# === 可扩展区域 ===
# 后续可追加检查项：
# - stale worktree 检测（.claude/worktrees/ 超过 24h 未修改）
# - 知识库膨胀警告（.forge/knowledge/ 文件数接近上限）
# - config drift 检测（config.md hash 是否变化）
# - CI 命令可用性（ci_check_command 对应工具是否已安装）

# 输出
if [ ${#messages[@]} -gt 0 ]; then
  context=""
  for msg in "${messages[@]}"; do
    context="${context}\n${msg}"
  done

  # JSON 转义
  escaped=$(printf '%s' "$context" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk '{printf "%s\\n", $0}')
  printf '{"hookSpecificOutput":{"additionalContext":"%s"}}\n' "$escaped"
else
  printf '{}'
fi

exit 0
```

### 2. Hook 注册

在项目 hook 配置中追加：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "bash hooks/session-start-resume-check.sh",
        "timeout": 3
      }
    ]
  }
}
```

### 3. 输出格式关键约束

- 只输出 `hookSpecificOutput.additionalContext`（Claude Code 格式）
- 不输出 `additional_context`（Cursor 格式）——Claude Code 无去重地读取所有字段，同时输出会导致双倍注入
- JSON 转义使用 sed + awk 的单 pass 方式
- 静默模式：`{}`

## Testing Strategy

- 手动测试：创建 `.forge/status.md` 含 `phase: build`，启动新会话确认提醒出现
- 手动测试：删除 phase 或设为 `idle`，启动新会话确认静默
- 验证脚本 timeout：`time bash hooks/session-start-resume-check.sh` 应 < 1s
- `npm run check`：全量测试通过
