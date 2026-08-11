---
status: locked
feature: subagent-foreground-truncation
layout: design
created: 2026-05-17
---

# Design — subagent foreground truncation

# Bugfix Requirements Document

## Introduction

本 spec 是 `subagent-result-truncation` 的 **followup**（命名沿用 spec id 链路；scope 已校准）。前序 spec 通过 Stage 1/2/3 三轮 Real Smoke 实验确认：

- **方向 A + C 在 background subagent 上 100% 有效**：Turn Budget Discipline IRON-LAW + Mandatory Read 合并 + maxTurns 10 让 quality-check / security-check 都返回完整 Layer 报告。
- **spec-check 连续三次失败**：触发 AGENTS.md §2.4 Three-Strike Reroute。

### 三次失败的事实校准

| Stage | 实验变量 | spec-check 结果 | 校准后归因 |
|---|---|---|---|
| 1 | maxTurns 10 + TBD + Mandatory Read 合并 | 通过 | fixture 仅 1 行 metrics.md，未触发 plans-enumeration → noise |
| 2 | + 同样改造扇出至 quality / security | 截断 | fixture 含 49 plan 文件，Plans-enumeration loop 打满 maxTurns |
| 3 | + spec-check `background: true` | 截断 | foreground/background 是 noise variable；plans-enumeration 与执行模式无关 |

### 真正的 Bug Condition（三次失败后形式化）

spec-check 在 review 时执行 R6（Claimed New File Existence on main branch）+ R7（Pack/Loader Integration Evidence）检查，需要枚举 `.forge/plans/` 下的文件做存在性验证。当 fixture 含 ≥ N 个 plan 文件时，spec-check 把所有 turn 都消耗在 Read/Grep plans 文件上，从未进入文本生成阶段。

```
C(X) :≡  reviewer = "spec-check"
           ∧ |.forge/plans/*.md| ≥ N_plans (实测 N_plans ≥ 49 必触发)
           ∧ subagent 在 Plans-enumeration loop 中耗尽 maxTurns
           ∧ result 字段不含结构化 Layer 1 报告
```

### 关键证据来源

- `.forge/findings/subagent-result-truncation-stage1.md` — Stage 1 数据
- `.forge/findings/subagent-result-truncation-stage2.md` — Stage 2 数据
- `.forge/findings/subagent-result-truncation-stage3.md` § Closure Note — 三次失败重排决策
- `agents/spec-check.md` § Check Items 5 (R6) + § 6 (R7) — plans 枚举检查的来源 prompt 段

### 修复方向（候选，design 阶段验证）

design 阶段从以下四个候选中选一个或组合：

1. **Plans-enumeration scoping**：spec-check 的 R6/R7 检查按 review topic 限定到 `.forge/plans/<topic>.md` 而不是枚举整个目录。需要识别 review topic 的来源。
2. **Plans context injection 移到 hook 层**：让 SessionStart 把 plans 索引（topic → mtime + 摘要）注入 prompt，subagent 不再运行时枚举。复用前序 spec `subagent-hook-context-budget` 的 `inject-evolved-rules.mjs` 模式。
3. **diff-scoped 触发**：R6 仅在 diff 中出现 `claimed new file` 字样（`new file mode` / 新增 `agents/*.md` / 新增 `skills/*/SKILL.md`）时触发，平均 review 不会无条件扫描 plans。
4. **检查项分层**：把 R6/R7 从 spec-check 拆出到独立的 `pack-integration-check` agent，spec-check 仅做 contract extraction。这是 architecture-level 改造，cost 高但根治。

候选 1 + 3 是最小创口；候选 2 + 4 cost 更高但更彻底。design 阶段需基于实验证据选定。

### 明确不做的事情

- 不修改 hook 注入预算（前序 spec `subagent-hook-context-budget` 已完成）。
- 不修改 quality-check / security-check 的 prompt 或 frontmatter（前序 spec `subagent-result-truncation` 已完成 + Real Smoke 验证）。
- 不修改 `Subagent_Summary_Protocol`（出口摘要由 `context-budget-management` spec 负责）。
- 不引入新的 hook 入口。
- 不调整 `maxTurns: 10`（已经是 reasonable 兜底；问题不在 turn 预算总量而在分配）。
- 不再实验 foreground/background 模式（Stage 3 已证伪）。

### 依赖与前置条件

- 前序 spec `subagent-result-truncation` 必须已 partial-closure（quality-check / security-check 在 background 路径已修，作为本 spec 的 preservation baseline）。
- 前序 spec `subagent-hook-context-budget` 必须已 partial-closure（hook 注入字节 = 0，作为本 spec 修复方向的可复用基础设施）。

涉及文件锚定（design 阶段定具体改点）：

- `agents/spec-check.md` § Check Items 5 (R6) + § 6 (R7) + § Check Method 主流程
- `.codex/agents/spec-check.toml`（不存在，列入 Out of Scope；本 spec 不创建该文件）
- 候选 2 涉及：`scripts/inject-plans-index.mjs`（新增）、`.claude-plugin/plugin.json` / `hooks/hooks.json` / `.claude/settings.json` 的 SessionStart 段（追加调用）
- 候选 3 涉及：`agents/spec-check.md` 的 R6 触发条件改写
- 候选 4 涉及：新建 `agents/pack-integration-check.md` + `src/review.ts` `buildReviewSubagents()` 增加该 agent

## Bug Analysis

### Current Behavior (Defect)

`/forge review` 调用 spec-check 时，若 fixture 含 ≥ N 个 plan 文件，spec-check 在 Plans-enumeration loop 中消耗全部 maxTurns，最终 result 字段不含 Layer 1 报告。

1.1 WHEN `/forge review` 调用 `spec-check` subagent AND fixture 含 ≥ N_plans active plan 文件（实测 N_plans = 49 必触发）THEN the system 在 spec-check 内部触发 R6/R7 检查路径，spec-check 通过 Glob/Read `.forge/plans/*.md` 逐个验证 main-branch 存在性。

1.2 WHEN spec-check 执行 R6/R7 plans 枚举 THEN the system 因每个 Read/Grep 调用消耗 1 个 turn，把 maxTurns: 10 全部消耗在 plans 枚举上，从未进入文本生成阶段。

1.3 WHEN spec-check 在 Plans-enumeration loop 中被 framework 掐断 THEN the system 返回给主 agent 的 result 字段为零文本输出，或仅包含工具调用之前的 preamble。

1.4 WHEN 同一 `/forge review` 调用同时跑三个 review subagent（spec-check / quality-check / security-check）THEN the system 让 quality-check / security-check 通过（它们不做 plans 枚举），spec-check 失败 — 此差异在 Stage 2 + Stage 3 Real Smoke 中被反复观察到。

1.5 WHEN spec-check `background: true` 与 `false` 模式都被实验过 THEN the system 在两种模式下都触发 1.1–1.4 的现象 — 证伪 foreground/background 是关键变量。

### Expected Behavior (Correct)

修复后，spec-check 在任意合法 fixture（含 ≥ 49 plan 文件）上都能返回完整 Layer 1 报告。

2.1 WHEN `/forge review` 调用 spec-check 且 fixture 含任意数量 plan 文件 THEN the system SHALL 让 spec-check 在 maxTurns: 10 内完成 R6/R7 检查 + 输出完整 Layer 1 报告（severity 表格 + Issue List + Scope Creep 段）。

2.2 WHEN spec-check 执行 R6 检查（Claimed New File Existence on main branch）THEN the system SHALL 把检查 scope 限定到与 review topic 相关的文件路径，而不是无条件枚举 `.forge/plans/`。具体 scope 限定方式由 design 阶段从候选 1/2/3/4 中选定。

2.3 WHEN spec-check 在 Plans-enumeration 路径上消耗 turn THEN the system SHALL 保证最坏情况下不超过 maxTurns - 2 个 turn 用于 plans 相关操作（与现有 Read 预算 ≤ 3 契约一致）。

2.4 WHEN spec-check 完成评审 THEN the system SHALL 让主 agent 收到 result 字段含 `## Layer 1 — Spec Alignment` 标题 + severity 表格 + Issue List 的完整结构化报告。

2.5 WHEN 主 agent 在主会话执行 `/forge review` AND fixture 与前序 spec Stage 2 Real Smoke 相同（49 plans + 9580 byte evolved-rules）THEN the system SHALL 让三个 review subagent 全部返回完整 Layer 报告 — 这是本 spec closure 的最终 e2e 验证。

### Unchanged Behavior (Regression Prevention)

前序 spec 的全部 acceptance criteria 保留，且不引入对其它 review subagent 链路的副作用。

3.1 WHEN `/forge review` 调用 quality-check / security-check subagent THEN the system SHALL CONTINUE TO 让它们返回完整 Layer 2 / Layer 3 报告（前序 spec `subagent-result-truncation` Stage 2 已验证）。本 spec 的修复 SHALL NOT 触碰 `agents/quality-check.md` / `agents/security-check.md` / `.codex/agents/quality-check.toml` / `.codex/agents/security-check.toml`。

3.2 WHEN spec-check 执行 Step 0 forge_git IRON-LAW THEN the system SHALL CONTINUE TO 强制其首步调用 `forge_git(subcommand="diff-content")`；本 spec 的修复 SHALL NOT 改 Step 0 契约。

3.3 WHEN spec-check 执行 Turn Budget Discipline THEN the system SHALL CONTINUE TO 保留前序 spec 引入的 IRON-LAW 段（含 maxTurns / final-report-turn 硬约束 / 预算耗尽兜底）；本 spec SHALL NOT 弱化该段。

3.4 WHEN review subagent 调用结束 THEN the system SHALL CONTINUE TO 应用 `Subagent_Summary_Protocol`（出口摘要协议由 `context-budget-management` spec 定义）。本 spec 仅改 spec-check 的 plans-enumeration 行为，不改出口路径。

3.5 WHEN hook 注入 `UserPromptSubmit` / `SessionStart` 在 spec-check 上触发 THEN the system SHALL CONTINUE TO 输出 0 字节注入（来自前序 spec `subagent-hook-context-budget` Property 1：`shouldSkipForSubagent` 短路）。本 spec 的修复 SHALL NOT 触碰 `scripts/lib/hook-stdin-router.mjs` 等 hook 层产出。

3.6 WHEN 任意 hook 事件（`PreToolUse` / `PostToolUse` / `Stop` / `TeammateIdle` / `PreCompact` / `PostCompact` / `TaskCompleted`）在主 agent 或 subagent 触发 THEN the system SHALL CONTINUE TO 沿用现有配置 / dispatcher / timeout，不被本 spec 改写。

3.7 WHEN `/forge decide` 启动 product / architect / security / designer subagent THEN the system SHALL CONTINUE TO 沿用现有 Agent tool 调用语义。本 spec scope 仅限 review 链路的 spec-check。

3.8 WHEN 用户在主 agent 会话中执行不涉及 review 的命令（`/forge plan` / `/forge build` / `/forge ship` / `/forge debug` 等）THEN the system SHALL CONTINUE TO 保持当前行为，不被本 spec 改动影响。

## Reproduction & Observability

- **Fixture（与前序 spec 相同，已就位）**：
  - `.forge/plans/` ≥ 5 个 ≥ 4 KB active plan（实测 49 个，必触发 Bug Condition）
  - `.forge/knowledge/evolved-rules.md` ≥ 8 KB（实测 9580 字节）
- **触发**：在 Claude Code 主 agent 会话执行 `/forge review`（不能从 Kiro 触发）。
- **观测**：
  1. spec-check 的最终 result 字段是否含 `## Layer 1 — Spec Alignment` + severity 表格。
  2. spec-check 的 tool_uses 数量与具体 tool 类型（Glob/Read/Grep 集中在 `.forge/plans/*` 路径上 = 命中 Bug Condition）。
  3. `.forge/reviews/<topic>.md` 是否落盘（如果 design 选择候选 4 拆分 agent）。
- **counterexample 起点**：
  - `.forge/findings/subagent-result-truncation-stage2.md` § Stage 2 Real Smoke 中 spec-check 的 6 tool_uses preamble 输出
  - `.forge/findings/subagent-result-truncation-stage3.md` § Closure Note 中 background 模式仍截断的零文本输出

## Out of Scope (Carry Forward)

- **`.codex/agents/spec-check.toml` 不存在**：本 spec 沿用前序 spec Out of Scope 决定，不创建该文件。codex runtime 上的 spec-check 路径修复留给独立 `codex-review-parity` spec。
- **`Subagent_Summary_Protocol` 改造**：出口摘要由 `context-budget-management` spec 负责。
- **Agent tool result-field 框架级改造**：不动 `src/subagent-runner.ts` 的 result 取值机制（前序 spec 已确认这是合理 API 语义）。
- **`/forge decide` subagent**：本 spec scope 仅 review 链路。
