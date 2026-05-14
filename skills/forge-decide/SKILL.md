---
name: forge-decide
description: "Decide through four-perspective Subagent deliberation covering product, architect, security, and designer viewpoints. Use when starting a full-tier task, facing irreversible technical choices, or needing threat modeling before implementation."
context: fork
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge decide — 决策引擎

> **触发方式**：全量路径第一步 / 用户输入 `/forge decide`
> **职责**：以两轮 Subagent 模式从产品、架构、安全、设计四个视角进行前置决策
> **Agent 模式**：两轮 Subagent（Round 1 并行视角评估，Round 2 Critic 交叉审查）

---

## 1. Overview

`/forge decide` 在编码开始前，从四个独立视角对任务进行系统性评估。三个核心视角（产品、架构、安全）始终参与，设计视角仅在任务涉及 UI 变更时动态加入。

每个视角由独立的 Subagent 承担，通过两轮 Subagent 模式协作，确保视角之间可以相互质疑和补充。

**核心原则**：先想清楚，再动手。决策阶段的投入远低于返工的代价。

**Not For**：轻量路径任务 / 需求已完全明确且无技术风险的变更

**Alternative**: Agent Teams mode (PoC) — 评估中，见 `skills/forge-decide-teams/SKILL.md` 和 `.kiro/specs/forge-decide-agent-teams/`

---

## 历史 ADR 提示 / Related ADRs

Skill 启动时先展示与当前任务最相关的历史 ADR，帮助用户感知已有决策、避免重复讨论、发现需要 `supersedes` 的旧决策。完整流程：

→ 详见 references/adr-output.md §历史 ADR 提示

---

## 2. Two-Round Subagent Execution

**Persona 覆盖**：用户可在 `.claude/agents/` 下定义同名文件（product.md、architect.md、security.md、designer.md）覆盖默认决策标准。用户定义优先于 Forge 默认。

使用 Agent tool 独立启动视角 Subagent，无需创建 Agent Team。

### Round 1 — Perspective Subagents (Parallel Launch)

**Default Members** (3, always participate):

| Subagent Name | Definition File | Responsibility |
|---------|--------------|------|
| product | `.claude/agents/product.md` | Product perspective — Socratic questioning |
| architect | `.claude/agents/architect.md` | Architecture perspective — Technical solution evaluation |
| security | `.claude/agents/security.md` | Security perspective — OWASP + STRIDE |

**Dynamic Member** (Conditional trigger):

| Subagent Name | Definition File | Trigger Condition |
|---------|--------------|---------|
| designer | `.claude/agents/designer.md` | Joins when task involves UI changes |

**启动方式**：使用 Agent tool 同时启动 3 或 4 个独立 Subagent（含 UI 时加 designer），使用 `Promise.allSettled` 等待所有 Subagent 完成。**每个视角输出限制在 500 tokens 以内**。

**并发控制**：并行 Subagent 数量受 `.forge/config.md` 中 `max_parallel_agents`（默认 6）限制。收到 HTTP 429 时按降级策略减少并发数。详见 CLAUDE.md §6 Session Boundaries。

### Round 2 — Critic Subagent (Serial, launched after Round 1 completes)

收集 Round 1 所有视角输出，启动 Critic Subagent 审查所有视角输出，寻找盲点和矛盾。

**Critic 规则**：
- 必须在所有 Round 1 视角输出完毕后才能审查
- 如果发现阻塞性问题 → 标记 `needs_revision`，相关视角修正后重新输出
- 标记 `needs_revision` 时返回具体哪些视角需要修正以及理由

**容错机制**：Round 1 使用 `Promise.allSettled`，单个视角失败不阻断其他。失败的视角标注"评估失败"。如果所有 Round 1 Subagent 均失败，决策终止并向用户报告。

### 自动视角重置（Auto Zoom-Out）

当 decide 阶段出现以下信号时，自动触发 zoom-out 打破局部锁定：

**触发条件**（满足任一即触发）：
- Subagent 评估 ≥ 2 轮且未达共识（`consensus_score` 低于阈值）
- 用户连续 3 次表达犹豫（「再想想」/「不确定」/「都行」）

**触发流程**：
1. 调用 `shouldAutoTriggerZoomOut({ scenario: "decide", decideRounds, decideConsensusReached, decideUserHesitationCount, alreadyTriggered })`
2. `shouldTrigger: true` → autonomous 模式直接执行 zoom-out；interactive 模式提示「当前讨论似乎陷入局部，建议先退后一步看看整体位置。是否继续？」
3. zoom-out 输出通过 `formatAutoZoomOutInjection(output, "decide")` 包装后注入下一轮 Subagent 的 system context
4. 设置 `autoZoomOutTriggered.decide = true` 防止重复触发

**与 Critic 的关系**：auto zoom-out 在 Critic 标记 `needs_revision` 后、视角修正前触发。不替代 Critic 审查。

### Round 2a: Inline Grill Trigger (conditional)

After Round 2 Critic output:

1. If Critic flags `disagreement_kind: "requirement_side"`:
   - Call `shouldTriggerInlineGrill({ mode, reason: "decide_requirement_disagreement", alreadyTriggered })`
   - `trigger: true` (interactive): Render `renderInlineGrillConfirmPrompt("decide_requirement_disagreement")`, await user confirmation, run inline grill loop with subset of decision categories (functionality / boundary / non_goal only), inject via `formatInlineGrillInjection(result, "decide")` → re-run Round 1 for affected perspectives only
   - `trigger: false` (autonomous): Render `renderInlineGrillAdvisory("decide_requirement_disagreement")`, write advisory to decision document §否决记录
2. If user expresses hesitation 3 consecutive times + requirement_side disagreement detected:
   - **grill takes priority over zoom-out** (grill resolves root cause: unclear requirements)
3. If user expresses hesitation 3 consecutive times + only technical_side disagreement:
   - **zoom-out takes priority** (positional issue, not requirements)

**Constraints**:
- Technical-side disagreement does NOT trigger inline grill (handled by critic needs_revision)
- Frequency: at most once per session per reason

---

## 3. Four-Perspective Evaluation

四视角输出格式（product / architect / security / designer）、Glossary alignment check、UI 触发判定信号：

→ 详见 references/perspective-formats.md

---

## 4. Execution Flow

1. **Read context**: `.forge/config.md`, `.forge/decisions/`, `.forge/knowledge/instincts.md`
2. **Determine if design perspective is needed** (references/perspective-formats.md §3.4 trigger conditions)
3. **Round 1**: Launch 3 or 4 perspective Subagents in parallel, wait with `Promise.allSettled`
4. **Round 2**: Collect all perspective outputs, launch Critic cross-review. Blocking issues → tag `needs_revision`; passed → generate decision document
5. **Output decision document**: Write to `.forge/decisions/<date>-<topic>.md`
6. **人工确认后推进**：用户确认决策方向后调用 /forge spec（→ 详见 shared/next-step-protocol.md）

---

## 5. Decision Document Format

Output path: `.forge/decisions/<YYYY-MM-DD>-<topic>.md`。YAML frontmatter + 六章节（Product / Technical / Security / Design / ADR Criteria / Veto）。

→ 详见 references/decision-format.md（完整模板、Context Budget Management、函数签名）

---

## 6. Token Control

每个角色的输出**严格限制在 500 tokens 以内**。超出时截断并提示精简。

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "这个任务很简单不需要多视角决策" | 简单任务的安全评估可以结论为"无风险"，但过程不能省。安全视角不可跳过是铁律 |
| "我已经知道技术方案了" | 你知道的是一个方案。决策阶段的价值是评估你没想到的替代方案和风险 |
| "决策会拖慢进度" | 编码前 20 分钟的决策能避免编码后数天的重构 |

---

## 7. Edge Case Handling

| Condition | Handling |
|------|------|
| Security perspective asked to skip | 拒绝。⚠️ 安全评估不可跳过。结论可以是"无显著安全风险"，但过程不能省略 |
| Design perspective false trigger | 开发者可明确跳过，Round 1 不启动 designer |
| Conflicts between perspectives | 记录冲突点 → 呈现给开发者 → 开发者做最终决定 → 记录到否决记录 |
| No `.forge/` directory | ⚠️ 请先运行 forge init |

---

## 8. Examples

Backend-only (3 perspectives) 与 UI-involved (4 perspectives) 两种典型场景：

→ 详见 references/examples.md

---

## ADR 输出 / ADR Output

决策确认后，Skill 同时生成 `.forge/decisions/<date>-<topic>.md`（视角对话全文）与 `.forge/decisions/ADR-NNNN-<topic>.md`（可检索的架构决策记录），并更新 `.forge/knowledge/adr-index.md`。

→ 详见 references/adr-output.md（完整流程、FinalizeAdrInput 构造、supersession 更新）

---

## Context Budget Management

Mandatory token limits per perspective output (≤500 tokens). Structured outputs exempt.

**Trimmer 函数映射**：

| 概念名 | 函数调用 | 返回值用途 |
|--------|---------|-----------|
| Subagent_Summary_Protocol | `serializeSubagentSummary(subagentOutput)` | 替换 Subagent 原始返回为提取摘要（≤200 tokens） |

**Retention modes**: `Write-and-discard`（写入文件后丢弃 context 中的原始输出）; `Keep-in-context`（仅限 ≤200 tokens 的结构化输出保留）。

→ 详见 references/decision-format.md（完整 Context Budget 规则、Trimmer 签名）

## Gotchas
- **Groupthink**: All perspectives converge too quickly → blind spots → critic must challenge, not validate
- **Missing designer**: UI task without designer perspective → usability gaps → always include designer when task involves UI
- **Analysis paralysis**: Too many perspectives produce conflicting recommendations → no decision → timebox each perspective, force recommendation
- **Premature consensus**: Perspectives agree because they share same assumptions → hidden risks → each perspective must state assumptions explicitly
