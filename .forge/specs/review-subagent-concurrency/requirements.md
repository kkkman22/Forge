---
status: completed
feature: review-subagent-concurrency
layout: requirements
created: 2026-05-17
tier: standard
---
# Requirements Document

## Introduction

`/forge review` 当前在 `skills/forge/lib/review/instructions.md` §2 中硬编码"并行启动 3 个 subagent"。Claude Code Agent SDK 在并发 ≥ 阈值时存在 task registry purge bug（详见 `.forge/findings/agent-sdk-task-id-purge-2.1.143.md`）：completed background agent 的 task ID 在 task-notification 投递后被 registry 清理，后续 `TaskOutput` 调用立即返回 `Error: No task found with ID: <id>`，并发 sibling 调用全部 cascade-fail。上游 issue #27371 实测：并发 2/4/6/10 全部成功，并发 ≥ 20 时 100% 失败。Forge 当前的 3 并发已经在阈值边缘。

本 spec 把"并发数"从硬编码常量提升为运行时可配置参数，让运维和 fallback ladder（后续 spec `review-no-mainagent-fallback` 消费）能在 SDK 抽风时降级到 concurrency=1（完全串行）应对，无需改代码。

### 设计原则

- **机制中立**：本 spec 只提供 `runSubagentsWithConcurrency` 机制，不决定何时降级。降级策略由后续 spec `review-no-mainagent-fallback` 实施。
- **行为兼容**：默认 `concurrency: 3`，等价于现有 `Promise.allSettled(invocations)` 行为，零回归风险。
- **API 形状不变**：返回 `ParallelExecutionResult`（succeeded[] + failed[]），上游消费方零改动。

### 显式不在范围内（Out of Scope）

- 自动降级策略（哪个失败信号触发 concurrency=1）→ `review-no-mainagent-fallback`
- 报告 schema 增加 `methodology` 字段 → `review-report-methodology-field`
- 主 Agent 接管评审禁令 → `review-no-mainagent-fallback`
- task-notification 替代 TaskOutput → `subagent-notification-consumption-migration`

## Glossary

- **Concurrency**：同时启动并等待的 subagent 数量上限。
- **Rolling-window scheduling**：`1 < concurrency < N` 时，任一槽位完成立即起下一个，直到 N 个全部派发完毕。
- **Parallel Execution Result**：现有 `src/loop-types.ts` 定义的 `{ succeeded, failed }` 二分类返回结构。

## Requirements

### Requirement 1: 配置字段引入

**User Story:** 作为 Forge 运维，我希望通过 `.forge/config.md` 或环境变量调节 review 阶段 subagent 并发数，这样 SDK 抽风时可以临时降级到串行而不必改代码或重新部署。

#### Acceptance Criteria

1. WHEN `.forge/config.md` 存在 `review.subagent_concurrency: <N>` 字段（N 为 1-10 的正整数）THEN config 解析器 SHALL 把该值作为运行时 concurrency。
2. WHEN `.forge/config.md` 没有 `review.subagent_concurrency` 字段 THEN config 解析器 SHALL 使用默认值 `3`，行为与改动前完全等价。
3. WHEN 环境变量 `FORGE_REVIEW_CONCURRENCY` 设置为 1-10 的正整数 THEN 该值 SHALL 覆盖 `.forge/config.md` 字段值。
4. WHEN `FORGE_REVIEW_CONCURRENCY` 或 `.forge/config.md` 字段值非法（< 1 / > 10 / 非整数 / 空字符串）THEN config 解析器 SHALL 回退到默认值 3 并输出 stderr warning，**禁止**抛异常阻断 review 启动。

### Requirement 2: 并发执行函数

**User Story:** 作为 `subagent-runner.ts` 的消费方（review/decide 等），我希望同一个执行入口能根据传入的 concurrency 参数自动适配并行/串行/滚动窗口三种行为，这样调用方代码不需要为每种模式写分支逻辑。

#### Acceptance Criteria

1. WHEN 调用 `runSubagentsWithConcurrency(invocations, executor, concurrency)` 且 `concurrency >= invocations.length` THEN 返回结果 SHALL 与 `runSubagentsInParallel(invocations, executor)` 完全等价（同 succeeded/failed 分类、同顺序、同结构）。
2. WHEN 调用 `runSubagentsWithConcurrency` 且 `concurrency === 1` THEN 函数 SHALL 顺序执行：第 i 个 invocation 完成（成功或失败）后才启动第 i+1 个；任何 invocation 抛错都不阻塞后续启动。
3. WHEN 调用 `runSubagentsWithConcurrency` 且 `1 < concurrency < invocations.length` THEN 函数 SHALL 按滚动窗口调度：初始启动 `concurrency` 个，任一完成立即启动下一个未派发的 invocation，直到全部完成。
4. WHEN `concurrency` 参数为 0 或负数 THEN 函数 SHALL 抛 `Error("concurrency must be >= 1")`，调用方负责输入校验。
5. WHEN `concurrency` 参数大于 100 THEN 函数 SHALL 抛 `Error("concurrency must be <= 100")`，防止误传导致资源耗尽。
6. WHEN executor 对某个 invocation 抛 reject THEN 该 invocation SHALL 进入 failed[]（与 `Promise.allSettled` 一致），后续 invocation 不受影响。

### Requirement 3: SKILL 文档同步

**User Story:** 作为 `/forge review` 的执行者，我希望 SKILL.md 显式说明并发参数从哪里读取，这样用户能找到调节入口。

#### Acceptance Criteria

1. WHEN `skills/forge/lib/review/instructions.md` §2 描述 subagent 启动时 THEN 文档 SHALL 显式声明并发数从 `review.subagent_concurrency` 配置（默认 3）读取，并提及 `FORGE_REVIEW_CONCURRENCY` 环境变量覆盖。
2. WHEN `dist-plugin/skills/forge/lib/review/instructions.md` 存在 THEN 镜像内容 SHALL 与 source 完全一致（`diff -r` 退出 0）。
3. WHEN `.forge/config.md` 模板存在 `review:` 段落 THEN 模板 SHALL 包含 `subagent_concurrency: 3` 注释行，便于用户发现该选项。

## Validation Contract

### VAL-R1-001: 默认值兼容

**Verify-By**: `vitest`
**Evidence**: `test/review/subagent-concurrency-config.test.ts` 测试 `should default to 3 when config field absent` 通过
**Covers**: R1.AC2

### VAL-R1-002: env 覆盖优先级

**Verify-By**: `vitest`
**Evidence**: `test/review/subagent-concurrency-config.test.ts` 测试 `FORGE_REVIEW_CONCURRENCY overrides config.md` 通过
**Covers**: R1.AC3

### VAL-R1-003: 非法值回退

**Verify-By**: `vitest`
**Evidence**: `test/review/subagent-concurrency-config.test.ts` 测试 `invalid values fallback to default with warning` 通过；断言 stderr 包含 `subagent_concurrency invalid`
**Covers**: R1.AC4

### VAL-R2-001: concurrency=N 等价 allSettled

**Verify-By**: `vitest`
**Evidence**: `test/review/subagent-concurrency-runner.test.ts` 测试 `concurrency >= N behaves like runSubagentsInParallel` 通过；断言 succeeded/failed 顺序与 `runSubagentsInParallel` 输出完全一致
**Covers**: R2.AC1

### VAL-R2-002: concurrency=1 串行

**Verify-By**: `vitest`
**Evidence**: `test/review/subagent-concurrency-runner.test.ts` 测试 `concurrency=1 executes sequentially` 通过；断言 invocation 时间戳严格递增、第 i 个 resolve 早于第 i+1 个 start
**Covers**: R2.AC2

### VAL-R2-003: 滚动窗口

**Verify-By**: `vitest`
**Evidence**: `test/review/subagent-concurrency-runner.test.ts` 测试 `concurrency=2 with 5 invocations uses rolling window` 通过；断言任意时刻并行数 ≤ 2、5 个 invocation 全部完成
**Covers**: R2.AC3

### VAL-R2-004: 边界值校验

**Verify-By**: `vitest`
**Evidence**: `test/review/subagent-concurrency-runner.test.ts` 测试 `throws on concurrency <= 0 or > 100` 通过
**Covers**: R2.AC4, R2.AC5

### VAL-R3-001: SKILL 文档参数化

**Verify-By**: `bash`
**Evidence**: `grep "subagent_concurrency" skills/forge/lib/review/instructions.md` 返回非空；`grep "FORGE_REVIEW_CONCURRENCY" skills/forge/lib/review/instructions.md` 返回非空
**Covers**: R3.AC1

### VAL-R3-002: dist-plugin 镜像一致

**Verify-By**: `bash`
**Evidence**: `diff skills/forge/lib/review/instructions.md dist-plugin/skills/forge/lib/review/instructions.md` 退出 0
**Covers**: R3.AC2
