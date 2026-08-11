---
feature: review-no-mainagent-fallback
layout: tasks
created: 2026-05-17
spec_ref: ".tinkerman/specs/review-no-mainagent-fallback/requirements.md"
---

# Implementation Plan: review-no-mainagent-fallback

## Overview

Tier: Full | Branch: `feature/review-no-mainagent-fallback` | 依赖: `review-subagent-concurrency` (Phase 1) + `review-report-methodology-field` (Phase 2)

引入 fallback ladder L0→L1→L2→L3 + 主 Agent 接管禁令（Hard-gate）+ `--force-skip-review` 逃生阀，并细化 `AGENTS.md §3.1`。本 spec 是 Full tier，需要 ADR 记录此细化。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "description": "Decide: ADR draft" },
    { "wave": 2, "tasks": ["2"], "description": "RED: fallback ladder integration tests" },
    { "wave": 3, "tasks": ["3"], "description": "GREEN: runReviewFallbackLadder" },
    { "wave": 4, "tasks": ["4"], "description": "RED: Hard-gate presence tests" },
    { "wave": 5, "tasks": ["5"], "description": "GREEN: SKILL §2.5 + Hard-gate docs" },
    { "wave": 6, "tasks": ["6"], "description": "RED: ship gate methodology tests" },
    { "wave": 7, "tasks": ["7"], "description": "GREEN: ship gate methodology check" },
    { "wave": 8, "tasks": ["8"], "description": "RED: force-skip-review tests" },
    { "wave": 9, "tasks": ["9"], "description": "GREEN: force-skip-review impl" },
    { "wave": 10, "tasks": ["10"], "description": "AGENTS.md + templates sync" },
    { "wave": 11, "tasks": ["11"], "description": "ADR finalize + dist-plugin sync" },
    { "wave": 12, "tasks": ["12"], "description": "Property tests" },
    { "wave": 13, "tasks": ["13"], "description": "Final validation" }
  ]
}
```

## Tasks

- [x] 1. Decide — ADR 草稿
  - 前置：执行前确认两条前置 spec 已合 main：`feat(review): wire buildReviewSubagents to runSubagentsWithConcurrency` + `feat(schema): add methodology enum field`，缺失任一 → 阻断
  - Files: Create `.tinkerman/decisions/<date>-review-fallback-ladder.md` (status: draft)
  - 内容：背景、决策、§替代方案（A/B/C）、§回滚、§跨版本回归（详见 design.md §7）
  - 触发：`/forge decide` 单独跑过（Round 1 + Round 2 critic）
  - Verify-By: bash
  - Evidence: `grep "Execution-Assessment Separation"` 非空；`grep "Reversible escape hatch"` 非空
  - 对应需求: R5.AC4
  - Commit: `chore(adr): draft review-fallback-ladder ADR`

- [x] 2. RED — fallback ladder 集成测试
  - Files: Create `test/review/fallback-ladder.test.ts`
  - 测试用例（最少 10 个）：
    - `L0 success path uses subagent-parallel methodology`
    - `L0 all-fail triggers L1 with concurrency=1`
    - `L1 success uses subagent-serial methodology + retry_count=1`
    - `L1 all-fail with CI evidence file present uses ci-evidence methodology`
    - `L0 + L1 + L2 all unavailable produces unavailable report`
    - `L1 only retries once even if both fail`
    - `L1 retry produces visible status output (mock console.warn)`
    - `L1 report frontmatter includes retry_count and l0_failure_signature`
    - `L1 report contains Fallback Ladder Trace section`
    - `main-agent fallback rejected — no Read/Grep/Bash invoked after L3` (mock executor 监听 fs 调用次数)
  - Verify-By: vitest
  - Evidence: 全 fail (RED)
  - 对应需求: R1.AC2, R1.AC3, R1.AC4, R1.AC5, R1.AC6, R3.AC1, R3.AC2, R3.AC3, R3.AC4, R3.AC5, R3.AC6, R5.AC1, R5.AC3
  - Commit: `test(review): add fallback ladder integration tests`

- [x] 3. GREEN — runReviewFallbackLadder 实现
  - Files: Modify `src/review.ts`、`src/index.ts`
  - 实现要点：见 design.md §1, §2
  - **包含 Phase 1 deferred T6 的接线**：本 task 把 `buildReviewSubagents` 调用方接线为 `runReviewFallbackLadder`，内部消费 `runSubagentsWithConcurrency(invocations, executor, parseReviewConfig(readConfig()).subagent_concurrency)`。这一步在 Phase 1 spec `review-subagent-concurrency` 中被推迟，由本 task 完成。
  - Verify-By: vitest
  - Evidence: T2 测试全 pass (GREEN)；现有 review 测试零回归
  - 对应需求: R1.AC2, R1.AC3, R1.AC4, R1.AC5, R1.AC6, R3.AC1, R3.AC2, R3.AC3, R3.AC4, R3.AC5, R3.AC6, R5.AC3
  - Commit: `feat(review): implement fallback ladder L0→L1→L2→L3 + wire concurrency runner`

- [x] 4. RED — Hard-gate 文档存在性测试
  - Files: Create `test/review/hard-gate-presence.test.ts`
  - 测试用例：
    - `skills/forge/lib/review/instructions.md contains <HARD-GATE name="no-mainagent-review">`
    - `Hard-gate section enumerates 4 forbidden forms`
    - `dist-plugin mirror has identical Hard-gate content`
  - Verify-By: vitest（读文件 + grep）
  - Evidence: 3 fail (RED)
  - 对应需求: R2.AC1
  - Commit: `test(review): add Hard-gate presence tests`

- [x] 5. GREEN — SKILL §2.5 + Hard-gate 文档
  - Files: Modify `skills/forge/lib/review/instructions.md`；Run `node scripts/sync-dist-plugin.mjs`
  - 格式：见 design.md §3
  - Verify-By: vitest + bash
  - Evidence: T4 测试全 pass；`diff source dist-plugin` 退出 0
  - 对应需求: R2.AC1
  - Commit: `docs(review): add §2.5 Fallback Ladder and no-mainagent-review Hard-gate`

- [x] 6. RED — ship gate methodology 测试
  - Files: Modify `test/ship/checkShipGate.test.ts`
  - 测试用例：
    - `ship blocks when review.methodology is unavailable`
    - `ship reason includes 'methodology=unavailable; subagent paths exhausted'`
    - `ship passes when review.methodology is subagent-parallel and other gates pass`
    - `ship passes when review.methodology is subagent-serial and other gates pass`
    - `ship passes when review.methodology is ci-evidence and other gates pass`
  - Verify-By: vitest
  - Evidence: 5 新测试 fail (RED)
  - 对应需求: R2.AC5
  - Commit: `test(ship): add methodology field check tests`

- [x] 7. GREEN — ship gate methodology 检查
  - Files: Modify `src/ship.ts`
  - 实现要点：见 design.md §5
  - Verify-By: vitest
  - Evidence: T6 测试全 pass + 现有 ship 测试零回归
  - 对应需求: R2.AC5
  - Commit: `feat(ship): block ship when review.methodology is unavailable`

- [x] 8. RED — force-skip-review 测试
  - Files: Create `test/ship/force-skip-review.test.ts`
  - 测试用例：
    - `--force-skip-review without reason throws`
    - `--force-skip-review with empty reason throws`
    - `--force-skip-review with non-empty reason returns passed + forceSkipped=true`
    - `--force-skip-review adds SKIPPED-BY-FORCE to commit message`
    - `--force-skip-review writes findings record with commit hash + reason + user`
  - Verify-By: vitest
  - Evidence: 5 fail (RED)
  - 对应需求: R4.AC1, R4.AC2, R4.AC3
  - Commit: `test(ship): add --force-skip-review escape hatch tests`

- [x] 9. GREEN — force-skip-review 实现
  - Files: Modify `src/ship.ts`、`src/index.ts`、`commands/forge.md`、`skills/forge/lib/ship/instructions.md`；Run sync 脚本
  - 实现要点：见 design.md §6
  - Verify-By: vitest + bash
  - Evidence: T8 测试全 pass；`grep "force-skip-review"` 非空；`diff source dist-plugin` 退出 0
  - 对应需求: R4.AC1, R4.AC2, R4.AC3, R4.AC4, R4.AC5
  - Commit: `feat(ship): add --force-skip-review escape hatch with reason+findings audit trail`

- [x] 10. AGENTS.md + templates 同步
  - Files: Modify `AGENTS.md` §3.1、`templates/CLAUDE.md` §3.1、`CLAUDE.md` §3.1（如独立维护）
  - Verify-By: bash
  - Evidence: `grep "不允许主 Agent" AGENTS.md` 非空；`grep "fallback ladder" AGENTS.md` 非空
  - 对应需求: R2.AC3, R2.AC4
  - Commit: `docs(constitution): forbid main-agent review takeover in §3.1`

- [x] 11. ADR 定稿 + dist-plugin 同步
  - Files: Modify `.tinkerman/decisions/<date>-review-fallback-ladder.md` (draft → accepted)；Run sync 脚本
  - Verify-By: bash
  - Evidence: `grep "status: accepted"` 非空；`diff -r skills/forge/lib/ dist-plugin/skills/forge/lib/` 退出 0
  - 对应需求: R5.AC4
  - Commit: `chore(adr): finalize review-fallback-ladder ADR`

- [x] 12. Property 测试
  - Files: Create `test/review/fallback-ladder.property.test.ts`
  - 属性：
    - `retry never exceeds 1`：fc 注入任意失败序列 → 断言 `runSubagentsWithConcurrency` 总调用 ≤ 2
    - `methodology and trace consistent`：fc 注入不同失败场景 → 断言 trace + methodology 对应关系
    - `no Read/Grep/Bash after L3`：fc 注入 L0+L1+L2 全失败 → 监听 mock fs/exec 调用 → 断言 0 次评审分析路径
  - Verify-By: vitest
  - Evidence: 3 property pass (200 runs each)
  - 对应需求: R3.AC5, R5.AC1
  - Commit: `test(review): add property tests for fallback ladder invariants`

- [x] 13. Final Validation
  - 执行：
    - `npm run check` → 全绿
    - `npx vitest run` → 全绿（含本 spec 所有新增 + 现有 review/ship 测试零回归）
    - `node scripts/check-registry-parity.sh` → 退出 0
    - 手工 smoke 1：mock executor 注入 3 个 reject → 观察输出含 "L0 ... failed; retrying"
    - 手工 smoke 2：跑真实 `/forge review` 在小 PR 上 → 观察 trace section L0=all-success
    - 手工 smoke 3：`/forge ship --force-skip-review` 不带 reason → 期望抛错；带 reason → commit message 含 SKIPPED-BY-FORCE
  - Verify-By: bash
  - Evidence: 所有命令退出 0；3 个 smoke 通过
  - 对应需求: 全部
  - Commit: `chore(review): final validation for fallback ladder + force-skip escape hatch`

## Notes

### Out of Scope

- 修复历史污染报告 `.tinkerman/reviews/forge-single-entry-skills-collapse.md` → 单独 spec 处理
- task-notification 替代 TaskOutput → `subagent-notification-consumption-migration`
- canvas 渲染区分 methodology

### Risk Register

| 风险 | 缓解 |
|---|---|
| Hard-gate 误伤合法主 Agent fallback 场景 | T2 测试覆盖 4 种禁止形式 |
| L1 串行重试在 task-id-purge 仍然失败 | 按设计自动进入 L2/L3，不会无限循环（property test 守护 retry ≤ 1）|
| `--force-skip-review` 被滥用 | findings 文件可审计 |
| ADR 内容与 SKILL 实现漂移 | T11 强制 dist-plugin 同步 |
| 同会话主 Agent "helpfulness" 偏置忽略 Hard-gate | T2 第 10 个测试用例显式监听 Read/Grep/Bash 调用次数 |

### Property Tests Warning

Task 12 包含 fast-check 属性测试。
