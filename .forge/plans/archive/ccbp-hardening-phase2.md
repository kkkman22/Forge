---
status: approved
created: "2026-05-12"
source: ".kiro/specs/ccbp-hardening-phase2/tasks.md"
spec_ref: ".forge/specs/ccbp-hardening-phase2/spec.md"
format: lightweight
monolith_acknowledged: true
---

# Plan: CCBP Hardening Phase 2

> Phase 2 of harness-layer hardening for Forge.
> Self-contained — does not depend on Phase 1 agent/dispatcher artifacts.
> 10 Requirements → 9 Task Groups → 62 sub-tasks.

## 前置状态

- Phase 1 rules 已存在: `forge-state.md`, `hooks.md`, `skill-authoring.md`, `testing.md`
- Phase 1 SKILL enhancements 已 commit (context:fork, Gotchas, important-if, etc.)
- hooks.json 有 7 个内联 if 模式需迁移
- CLAUDE.md 149 行（低于 200 行目标）
- `.claude/agents/` 只有 3 个 review agent，无 forge-{plan,build,review,ship}.md
- 无 dispatcher.sh
- 无 settings.json hooks section

## 自包含修正

原 spec Task 0 检查 Phase 1 agent/dispatcher 前置 → **跳过**。Phase 2 的 Req 3/4/5 要求 agent frontmatter，但 agent 文件本身需要先创建。Plan 中 Task 3 已包含创建 agent 文件的步骤。

## 任务摘要

| # | Task | Req | Files | Type |
|---|------|-----|-------|------|
| T1 | Hooks `if:` 条件过滤迁移 | R1 | hooks.json, HOOKS-README.md, test | MODIFY + CREATE |
| T2 | PreCompact/PostCompact 保护 | R2 | scripts/hook-{pre,post}compact.sh, settings.json, .gitignore | CREATE + MODIFY |
| T3 | Agent frontmatter (hooks/initialPrompt/isolation) | R3,R4,R5 | .claude/agents/forge-{plan,build,ship}.md, forge.md command | CREATE + MODIFY |
| T4 | Dispatcher 剩余事件迁移 | R6 | dispatcher.sh, settings.json, HOOKS-README.md | CREATE + MODIFY |
| T5 | Rules 迁移 | R7 | .claude/rules/{forge-src,skill-editing,branch-protection}.md, CLAUDE.md | CREATE + MODIFY |
| T6 | CLAUDE.md 二轮瘦身 | R8 | CLAUDE.md | CONDITIONAL MODIFY |
| T7 | CC 版本门禁 | R9 | scripts/init.sh, README.md, CHANGELOG.md | MODIFY |
| T8 | Contract test + 文档 | R10 | test/phase2.contract.test.ts, CHANGELOG, README, ADR | CREATE + MODIFY |
| T9 | 烟雾测试 | R10 | manual verification | VERIFY |

## Dependency Graph

```
T1 (if: migration) ─────────────┐
T2 (compaction) ────────────────┤
T3 (agent frontmatter) ─────────┤  ← independent, parallelizable
                                 │
T4 (dispatcher) ─── depends T1 ─┤  ← needs if: migration done
T5 (rules) ─────────────────────┤  ← independent
                                 │
T6 (CLAUDE.md trim) ─ dep T5 ──┤  ← needs rules content extracted
T7 (version gate) ─────────────┤  ← independent
                                 │
T8 (contract tests) ─ dep T1-T7 ┤
T9 (smoke test) ───── dep T8 ──┘
```

## Execution Order

Phase A (parallel): T1 + T2 + T3
Phase B (parallel): T4 (after T1) + T5 + T7
Phase C (after T5): T6 (conditional)
Phase D (after all): T8
Phase E (final): T9

## Detailed Tasks

### T1: Hooks `if:` 条件过滤迁移 (R1)

- T1.1: 审计 hooks.json 7 个内联 if 模式 → 创建 `.forge/docs/living/hooks-if-migration.md` 迁移表
- T1.2: 迁移可迁移的 hook 到 `if:` 字段（Write/Edit/Bash patterns → permission-rule 语法）
- T1.3: 保留不可迁移的内联判断（sandbox 检查用 `[ -f .forge/.sandbox-active.json ]`）
- T1.4: 更新 HOOKS-README.md + dispatcher 协同
- T1.5: 新增集成测试验证 if: 过滤行为
- T1.6: Checkpoint: vitest + diff 验证

### T2: PreCompact/PostCompact 保护 (R2)

- T2.1: 创建 `scripts/hook-precompact.sh`（trap exit 0, 读 status.md, 写 snapshot）
- T2.2: 创建 `scripts/hook-postcompact.sh`（读 snapshot, stdout, 删除）
- T2.3: 单元测试 compact-hooks.test.sh（有效/缺失/出错场景）
- T2.4: 注册到 settings.json（PreCompact/PostCompact 条目）
- T2.5: 更新 .gitignore（加 .forge/.compact-snapshot.md）
- T2.6: Checkpoint

### T3: Agent frontmatter (R3, R4, R5)

- T3.1: 创建 `.claude/agents/forge-build.md`（hooks: Stop + isolation: worktree）
- T3.2: 创建 `.claude/agents/forge-ship.md`（hooks: PreToolUse for git push）
- T3.3: 创建 `.claude/agents/forge-plan.md`（initialPrompt）
- T3.4: 更新 `.claude/commands/forge.md` plan 分支（简化 kickoff）
- T3.5: 评估 review/ship 的 initialPrompt → 记录决策
- T3.6: 冲突审计（agent hooks vs hooks.json）
- T3.7: 审计 scripts/ worktree 自建逻辑
- T3.8: 更新 .forge/config.md worktree 文档
- T3.9: Checkpoint

### T4: Dispatcher 剩余事件迁移 (R6)

- T4.1: 创建/扩展 `scripts/dispatcher.sh`（6 handler 函数）
- T4.2: 迁移 PreToolUse → handle_pretool()
- T4.3: 迁移 PostToolUse → handle_posttool()
- T4.4: 迁移 Stop → handle_stop()
- T4.5: 迁移 TeammateIdle → handle_teammate_idle()
- T4.6: 更新 settings.json（合并为 dispatcher 单条目）
- T4.7: 更新 HOOKS-README.md
- T4.8: Contract test 断言 6 个 handle_* 函数
- T4.9: Checkpoint

### T5: Rules 迁移 (R7)

- T5.1: 创建 `.claude/rules/forge-src.md`（paths: src/**, strict null, import order）
- T5.2: 创建 `.claude/rules/skill-editing.md`（paths: SKILL.md, frontmatter rules）
- T5.3: 创建 `.claude/rules/branch-protection.md`（paths: **/*.ts, **/*.md）
- T5.4: CLAUDE.md 清理对应段落
- T5.5: Contract test 断言 rules
- T5.6: Checkpoint

### T6: CLAUDE.md 二轮瘦身 (R8)

- T6.1: 测量行数（当前 149 → 可能 ≤200 直接跳过）
- T6.2: 判断是否需要进一步瘦身（≤200 跳过）
- T6.3-6.5: 条件执行（若 >200 才执行）
- T6.6: @path 引用合法性检查
- T6.7: Checkpoint

### T7: CC 版本门禁 (R9)

- T7.1: scripts/init.sh 加 check_cc_version() 函数
- T7.2: 单元测试 check-cc-version.test.sh
- T7.3: forge-status SKILL.md 加版本检查
- T7.4: README.md 前置条件更新
- T7.5: CHANGELOG.md 记录版本要求
- T7.6: Checkpoint

### T8: Contract Test + 文档 (R10)

- T8.1: 新建 test/phase2.contract.test.ts（全面断言）
- T8.2: CHANGELOG Phase 2 条目
- T8.3: README.md 三处更新
- T8.4: ADR .forge/decisions/<date>-ccbp-hardening-phase2.md
- T8.5: Phase 1 → Phase 2 handover note
- T8.6: 全量测试 (vitest + npm run check)

### T9: 烟雾测试

- T9.1-T9.5: 5 个 e2e 场景（build flow, compaction, branch protection, lazy rules, hook spawn）
- T9.6: 清理
- T9.7: Final checkpoint

## Verification Commands

每 Task Checkpoint 运行:
```bash
npx vitest run
npm run check
bash -n scripts/*.sh  # syntax check
```

Final:
```bash
npm run check && npx vitest run
```
