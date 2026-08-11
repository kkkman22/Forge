---
feature: grill-integration-in-decide
layout: design
created: 2026-06-03
---

# Design Document: Grill 在 Decide 阶段的深度集成

## Overview

本功能增强 `/forge grill` 与 `/forge decide` 的集成，在 decide 的 Round 1 之前新增主动的 Round 0 Proactive Grill（条件触发），增强 product agent 的推荐答案行为，并扩展 Round 2a 的 inline grill 触发条件。

**灵感来源**：Matt Pocock `skills` 仓库的 `/grill-me` skill（一次一个问题 + 每个问题附推荐答案 + code-first resolution）。

**关键发现**：Forge **已经有** grill-in-decide 的基础——
- `/forge grill` 支持 inline mode（被 decide/spec 直接调用）
- decide §2 Round 2a 已有条件触发 inline grill（requirement-side disagreement 时）
- product agent 已有苏格拉底式提问和 6 个 Mandatory Questions

本功能不是从零构建，而是**增强现有集成**。

**修改范围**：
1. `skills/forge/lib/decide/instructions.md` — 新增 §2 Round 0 + 增强 Round 2a
2. `.claude/agents/product.md` — 追加推荐答案 + code-first resolution 行为

**设计原则**：
- Round 0 是可选的前置步骤，用户可跳过
- 不改变 `/forge grill` 独立 skill 的行为
- 不改变 grill 的决策树结构（5 类不变）
- 不改变 decide 的 Round 1/Round 2 核心流程

## Architecture

### 现有实现分析

**`decide/instructions.md` §2 Round 2a**（现有 inline grill 触发）：

```
Round 2 Critic 标记 disagreement_kind: "requirement_side" 时 → 触发 inline grill
```

这是一个**被动**触发——只有 Critic 发现问题才激活。

**`.claude/agents/product.md`**（现有 product agent）：

- 6 个 Mandatory Questions（Problem / Users / Success / Risk / MVP / Boundaries）
- "一次只问一个问题"
- "不给答案，只提问"
- 500 tokens 限制

**`grill/instructions.md`**（现有 grill skill）：

- 5 类决策树：functionality / boundary / dependency / assumption / non_goal
- Code-first Resolution（glossary lookup / explore 代替问用户）
- Inline mode（可被 decide/spec 直接调用）
- `extractNewGlossaryCandidates` 纯函数

**Gap**：

| 维度 | Forge 现有 | Matt 的 grill-me | Gap |
|------|-----------|-----------------|-----|
| 触发时机 | Round 2a 被动触发 | decide 前主动 grill | 无 Round 0 |
| 问题定制 | product 6 个固定问题 | 按具体任务生成决策树 | 固定 vs 定制 |
| 推荐答案 | "不给答案，只提问" | 每个问题附带推荐答案 | 缺少推荐 |
| Code-first | grill 有（explore 代替问） | "explore codebase instead" | product agent 没有 |

### 修改拓扑

```
skills/forge/lib/decide/instructions.md
  └── §2 Two-Round Subagent Execution
        ├── Round 0 — Proactive Grill（新增，条件触发）
        ├── Round 1 — Perspective Subagents（保留）
        ├── Round 2 — Critic Subagent（保留）
        └── Round 2a — Inline Grill Trigger（增强触发条件）

.claude/agents/product.md
  └── Behavioral Rules 追加 6, 7（推荐答案 + code-first）
```

## Components and Interfaces

### Component 1: Round 0 — Proactive Grill（条件触发）

在 decide/instructions.md §2 的 Round 1 之前插入。

**触发条件**（满足任一即触发）：
1. `tier === "full"` 且用户任务描述 ≤ 50 字（模糊描述）
2. 用户任务描述中存在 3+ 个 glossary 未定义的术语
3. 用户主动说 "grill me" / "帮我理清思路" / "再挖深点"
4. decide 首次运行（无历史 decision 文档）

**不触发**（跳过 Round 0，直接进入 Round 1）：
- `tier === "standard"` 或 `tier === "light"`
- 用户任务描述 ≥ 50 字且术语清晰
- 已有完整 grill findings（`.tinkerman/findings/grill-<topic>.md` 存在且 `isComplete` 为 true）

**触发后的行为**：

调用 `/forge grill` 的 inline mode（不 spawn 独立 skill），限制为 3-5 个核心问题（而非完整 5 类决策树），聚焦：
1. 要解决什么问题（functionality 类）
2. 边界在哪（boundary 类）
3. 有什么假设（assumption 类）

Round 0 完成后，将 grill findings 注入 Round 1 所有 subagent 的上下文，避免视角重复提问。

**用户控制**：Round 0 触发时输出：
```
🔍 需求描述较为模糊，建议先做 3-5 个快速澄清问题。跳过？[y/N]
```

**约束**：Round 0 每个问题限时 30 秒（interactive 模式），超时自动采用 AI 推荐答案。总 Round 0 时长 ≤ 5 分钟。

**与 §2.7 No Confirmation Between Steps 的关系**：Round 0 的 "跳过？[y/N]" 是 Round 0 唯一的用户交互点。一旦用户选择不跳过，后续 3-5 个问题连续执行不停顿。这符合 §2.7（"唯一可停"包括用户控制入口）。

### Component 2: product.md 推荐答案行为

在 Behavioral Rules 列表追加：

```markdown
6. **每个问题附带推荐答案**。格式：
   > Q: <问题>
   > 💡 推荐: <AI 给出的推荐答案>
   > 你同意吗？还是有不同的想法？

   推荐答案原则：
   - 具体到能看出你理解了问题（不是 "TBD"）
   - 中立——不替用户做只有用户能做的价值判断
   - 短——一到两句话
   - 如果推荐答案需要超过两句话，说明问题太宽，应该拆分
```

### Component 3: product.md code-first resolution

在 Behavioral Rules 列表追加：

```markdown
7. **如果问题可以通过探索代码库回答，探索代码库而非问用户**：
   - "现在的行为是什么？" → explore，不问
   - "新的行为应该是什么？" → 问用户
   - "术语 Y 已经定义了吗？" → glossary lookup，不问
   - "文件 Z 存在吗 / 导出什么？" → explore，不问
   当 explore 回答了问题，记录为推荐答案并标注 `[code-resolved]`，
   用户只需确认即可。
```

### Component 4: Round 2a 触发条件增强

现有 Round 2a 在 Critic 发现 `requirement_side` disagreement 时触发。增强触发条件：

```markdown
增强后的触发条件（满足任一即触发）：
1. （现有）Critic 标记 `disagreement_kind: "requirement_side"`
2. （新增）Round 1 所有视角输出中，术语使用不一致
   （≥2 个视角对同一概念用了不同术语）
3. （新增）Round 1 视角输出的核心结论存在直接矛盾
   （如 product 说 "必须支持离线" 但 architect 说 "需要实时网络"）
```

## Edge Cases

| 情况 | 处理 |
|------|------|
| 用户跳过 Round 0 | 直接进入 Round 1，无副作用 |
| Round 0 超时 | 超时问题自动采用 AI 推荐答案，继续下一个问题 |
| product agent 无法探索代码库（explore agent 不可用） | 退回提问用户 |
| Round 2a 新增触发条件与现有条件重复 | 去重：同一 contradiction 只触发一次 inline grill |
| Agent Teams 模式 | Round 0 在 forge-decide-lead 派发前执行，findings 注入各 teammate prompt |

## Out of Scope

- 不改变 `/forge grill` 独立 skill 的行为
- 不改变 grill 的决策树结构（5 类不变）
- 不改变 forge-decide-lead（Agent Teams 模式）
- 不引入新的 agent 类型
- 不改变 product agent 的 6 个 Mandatory Questions
