---
feature: hook-system-enhancement
layout: tasks
created: 2026-05-30
spec_ref: ".tinkerman/specs/hook-system-enhancement/requirements.md"
---

# Tasks

## Task 1: Stop Hook command→args 迁移（§6）

- [ ] 1.1 新建 `scripts/stop-incomplete-tasks.mjs`（从 Stop hook 第 1 个 command 迁移）
- [ ] 1.2 新建 `scripts/stop-pending-rules.mjs`（从 Stop hook 第 3 个 command 迁移）
- [ ] 1.3 新建 `scripts/stop-phase-verify.mjs`（从 Stop hook 最后一个 command 迁移）
- [ ] 1.4 修改 `plugin.json` Stop hook：将 command 替换为 args 形式
- [ ] 1.5 新建 `scripts/posttooluse-status-reminder.mjs`（从 PostToolUse command 迁移）
- [ ] 1.6 新建 `scripts/teammate-idle-phase-check.mjs`（从 TeammateIdle command 迁移）
- [ ] 1.7 新建 `scripts/task-completed-notify.mjs`（从 TaskCompleted command 迁移）
- [ ] 1.8 验证 `plugin.json` 中无 `command` 字段残留

**Verify-By**: bash — `grep -c '"command"' .claude-plugin/plugin.json` 输出 0
**关联需求**: R1

## Task 2: MCP Tool Hook 迁移（§8）

- [ ] 2.1 审查所有 hook，识别仅调用 forge-context MCP 的候选
- [ ] 2.2 将符合条件的 hook 迁移为 `type: "mcp_tool"`
- [ ] 2.3 验证迁移后 hook 行为不变

**Verify-By**: bash — `grep -c 'mcp_tool' .claude-plugin/plugin.json` 确认新增数量
**关联需求**: R2

## Task 3: TaskCreated Hook（§12）

- [ ] 3.1 新建 `scripts/task-created-hook.mjs`：读取 `.tinkerman/plans/` 输出 task 摘要
- [ ] 3.2 在 `plugin.json` 注册 `TaskCreated` 事件
- [ ] 3.3 实现 fail-open 设计

**Verify-By**: bash — `grep 'TaskCreated' .claude-plugin/plugin.json`
**关联需求**: R3

## Task 4: WorktreeCreate/Remove Hook（§13）

- [ ] 4.1 新建 `scripts/worktree-create-hook.mjs`：记录 worktree 信息到 `.tinkerman/progress/worktrees.json`
- [ ] 4.2 新建 `scripts/worktree-remove-hook.mjs`：移除对应记录
- [ ] 4.3 在 `plugin.json` 注册两个事件
- [ ] 4.4 实现 `.tinkerman/progress/` 和 `.tinkerman/debug/` 的自动 mkdir

**Verify-By**: manual — 创建 worktree 后检查 worktrees.json
**关联需求**: R4

## Task 5: StopFailure Hook（§15）

- [ ] 5.1 新建 `scripts/stop-failure-hook.mjs`：追加 API 错误到 `.tinkerman/debug/failures.jsonl`
- [ ] 5.2 在 `plugin.json` 注册 `StopFailure` 事件
- [ ] 5.3 JSONL 格式：`{ "error_type": "...", "timestamp": "...", "details": "..." }`

**Verify-By**: bash — `grep 'StopFailure' .claude-plugin/plugin.json`
**关联需求**: R5

## Task 6: PermissionDenied Hook（§16）

- [ ] 6.1 新建 `scripts/permission-denied-hook.mjs`：解析被拒工具，决定是否 retry
- [ ] 6.2 读操作被拒 → 返回 `{ retry: true }`
- [ ] 6.3 写操作被拒 → 不 retry
- [ ] 6.4 在 `plugin.json` 注册 `PermissionDenied` 事件

**Verify-By**: bash — `grep 'PermissionDenied' .claude-plugin/plugin.json`
**关联需求**: R6

## Task 7: terminalSequence 通知（§7）

- [ ] 7.1 在 persistent-loop.sh 或 Stop hook 中添加 terminalSequence 输出
- [ ] 7.2 通知格式：`{ "terminalSequence": { "title": "Forge", "message": "🔨 Build → 📝 Review" } }`
- [ ] 7.3 仅在交互模式下触发（检测 CI 环境）

**Verify-By**: manual — `/forge build` 完成后观察桌面通知
**关联需求**: R7

## Task 8: duration_ms 追踪（§19）

- [ ] 8.1 修改 `scripts/check-context-boundary.mjs`：提取 PostToolUse 输入中的 `duration_ms`
- [ ] 8.2 追加到 `.tinkerman/runs/` 下的 JSONL 日志
- [ ] 8.3 添加 `--help` 支持

**Verify-By**: bash — 运行 hook 后检查 `.tinkerman/runs/` 中的 JSONL
**关联需求**: R8

## Task 9: 回归验证

- [ ] 9.1 `npm run check` 通过
- [ ] 9.2 Stop hook 迁移后行为不变（incomplete tasks 提示、pending rules 提示）
- [ ] 9.3 所有新 hook 脚本 exit 0（fail-open）

**Verify-By**: bash + manual
**关联需求**: 全部
