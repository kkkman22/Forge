---
description: "Use when user runs `/forge learn`, task completes, or needs to convert session experience into persistent knowledge assets"
updated: 2026-06-16
context: fork

dispatch_mode: fork
allowed_tools:
  - Read
  - Agent
  - Glob
  - Grep
  - Bash
  - Write
  - Edit
  - WebSearch
disallowedTools: ["Bash(git push *)"]
---

# /forge learn — 知识引擎

> **触发方式**：全量路径的第八步（最后一步），或用户直接输入 `/forge learn`，或 `/forge ship` 完成后提示触发
> **职责**：从每次开发中提取关键经验并沉淀为可复用的知识资产，让系统越做越强
> **输出路径**：`.forge/knowledge/solutions/<topic>.md` + `.forge/knowledge/instincts.md` + `.forge/knowledge/known-failures.md` + `.forge/knowledge/sessions/<date>-<topic>.md`

---

## 1. Overview

`/forge learn` 是 Forge 工作流的知识沉淀阶段——把一次性的开发经验转化为可复用的知识资产。它以 Subagent 模式从五个维度提取知识，将解决方案文档化，将高频模式写入直觉库，并自动维护知识库的健康度。

**核心原则**：完成即沉淀。每次开发都是一次学习机会，不沉淀的经验等于没有发生过。

## Mode Dispatch

`/forge learn` 有两种模式，按参数路由：

| 调用 | 模式 | 行为 |
|------|------|------|
| `/forge learn`（无参数） | **提取模式**（默认） | 五维度提取 + solutions/instincts/known-failures 沉淀（下方主流程）。只增不减。 |
| `/forge learn --deep` | **收敛模式**（regenerative-checkpoint R4） | 对账 raw trajectory + 去重 + 压缩 + 验证 + prune 知识库。→ 详见 `references/deep-reconciliation.md` |

**`--deep` 模式**（regenerative-checkpoint R4，借鉴 MiMo-Code `/dream`）：周期性收敛知识库——不是提取新知识，而是让已有知识**更紧凑、更准确、无冗余**。流程：读 CC transcript JSONL（`~/.claude/projects/<slug>/*.jsonl`）+ `.forge/` 文件轨迹对账 → 搜用户原话关键词（always/never/decided 等）验证候选事实 → 去重/合并/压缩 → 验证路径(Glob)/函数名(Grep) → prune 过时条目 → 密度上限（单个 knowledge 文件 ≤200 行/10KB） → 输出收敛报告。判定 `--deep` 后**跳过下方提取主流程**，直接执行 `references/deep-reconciliation.md` 的收敛流程。

## Auto_Memory Boundary

> 引用 `skills/shared/native-command-matrix.md` 获取完整配置

**Auto_Memory 负责会话级快速记忆；forge-learn 负责跨项目 ADR 与五维度结构化沉淀。**

### 已委托给 Auto_Memory（v2.1.59+，不再由 forge-learn 覆盖）

| 类别 | 说明 |
|------|------|
| Build commands | Auto_Memory 自动捕获构建指令 |
| Debugging notes | Auto_Memory 自动捕获调试记录 |
| Routine repl invocations | Auto_Memory 自动记录常规操作 |

### forge-learn 保留的差异化范围

| 类别 | 说明 |
|------|------|
| 跨项目 ADR | 跨项目架构决策记录的生成与同步 |
| 五维度结构化沉淀 | event / decision / pattern / anti-pattern / rule |
| `--from-chats` 历史对话提取 | 从历史对话中批量提取知识 |
| 规则蒸馏 | 从知识积累中蒸馏错误预防规则（Evolved Rules） |
| 执行质量评估 | 四维度执行质量分析 |

### Fallback 行为

当 Claude Code 版本 < 2.1.59（无 Auto_Memory）时：恢复完整遗留覆盖范围（包含上述已委托类别），并 emit Deprecation_Notice：

`⚠️ [Forge Slimming] /forge learn 可委托给 Auto_Memory（Claude Code ≥ 2.1.59）处理会话级记忆。当前版本不满足，使用完整遗留范围。迁移指南：docs/slimming-migration.md`

### 不可降级规则

forge-learn **不会** emit 严格会话作用域且已被 Auto_Memory 覆盖的 ADR 条目。

**Not For**：轻量路径的简单修复（无值得沉淀的经验）/ 中止的任务（abort 后无需 learn）

### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "learn", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

默认严重度：warn。可通过 `severityOverride` 覆盖。

### §1.6 Pre-flight: Docs Governance Check

Run the three docs governance checkers to detect document health issues before knowledge extraction:

```bash
npx tsx scripts/check-docs-quota.ts --json
npx tsx scripts/check-docs-staleness.ts --json
npx tsx scripts/check-docs-links.ts --json
```

**Budget**: 10 seconds total. If any checker times out, treat as `needs_attention`.

**Processing**:
1. Parse NDJSON output from each checker
2. Extract critical/error-level diagnostics
3. If any checker returns non-zero exit code, times out, or script is missing → mark "文档增量" section as `needs_attention` but do NOT block main learn flow
4. If all three checkers complete with zero status and no critical diagnostics → mark as `clean` with UTC ISO 8601 timestamp

**Session output**: Write critical-level issues into `.forge/knowledge/sessions/<session>.md` under a `## 文档治理诊断` section, each containing:
- Source detector name
- Document relative path
- Issue summary

This check is informational only — it enriches the learn session with documentation health context.

---

## §0.7 Observability Data Collection (§71, §72, §74)

> **Precondition**: OTEL data is available via `.forge/runs/` JSONL logs or `OTEL_EXPORTER_*` env vars.
> If no observability data exists, **skip this entire section** with a single-line note: `⏭️ OTEL 数据不可用，跳过可观测性统计。`

### Step 1: Probe OTEL availability

```bash
# Check if runs directory has tool-duration logs
ls .forge/runs/*tool-durations*.jsonl 2>/dev/null
# Check if OTEL exporter is configured
echo "$OTEL_EXPORTER_OTLP_ENDPOINT"
```

If neither source exists → skip.

### Step 2: Extract statistics

From `.forge/runs/*tool-durations*.jsonl` (or OTEL spans if available):

| Metric | Source | Calculation |
|--------|--------|-------------|
| `observability.agent_depth` | `parent_agent_id` chain | Max depth from root agent to deepest leaf |
| `observability.top_tools` | `tool_name` field | Top-5 tools by invocation count |
| `observability.avg_duration_ms` | `duration_ms` field | Mean per tool, across all invocations |
| `observability.total_tokens` | OTEL resource or session metadata | Sum of input + output tokens (best-effort) |

### Step 3: Write to knowledge metadata

When generating knowledge documents under `.forge/knowledge/sessions/`, append an `## Observability` section:

```yaml
observability:
  agent_depth: <number>
  top_tools:
    - tool: <name>
      count: <number>
  avg_duration_ms: <number>
  total_tokens: <number|unknown>
  performance_bottlenecks:
    - tool: <name>
      duration_ms: <number>
      note: "exceeded 30s threshold"
```

### Step 4: Identify bottlenecks

Any tool invocation with `duration_ms > 30000` (30 seconds) is flagged as a **performance bottleneck**. Record in the session document with tool name, duration, and a brief note.

### Step 5: Skip logic

- No `.forge/runs/*tool-durations*.jsonl` → skip silently
- No `OTEL_EXPORTER_*` env vars → skip silently
- Empty JSONL files → skip silently
- **Never** block the main learn flow due to missing observability data

---

## §0.7b Understanding Confirmation（理解腐烂对策）

> **Spec: loop-engineering-adoption R3, design.md D7** — 对抗理解腐烂（Understanding Rot）。
> 论文 §07："循环交付你没写的代码越快，'实际存在的东西'和'你真正理解的东西'的差距就越大。"

### 触发条件

当 `/forge learn` 从 `.forge/runs/<id>/` 提取经验时（即有 loop 或 build run 产出），**且** `.forge/runs/<id>/commit-narrative.md` 存在，执行理解确认。

无 commit-narrative.md（手动 build 非 loop、或旧 run 无叙事）→ 跳过本节，不阻断 learn。

### 确认流程

1. **读 commit-narrative.md**，取出本次 run 的关键改动列表。
2. **向用户提示理解确认**：

   ```
   🧠 理解确认（对抗理解腐烂）
   本次 run 产出了 N 个改动。请用一句话复述任意一条改动的"为什么这么改"。
   （如果复述不出，说明你的理解地图可能落后于代码现状，需要更新。）
   ```

3. **判定**：
   - 用户复述出至少一条 → 标记 `understanding: confirmed`，继续 learn 流程。
   - 用户复述不出 / 表示不确定 → 标记 `understanding: map-needs-update`，在 session 文档写入 `⚠️ 理解地图需更新：本次 run 的改动尚未被完全理解，建议逐条核对 commit-narrative.md`。

### 语义

理解确认**不阻断** learn 的知识提取（那部分照常进行）。它的唯一目的是：在 loop 跑顺、人可能"认知投降"时，强迫人停下来确认自己还跟得上。这是一个 safety valve，不是 gate。

### AFK 模式

`/forge learn` 在 autonomous / AFK 模式下（无人交互）→ 跳过确认交互，只在 session 文档写 `understanding: unverified(afk)`，不阻断。

---

## §0.8 Gate Feedback Analysis (Reframing / Clarification Logs)

> **Precondition**: Gate logs exist in `.forge/progress/` as `*-reframing.jsonl` or `*-clarification.jsonl`.
> If no gate logs exist, **skip this entire section** with a single-line note: `⏭️ 无 Gate 反馈日志，跳过 Gate 分析。`

### Step 1: Scan Gate logs

```bash
# Find all gate log files
ls .forge/progress/*-reframing.jsonl .forge/progress/*-clarification.jsonl 2>/dev/null
```

If no files found → skip.

### Step 2: Aggregate statistics per question dimension

For each gate log entry (NDJSON, one JSON object per line), aggregate by question dimension:

| Field | Source | Calculation |
|-------|--------|-------------|
| `questions_asked` | `questions_asked` field | Sum across all entries |
| `questions_answered` | `questions_answered` field | Sum across all entries |
| `questions_skipped` | `questions_skipped` field | Sum across all entries |
| `outcome_changed_ratio` | `outcome_changed` field | Count of `true` / total entries |

### Step 3: Identify high-impact dimensions

WHEN a question dimension meets **both** conditions:
- `outcome_changed=true` ratio > 50%
- Sample count ≥ 3

Output a suggestion:
```
💡 问题维度 '{dimension}' 在 {N} 次使用中 {P}% 改变了结果。建议提升为 evolved-rule。
```

### Step 4: Propose evolved-rule

#### TDD-Driven Rule Generation

当 knowledge entries 达到阈值（≥3 次同类错误）时，执行以下 TDD 流程：

**Phase 1: RED — 验证问题存在**
1. 从 knowledge entries 中提取错误模式
2. 构造一个**最小复现场景**（<200 词 prompt），描述一个任务：
   - 正确执行需要遵守目标规则
   - 但 prompt 中不提及该规则
3. 在**不加载**目标 evolved-rule 的条件下，派发 subagent 执行
4. 记录 baseline 行为：是否违反？借口是什么？哪些压力条件触发？

如果 subagent 没有违反 → 问题不存在或已被其他规则覆盖，**不生成** evolved rule。

**Phase 2: GREEN — 写最小规则**
基于 Phase 1 的具体违反行为写最小化 evolved rule。Rule 必须直接反驳 Phase 1 中记录的借口。

**Phase 3: REFACTOR — 关闭漏洞**
1. 在**加载**新 evolved-rule 的条件下，重跑 Phase 1 场景
2. 检查 subagent 是否遵守规则
3. 找到新逃避方式 → 更新 rule，追加反驳
4. 连续 2 次运行无违反 → rule 上线

**铁律**：没有完成 Phase 1（RED）验证 → 不写 evolved rule。没有完成 Phase 3（REFACTOR）验证 → 不上线 evolved rule。

#### Fallback: Threshold-Only

当 TDD 流程不可用（非交互模式 / subagent 不可用）时，回退到原有的统计阈值触发模式。Threshold-only 规则的 Confidence SHALL ≤ 0.6。

For each high-impact dimension:
1. Follow §5.2 Self-Evolution Protocol (Propose → Declare → Approve → Log)
2. Proposed rule format: `gate-dimension-{dimension}-high-impact`
3. Rule content: trigger condition and recommended question for that dimension
4. WHEN user rejects → record rejection reason in session log

#### Skill/Instructions 变更验证

修改任何 `skills/forge/lib/*/instructions.md` 或 `.claude/agents/*.md` 后，必须执行：

1. **识别变更意图**：这次修改想让 agent 做什么不同的事？
2. **构造验证场景**：写一个简短 prompt，让 agent 执行需要新行为的任务
3. **运行验证**：带修改运行，检查 agent 行为是否如预期改变
4. **记录结果**：在 `.forge/knowledge/skill-feedback.md` 中记录

**豁免条件**（commit message 注明 `[skip-skill-verify]`）：纯格式/排版修改、链接/路径修复、typo 修正、删除过时内容。

### Step 5: Write statistics summary

Write aggregated stats to `.forge/knowledge/sessions/<date>-gate-stats.md`:

```yaml
---
title: "Gate Feedback Statistics"
date: "YYYY-MM-DD"
type: gate-analysis
---
## Summary
- Total gate sessions: <count>
- Total questions asked: <count>
- Total questions answered: <count>
- Total questions skipped: <count>
- Overall outcome_changed rate: <percentage>%

## Per-Dimension Breakdown
| Dimension | Asked | Answered | Skipped | Outcome Changed % |
|-----------|-------|----------|---------|-------------------|
| ... | ... | ... | ... | ... |
```

### Step 6: Skip logic

- No `*-reframing.jsonl` or `*-clarification.jsonl` → skip silently
- Empty JSONL files → skip silently
- **Never** block the main learn flow due to missing gate logs

---

## §0.9 Deferred Decisions Sweep (`forge:defer` 回收)

> **Precondition**: 本次 build 产出了代码变更（非纯文档/配置任务）。
> 若本次 learn 无 build run（如手动知识整理、`--from-chats`），跳过本节。

### Step 1: 定位本次 build 涉及的文件

从 `.forge/runs/<id>/commit-narrative.md` 或 `.forge/progress/<topic>.md` 取本次 build 改动的文件列表。若两者都没有，用 `git diff <base>...HEAD --name-only`。

### Step 2: grep `forge:defer` 注释

```bash
git diff <base>...HEAD -z --name-only | xargs -0 grep -n "forge:defer"
```

（`-z`/`-0` 处理含空格/特殊字符的文件名，防 shell 拼接注入。）

解析每条命中，提取三段：`<ceiling>, upgrade when <trigger> / <path>`。

### Step 3: 写入台账（含脱敏）

把解析结果追加到 `.forge/knowledge/deferred.md` 的台账表：

| 日期 | Feature | 文件:行 | Ceiling | 升级触发 | 升级路径 |

日期用本次 learn 的 UTC 日期；Feature 从 `.forge/status.md` 当前 topic 取。

**脱敏规则（强制，写入前逐条检查）**：deferred.md 受 git 跟踪并可能推送远端，`forge:defer` 的三段内容（尤其 `<path>`）必须脱敏：
- **凭据/密钥**：命中以下模式之一 → 拒绝写入该条，输出 `⚠️ defer entry at <file>:<line> contains疑似凭据，已跳过台账`：
  - 固定前缀 token：`AKIA[0-9A-Z]{16}`（AWS）、`xox[bpas]-`（Slack）、`gh[posur]_[A-Za-z0-9]{36}`（GitHub PAT）、`glpat-`（GitLab）、`sk_live_`/`rk_live_`（Stripe）、`Bearer `、`eyJ`（JWT 起始）。
  - PEM 块：`-----BEGIN`。
  - 长 hex/base64 串（≥32 字符的连续 `[0-9a-fA-F]` 或 base64）。
  - 赋值式：`password=`、`token=`、`secret=`、`api_key=`、`apikey=`。
- **内网/私有地址**：`<path>` 若是 URL，只允许公开 issue tracker（`github.com`/`gitlab.com`/公共域）；私有 host（`internal.*`/`10.*`/`192.168.*`/`*.local`/`*.corp`）/ 内部仓库路径 → 替换为 `<private-ref>` 占位。
- **绝对路径**：转为仓库相对路径（`<absolute>/src/...` → `src/...`）。
- **markdown 转义**：三段内容含 `|` 或换行 → 转义为 `\|` / `<br>`，防破坏表格。

### Step 4: 置信度降级

对每条新增条目检查 `<trigger>` 是否可量化（QPS / 用户数 / 延迟 / 数据量等具体阈值）：
- **可量化** → 该条目保留，confidence 0.5。
- **模糊**（"以后需要时" / "量大时" / 无阈值）→ 在台账行的升级触发列标注 `⚠️ fuzzy`，confidence 设 0.2。后续由 `maintainKnowledgeBase`（见 G4 Pattern Lifecycle Management）按 confidence < 0.3 自动清理。

### Step 5: Skip 逻辑

- 本次 build 无代码变更 → skip
- grep 无 `forge:defer` 命中 → 输出一行 `⏭️ 本次 build 无延迟决策标记。` 并 skip
- **绝不**因 deferred.md 不存在而阻断 learn 流程（首次运行时创建）

---

## Goals

### G1: Execution Quality Assessment
Produce a structured analysis of this session's execution quality across four dimensions (First-pass Rate, Plan Accuracy, Review Interception Rate, Debug Trigger Rate). Improvement signals feed directly into knowledge extraction.

### G2: Five-Dimension Knowledge Extraction
Extract actionable knowledge across all five dimensions: Problem Pattern, Solution, Pitfall Record, Decision Rationale, Reusable Pattern. Each dimension must be covered — no omissions.

### G3: Knowledge Document Generation
Produce properly formatted knowledge documents with correct YAML frontmatter and five-section body. Documents must follow the exact format spec. Internally calls `generateKnowledgeDocument(extraction, template)` to render the document body and `validateKnowledgeFrontmatter(frontmatter)` to enforce required fields (title, tags, date, confidence range 0.3–0.9). Context budget snapshots are serialized via `serializeContextBudgetReport(report)` for session logs.

### G4: Pattern Lifecycle Management
Identify high-frequency patterns, promote them to instincts when thresholds are met, manage pattern staleness and decay, and distill error-prevention rules from accumulated data. Core lifecycle functions: `maintainKnowledgeBase(kb, config)` enforces the 20-document cap and auto-cleans confidence < 0.3 entries; `findStaleOrDecayedPatterns(kb)` detects patterns with outdated confidence or zero recent adoption; `archivePatternByName(name)` moves a superseded pattern to archive; `buildPatternUpgradeDrafts(patterns)` generates proposed upgrades for high-confidence patterns; `proposeStaleTerms(glossary, sessionData)` identifies glossary terms no longer in active use.

### G5: Knowledge Base Health
Maintain the knowledge base within configured limits, enforce confidence thresholds, merge overlapping entries, and ensure maintenance invariants hold at all times. Run integrity lint (cross-file reference validation, orphan detection, contradiction detection) and regenerate the Layer A catalog index. Solutions 写入完成后，hooks.json PostToolUse 自动触发 integrity lint（`scripts/knowledge-hook-dispatch.mjs`），findings 写入 `.forge/findings/integrity-<timestamp>.md`。

### G6: Knowledge Backflow Wiring
Ensure knowledge flows back into plan, build, and debug phases. Track adoption and adjust confidence accordingly. Record failure patterns.

### G7: SKILL Feedback Detection
Detect scenarios where SKILL.md guidance was inapplicable. Record for review but never auto-modify SKILL.md.

### G8: Session Epilogue
Produce a session episode, run evolution aggregation, archive task artifacts, and update status. Episode generation calls `buildEpisodeFromSession(sessionData)` to produce the ≤20-line session episode document. Prompt configuration is loaded via `getLearnPromptConfig(config)` which returns dimension-specific extraction prompts.

### G9: 规则蒸馏 (Rule Distillation)
Distill error-prevention rules from accumulated knowledge entries when confidence and frequency thresholds are met. Proposed rules follow the Evolved Rules protocol (`.forge/knowledge/evolved-rules.md`). 内部使用 `runGlossaryCheck({ phase: 'learn' })` 检测术语冲突。 Evolution report is produced by `generateEvolutionReport(evolutions, rules)` and rendered for user review via `renderEvolutionReport(report)`. Term lifecycle is managed by `extractSessionTermCandidates(sessionData)` for candidate discovery, `mergeTerm(target, source)` for deduplication, and `archiveTerm(name)` for retirement.

### G10: Gate Feedback Analysis
Analyze Reframing Gate and Clarification Gate feedback logs (`.forge/progress/*-reframing.jsonl` and `*-clarification.jsonl`) to identify high-value question patterns. When a question dimension shows `outcome_changed=true` in > 50% of cases with ≥ 3 samples, propose it as an evolved-rule via §5.2 Self-Evolution Protocol.

---

## Constraints

### Knowledge Documents
- Every knowledge document must have YAML frontmatter with title, tags, date, confidence (range 0.3–0.9)
- Body must contain five sections: Problem Pattern, Solution, Pitfall Record, Decision Rationale, Reusable Pattern
- Output path: `.forge/knowledge/solutions/<topic>.md` (kebab-case)
- Tags overlap ≥ 50% with existing document → merge, do not create new
- When `.forge/charter.md` exists AND `status: active`: check if new knowledge relates to charter boundary or invariant. If so, add `charter_refs: [INV-NNN]` to frontmatter

## Dual-Track Knowledge System

Knowledge documents follow one of two tracks based on the trigger source. The track is automatically selected:

### Track Selection Logic

| Trigger Source | Track |
|----------------|-------|
| `/forge debug` fix OR review P0/P1 bug finding | **Bug Track** |
| Architecture decision, design pattern, tooling choice | **Knowledge Track** |
| Cannot determine | **Knowledge Track** (default) |

### Bug Track Template

For bug-fixing knowledge. Frontmatter includes `track: bug` and `problem_type` enum.

**Frontmatter fields**:
```yaml
---
name: <kebab-case-slug>
track: bug
problem_type: build_error | test_failure | runtime_error | performance_issue | security_issue | logic_error
component: <string>
root_cause: logic_error | race_condition | off_by_one | null_propagation | state_corruption | assumption_violation | external_dependency
confidence: 0.3-0.9
created: YYYY-MM-DD
updated: YYYY-MM-DD
changelog:
  - date: YYYY-MM-DD
    action: created
    summary: <string>
---
```

**Body sections**:
1. `## Problem` — 1–3 sentence description
2. `## Symptoms` — Observable symptoms list
3. `## What Didn't Work` — Approaches tried but failed
4. `## Solution` — Final working solution
5. `## Why This Works` — Why this solution is effective
6. `## Prevention` — Rules to prevent recurrence

### Knowledge Track Template

For architecture/design/tooling decisions. Frontmatter includes `track: knowledge` and `problem_type` enum.

**Frontmatter fields**:
```yaml
---
name: <kebab-case-slug>
track: knowledge
problem_type: architecture_pattern | design_pattern | tooling_decision | convention | best_practice
component: <string>
confidence: 0.3-0.9
created: YYYY-MM-DD
updated: YYYY-MM-DD
changelog:
  - date: YYYY-MM-DD
    action: created
    summary: <string>
---
```

**Body sections**:
1. `## Context` — Decision background (why needed)
2. `## Guidance` — Specific instructions (what to do, how)
3. `## Why This Matters` — Importance explanation
4. `## When to Apply` — Applicable scenarios
5. `## Examples` — Code examples or references

### Compatibility

Dual-track templates are a **structured superset** of the existing 5-dimension extraction. The five dimensions (Problem Pattern, Solution, Pitfall Record, Decision Rationale, Reusable Pattern) map to dual-track fields:
- Problem Pattern → Bug: Problem + Symptoms | Knowledge: Context
- Solution → Bug: Solution | Knowledge: Guidance
- Pitfall Record → Bug: What Didn't Work | Knowledge: Why This Matters
- Decision Rationale → Bug: Why This Works | Knowledge: When to Apply
- Reusable Pattern → Bug: Prevention | Knowledge: Examples

Existing 5-dimension documents remain valid. Only newly created documents use dual-track format.

## Dual-Track Knowledge System

Knowledge documents follow one of two tracks based on the trigger source. The track is automatically selected:

### Track Selection Logic

| Trigger Source | Track |
|----------------|-------|
| `/forge debug` fix OR review P0/P1 bug finding | **Bug Track** |
| Architecture decision, design pattern, tooling choice | **Knowledge Track** |
| Cannot determine | **Knowledge Track** (default) |

### Bug Track Template

For bug-fixing knowledge. Frontmatter includes `track: bug` and `problem_type` enum.

**Frontmatter fields**:
```yaml
---
name: <kebab-case-slug>
track: bug
problem_type: build_error | test_failure | runtime_error | performance_issue | security_issue | logic_error
component: <string>
root_cause: logic_error | race_condition | off_by_one | null_propagation | state_corruption | assumption_violation | external_dependency
confidence: 0.3-0.9
created: YYYY-MM-DD
updated: YYYY-MM-DD
changelog:
  - date: YYYY-MM-DD
    action: created
    summary: <string>
---
```

**Body sections**:
1. `## Problem` — 1–3 sentence description
2. `## Symptoms` — Observable symptoms list
3. `## What Didn't Work` — Approaches tried but failed
4. `## Solution` — Final working solution
5. `## Why This Works` — Why this solution is effective
6. `## Prevention` — Rules to prevent recurrence

### Knowledge Track Template

For architecture/design/tooling decisions. Frontmatter includes `track: knowledge` and `problem_type` enum.

**Frontmatter fields**:
```yaml
---
name: <kebab-case-slug>
track: knowledge
problem_type: architecture_pattern | design_pattern | tooling_decision | convention | best_practice
component: <string>
confidence: 0.3-0.9
created: YYYY-MM-DD
updated: YYYY-MM-DD
changelog:
  - date: YYYY-MM-DD
    action: created
    summary: <string>
---
```

**Body sections**:
1. `## Context` — Decision background (why needed)
2. `## Guidance` — Specific instructions (what to do, how)
3. `## Why This Matters` — Importance explanation
4. `## When to Apply` — Applicable scenarios
5. `## Examples` — Code examples or references

### Compatibility

Dual-track templates are a **structured superset** of the existing 5-dimension extraction. The five dimensions (Problem Pattern, Solution, Pitfall Record, Decision Rationale, Reusable Pattern) map to dual-track fields:
- Problem Pattern → Bug: Problem + Symptoms | Knowledge: Context
- Solution → Bug: Solution | Knowledge: Guidance
- Pitfall Record → Bug: What Didn't Work | Knowledge: Why This Matters
- Decision Rationale → Bug: Why This Works | Knowledge: When to Apply
- Reusable Pattern → Bug: Prevention | Knowledge: Examples

Existing 5-dimension documents remain valid. Only newly created documents use dual-track format.

### instincts.md
- Pattern must appear in 2+ knowledge documents with confidence ≥ 0.5 to be promoted
- Every pattern entry must include Confidence_Score in 0.3–0.9 range
- Patterns with confidence ≥ 0.8 and no tech-stack dependency → suggest promotion to `patterns/`

### Knowledge Base Limits
- `solutions/` capped at 20 documents (configurable via `knowledge_limit` in `config.md`)
- Confidence_Score < 0.3 patterns are automatically deleted
- Invariant: document count ≤ limit ∧ no low-confidence patterns

#### Near-Limit Pre-Write Check (R4)
Before writing a new `solutions/<topic>.md`, count existing documents and emit a near-limit warning when the base reaches 90% of `knowledge_limit`:
```
threshold = ceil(knowledge_limit * 0.9)   # default 0.9 → 18/20
count = glob('.forge/knowledge/solutions/*.md').length
if count >= threshold:
    emit "[knowledge-near-limit] 知识库逼近上限: 当前 {count}/{knowledge_limit} (阈值 {threshold})。建议执行清理 (Confidence<0.3 自动清理) 或提升 instincts,而非等超限被动清理。"
```
The warning is **advisory** (non-blocking) — the write still proceeds. Pure logic lives in `src/knowledge-quota.ts` (`checkKnowledgeNearLimit`); this step performs the file count and renders its decision. When `count < threshold`, emit nothing (zero noise).

### Error-Prevention Rules (evolved-rules.md)
- Maximum 15 rules
- Only add rules where absence would cause Claude to err — not a knowledge dump
- Written to `.forge/knowledge/evolved-rules.md`, injected via SessionStart hook

### Backflow Confidence Adjustment
- Knowledge adopted: confidence +0.05 (cap 0.9)
- Knowledge found ineffective: confidence -0.1 (floor 0.3)
- Failure pattern appearing 2+ times → write to `.forge/knowledge/known-failures.md`

### SKILL Feedback
- Record to `.forge/knowledge/skill-feedback.md`
- Same feedback category ≥ 3 occurrences → remind user to review
- Never auto-modify SKILL.md

### Execution Quality
- Four dimensions: First-pass Rate, Plan Accuracy, Review Interception Rate, Debug Trigger Rate
- Results append to `.forge/knowledge/metrics.md`
- Improvement signals must feed into five-dimension extraction

### Session Episode
- Write `sessions/<date>-<topic>.md` (≤20 lines)
- Task artifacts archived to `.forge/archive/<date>-<topic>/`
- Do not archive knowledge/ or config.md

### Compaction Recovery
- If resuming from a conversation summary: re-read this SKILL.md in full, verify all five dimensions are covered, verify document format correctness, then resume from interruption point

---

## Output Format

### Knowledge Document Template

```yaml
---
title: "<知识标题>"
tags: ["tag1", "tag2"]
date: "YYYY-MM-DD"
confidence: 0.85
---
```

### Execution Flow Reference

The full 21-step execution flow and task archival details are in references/knowledge-format.md §9.

### Reference Documents

| Topic | Reference |
|-------|-----------|
| Quality analysis (data sources, dimension calculation, output format, `analyzeSkillFeedback` / `crossValidateFailures`) | references/quality-analysis.md |
| Five dimensions (dimension table, data sources, function signatures, Confidence Score Rules, layered architecture) | references/five-dimensions.md |
| SKILL feedback | references/skill-feedback.md |
| Knowledge format §5 (complete template and field descriptions) | references/knowledge-format.md |
| Rule distillation (data sources, distillation algorithm, thresholds, exclusions, conflict detection, capacity, staleness, approval & write) | references/rule-distillation.md |
| Maintenance invariants | references/maintenance-invariants.md |
| Knowledge backflow | references/knowledge-backflow.md |
| Knowledge integrity lint (`lintKnowledgeIntegrity`: reference validation, orphan detection, contradiction detection) | `src/knowledge-integrity.ts` |
| Knowledge catalog (`buildCatalog`: Layer A progressive index generation) | `src/knowledge-catalog.ts` |
| Examples | references/examples.md |

---

## Workflow Dispatch (R1)

When user triggers `/forge learn`, follow this dispatch protocol:

### Dispatch Protocol

1. **Probe workflow eligibility** (same 5 conditions):
   - `process.env.CLAUDE_CODE_WORKFLOWS === '1'`
   - `mode === 'interactive'`
   - `${CLAUDE_PLUGIN_ROOT}/workflows/learn.js` exists (future: when available)
   - `node --check` passes
   - Concurrency bridge reachable

2. **If all 5 pass → attempt L0**:
   ```
   import { createAuditWriter } from './workflow-audit-factory.js';
   const auditWriter = createAuditWriter(forgeRoot);
   WorkflowDispatcher.dispatch(ctx, { tryL0, runFallback, auditWriter })
   ```
   Dispatcher auto-fills 14 fields, writes `dispatch.jsonl` + updates `status.md`.

3. **If any fails → L1**: existing subagent knowledge extraction path. Dispatcher records `chosen_level: L1`.

4. **Dispatch record always written** (14 fields, handled by dispatcher).
5. **Status always updated** (3 dispatch fields in status.md, handled by dispatcher).
6. **No confirmation prompts** between dispatch and execution.

### Reference

- Fallback ladder: `@.claude/rules/workflow-fallback-ladder.md`
- Dispatcher: `src/forge/agents-dispatcher.ts`

## Edge Cases

| Scenario | Handling |
|----------|----------|
| 首次执行（空知识库） | 创建 solutions/ 和 instincts.md，输出提示 |
| 无可提取知识 | 提示本次较简单，未识别到新知识 |
| 知识库已满 | 新文档 confidence 高于最低文档时提示替换确认 |
| 无 `.forge/` 目录 | 提示先运行 `/forge init` |
| 无 Gate 日志 | 跳过 Gate 分析，不影响主流程 |
| Gate 日志格式异常 | 跳过异常条目，记录警告到 session 日志 |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "这次开发没什么值得记录的" | 每次开发都有值得记录的经验。"没什么特别的"本身就是一个信号——说明你没有深入反思 |
| "知识沉淀是额外开销" | 不沉淀的经验等于没有发生过。下次遇到同样问题时你会从零开始 |
| "代码本身就是文档" | 代码记录了"做了什么"，不记录"为什么这样做"和"试过什么不行" |

## Gotchas
- **Generic lessons**: "Be careful with types" → not actionable → lessons must include specific code pattern and trigger condition
- **Duplicate knowledge**: Same lesson recorded across sessions → knowledge base bloat → check existing entries before adding
- **Missing context**: Lesson recorded without the "why" → future sessions can't judge applicability → always include trigger condition and confidence score

## Saved Workflow Backend

Forge learn may use a saved workflow backend for parallel five-dimension extraction when workflows are enabled. The saved workflow is an optional L0 backend; fallback remains the existing subagent/single-agent learn flow.

## Periodic Cron Install（regenerative-checkpoint R5/D7）

`/forge learn` 支持 opt-in 定时触发 `--deep` 收敛：

```
/forge learn --install     # 安装 cron 定时触发（用 config 的 learn.cron 表达式）
/forge learn --uninstall   # 卸载定时触发
/forge learn --status      # 显示上次收敛时间 + 知识库健康度
```

**`--install` 流程**（调用 `buildCronInstallSpec` from `src/loop/install-cron-skill.ts`）：

1. 读 `.forge/config.md` 的 `learn:` 块（`enabled` / `cron` / `interval_days`），用 `resolveCronConfig` 解析（默认 `enabled: false` / `cron: "0 9 * * 1"` / `interval_days: 7`）。
2. 若 `enabled: false` → 输出指引（"在 .forge/config.md 设 learn.enabled: true 后重试 --install"），**不阻断**手动 `/forge learn --deep`。
3. 用 `validateCronExpression` 校验 cron 表达式。
4. 用 `buildCronInstallSpec({ skillName: "learn", cron, prompt: "/forge learn --deep" })` 生成 CronCreate 调用约定。
5. 调用 CC 的 `CronCreate` 工具安装定时触发。

**`--uninstall`**：移除已安装的 cron（label: `forge-learn`）。

**`--status`**：读 `.forge/state/last-learn-at`（上次 --deep 时间）+ 知识库行数/字节健康度。

⚠️ **硬限制**：本地 cron 需 Claude Code 进程活着——机器关了、CC 退了就漏触发。不承诺关机运行（对齐 loop-engineering-adoption AC8）。
