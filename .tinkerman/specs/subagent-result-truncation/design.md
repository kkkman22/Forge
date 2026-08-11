---
feature: subagent-result-truncation
layout: design
created: 2026-05-17
---

# Bugfix Design Document

## Overview

前序 spec `subagent-hook-context-budget` 修掉了 hook 注入字节量（subagent 路径已经 0 字节，量化证据见 `.tinkerman/findings/subagent-hook-context-budget-smoke.md` § Mock Smoke）。但 Real Smoke 揭示 `tool_uses ≥ 5` 的 review subagent（`spec-check` / `security-check`）仍只返回 preamble 而非结构化 Layer 报告。本 spec 修复这残留现象。

修复策略遵循 bug condition 方法：

- **C(X)**：subagent 完成实质工作（`tool_uses ≥ 5`）但 `result` 字段不含 severity 表格 / Issue List。
- **¬C(X)**：subagent 在 maxTurns 内自然完成且 `result` 含完整 Layer 报告（quality-check 1 tool use 的当前正常路径）。
- **F → F'**：在三份 `.claude/agents/{spec,quality,security}-check.md` 的 prompt body 写入 **Turn Budget Discipline IRON-LAW**（方向 A）+ 压缩 Check Method（方向 C）+ 把 `maxTurns: 6` 提到 `10`（兜底）。codex `.codex/agents/*.toml` 同步策略另议（见 §Out of Scope）。

修复采用两阶段 rollout：

- **Stage 1（可独立验证）**：仅改 `.claude/agents/spec-check.md`，让用户跑一次 `/forge review` 在主 agent 会话验证 spec-check 是否返回完整 Layer 1 报告。验证通过即说明 A + C 方向可扇出。
- **Stage 2（扇出）**：把 Stage 1 的 prompt 改造扇出到 `quality-check.md` / `security-check.md`，再跑一次真 `/forge review` 验收三个 subagent 全绿。

## Glossary

- **Bug Condition (C)**：subagent 完成 `tool_uses ≥ 5` 但 `result` 不含 severity 表格的截断现象。`tool_uses` 阈值取 5（来自 Real Smoke：1 tool use 通过，6 tool uses 截断），design 阶段固化此阈值。
- **Turn Budget Discipline (TBD)**：本次新增的 prompt-level IRON-LAW，规定 turn 预算分配 + 最后一 turn 必须输出 Markdown 报告 + 禁止在最后一 turn 发起 tool call。
- **Final-Report Turn**：subagent 一次会话中**唯一**只输出 Markdown 报告 text block 的 turn，必须落在 `[maxTurns - 1, maxTurns]` 区间内。
- **Investigation Turn**：调用工具收集证据的 turn（forge_git / Read / Glob / Grep / WebSearch）。
- **Mandatory Investigation Set**：subagent 强制必走的 tool 调用集合 — 至少包含 Step 0 的 `forge_git(diff-content)`；spec-check 历史上还包含 Step 0.5 contract extraction Read 与 Step 0.5 known-failures Read，本 spec 把这两步合并以释放 turn 预算。
- **F**：修复前 `.claude/agents/{spec,quality,security}-check.md` frontmatter (`maxTurns: 6`) + Check Method 串行 10 步检查清单 + 无 final-report-turn 硬约束。
- **F'**：修复后同三个文件 frontmatter (`maxTurns: 10`) + 在 Identity 段后插入 `## Turn Budget Discipline` 硬约束段 + 合并 Step 0.5 contract / known-failures 两步为一次综合性 Read。
- **Stage 1 Smoke**：仅扇出 spec-check 后跑一次 Real `/forge review`，观察 spec-check 单一 subagent 是否返回完整 Layer 1 报告（quality-check / security-check 在此阶段保留原样作为 control 组）。
- **Stage 2 Smoke**：扇出全部三个 subagent 后跑一次 Real `/forge review`，验证三个 subagent 都返回完整 Layer N 报告，作为 spec closure e2e 证据。

## Bug Details

### Bug Condition (Restated for design)

```
FUNCTION isBugCondition(subagentResult)
  INPUT: subagentResult = { agentType, tool_uses, duration_ms, result, maxTurns }
  OUTPUT: boolean

  hasInvestigation := subagentResult.tool_uses >= 5
  hasReport := subagentResult.result.contains("severity table"
                                               | "Issue List"
                                               | "## Layer")
  hasWork := subagentResult.duration_ms > 0

  RETURN hasInvestigation AND NOT hasReport AND hasWork
END FUNCTION
```

`tool_uses ≥ 5` 阈值固化：Real Smoke 中 quality-check 1 tool use 通过（≤ 阈值），spec-check / security-check 6 tool uses 截断（> 阈值）。design 阶段不再 parametrize。

### Examples

- **Example 1 — spec-check 同步截断**：commit 影响小（metrics.md 一行），spec-check 用 6 tool uses 走完 Step 0 forge_git + Step 0.5 contract Read + Step 0.5 known-failures Read + Step 0.6 append-block + 主流程 1-3 次 Read，第 6 turn 正打算去 Read spec/requirements.md，preamble `I need to understand what spec this commit belongs to...` 成为 result。期望：合并 contract / known-failures Read 为 1 次，留出 final-report turn。
- **Example 2 — security-check 异步截断**：6 tool uses / 19 秒，最后 message `Now let me check for known-failures to detect any recurrence patterns:`。期望：known-failures 在合并步骤中已读完，不再触发新 Read，第 9-10 turn 强制输出 Layer 3 报告。
- **Example 3 — quality-check 控制组**：1 tool use / 14 秒 / 完整 Layer 2 报告。期望：方向 A + C 后行为不变（diff-only review 已经 ≤ 5 tool uses，TBD 段只在第 9-10 turn 切换为 final-report-turn）。

## Hypothesized Root Cause

事实校准已完成（详见 spec history）：

1. **三个 review subagent 共用 `maxTurns: 6`**：
   - spec-check Mandatory Investigation Set: forge_git + contract Read + known-failures Read = 3 turns（最低）
   - security-check Mandatory Investigation Set: forge_git + known-failures Read = 2 turns（最低）
   - quality-check Mandatory Investigation Set: forge_git = 1 turn（最低）

   spec-check 留给主流程的 turn 上限 = 6 - 3 = 3，与 prompt 写的"≤ 3 次 Read"刚好打满，**没有 turn 留给 final-report**。

2. **prompt body 没有 final-report-turn 硬约束**：三个 subagent 的 Check Method 列了 10 步检查清单，最后一步是产出 Output Format 表格，但**未规定该输出必须发生在 turn N**。subagent 在最后一 turn 自然按"先调研再总结"心智发起新 tool call，被 framework 掐断。

3. **Agent tool result 字段语义按"最后 assistant text block"取值**：源代码 `src/subagent-runner.ts:80` `result.output ?? ""` 直接吃 result，未做 transcript 回扫。这不是 bug 而是合理 API 语义；对应的责任在 subagent prompt 端保证最后 message 是 text 而非 tool call。

候选 1 与 2 叠加构成 C(X) 的充分条件。修复必须双管齐下，仅修一个不够。

## Expected Behavior

### Preservation Requirements

- 主 agent 与所有 hook 行为完全不变（前序 spec acceptance criteria 1 / 3 / 4 全量保留）。
- subagent frontmatter 的 `tools` 白名单（Read / Glob / Grep + security-check 加 WebSearch）/ `permissionMode: plan` / `memory: project` / `background: true`（quality / security）全部不变。
- subagent Output Format 表格 schema 不变（Reviewer / Severity / File / Issue / Suggestion / Layer N 标题）。
- Step 0 IRON-LAW（首步必须 forge_git）保留。
- Read 预算 ≤ 3（除 Step 0 外）的契约保留——本 spec 不增加 Read 预算，而是把 mandatory investigation 缩小到只剩 forge_git。
- quality-check 的现状（diff-only review，1 tool use 完整产出）保留 byte-equal；TBD 段对它只在 turn 边界生效，不影响 happy path。
- 评审结果合并管线（`mergeReviewResults` 在 src/review.ts）不变。
- `Subagent_Summary_Protocol`（出口摘要协议）不变。

**Scope:**

All inputs that do NOT match C(X) 应当完全不受本次修复影响。具体：

- subagent `tool_uses ≤ 4` 的所有路径（quality-check 当前路径）。
- 主 agent 在所有 hook 上的注入字节流（前序 spec 已锁定）。
- `/forge decide` 的 product / architect / security / designer subagent（不同 maxTurns，不同 prompt scope）。
- subagent 调用方代码 (`src/subagent-runner.ts` / `src/review.ts buildReviewSubagents`)。

**Note:** Property 1 / Property 2 / Property 3 / Property 4 / Property 5（见 §Correctness Properties）共同覆盖 C(X) → final report 与 ¬C(X) → byte-equal 两类语义。

## Correctness Properties

### Property 1: Bug Condition — Final-Report Turn

_For any_ review subagent invocation where `tool_uses ≥ 5`，subagent 的最后一 turn SHALL 是 Markdown text block，SHALL 包含 `## Layer N` 标题和 severity 表格，且 SHALL NOT 发起任何 tool call。该 text block 的内容 SHALL 出现在 Agent tool 返回的 `result.output` 字段中。

**Validates: Requirements 2.1, 2.2, 2.4**

### Property 2: Preservation — Quality-Check Byte-Equal Happy Path

_For any_ review where 当前路径 `tool_uses ≤ 4`（quality-check 的典型路径），subagent 的 `result.output` SHALL byte-equal 修复前对相同 diff fixture 的输出（即 Layer 2 表格 + 7 项分析维度的字符串）。本 property 用 Real Smoke 的 quality-check 输出作为 baseline。

**Validates: Requirements 3.3**

### Property 3: Preservation — Tool Whitelist & Step 0 IRON-LAW

_For any_ review subagent invocation，subagent SHALL CONTINUE TO 仅调用 frontmatter `tools` 字段允许的工具集（Read / Glob / Grep + WebSearch for security-check），SHALL CONTINUE TO 把 `forge_git(subcommand="diff-content")` 作为第一个 tool call。不得新增 Bash / Write / Edit 等扩权工具。

**Validates: Requirements 3.2, 3.3**

### Property 4: Preservation — Investigation Read Budget

_For any_ review subagent invocation，subagent 在 final-report turn 之前的所有 Read tool calls 之和 SHALL ≤ 3（除 Step 0 forge_git 外）。本约束 byte-equal 保留前述 prompt 中的"Read 预算 ≤ 3"契约，不被 maxTurns 提到 10 的兜底改动放宽。

**Validates: Requirements 3.3**

### Property 5: Preservation — Hook Layer Untouched

_For any_ change introduced by this spec，全部修改 SHALL 仅落在 `.claude/agents/{spec,quality,security}-check.md`（与可选 `.codex/agents/*.toml`）。`scripts/lib/hook-stdin-router.mjs` / `scripts/inject-plan-context.mjs` / `scripts/inject-evolved-rules.mjs` / `scripts/cmux-mirror/sync-once.mjs` / `.claude/settings.json` / `.claude-plugin/plugin.json` / `hooks/hooks.json` byte-equal 修复前。

**Validates: Requirements 3.1, 3.6**

## Architecture

### Modification Inventory

| # | File | Section / Change | Stage |
|---|------|------------------|-------|
| ① | `.claude/agents/spec-check.md` | frontmatter `maxTurns: 6 → 10`；Identity 段后插入 `## Turn Budget Discipline`；Check Method Step 0.5 / 0.6 合并为单 Read；Output Format 段尾加 `## Final Report Block` 提示 | Stage 1 |
| ② | `.claude/agents/quality-check.md` | 同 ① 三处改动（quality-check 没有 Step 0.5 contract，只合并 Step 0.5 known-failures Read 与 Step 0.6 append-block） | Stage 2 |
| ③ | `.claude/agents/security-check.md` | 同 ② | Stage 2 |
| ④ | `.codex/agents/quality-check.toml` | 仅同步 frontmatter `maxTurns` 与 TBD 段（codex toml 是 abridged 版本，不含 known-failures Step 0.5/0.6，因此压缩 Method 步骤数对它 no-op） | Stage 2 |
| ⑤ | `.codex/agents/security-check.toml` | 同 ④ | Stage 2 |
| ⑥ | `.codex/agents/spec-check.toml` | **不存在** — Stage 1 的 codex side 是 missing 状态。本 spec **不**新建该文件，留给后续 codex parity spec 处理（详见 §Out of Scope） | n/a |

### Stage Topology

```
Stage 1 (single-file experiment)
┌─────────────────────────────────────────────────────────────┐
│  .claude/agents/spec-check.md                                │
│  ├── frontmatter: maxTurns 6 → 10                           │
│  ├── + ## Turn Budget Discipline (IRON-LAW)                  │
│  ├── Check Method Step 0.5/0.6 → merged single Read          │
│  └── + ## Final Report Block hint                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                Real /forge review (Stage 1 Smoke)
                          │
                          ▼
        spec-check 返回完整 Layer 1 报告? ───┐
                          │                  │
                       Yes│                No│ → debug, 调整 prompt
                          ▼                  │   再回 Stage 1
Stage 2 (fan-out)         │                  │
┌─────────────────────────────────────────────────────────────┐
│  + .claude/agents/quality-check.md (same pattern)            │
│  + .claude/agents/security-check.md (same pattern)           │
│  + .codex/agents/quality-check.toml (frontmatter + TBD only) │
│  + .codex/agents/security-check.toml (frontmatter + TBD only)│
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                Real /forge review (Stage 2 Smoke)
                          │
                          ▼
        三个 subagent 都返回完整 Layer 报告? → spec closure
```

### Out of Scope

- **codex spec-check 缺失**：`.codex/agents/spec-check.toml` 不存在，本 spec **不**新建该文件。代码注释里假设 review 三件套都跑在 Claude Code runtime 上；若 codex 也要支持 spec-check，应当作为独立 `codex-review-parity` spec 处理。
- **subagent prompt 长度优化**：本 spec 仅做 Step 0.5 / 0.6 合并（≤ 30 行净减），不做整体 prompt 精简。整体精简属于 prompt-engineering 优化范畴，需要独立 spec。
- **Agent tool result 字段语义改造**：不动 `src/subagent-runner.ts`，不引入 transcript 回扫等新代码路径。这一层若需要修改属于 Claude Code framework 升级范畴，超出 Forge spec 范围。
- **`/forge decide` subagent**：design 阶段证据来自 review，未观察到 decide 链路也有截断；本 spec scope 限在 review。

## Components

### Component 1: Turn Budget Discipline IRON-LAW Block (NEW prompt section)

**Insertion point**：在每份 `.claude/agents/{spec,quality,security}-check.md` 的 `## Identity` 段之后、第一个领域检查段（`## Check Items` / `## Six-Dimension Check` / `## Five-Dimension Check`）之前。

**Block content**（中文为主，与既有 prompt 风格一致）：

```markdown
---

## Turn Budget Discipline (IRON-LAW)

你最多有 `maxTurns` 个 turn（参见 frontmatter）。Turn 预算必须按以下规则分配，**违反此规则属于评审失败**：

| Turn 范围 | 允许的动作 | 禁止的动作 |
|----------|-----------|-----------|
| 1 to (maxTurns - 2) | 工具调用（forge_git / Read / Glob / Grep<reviewer-extra-tools>） | — |
| (maxTurns - 1) | 最后一次工具调用 OR 开始撰写 Markdown 报告 | 不再发起新工具调用 |
| **maxTurns**（最后一 turn） | **必须**输出 Markdown 报告 text block，包含 `## Layer <N>` 标题和 severity 表格 | **严禁**任何工具调用 |

**Final-Report Block 强制契约**：

最后一 turn 的 assistant text block 必须以 `## Layer <N>` 开头，必须包含 severity 表格（即使所有 issue 列为 "无 issue 发现"，也要保留表格框架）。**禁止**最后一 turn 仅输出 preamble（例如 "Now let me check..." / "I need to understand..."）。

**预算耗尽兜底**：

如果在 turn `(maxTurns - 1)` 仍然 evidence 不足，**直接**在 final-report 中以 `Severity: P1` 列出 `Insufficient evidence — Read budget exhausted` 项，并把已观察到的部分填入表格，然后输出报告。**绝不**在最后一 turn 再发起新的 tool call。

> 本约束与 Step 0 forge_git IRON-LAW 同级，违反任一条都构成评审失败。
```

`<reviewer-extra-tools>` 占位符在三个文件分别替换：

- spec-check: 留空
- quality-check: 留空
- security-check: ` / WebSearch`

### Component 2: Method 段的 Step 0.5 / 0.6 合并 (MODIFY)

**spec-check.md 的合并目标**：

当前结构（Step 0 之后）：

- Step 0.5 — Contract Extraction（Read spec/requirements.md，提取 `Verify-By` / `Evidence`）
- Step 0.5 — Known-failures Recurrence Detection（Read `.tinkerman/knowledge/known-failures.md`）
- Step 0.6 — Known-failures Append-block（输出，无 Read）

**合并后**：把"必读的两份外部文件"（spec requirements + known-failures）合并为单步 `Step 0.5 — Mandatory Context Read`，主 prompt 显式说明这步**只能用 1 次 Read 调用**完成（让 subagent 自己选择 Read 哪份；如果两份都需要，使用 Glob 列出后一次性 Read 较小的一份），剩余信息从 diff context 推导。Step 0.6 的 append-block 保留，因为它只是输出格式，不消耗 tool。

合并后 spec-check 的 Mandatory Investigation Set 从 3（forge_git + contract Read + known-failures Read）压到 2（forge_git + 1 次合并 Read），节省 1 turn 喂给 final-report。

**security-check.md 的合并目标**：

当前 Step 0.5 仅有 Known-failures Read。合并目标：把 Step 0.5 的 known-failures Read **改为可选**（`if .tinkerman/knowledge/known-failures.md exists AND review scope ≥ N files`），让 review scope 小（如本次 metrics.md 一行）的场景跳过 known-failures，直接进主流程。Step 0.6 保留。

**quality-check.md**：当前没有 Step 0.5 contract，仅 Step 0.5 known-failures + Step 0.6 append。同 security-check 改 known-failures 为可选。

### Component 3: maxTurns 提到 10 (frontmatter MODIFY)

`maxTurns: 6 → 10` 在三份 `.claude/agents/*.md` 与两份 `.codex/agents/*.toml`（quality / security；spec-check.toml 不存在）。理由：

- Component 1 + Component 2 是主修复，maxTurns: 10 是兜底——即使两个组件覆盖不完整，10 turns 也给 final-report 留充足 buffer。
- 单 agent cost 增加 ≤ 70%（从 6 to 10），但主 agent 收到完整 Layer 报告的概率从 33% 升到 ≈ 100%。
- AGENTS.md `max_parallel_agents: 6` 与 `/forge decide` round-1 4 agents 全不受影响。
- 不超过 `subagent-runner.ts` 中的 `maxTurns: Math.min(opts.maxTurns ?? 10, 30)` 上限。

## Data Models

无新数据模型。本 spec 只改 prompt 文档，不修改 runtime 数据结构（`SubagentInvocation` / `SubagentResult` / `ReviewReportFrontmatter` 等保持不变）。

## Fix Implementation

### Stage 1 Changes

**File**: `.claude/agents/spec-check.md`

**Specific Changes**:

1. **frontmatter `maxTurns: 6` → `maxTurns: 10`**。其它 frontmatter 字段（name / description / model / tools / permissionMode / memory）byte-equal 保留。
2. **在 `## Identity` 段后插入 Turn Budget Discipline IRON-LAW 段**（参见 Component 1 模板）。占位符按 spec-check 规则：`<reviewer-extra-tools>` 留空。
3. **合并 Check Method Step 0.5 (Contract Extraction) + Step 0.5 (Known-failures Detection)**：保留 Step 0（forge_git 强制首步），把后两个 Step 0.5 合并为单一 Step 0.5 段，标题改为 `## Step 0.5 — Mandatory Context Read (one-shot)`，正文规定"如同时需要 spec/requirements.md 与 known-failures.md，使用 Glob 定位较小的一份后再单次 Read；另一份信息从 diff context 推导"。Step 0.6 (Known-failures append-block) 保留 byte-equal。
4. **在 Output Format 段后追加 `## Final Report Block`**：`本节是 Turn Budget Discipline 的 final-report 模板锚点。最后一 turn 的输出必须以 ## Layer 1 — Spec Alignment 起头，按上方 Output Format 表格输出，禁止以 preamble 起头。`

### Stage 2 Changes

**File**: `.claude/agents/quality-check.md`

**Specific Changes**: 同 Stage 1 三处改动模式。区别：

- Component 2 合并目标缩小到 Step 0.5 known-failures + Step 0.6 append（无 contract extraction），改为"known-failures Read 可选"语义。
- `<reviewer-extra-tools>` 占位符：留空。
- Final Report Block 锚点改为 `## Layer 2 — Code Quality`。

**File**: `.claude/agents/security-check.md`

**Specific Changes**: 同 quality-check 改动模式。区别：

- `<reviewer-extra-tools>` 占位符：` / WebSearch`。
- Final Report Block 锚点改为 `## Layer 3 — Security & Risk`。

**File**: `.codex/agents/quality-check.toml`

**Specific Changes**:

1. 在 `developer_instructions` 顶部 Identity 段后插入 Turn Budget Discipline IRON-LAW 段（同 Stage 2 .claude/agents/quality-check.md 的 Component 1 文本）。
2. codex toml 当前**不含** `maxTurns` 字段（它由 codex runtime 默认配置决定）；本 spec **不**新增该字段，保留 codex 默认上限——前提是 codex 默认 ≥ 10。如果 codex 默认 < 10，需要在 `[run]` 块下显式声明 `max_turns = 10`（参考 codex 文档；本 spec 不替换其值，发现 < 10 时在 task 中确认）。
3. codex toml 不含 known-failures Step 0.5 / 0.6（abridged 版），Component 2 对它 no-op。

**File**: `.codex/agents/security-check.toml`

**Specific Changes**: 同 quality-check.toml 模式。

### Test File Updates

**File**: `test/agent-frontmatter.test.ts`（如果存在；否则**新建** `test/agent-prompt-discipline.test.ts`）

**Specific Changes**:

1. **新增/扩展契约测试**：扫描 `.claude/agents/{spec,quality,security}-check.md`，断言：
   - frontmatter `maxTurns === 10`
   - prompt body 含字符串 `Turn Budget Discipline` AND `Final Report Block`
   - 仍含字符串 `forge_git(subcommand="diff-content")`（Step 0 IRON-LAW 保留）
2. **PBT**：用 `fast-check` 生成任意 maxTurns ∈ [6, 30]，断言 prompt 内的 Turn Budget Discipline 段对所有合法 maxTurns 都可解析（不依赖具体数值，只要求段结构存在）。

### Verification Order

每段对应一次原子提交 + 一次 Stage 验证：

1. **Stage 1 commit**：仅改 spec-check.md，跑契约测试 + Real `/forge review`。
2. **Stage 2 commit batch**：扇出三份 .md + 两份 .toml，跑契约测试 + Real `/forge review`。
3. **Closure**：Real Smoke 3/3 通过 → 写 findings + 关 spec。

## Testing Strategy

### Validation Approach

测试分三层：契约层（断言 prompt body 中关键字符串存在）+ Real Smoke（端到端验证 result 字段含 severity 表格）+ 回归（前序 spec 的全部测试不变）。

### Exploratory Bug Condition Checking

**Goal**：在 fix 应用前确认 C(X) 在 Stage 0 仍然可复现。

**Test Plan**：跑一次 baseline `/forge review`（在 Stage 1 commit 之前）。预期：`spec-check` / `security-check` 在 `tool_uses ≥ 5` 时返回 preamble-only。这本身就是 Real Smoke 已经记录的现象，无需重复——直接引用 `.tinkerman/findings/subagent-hook-context-budget-smoke.md` § Real Smoke Run 作为 counterexample。

### Fix Checking

**Goal**：验证修复应用后，C(X) 不再出现。

```
FOR ALL subagentResult WHERE isBugCondition_pre_fix(subagentResult) DO
  result := postFixSubagent(sameInputs)
  ASSERT NOT isBugCondition(result):
      result.result.contains("## Layer N") = true
      AND result.result.contains("severity table" OR "Issue List") = true
      AND result.result NOT starts with "Now let me" / "I need to" / "Let me"
END FOR
```

### Preservation Checking

**Goal**：验证 ¬C(X) 路径（quality-check happy path）字节级保留。

**Test Plan**：在 Stage 2 完成后跑一次 `/forge review` 在与 Real Smoke 相同 fixture 上，断言 quality-check 的输出 byte-equal `.tinkerman/findings/subagent-hook-context-budget-smoke.md` 的 quality-check § Real Smoke Run 引用。允许 ≤ 5% 差异（reviewer 自然语言波动），但 severity 表格列数 / 行数 / Layer 标题必须一致。

### Unit Tests

- **`test/agent-prompt-discipline.test.ts`** (NEW)：对三份 `.claude/agents/*.md` 与两份 `.codex/agents/*.toml` 做契约扫描，断言 Turn Budget Discipline 段存在 + maxTurns ≥ 10 + Step 0 IRON-LAW 字符串保留。
- **`test/agent-frontmatter.property.test.ts`** (NEW or EXTEND)：用 fast-check 生成任意 prompt mutation，断言：去掉 Turn Budget Discipline 段后契约测试 fail；只去掉 maxTurns 不修 prompt body，契约测试也 fail——验证两者必须共存。

### Integration Tests

- **Stage 1 Smoke**：手工跑一次 `/forge review`，仅 spec-check 已 fix。期望：spec-check 返回完整 Layer 1 报告 + severity 表格；quality-check 仍 1 turn 通过；security-check 仍可能截断（control 组）。
- **Stage 2 Smoke**：手工跑一次 `/forge review`，三个 subagent 都已 fix。期望：三个都返回完整 Layer 报告；附加 quality-check 的 byte-equal 比较（preservation）。

### PBT Targets

- 任意 `maxTurns ∈ [6, 30]` → Turn Budget Discipline 段可解析、Final-Report-Turn 计算正确（`maxTurns` 是最后一 turn）。
- 任意 review fixture（含 0 文件 / 1 文件 / 100 文件 diff）→ Mandatory Investigation Set 总是只调用 forge_git（其它 Read 都是可选）。

## Migration / Rollout

### Stage 1: spec-check Single-File Experiment

**Scope**：

- 修改 `.claude/agents/spec-check.md`（① 三处修改）。
- 新增 `test/agent-prompt-discipline.test.ts`（先建空 skeleton；assertion 只对 spec-check 生效）。
- 在 commit message 标注 `[stage 1 of 2]`。

**为什么独立**：

- 未观察过 prompt 改动是否真生效之前，先做一份对照实验。
- 若 Stage 1 Smoke 失败，可以独立回滚单文件而不动 quality / security。
- 提供"prompt 改动 → 行为改变"的证据链，让 Stage 2 扇出有依据。

**Verification commands**：

```bash
# Contract test（CI 必经）
npx vitest run test/agent-prompt-discipline.test.ts

# Real Smoke（手工，由用户在 Claude Code 主 agent 触发）
# Pre-flight:
git rev-parse --short HEAD
date -u '+%Y-%m-%dT%H:%M:%SZ'
git diff --stat HEAD~1..HEAD | tail -3   # 确保 review 目标 diff 非空

# In Claude Code main-agent session:
/forge review

# Post-run: append spec-check Layer 1 report + tool_uses + duration to:
# .tinkerman/findings/subagent-result-truncation-stage1.md
```

**Decision gate**：spec-check Layer 1 报告 == 完整 severity 表格 + Issue List → Stage 2；否则 debug + 调整 Turn Budget Discipline 文案后回到 Stage 1。

### Stage 2: Fan-out

**Scope**：

- 修改 `.claude/agents/quality-check.md`（② 三处修改）。
- 修改 `.claude/agents/security-check.md`（③ 三处修改）。
- 修改 `.codex/agents/quality-check.toml`（④ TBD 段插入；可选 `max_turns = 10`）。
- 修改 `.codex/agents/security-check.toml`（⑤ 同上）。
- 扩展 `test/agent-prompt-discipline.test.ts` 让契约扫描覆盖三份 .md + 两份 .toml。
- 在 commit message 标注 `[stage 2 of 2]`。

**Verification commands**：

```bash
# Contract test
npx vitest run test/agent-prompt-discipline.test.ts

# Existing regression (确保前序 spec 的 hook layer 测试零回归)
npx vitest run test/hook-stdin-router.test.ts \
                test/hook-stdin-router.property.test.ts \
                test/inject-plan-context.test.ts \
                test/inject-evolved-rules.test.ts \
                test/cmux-sync-once.subagent-skip.test.ts \
                test/hooks-config-integrity.property.test.ts \
                test/non-frozen-hook-preservation.property.test.ts \
                test/contract.hooks.test.ts

# Real Smoke (手工)
/forge review

# Post-run: 三份 subagent 报告 + tool_uses + duration 都写入:
# .tinkerman/findings/subagent-result-truncation-stage2.md
```

**Decision gate**：3/3 subagent 返回完整 Layer 报告 → spec closure；任一 subagent 仍 truncate → 回到 Stage 2 调整对应 prompt（不退回 Stage 1，spec-check 已验证）。

### Rollback Strategy

- Stage 1 回滚：`git revert <stage1-commit>`，单文件原子回滚。回滚后 spec-check 回到 Real Smoke 的 truncated 状态——可接受，因为 prerequisite 是 hook layer 修复（前序 spec 已合并），review 行为整体不会更差。
- Stage 2 回滚：`git revert <stage2-commit-batch>`，回到 Stage 1 状态（仅 spec-check 已修）。

每段都不影响前序 spec `subagent-hook-context-budget` 的产出（hook router / capped injectors / config cleanup）。

## Error Handling

| 错误场景 | 行为 | 验证位置 |
|---------|------|---------|
| Stage 1 Smoke spec-check 仍 truncate | 不进 Stage 2；进 debug 模式调整 Turn Budget Discipline 文案（例如把 IRON-LAW 改成更显式的"如果你即将发起 tool call 而当前 turn 是 maxTurns，立刻停止并输出 Markdown 报告"） | Stage 1 manual smoke |
| Stage 2 Smoke quality-check 出现新行为偏差（preservation 失败） | 立刻回滚 Stage 2 quality-check.md 部分，保留 spec-check 与 security-check 改动；report quality-check 异常作为 followup | Stage 2 manual smoke + byte-equal compare |
| 契约测试 fail（prompt 中 Turn Budget Discipline 字符串缺失） | CI 阻断 commit；prompt edit 必须修正后重新 commit | `test/agent-prompt-discipline.test.ts` |
| codex toml 缺 `max_turns` 字段且默认值 < 10 | 在 `.codex/agents/*.toml` `[run]` 块下显式声明 `max_turns = 10`；如果 codex schema 不支持，spec 文档标注 known issue 转 followup `codex-review-parity` spec | Stage 2 task discovery |
| subagent 仍在最后一 turn 发起 tool call（IRON-LAW 被忽略） | 这是 LLM 不遵循 prompt 的硬限制；mitigation：把 maxTurns 进一步提到 12 + 在 prompt 中增加 in-line 示例（"❌ Wrong: Turn 10 outputs 'let me check ...' / ✅ Right: Turn 10 outputs '## Layer 1 — Spec Alignment ...'"） | Stage 2 manual smoke |
| `subagent-runner.ts` 未来重写并修改 `maxTurns: Math.min(opts.maxTurns ?? 10, 30)` 上限 | 本 spec 不依赖该 default 路径（本 spec 在 frontmatter 显式写 `maxTurns: 10`，会覆盖 default）；但若上限被调到 < 10，spec 立刻失效——加 watcher，单测断言 `Math.min(_, 30)` 表达式存在 | `test/subagent-runner.test.ts`（如已有则扩展） |
| `.codex/agents/spec-check.toml` 仍缺失 | 不本 spec 范围；标注 followup spec `codex-review-parity` | Stage 2 task discovery |
| Real Smoke 在 fixture 改变后表现不一致 | findings 文件锚定 `.tinkerman/plans/` 文件数与 `.tinkerman/knowledge/evolved-rules.md` 字节数为 fixture 状态戳；Smoke 前必须 echo 这两个值 | findings 文件 frontmatter |

**Fail-safe principle**：Stage 1 / Stage 2 之间存在显式 decision gate，禁止跳步。如果 Stage 1 Smoke 失败，**禁止**直接合 Stage 2——按 AGENTS.md §2.4 三次失败重排，需重新评估 root cause（可能 maxTurns + 合并 Step 0.5 还不够，要追加方向 D 写盘 fallback）。
