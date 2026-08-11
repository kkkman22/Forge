---
feature: hook-system-enhancement
layout: design
created: 2026-05-30
---

# Design Document: Hook 系统增强

## Overview

对 Forge hook 系统进行 8 项增强：command→args 迁移（6 个 hook）、mcp_tool 迁移、5 个新生命周期 hook 脚本、terminalSequence 通知、duration_ms 追踪。

**变更范围**：
- 修改 `.claude-plugin/plugin.json`（hook 注册变更）
- 新增 5 个 hook 脚本（`scripts/` 下）
- 包装 6 个 inline shell 为独立脚本
- 修改 `scripts/check-context-boundary.mjs`（添加 duration_ms 追踪）

**不涉及**：agent 定义、SKILL 文档、MCP server。

## Architecture

```
plugin.json hooks 注册
├── 已有 hook 迁移
│   ├── Stop (6个inline shell) → 独立脚本 + args 形式
│   ├── PostToolUse (1个inline shell) → 独立脚本 + args 形式
│   ├── TeammateIdle → 独立脚本 + args 形式
│   └── TaskCompleted → 独立脚本 + args 形式
│
├── MCP Tool 迁移（候选）
│   └── 仅调用 forge-context 的 hook → type: mcp_tool
│
└── 新增生命周期 Hook
    ├── TaskCreated → scripts/task-created-hook.mjs
    ├── WorktreeCreate → scripts/worktree-create-hook.mjs
    ├── WorktreeRemove → scripts/worktree-remove-hook.mjs
    ├── StopFailure → scripts/stop-failure-hook.mjs
    └── PermissionDenied → scripts/permission-denied-hook.mjs
```

## Components and Interfaces

### Component 1: Stop Hook 脚本拆分

当前 `Stop` hook 包含 6 个内联 shell command：

| 当前 command | 新脚本 |
|-------------|--------|
| `if [ -f .tinkerman/progress/*.md ]...` | `scripts/stop-incomplete-tasks.mjs` |
| `bash persistent-loop.sh` | 保留（已有独立脚本） |
| `if [ -f .tinkerman/knowledge/evolved-rules.md ]...` | `scripts/stop-pending-rules.mjs` |
| `record-evolved-rule-violation.mjs` | 保留（已有独立脚本） |
| `flag-stale-evolved-rules.mjs` | 保留（已有独立脚本） |
| `cmux-mirror/sync-once.mjs` | 保留（已有独立脚本） |
| `if [ -f .tinkerman/status.md ]...phase check` | `scripts/stop-phase-verify.mjs` |

### Component 2: 新 Hook 脚本

每个脚本 ~30-50 行 Node.js，遵循 fail-open 设计：

```
scripts/task-created-hook.mjs      — 读取 plan 文件，输出 task 摘要
scripts/worktree-create-hook.mjs   — 记录 worktree 到 .tinkerman/progress/worktrees.json
scripts/worktree-remove-hook.mjs   — 移除 worktree 记录
scripts/stop-failure-hook.mjs      — 追加 API 错误到 .tinkerman/debug/failures.jsonl
scripts/permission-denied-hook.mjs — 读取被拒工具名，决定是否 retry
```

### Component 3: terminalSequence 通知

在 phase transition 脚本（如 persistent-loop.sh 或 Stop hook）中添加通知输出：

```json
{
  "terminalSequence": {
    "type": "notification",
    "title": "Forge Phase Transition",
    "message": "🔨 Build → 📝 Review"
  }
}
```

### Component 4: duration_ms 追踪

修改 `scripts/check-context-boundary.mjs`（PostToolUse hook）：

```js
// 从 hook 输入中提取 duration_ms
const duration = input.duration_ms;
if (duration) {
  appendToRunLog({ tool: input.tool_name, duration_ms: duration, timestamp: Date.now() });
}
```

## Error Handling

| 场景 | 行为 |
|------|------|
| 新 hook 脚本异常 | try/catch → exit 0 |
| plan 文件不存在（TaskCreated） | 静默退出 |
| `.tinkerman/debug/` 不存在 | mkdirSync recursive |
| worktrees.json 损坏 | 重建空文件 |
| terminalSequence 不支持 | 静默忽略（JSON 输出不会被消费） |
| MCP tool hook 失败 | exit 0（不阻断） |

## Testing Strategy

1. **单元测试**：每个新 hook 脚本的核心逻辑
2. **迁移验证**：Stop hook 迁移后行为与迁移前一致
3. **回归验证**：`npm run check` 通过
4. **手动验证**：worktree create → 检查 worktrees.json 记录
