---
feature: review-subagent-concurrency
layout: tasks
created: 2026-05-17
spec_ref: ".tinkerman/specs/review-subagent-concurrency/requirements.md"
---

# Implementation Plan: review-subagent-concurrency

## Overview

Tier: Standard | Branch: `feature/review-subagent-concurrency` | 依赖: 无

把 review 阶段 subagent 并发数从硬编码 3 升级为可配置参数（默认 3，1-10，env 可覆盖），引入滚动窗口调度器，零行为回归。后续 `review-no-mainagent-fallback` spec 消费此机制。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "description": "RED: config parser tests" },
    { "wave": 2, "tasks": ["2"], "description": "GREEN: parseReviewConfig" },
    { "wave": 3, "tasks": ["3"], "description": "RED: runner unit tests" },
    { "wave": 4, "tasks": ["4"], "description": "GREEN: runSubagentsWithConcurrency" },
    { "wave": 5, "tasks": ["5"], "description": "Property tests" },
    { "wave": 6, "tasks": ["6"], "description": "Wire review engine" },
    { "wave": 7, "tasks": ["7", "8"], "description": "Docs + config template (parallel)" },
    { "wave": 8, "tasks": ["9"], "description": "Final validation" }
  ]
}
```

## Tasks

- [x] 1. RED — config 解析单元测试
  - Files: Create `test/review/subagent-concurrency-config.test.ts`
  - 测试用例：
    - `should default to 3 when config.md absent`
    - `should default to 3 when config.md missing field`
    - `should parse review.subagent_concurrency: <N>` (N=1,5,10)
    - `should fallback to default with warning when config value invalid` (N=0,11,-1,"abc")
    - `FORGE_REVIEW_CONCURRENCY env overrides config.md`
    - `invalid env falls through to config.md`
  - Verify-By: vitest
  - Evidence: `npx vitest run test/review/subagent-concurrency-config.test.ts` → 6 fail (RED)
  - 对应需求: R1.AC1, R1.AC2, R1.AC3, R1.AC4
  - Commit: `test(review): add config parser tests for subagent_concurrency`

- [x] 2. GREEN — 实现 parseReviewConfig
  - Files: Modify `src/config.ts`、`src/index.ts`
  - 实现要点：env > config > default(3)；范围 1-10；非法值 warn + default，不抛
  - Verify-By: vitest
  - Evidence: `npx vitest run test/review/subagent-concurrency-config.test.ts` → 6 pass (GREEN)
  - 对应需求: R1.AC1, R1.AC2, R1.AC3, R1.AC4
  - Commit: `feat(review): parse subagent_concurrency from config.md and env`

- [x] 3. RED — runner 单元测试
  - Files: Create `test/review/subagent-concurrency-runner.test.ts`
  - 测试用例：
    - `concurrency >= N behaves like runSubagentsInParallel` (N=3, concurrency=3,5,10)
    - `concurrency=1 executes sequentially` (timestamp 严格递增)
    - `concurrency=2 with 5 invocations uses rolling window` (inflight ≤ 2)
    - `throws on concurrency=0`
    - `throws on concurrency=-1`
    - `throws on concurrency=101`
    - `executor rejection isolated to single invocation`
  - Verify-By: vitest
  - Evidence: 7 fail (RED)
  - 对应需求: R2.AC1, R2.AC2, R2.AC3, R2.AC4, R2.AC5, R2.AC6
  - Commit: `test(review): add runSubagentsWithConcurrency unit tests`

- [x] 4. GREEN — 实现 runSubagentsWithConcurrency
  - Files: Modify `src/subagent-runner.ts`、`src/index.ts`
  - 实现要点：fast path (concurrency >= N)、滚动窗口、reject 进 failed、边界抛错
  - Verify-By: vitest
  - Evidence: 7 pass (GREEN)
  - 对应需求: R2.AC1, R2.AC2, R2.AC3, R2.AC4, R2.AC5, R2.AC6
  - Commit: `feat(review): add runSubagentsWithConcurrency rolling-window scheduler`

- [x] 5. 属性测试
  - Files: Create `test/review/subagent-concurrency-runner.property.test.ts`
  - 属性：
    - 窗口上限不变量
    - 完整覆盖不变量
    - API 等价（concurrency=N 与 allSettled）
    - 失败隔离
  - Verify-By: vitest
  - Evidence: 4 property pass (200 runs each)
  - 对应需求: R2.AC1, R2.AC2, R2.AC3, R2.AC4, R2.AC5, R2.AC6
  - Commit: `test(review): add property tests for concurrency runner invariants`

- [x] 6. ~~接线 review 引擎~~ **DEFERRED to Phase 3** (`review-no-mainagent-fallback` spec)
  - 推迟原因：Phase 3 引入 `runReviewFallbackLadder` 时会自然消费 concurrency 机制（`runSubagentsWithConcurrency`）。在本 spec 提前接线只会和 Phase 3 的 fallback ladder 实现打架。
  - 当前状态：`runSubagentsWithConcurrency` 作为 public API 导出（`src/index.ts`），机制层完整可用；运行时实际 dispatch 由 SKILL prose 通过 Claude Code Agent tool 完成。
  - 在 Phase 3 spec 的 T3 (`GREEN — runReviewFallbackLadder 实现`) 中，`buildReviewSubagents` 调用方将正式接线为 `runReviewFallbackLadder` → 内部消费 `runSubagentsWithConcurrency` + `parseReviewConfig`。
  - 对应需求: ~~R1.AC1, R1.AC2, R1.AC3, R1.AC4, R2.AC1, R2.AC2, R2.AC3, R2.AC4, R2.AC5, R2.AC6~~ → 这些 AC 仍由 Task 2/4 单元测试 + Task 5 property test 全覆盖，与运行时接线解耦
  - Commit: ~~`feat(review): wire buildReviewSubagents to runSubagentsWithConcurrency`~~ → 不产生 commit

- [x] 7. SKILL.md 文案 + dist-plugin 同步
  - Files: Modify `skills/forge/lib/review/instructions.md`；Run `node scripts/sync-dist-plugin.mjs`
  - 改动文案：见 design.md §3
  - Verify-By: bash
  - Evidence: `grep "subagent_concurrency"` 非空；`grep "FORGE_REVIEW_CONCURRENCY"` 非空；`diff source dist-plugin` 退出 0
  - 对应需求: R3.AC1, R3.AC2
  - Commit: `docs(review): parametrize subagent concurrency in SKILL.md and dist-plugin mirror`

- [x] 8. config.md 模板更新
  - Files: Modify `.tinkerman/config.md`、`templates/.tinkerman/config.md` (如有)
  - 格式：见 design.md §4
  - Verify-By: bash
  - Evidence: `grep "subagent_concurrency" .tinkerman/config.md` 非空
  - 对应需求: R3.AC3
  - Commit: `chore(config): document review.subagent_concurrency option`

- [x] 9. Final Validation
  - 执行：
    - `npm run check` → 全绿
    - `npx vitest run` → 全绿（含新增 3 个测试文件）
    - `node scripts/check-registry-parity.sh` → 退出 0
    - 手动 smoke：`FORGE_REVIEW_CONCURRENCY=1 /forge review` 在小 PR 上跑一次，观察 subagent 启动顺序为串行
  - Verify-By: bash
  - Evidence: 所有命令退出 0；smoke log 中 spec-check.completedAt < quality-check.startedAt
  - 对应需求: 全部
  - Commit: `chore(review): final validation for subagent concurrency`

## Notes

### Out of Scope

- decide skill 的 Round 1 并行不在本 spec 改动范围
- 自动降级策略由 `review-no-mainagent-fallback` spec 实施
- task-notification 替代 TaskOutput 由 `subagent-notification-consumption-migration` spec 实施

### Risk Register

| 风险 | 缓解 |
|---|---|
| 滚动窗口 race condition | property test 200 runs + 现有 review 测试集回归 |
| concurrency=1 时 CI 时间暴涨 | default 保持 3，env override 仅在故障时启用 |
| dist-plugin 漂移 | task 7 强制运行 sync 脚本 + diff 校验 |

### Property Tests Warning

Task 5 包含 fast-check 属性测试，运行时会生成 200+ 随机用例。
