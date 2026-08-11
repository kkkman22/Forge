# Progress: hook-system-enhancement

## Tasks

### Task 1: Stop Hook command→args migration (§6)
- [ ] 1.1 新建 `scripts/stop-incomplete-tasks.mjs`
- [ ] 1.2 新建 `scripts/stop-pending-rules.mjs`
- [ ] 1.3 新建 `scripts/stop-phase-verify.mjs`
- [ ] 1.4 修改 `plugin.json` Stop hook → args 形式
- [ ] 1.5 新建 `scripts/posttooluse-status-reminder.mjs`
- [ ] 1.6 新建 `scripts/teammate-idle-phase-check.mjs`
- [ ] 1.7 新建 `scripts/task-completed-notify.mjs`
- [ ] 1.8 验证 `plugin.json` 中无 `command` 字段

### Task 2: MCP Tool Hook migration (§8)
- [ ] 2.1 审查所有 hook
- [ ] 2.2 迁移符合条件的 hook
- [ ] 2.3 验证迁移后行为

### Task 3: TaskCreated Hook (§12)
- [ ] 3.1 新建 `scripts/task-created-hook.mjs`
- [ ] 3.2 注册 `TaskCreated` 事件
- [ ] 3.3 fail-open 设计

### Task 4: WorktreeCreate/Remove Hook (§13)
- [ ] 4.1 新建 `scripts/worktree-create-hook.mjs`
- [ ] 4.2 新建 `scripts/worktree-remove-hook.mjs`
- [ ] 4.3 注册两个事件
- [ ] 4.4 自动 mkdir

### Task 5: StopFailure Hook (§15)
- [ ] 5.1 新建 `scripts/stop-failure-hook.mjs`
- [ ] 5.2 注册 `StopFailure` 事件
- [ ] 5.3 JSONL 格式

### Task 6: PermissionDenied Hook (§16)
- [ ] 6.1 新建 `scripts/permission-denied-hook.mjs`
- [ ] 6.2 读操作 → retry
- [ ] 6.3 写操作 → 不 retry
- [ ] 6.4 注册 `PermissionDenied` 事件

### Task 7: terminalSequence 通知 (§7)
- [ ] 7.1 添加 terminalSequence 输出
- [ ] 7.2 通知格式
- [ ] 7.3 仅交互模式

### Task 8: duration_ms 追踪 (§19)
- [ ] 8.1 修改 check-context-boundary.mjs
- [ ] 8.2 JSONL 日志
- [ ] 8.3 --help 支持

### Task 9: 回归验证
- [ ] 9.1 `npm run check`
- [ ] 9.2 Stop hook 行为不变
- [ ] 9.3 所有新 hook exit 0
## Task 2: MCP Tool Hook Migration — Audit Result

**Date**: 2026-05-30
**Finding**: No hooks qualify for type: mcp_tool migration.

All 25 registered hook scripts perform file-system I/O (readFileSync, writeFileSync, readdirSync, execSync, etc.) as their primary logic. None exclusively call forge-context MCP tools without additional processing.

**Conclusion**: The mcp_tool migration path is not applicable to any current Forge hooks. Requirement R2 is satisfied by conducting the audit — no code changes needed.
