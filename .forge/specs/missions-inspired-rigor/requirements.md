---
status: completed
feature: missions-inspired-rigor
layout: requirements
created: 2026-05-16
tier: standard
---
# Requirements Document

## Introduction

本 spec 把 Factory **Missions: Multi-Agent Systems That Ship for Days** 演讲中四条与 Forge 现有架构高度对齐的设计原则落地。Missions 在 16 天连续运行 + 89% 测试覆盖率的实战验证下，给出了"长周期多 Agent 可交付"的工程答案：把验收契约前置到任何代码之前、用机器可读 handoff 取代 agent 记忆、让 validator 在 mission 进行中累积知识、用 `forge-loop` 承载 mission 级别的项目编排。

Forge 的三角色（plan / build / review）哲学和 Missions 的（orchestrator / worker / validator）已收敛到同一条路径上。但在以下四点上 Forge 还差最后一公里——本 spec 一次性补齐。

### 当前状态对照

- **Validation Contract（条款 1）**：spec 的 Acceptance Criteria 用 `WHEN ... THEN ...` 自然语言句式，`spec-check` 评审时只能"逐条对照"，但"对照什么、用什么验、留什么证据"全靠 reviewer 自由心证。Missions 强制每条断言带 `Tool` 和 `Evidence` 字段，让 validator 机械可执行。
- **Atomic Task Handoff（条款 2）**：`.forge/progress/<topic>.md` 当前由 build agent 自由发挥写状态，每个项目 schema 不一致；Missions 强制 5 字段 schema（completed / not_completed / commands_executed / issues_found / procedure_compliance），让"下一个 worker 拿到的就是机器可读状态"。
- **Validator-time Knowledge Capture（条款 3）**：Forge 的 `/forge learn` 在收尾才跑，KB 是事后追忆；Missions 让 validator 在抓到 issue 时直接写 `.forge/knowledge/known-failures.md`，下一次 review 启动时 KB 自带"上次类似 diff 出过这个问题"。
- **Mission-grade `/forge loop`（条款 4）**：Forge 的 `forge-loop` 当前定位是"一个 plan 的无人值守"，wall-clock 上不去；Missions 的关键技巧是**单 agent run 短**（实现 51 turns / 验证 30 turns），靠**外部状态文件 + 频繁 fresh-context 重启**撑长周期。Forge 已具备状态文件、resume、worktree 隔离的全部素材，差最后一道明确的"每个 SKILL 调用都是 fresh-context 子会话"约定。

### 设计原则

- **不破坏既有用户**：所有改动以增量 schema + 工具增强方式落地，旧 spec / 旧 progress 文件继续可读、可继续推进。
- **不引入新外部依赖**：所有改动在 Forge 既有 SKILL / agent / MCP server / 状态文件目录内完成。
- **可单独落地**：四条需求按依赖顺序排序（R1 → R2 → R3 → R4），任一条单独合并都能独立产生价值。

### 显式不在范围内（Out of Scope）

- 跨家族 LLM 双签 review（已记录到 ROADMAP 长期项，等 false-negative 率证据再启动）
- Mission Control 可视化 UI（Forge 是 CLI plugin 形态，ROI 低）
- 单 mission 跨 ≥24 小时的连续运行能力（先把单次 plan 的 wall-clock 拉长到 ≥4 小时再说）
- prompt-driven 700 行 orchestrator 重写（Forge 当前 SKILL 化已等价吃到这个红利）

## Glossary

- **Validation Contract**：一组可执行的行为断言，每条带 `Verify-By`（验证手段）和 `Evidence`（必须留下的产物）字段。在 spec 锁定阶段产出，先于任何代码。
- **Atomic Task Handoff**：build agent 完成单个原子任务后写入 `.forge/progress/<topic>.md` 的结构化记录，包含 5 个固定字段。
- **Validator-time Knowledge Capture**：`spec-check` / `quality-check` / `security-check` 在 review 阶段输出 P0/P1 时，强制 append 一行到 `.forge/knowledge/known-failures.md` 的累积模式。
- **Mission-grade Loop**：`forge-loop` 在 fresh-context 子会话约定下，能持续推进 ≥4 小时 wall-clock 的多 SKILL 序列。
- **Fresh-context 子会话**：每次 SKILL 调用启动一个新的 agent 实例，只通过状态文件读上一阶段产出，不携带前一阶段对话历史。

## Requirements

### Requirement 1: Validation Contract 前置到 spec 锁定阶段

**User Story:** 作为 spec-check 评审者，我希望每条 Acceptance Criteria 都自带验证手段和证据要求，这样我能机械执行验证而不是靠主观判断"该看什么"。

#### Acceptance Criteria

1. WHEN 用户运行 `/forge spec` 进入 contract 起草阶段 THEN forge-spec SKILL SHALL 在 requirements.md 模板中显式包含 `Validation Contract` 章节，每条 Acceptance Criteria 必须附 `Verify-By:` 和 `Evidence:` 两个字段。
2. WHEN spec 文件 lock 时 THEN forge-spec SKILL SHALL 校验所有 Acceptance Criteria 都带 `Verify-By` 和 `Evidence` 字段，缺失任一字段时阻断 lock。
3. WHEN spec-check 评审运行 Step 0 拿到 diff 后 THEN spec-check agent SHALL 优先按 Acceptance Criteria 的 `Verify-By` 和 `Evidence` 进行机械对照，**禁止**在 contract 不完整的情况下输出"已实现"判定。
4. WHEN spec-check 发现某条 Acceptance Criteria 缺少 `Verify-By` 或 `Evidence` 字段 THEN spec-check agent SHALL 输出一条 P1 issue：`spec contract incomplete — missing Verify-By/Evidence`。
5. WHEN 一条 Acceptance Criteria 的 `Verify-By` 字段值为 `vitest` / `bash` / `forge_git` / `forge_exec` / `manual` 之一 THEN spec-check agent SHALL 接受为合法验证手段；其他值（包括空字符串、未填、自由文本）SHALL 触发 P1。
6. WHEN 一条 Acceptance Criteria 的 `Evidence` 字段值为非空字符串 THEN spec-check agent SHALL 接受；空字符串或仅包含 placeholder（如 `TBD` / `待补`）SHALL 触发 P1。

### Requirement 2: 原子任务 5 字段 Handoff Schema

**User Story:** 作为 build agent，我希望完成每个原子任务后填写一份固定 schema 的 handoff 记录，这样下一个原子任务（即使在 fresh-context 子会话里）也能精确接续，不依赖对话历史。

#### Acceptance Criteria

1. WHEN build agent 完成一个原子任务并准备 commit THEN forge-build SKILL SHALL 要求 build agent 在 `.forge/progress/<topic>.md` 对应任务条目下追加一份 5 字段 handoff block，字段为 `completed`、`not_completed`、`commands_executed`、`issues_found`、`procedure_compliance`。
2. WHEN handoff block 写入 `.forge/progress/<topic>.md` THEN 该 block SHALL 使用 fenced code block 包裹（语言标记为 `yaml` 或 `handoff`），便于机器解析。
3. WHEN `commands_executed` 字段记录命令时 THEN 每个命令条目 SHALL 包含 `cmd` 和 `exit_code` 两个子字段。
4. WHEN `procedure_compliance` 字段填写时 THEN 该字段 SHALL 至少包含 RED / GREEN / REFACTOR 三个 TDD 阶段的执行情况描述（例如 `"RED: test/foo.test.ts 新增失败用例 → GREEN: src/foo.ts 实现 → REFACTOR: 提取 normalizeInput"`）。
5. WHEN 下一个原子任务启动（同 topic）THEN build agent SHALL 先读取 `.forge/progress/<topic>.md` 中上一个任务的 handoff block 作为接续输入；**禁止**仅依赖会话内对话历史推断状态。
6. WHEN handoff block 中 `not_completed` 字段非空 THEN forge-build SKILL SHALL 在下一个原子任务的 plan 阶段提示 build agent："上一任务遗留：<not_completed 内容>，本任务是否需要先处理？"
7. WHEN forge-build SKILL 自检（§3.4 Self-Check）运行时 THEN 自检 SHALL 验证已 commit 的所有原子任务都对应一份 handoff block，缺失即触发 P1。
8. WHEN handoff block 字段缺失或 schema 不合法（如 `commands_executed` 不是数组）THEN forge-build 自检 SHALL 输出 P1 issue。

### Requirement 3: Validator 在 review 阶段持续累积知识

**User Story:** 作为 review subagent，我希望在抓到 P0/P1 issue 时立即把它登记到 `.forge/knowledge/known-failures.md`，这样下一次 review 启动时 spec-check / quality-check / security-check 可以自动检索"过去类似 diff 是否出过同样问题"。

#### Acceptance Criteria

1. WHEN spec-check / quality-check / security-check 中任一 agent 输出 P0 或 P1 issue THEN 该 agent SHALL 在 review 报告中同时输出一段 `known-failures append-block`，包含字段：`pattern_id`（自动生成的简短 slug）、`severity`、`first_seen_commit`、`signature`（issue 的 1-行特征描述）、`fix_required`（修复建议）。
2. WHEN forge-review SKILL 收到三层评审报告 THEN forge-review SKILL SHALL 把所有 `known-failures append-block` 合并去重后追加到 `.forge/knowledge/known-failures.md`。
3. WHEN known-failures.md 已存在相同 `pattern_id` 的条目 THEN forge-review SKILL SHALL 仅更新该条目的 `last_seen_commit` 和 `occurrence_count`，**不**重复追加；该文件保持 append-only 的语义不变（删除受 `frozen-zone-protection` 保护）。
4. WHEN spec-check / quality-check / security-check 任一 agent 启动 Step 0 之后 THEN 该 agent SHALL 读取 `.forge/knowledge/known-failures.md` 作为辅助上下文，并在输出报告头部列出"本次 diff 命中的历史失败模式（按 pattern_id 列表）"。
5. WHEN 历史失败模式被命中且修复在本次 diff 中没有体现 THEN 对应 review agent SHALL 输出一条 P1 issue：`known-failure recurrence — pattern <pattern_id>, last seen at <commit>`。
6. WHEN forge-review SKILL 完成报告合并 THEN forge-review SKILL SHALL 在 review 报告末尾输出"本次新增 N 条 known-failures、更新 M 条"的统计行，便于 ship 阶段决策。

### Requirement 4: `forge-loop` 升级为 Mission-grade Long-Running Loop

**User Story:** 作为 forge-loop 的运行者，我希望每次 SKILL 调用都启动 fresh-context 子会话，并在迭代之间通过状态文件交接，这样单次 loop 可以跨数小时甚至跨天持续推进而不被会话超时打断。

#### Acceptance Criteria

1. WHEN forge-loop SKILL 调度下一个 SKILL 阶段（plan → build → review → ...）THEN forge-loop SKILL SHALL 通过 `Skill(skill="forge", args="<phase>")` 调用，**禁止**在同一会话内串联多个 SKILL 实例。
2. WHEN forge-loop 在迭代之间交接状态 THEN 交接 SHALL 仅通过以下文件完成：`.forge/status.md`、`.forge/specs/<topic>/spec.md`、`.forge/plans/<topic>.md`、`.forge/progress/<topic>.md`、`.forge/findings/<topic>.md`、`.forge/knowledge/known-failures.md`、`.forge/runs/<run-id>/events.ndjson`。
3. WHEN forge-loop SKILL 在某次 SKILL 调用前 THEN forge-loop SKILL SHALL 在 `.forge/runs/<run-id>/events.ndjson` 中写入一条 `phase_start` 事件，包含 `phase`、`iteration`、`wall_clock_elapsed_seconds`、`token_budget_used` 字段。
4. WHEN forge-loop SKILL 在某次 SKILL 调用后 THEN forge-loop SKILL SHALL 写入一条 `phase_end` 事件，包含 `phase`、`iteration`、`exit_code`、`wall_clock_elapsed_seconds`、`token_budget_used` 字段。
5. WHEN forge-loop 累计 wall-clock 超过 4 小时但未触发熔断器 THEN forge-loop SHALL 继续运行，**不**因为单一会话上下文长度而停止；具体方式是每次 SKILL 调用作为独立 fresh-context 子会话。
6. WHEN forge-loop 触发熔断器（三振出局 / token 预算超限 / 用户中断）THEN forge-loop SHALL 在 `.forge/status.md` 写入完整 phase + skill_sequence + 最近一次 events.ndjson cursor，使 `/forge resume` 能在新会话内从断点继续。
7. WHEN 用户运行 `/forge resume <run-id>` THEN forge-resume SKILL SHALL 读取 `.forge/runs/<run-id>/events.ndjson` 的最新 cursor + `.forge/status.md`，在新会话中重启 forge-loop，状态完全恢复。
8. WHEN forge-loop SKILL 输出运行总结时 THEN 总结 SHALL 包含 `total_wall_clock`、`total_skill_invocations`、`total_iterations`、`token_budget_used`、`milestones_completed` 字段，对齐 Missions 演讲公布的指标维度。

## Validation Contract

> 本章节是本 spec 自身遵循 R1 的示范实例。所有 Acceptance Criteria 引用条目用 `R<n>.AC<m>` 格式。

### VAL-R1-001: forge-spec 输出包含 Validation Contract 模板

**Verify-By**: `bash`
**Evidence**: `bash scripts/check-spec-contract-template.sh` 退出码 0；输出包含 "OK: contract template present"
**Covers**: R1.AC1

### VAL-R1-002: spec lock 时缺少 Verify-By/Evidence 阻断

**Verify-By**: `vitest`
**Evidence**: `test/forge-spec/contract-validation.test.ts` 测试 `should block lock when Verify-By missing` 通过
**Covers**: R1.AC2, R1.AC4

### VAL-R1-003: Verify-By 字段白名单校验

**Verify-By**: `vitest`
**Evidence**: `test/forge-spec/contract-validation.test.ts` 测试 `should accept whitelist values and reject others` 通过
**Covers**: R1.AC5

### VAL-R2-001: handoff block 5 字段必填校验

**Verify-By**: `vitest`
**Evidence**: `test/forge-build/handoff-schema.test.ts` 测试 `should reject handoff missing any of 5 fields` 通过
**Covers**: R2.AC1, R2.AC8

### VAL-R2-002: 下一任务读取上一任务 handoff

**Verify-By**: `manual`
**Evidence**: 录屏或 `.forge/progress/missions-inspired-rigor.md` 中可见 build agent 在第 N+1 任务的开头明确引用第 N 任务的 handoff block 内容
**Covers**: R2.AC5, R2.AC6

### VAL-R3-001: review 输出 known-failures append-block

**Verify-By**: `vitest`
**Evidence**: `test/forge-review/known-failures-append.test.ts` 测试 `should emit append-block on P0/P1 issue` 通过
**Covers**: R3.AC1, R3.AC2

### VAL-R3-002: known-failures 命中时报 P1 recurrence

**Verify-By**: `vitest`
**Evidence**: `test/forge-review/known-failures-recurrence.test.ts` 测试 `should flag recurrence as P1 when fix not in diff` 通过
**Covers**: R3.AC4, R3.AC5

### VAL-R4-001: forge-loop 每次 SKILL 调用启动 fresh-context

**Verify-By**: `manual`
**Evidence**: 在 `forge-loop` 一次完整运行后，`.forge/runs/<run-id>/events.ndjson` 中可见多条 `phase_start` / `phase_end` 事件，且每条事件附带不同的 `session_id`
**Covers**: R4.AC1, R4.AC3, R4.AC4

### VAL-R4-002: forge-loop wall-clock ≥4 小时

**Verify-By**: `manual`
**Evidence**: 一次实战 dogfooding 跑出 wall-clock ≥4 小时的运行日志，事件流连续无中断
**Covers**: R4.AC5

### VAL-R4-003: forge-resume 从 events.ndjson cursor 恢复

**Verify-By**: `vitest`
**Evidence**: `test/forge-resume/events-cursor-resume.test.ts` 测试 `should resume from latest cursor in events.ndjson` 通过
**Covers**: R4.AC6, R4.AC7

## Dependencies

- 依赖 `.forge/knowledge/known-failures.md` 已存在并属于受保护区（已在 `config.md` 声明）
- 依赖 `forge-context` MCP 已捆绑（由 `forge-context-mcp-bundling` spec 在 v2.4.0 提供）
- 依赖 `.forge/runs/<run-id>/events.ndjson` 事件流基础设施已就位（由 `structured-observability` spec 提供）

## Risks

- **R1 模板改动可能让旧 spec 的 lock 失败**：通过 forge-spec SKILL 增加 `--legacy` 兜底标记，对 lock 时间早于本 spec 上线日的 spec 跳过 contract 校验。
- **R2 handoff schema 强制可能让现有 build 流程变重**：先在 standard / full tier 强制，light tier 保持 best-effort（仅记录 commands_executed）。
- **R3 known-failures.md 增长可能失控**：使用 `pattern_id` 去重 + 配置 `findings_retention_days`（默认 30）淘汰旧条目；超出 100 条时触发自动归档。
- **R4 fresh-context 调用可能因 cache miss 增加 token 消耗**：依赖 Forge 已有的 prefix-cache 友好的状态文件分区（冻结 / 受保护 / 开放），实测 cache 命中率应 ≥80%；监控指标进入 `.forge/knowledge/metrics.md`。
