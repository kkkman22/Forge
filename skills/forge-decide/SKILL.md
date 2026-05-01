---
name: forge-decide
description: "四视角前置决策引擎。以两轮 Subagent 模式从产品、架构、安全、设计视角进行系统性评估。"
disable-model-invocation: true
---

# /forge decide — 决策引擎

> **触发方式**：全量路径的第一步，或用户直接输入 `/forge decide`
> **职责**：以两轮 Subagent 模式从产品、架构、安全、设计四个视角进行前置决策，在编码前明确问题边界、风险和技术方向
> **Agent 模式**：两轮 Subagent（Round 1 并行视角评估，Round 2 Critic 交叉审查）

---

## 1. Overview

`/forge decide` 在编码开始前，从四个独立视角对任务进行系统性评估。三个核心视角（产品、架构、安全）始终参与，设计视角仅在任务涉及 UI 变更时动态加入。

每个视角由独立的 Subagent 承担，通过两轮 Subagent 模式协作，确保视角之间可以相互质疑和补充。

**核心原则**：先想清楚，再动手。决策阶段的投入远低于返工的代价。

---

**Not For**：
- 轻量路径任务
- 需求已完全明确且无技术风险的变更

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

**Designer 条件触发**：仅当 `involvesUIChanges()` 返回 true 时加入。判定信号：任务描述提及前端/UI/页面/组件/样式、涉及的文件含 UI 扩展名（`.tsx`/`.jsx`/`.vue`/`.svelte`/`.css`）、任务涉及用户交互流程变更。不触发：纯后端 API、数据库变更、CI/CD、纯逻辑重构。

### Round 2 — Critic Subagent (Serial, launched after Round 1 completes)

收集 Round 1 所有视角输出，启动 Critic Subagent 审查所有视角输出，寻找盲点和矛盾。

**Critic 规则**：
- 必须在所有 Round 1 视角输出完毕后才能审查
- 如果发现阻塞性问题 → 标记 `needs_revision`，相关视角修正后重新输出
- 标记 `needs_revision` 时返回具体哪些视角需要修正以及理由

**容错机制**：Round 1 使用 `Promise.allSettled`，单个视角失败不阻断其他。失败的视角标注"评估失败"。如果所有 Round 1 Subagent 均失败，决策终止并向用户报告。

---

## 3. Four-Perspective Evaluation

**约束**：每个角色输出限制在 **500 tokens 以内**。安全视角**不可跳过**。各视角独立输出，但可以引用和质疑其他视角的结论。

### 3.1 Product Perspective (product.md)

以苏格拉底式提问厘清问题本质：问题定义、目标用户、成功标准。

**Behavior rules**: 一次只问一个问题，不给答案只提问，模糊回答则追问具体化。

**Output Format**:

```markdown
### Product Definition

**Problem**: <One-sentence description of the core problem to solve>
**Users**: <Target users and usage scenarios>
**Success Criteria**: - <Measurable criteria>
**Scope Boundaries**: <Explicitly what NOT to do>
```

### 3.2 Architecture Perspective (architect.md)

评估技术方案的合理性和风险：技术选型合理性、架构风险、扩展性、兼容性。

**Output Format**:

```markdown
### Technical Solution

**Tech Selection**: <Technology choice and rationale>
**Risks**: - <Risk>: <Impact> / <Mitigation>
**Scalability**: <Scalability assessment>
**Compatibility**: <Compatibility assessment with existing systems>
```

### 3.3 Security Perspective (security.md)

基于 OWASP Top 10 和 STRIDE 进行威胁建模。**此视角不可跳过**，即使任务看起来与安全无关。结论可以是"无显著安全风险"，但过程不能省略。

**Output Format**:

```markdown
### Security Assessment

**OWASP Check**: - <Relevant item>: <Risk level> — <Description>
**STRIDE Analysis**: - <Relevant threat>: <Description> / <Suggested measures>
**Conclusion**: <Overall security assessment conclusion>
```

### 3.4 Design Perspective (designer.md) — Conditional Trigger

评估 UI/UX 方面的可用性、可访问性和一致性。仅当 `involvesUIChanges()` 返回 true 时动态加入。

**Output Format**:

```markdown
### Design Assessment

**Usability**: <Assessment conclusion>
**Accessibility**: <WCAG-related recommendations>
**Consistency**: <Consistency assessment with existing design system>
**Recommendations**: - <Recommendation>
```

---

## 4. Execution Flow

1. **Read context**: `.forge/config.md`, `.forge/decisions/`, `.forge/knowledge/instincts.md`
2. **Determine if design perspective is needed** (§3.4 trigger conditions)
3. **Round 1**: Launch 3 or 4 perspective Subagents in parallel, wait with `Promise.allSettled`
4. **Round 2**: Collect all perspective outputs, launch Critic cross-review. Blocking issues → tag `needs_revision`; passed → generate decision document
5. **Output decision document**: Write to `.forge/decisions/<date>-<topic>.md`

---

## 5. Decision Document Format

Output path: `.forge/decisions/<YYYY-MM-DD>-<topic>.md`

```markdown
---
topic: "<Topic>"
date: "YYYY-MM-DD"
status: "confirmed"
---

## Product Definition
<Product perspective output>

## Technical Solution
<Architecture perspective output>

## Security Assessment
<Security perspective output>

## Design Assessment
<Design perspective output, included only when triggered>

## Veto Record
<Rejected proposals and reasons, write "None" when no vetoes>
```

---

## 6. Token Control

每个角色的输出**严格限制在 500 tokens 以内**。超出时截断并提示精简。

| Role | Limit |
|------|------|
| product | 500 tokens |
| architect | 500 tokens |
| security | 500 tokens |
| designer | 500 tokens |

---

## Context Budget Management

| Information Source | Pruning Strategy |
|--------|---------|
| Perspective Subagent output | Subagent_Summary_Protocol: Use only summaries for Round 2 input, ≤200 tokens/perspective |
| Final decision document | Write-and-discard: Write full decision to `.forge/decisions/<topic>.md`, keep only decision conclusions in context |

**Function call**: `serializeSubagentSummary(summary)`
- 参数：`summary` — Perspective Subagent original return value (needs to be parsed as `SubagentSummary` type)
- 返回：摘要字符串（≤200 tokens）
- 用途：Round 1 视角输出完成后调用此函数生成摘要，Round 2 输入时使用摘要替代原始输出，控制 context 增长

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

### Example 1: Backend-Only Task (Three Perspectives)

Task: "Add batch export functionality to the order system"

- **产品视角**：提问导出格式、数据量级、权限要求
- **架构视角**：评估大数据量导出方案（流式 vs 分页）、文件存储策略
- **安全视角**：检查权限控制、敏感字段脱敏、导出日志审计
- **设计视角**：不触发

Output: `.forge/decisions/2025-01-15-order-batch-export.md`

### Example 2: UI-Involved Task (Four Perspectives)

Task: "Redesign the user settings page"

- **产品视角**：提问设置项优先级、移动端适配需求
- **架构视角**：评估设置数据存储和同步方案、前后端接口设计
- **安全视角**：检查敏感设置修改流程安全性
- **设计视角**：**触发** — 评估页面布局、表单可用性、WCAG、设计系统一致性

Output: `.forge/decisions/2025-01-15-user-settings-redesign.md`
