---
status: completed
feature: review-no-mainagent-fallback
layout: requirements
created: 2026-05-17
tier: standard
---
# Requirements Document

## Introduction

`/forge review` 在 commit `d1ee44b` 对 `forge-single-entry-skills-collapse` 跑三层评审时，三个 subagent 都命中 Claude Code Agent SDK 的 task registry purge bug（`Error: No task found with ID: <id>`）。主 Agent 在所有 subagent 失败后**自行接管**直接评审，产出 `.tinkerman/reviews/forge-single-entry-skills-collapse.md`，标记 `result: blocked` + 7 个 P0/P1 finding。这份报告的产出路径**违反** `AGENTS.md §3.1 Execution-Assessment Separation`：写代码的主 Agent 不应该评审同一会话内自己刚 build 的代码，subagent 隔离的核心价值在 fresh context、不在身份。

本 spec 引入分级 fallback ladder + 主 Agent 接管禁令 + 自动重跑机制，确保 review 阶段的产出**永远来自隔离的子代理或 CI 异步证据**，永不来自主 Agent。当所有合法路径都不可用时，review 报告以 `methodology: unavailable` + `result: blocked` 阻断 ship，要求用户手工干预。

本 spec 是 Full tier，因为它细化了项目宪法 `AGENTS.md §3.1`，需要走 decide → spec → plan → build → review → test → ship → learn 完整流程，并产出 ADR 记录此细化。

### 设计原则

- **Fail-safe over heuristic**：任何不确定路径都阻断 ship，宁可让用户手工 unblock，不让主 Agent 自评放行。
- **隔离重于身份**：禁令的判据是"评审者是否独立 fresh-context 启动"，不是"评审者是否写过这段代码"。同一会话主 Agent 即使没 build 这块代码也禁止顶替子代理评审。
- **机制优先于策略**：本 spec 假设 `review-subagent-concurrency`（并发机制）和 `review-report-methodology-field`（schema 字段）已 ship，仅做策略层接线。
- **逃生阀必须留**：极端场景下 ship 永久阻塞不可接受，提供 `--force-skip-review` 显式逃生阀，要求 commit log 记录使用原因。

### 显式不在范围内（Out of Scope）

- subagent 并发机制 → `review-subagent-concurrency`（Phase 1，前置依赖）
- 报告 schema methodology 字段 → `review-report-methodology-field`（Phase 2，前置依赖）
- task-notification 替代 TaskOutput → `subagent-notification-consumption-migration`（Phase 5，触发条件未达）
- 修复历史污染报告（`forge-single-entry-skills-collapse.md`）→ Phase 4 单独处理

### 前置依赖

| Spec | 状态要求 |
|---|---|
| `review-subagent-concurrency` | 已合 main，`runSubagentsWithConcurrency` 可用，`FORGE_REVIEW_CONCURRENCY` 生效 |
| `review-report-methodology-field` | 已合 main，schema 接受 4 个 methodology 枚举值，parser 处理 unavailable 强制 blocked |

## Glossary

- **Fallback Ladder**：三个 subagent 全部失败时的降级阶梯，从高到低：L0 默认并行 → L1 串行重试 → L2 CI 证据 → L3 阻断。
- **L0–L3**：fallback ladder 的四个层级（详见 §设计原则）。
- **Main-agent direct review**：主 Agent 在同一会话内绕过 subagent 直接产出 review 报告的行为，本 spec 禁止之。
- **Hard-gate**：`<HARD-GATE>` 段落标记的不可绕过约束，违反即评审失败。
- **逃生阀**：`--force-skip-review` 命令行参数，绕过本 spec 引入的所有 fallback 强制约束，仅用于极端事故恢复。

## Requirements

### Requirement 1: Fallback Ladder 定义

**User Story:** 作为 `/forge review` 的执行者，我希望在遇到 SDK 抽风时有明确的降级阶梯（不是"主 Agent 顶上"），这样降级行为可预测、可审计。

#### Acceptance Criteria

1. WHEN forge-review SKILL §2 的 subagent 启动 THEN 文档 SHALL 显式定义 L0-L3 四个层级，每级附触发条件、评审者身份、可信度评级。
2. WHEN L0（默认路径）的三个 subagent 全部成功返回结构化 finding THEN forge-review SKILL SHALL 标记 `methodology: subagent-parallel` 进入合并管线，**不**进入 L1。
3. WHEN L0 出现"全部失败"信号（任一：所有 subagent 报错、所有报告无法解析、命中 `Error: No task found with ID` 的 cascade fail）THEN forge-review SKILL SHALL 自动启动 L1：以 `concurrency=1` 串行重试同样三个 subagent 一次。
4. WHEN L1 串行重试成功（至少 2 个 subagent 产出可解析 finding）THEN forge-review SKILL SHALL 标记 `methodology: subagent-serial` 进入合并管线。
5. WHEN L1 仍然全部失败 THEN forge-review SKILL SHALL 检查 `.tinkerman/reviews/<pr>-ci.md` 是否存在；存在且 `severity_counts` 字段可解析 → 标记 `methodology: ci-evidence` + 直接读取 CI 证据作为评审结论。
6. WHEN L0、L1、L2 全部不可用 THEN forge-review SKILL SHALL 写入一份 `methodology: unavailable` + `result: blocked` 的报告，frontmatter 包含 `failure_reason: "all subagent paths exhausted; no CI evidence available"`，**禁止**主 Agent 接管。

### Requirement 2: 主 Agent 接管禁令（Hard-gate）

**User Story:** 作为 Forge 项目的工程纪律守护者，我希望 review SKILL 显式禁止主 Agent 在 fallback ladder 任一级失败后自行接管评审，这样不会因为模型"helpfulness"偏置而绕过 §3.1 隔离原则。

#### Acceptance Criteria

1. WHEN forge-review SKILL §2 描述 fallback 行为 THEN 文档 SHALL 包含 `<HARD-GATE name="no-mainagent-review">` 段落，显式列出"主 Agent 接管评审"的 4 种禁止形式：直接读 diff 自评 / 调用本地 Read+Grep+Bash 自评 / 用 Skill(forge, "review") inline 路径自评 / 重写已有 subagent 报告。
2. WHEN forge-review SKILL 检测到 fallback ladder L0-L2 全部失败 THEN forge-review SKILL SHALL 直接进入 L3（写 unavailable 报告 + 阻断 ship），**不**输出"我来手动评审"等表达，不调用 Read/Grep/Bash 进入评审分析模式。
3. WHEN `AGENTS.md §3.1` 描述 Execution-Assessment Separation THEN 章节 SHALL 追加一句："且**不允许**主 Agent 在 subagent 全部失败后自行顶替评审；fallback ladder 见 `forge-review` SKILL。"
4. WHEN `templates/CLAUDE.md` 存在对应章节 THEN 模板 SHALL 同步追加该句。
5. WHEN ship gate 检查到 review 报告 `methodology === "unavailable"` THEN ship gate SHALL 返回 `blocked`，原因字段包含 `methodology=unavailable; subagent paths exhausted`。

### Requirement 3: 自动重跑机制

**User Story:** 作为遇到 SDK 抽风的用户，我希望 review SKILL 自动尝试串行重试，不需要我手工设 `FORGE_REVIEW_CONCURRENCY=1` 重跑，这样常见的 SDK race condition 不需要人工介入。

#### Acceptance Criteria

1. WHEN forge-review SKILL 检测到 L0 全部失败 THEN SKILL SHALL 在主 agent 输出中显示 `⚠ L0 subagent dispatch failed; retrying with concurrency=1...`，然后自动启动 L1。
2. WHEN L1 启动时 THEN forge-review SKILL SHALL 把传给 `runSubagentsWithConcurrency` 的 concurrency 参数强制设为 1（覆盖 `.tinkerman/config.md` / env），其他参数（invocations / executor）与 L0 完全一致。
3. WHEN L1 完成 THEN forge-review SKILL SHALL 在主 agent 输出中显示 L1 结果摘要：`L1 retry result: <succeeded count>/3 subagents recovered`。
4. WHEN L1 也失败 THEN forge-review SKILL SHALL 在主 agent 输出中显示 `⚠ L1 retry exhausted; checking CI evidence (L2)...`，然后自动检查 CI 证据。
5. WHEN L1 启动时 THEN SKILL SHALL **不**在同一次 review session 内重试超过 1 次（防止无限循环）；若 L1 失败必须进入 L2 或 L3。
6. WHEN L1 重试后产生的 review 报告写入 `.tinkerman/reviews/<topic>.md` THEN 报告 frontmatter SHALL 包含 `retry_count: 1`、`l0_failure_signature: "<错误特征>"` 字段，便于事后审计 SDK 抽风频率。

### Requirement 4: 逃生阀

**User Story:** 作为遇到极端事故（CI 系统也宕机、所有 fallback 都不可用、但必须紧急 ship）的运维，我希望有显式逃生阀绕过 review 阻断，且使用记录可审计。

#### Acceptance Criteria

1. WHEN 用户在 `/forge ship` 命令上加 `--force-skip-review` 参数 THEN ship gate SHALL 跳过对 review 报告 `methodology` 字段的检查。
2. WHEN `--force-skip-review` 被使用 THEN ship gate SHALL 在 commit message 自动追加一行 `Reviewed-by: SKIPPED-BY-FORCE (reason: <CLI 输入>)`，CLI 必须强制要求用户输入 `--reason="<非空字符串>"`，否则拒绝执行。
3. WHEN `--force-skip-review` 被使用 THEN ship gate SHALL 在 `.tinkerman/findings/force-skip-review-<date>.md` 追加一条记录，包含 commit hash、reason、timestamp、user identity（git config user.name）。
4. WHEN ADR `<date>-review-fallback-ladder.md` 产出 THEN ADR SHALL 显式声明 `--force-skip-review` 是 reversible escape hatch，引用条件、commit 标记、findings 记录三道审计痕迹。
5. WHEN forge-ship SKILL.md 描述 ship gate THEN 文档 SHALL 包含 `--force-skip-review` 的使用说明、风险声明、强制 reason 字段。

### Requirement 5: 测试与可观测性

**User Story:** 作为 review SKILL 的维护者，我希望 fallback ladder 的每一级都有自动化测试，这样未来 SDK 升级时能快速回归。

#### Acceptance Criteria

1. WHEN `test/review/fallback-ladder.test.ts` 存在 THEN 文件 SHALL 包含至少 5 个集成测试，分别覆盖：L0 全成功、L0 全失败 → L1 全成功、L1 全失败 → L2 命中 CI、L2 不可用 → L3 阻断、main-agent fallback 拒绝执行（断言 SKILL 不调用 Read/Grep/Bash 进入评审分析路径）。
2. WHEN `test/ship/force-skip-review.test.ts` 存在 THEN 文件 SHALL 包含至少 3 个测试：reason 缺失阻断、reason 提供后通过 + commit message 含 `SKIPPED-BY-FORCE`、findings 记录写入。
3. WHEN review 在 L1/L2/L3 路径产出报告 THEN 报告末尾 SHALL 包含 `## Fallback Ladder Trace` 段落，按时序记录每级的触发时间、结果、耗时。
4. WHEN ADR `<date>-review-fallback-ladder.md` 产出 THEN ADR SHALL 包含 §决策、§替代方案（讨论"主 Agent 接管"为何被拒）、§回滚（如何禁用 fallback ladder 回到旧行为）、§跨版本回归（每次 Claude Code 升级时的回归点）。

## Validation Contract

### VAL-R1-001: L0 默认路径

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L0 success path uses subagent-parallel methodology` 通过
**Covers**: R1.AC2

### VAL-R1-002: L0→L1 自动转移

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L0 all-fail triggers L1 with concurrency=1` 通过；mock executor 模拟 3 个 subagent 全 reject，断言 `runSubagentsWithConcurrency` 被第二次调用且 concurrency 参数 = 1
**Covers**: R1.AC3, R3.AC2

### VAL-R1-003: L1→L2 CI 命中

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L1 all-fail with CI evidence file present uses ci-evidence methodology` 通过
**Covers**: R1.AC5

### VAL-R1-004: L3 unavailable 报告

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L0 + L1 + L2 all unavailable produces unavailable report` 通过；断言 `methodology === "unavailable"`、`result === "blocked"`、`failure_reason` 字段存在
**Covers**: R1.AC6

### VAL-R2-001: Hard-gate 文档存在

**Verify-By**: `bash`
**Evidence**: `grep '<HARD-GATE name="no-mainagent-review">' skills/forge/lib/review/instructions.md` 非空；段落内列出 4 种禁止形式
**Covers**: R2.AC1

### VAL-R2-002: Main-agent fallback 拒绝执行

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `main-agent fallback rejected — no Read/Grep/Bash invoked after L3` 通过；断言 SKILL 在 L3 之后不调用 Read/Grep/Bash 进入评审分析路径
**Covers**: R2.AC2

### VAL-R2-003: AGENTS.md 同步

**Verify-By**: `bash`
**Evidence**: `grep "不允许主 Agent" AGENTS.md` 非空；`grep "fallback ladder" AGENTS.md` 非空；`templates/CLAUDE.md` 同步
**Covers**: R2.AC3, R2.AC4

### VAL-R2-004: ship gate 阻断 unavailable

**Verify-By**: `vitest`
**Evidence**: `test/ship/checkShipGate.test.ts` 增量测试 `ship blocks when review.methodology is unavailable` 通过；断言 `result.status === "blocked"`、reason 含 `methodology=unavailable`
**Covers**: R2.AC5

### VAL-R3-001: 自动重试 1 次

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L1 only retries once even if both fail` 通过；断言 `runSubagentsWithConcurrency` 总调用次数 ≤ 2
**Covers**: R3.AC2, R3.AC5

### VAL-R3-002: 重试摘要可见

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L1 retry produces visible status output` 通过；断言主 agent stdout 包含 `L1 retry result:` 字符串
**Covers**: R3.AC3

### VAL-R3-003: retry_count + l0_failure_signature 字段

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L1 report frontmatter includes retry_count and l0_failure_signature` 通过；断言 frontmatter parse 出 `retry_count: 1`、`l0_failure_signature` 非空
**Covers**: R3.AC6

### VAL-R4-001: --force-skip-review reason 强制

**Verify-By**: `vitest`
**Evidence**: `test/ship/force-skip-review.test.ts` 测试 `--force-skip-review without reason fails` 通过
**Covers**: R4.AC2

### VAL-R4-002: --force-skip-review commit 标记

**Verify-By**: `vitest`
**Evidence**: `test/ship/force-skip-review.test.ts` 测试 `--force-skip-review with reason adds SKIPPED-BY-FORCE to commit message` 通过
**Covers**: R4.AC2

### VAL-R4-003: findings 记录

**Verify-By**: `vitest`
**Evidence**: `test/ship/force-skip-review.test.ts` 测试 `--force-skip-review writes findings record` 通过；断言 `.tinkerman/findings/force-skip-review-<date>.md` 存在且含 commit hash + reason + user
**Covers**: R4.AC3

### VAL-R4-004: forge-ship SKILL 文档

**Verify-By**: `bash`
**Evidence**: `grep "force-skip-review" skills/forge/lib/ship/instructions.md` 非空；文档含使用说明 + 风险声明 + reason 强制
**Covers**: R4.AC5

### VAL-R5-001: ADR 产出

**Verify-By**: `bash`
**Evidence**: 文件 `.tinkerman/decisions/<date>-review-fallback-ladder.md` 存在；`grep "Execution-Assessment Separation" .tinkerman/decisions/<date>-review-fallback-ladder.md` 非空；`grep "Reversible escape hatch" .tinkerman/decisions/<date>-review-fallback-ladder.md` 非空
**Covers**: R4.AC4, R5.AC4

### VAL-R5-002: Fallback Ladder Trace 段

**Verify-By**: `vitest`
**Evidence**: `test/review/fallback-ladder.test.ts` 测试 `L1 report contains Fallback Ladder Trace section` 通过；断言报告 markdown 含 `## Fallback Ladder Trace` heading
**Covers**: R5.AC3
