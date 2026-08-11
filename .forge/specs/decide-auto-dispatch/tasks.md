---
feature: decide-auto-dispatch
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/decide-auto-dispatch/requirements.md"
---

# Tasks

## Task 1: decide skill instructions 模式分发逻辑

- [ ] 1.1 在 `skills/forge/lib/decide/instructions.md` 头部新增"模式选择"章节
- [ ] 1.2 实现 `inline`/`agents`/`auto` 三值分发逻辑说明
- [ ] 1.3 实现 `auto` 模式的 tier 读取规则：从 `.forge/status.md` 读取 `tier` 字段
- [ ] 1.4 实现 `auto` 模式的 tier→模式映射：full→agents, standard/light→inline
- [ ] 1.5 实现降级逻辑：Agent Teams 不可用 → inline + 警告输出格式

**Verify-By**: manual — 运行 `/forge decide`（Full tier）验证模式选择
**关联需求**: R1, R2

## Task 2: router skill tier 传递验证

- [ ] 2.1 检查 `skills/forge/lib/router/instructions.md` 是否已将 tier 写入 `.forge/status.md`
- [ ] 2.2 确认 tier 字段格式正确（`tier: full`、`tier: standard`、`tier: light`）
- [ ] 2.3 如需修改，添加 tier 写入逻辑

**Verify-By**: bash — `grep -n 'tier' .forge/status.md`
**关联需求**: R2

## Task 3: config.md 默认值变更

- [ ] 3.1 将 `.forge/config.md` 中 `decide_dispatch_mode: inline` 改为 `decide_dispatch_mode: auto`
- [ ] 3.2 在 config.md 注释中说明 `auto` 的行为：full→agents, 其他→inline
- [ ] 3.3 更新 `forge init` 模板（`templates/` 中的 config.md 模板）

**Verify-By**: bash — `grep 'decide_dispatch_mode' .forge/config.md`
**关联需求**: R1, R4

## Task 4: workflow-fallback-ladder.md 更新

- [ ] 4.1 在 `.claude/rules/workflow-fallback-ladder.md` 的 L1 触发条件中新增 `agents_unavailable` 场景
- [ ] 4.2 添加说明：`auto` 模式选择 Agent Teams 但环境不支持时的降级行为

**Verify-By**: bash — `grep 'agents_unavailable' .claude/rules/workflow-fallback-ladder.md`
**关联需求**: R3

## Task 5: 端到端验证

- [ ] 5.1 Full tier + `auto` 模式：运行 `/forge decide`，确认启动 Agent Teams
- [ ] 5.2 Standard tier + `auto` 模式：运行 `/forge decide`，确认使用 inline
- [ ] 5.3 Full tier + `auto` + 无 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`：确认降级到 inline + 警告
- [ ] 5.4 `inline` 模式：确认行为不变
- [ ] 5.5 `npm run check` 通过

**Verify-By**: manual — 全场景验证
**关联需求**: R1, R2, R3, R5
