---
feature: agency-borrow-03-agent-persona-template
layout: design
created: 2026-06-23
spec_ref: ".forge/specs/agency-borrow-03-agent-persona-template/requirements.md"
---

# Agent 人格模板标准化 — 设计文档

## 概述

新增 `templates/AGENT-TEMPLATE.md`,定义 agent 文件的标准 section 结构与可选 `vibe` 字段;将 Forge 铁律以"引用 + 落地"方式内嵌到 review/decide agent 的 Critical Rules。属文档与 frontmatter 规范变更,无代码逻辑改动。

## 设计决策

### D1: AGENT-TEMPLATE 与 SKILL-TEMPLATE 的边界

- **问题**:Forge 已有 SKILL-TEMPLATE,新增 AGENT-TEMPLATE 会不会职责重叠?
- **选择**:明确分工——
  - **SKILL-TEMPLATE**:面向 `/forge <command>` 工作流,含 Prerequisites/Workflow/Deliverable,是"流程定义"。
  - **AGENT-TEMPLATE**:面向 subagent 人格,含 Identity/Mission/Critical Rules/Communication Style,是"角色定义"。
- **判据**:有 `initialPrompt`/被 `Task()` spawn 的是 agent,有 `Trigger`/`Output path` 的是 skill。两者可共存(一个 skill 编排多个 agent)。

### D2: 铁律内嵌的"引用 + 落地"形式

- **问题**:把铁律全文复制进每个 agent 会冗余且易腐化。
- **选择**:用 `§编号 + 一句话落地` 形式,而非全文复制。例如:
  ```markdown
  ## Critical Rules
  - §3.1 执行评估分离:我只读不写,不评审自己参与编写的代码。
  - §2.3 验证铁律:判定"满足"前,我要求作者提供运行证据。
  ```
- **理由**:引用保证单一真相源(铁律正文在 AGENTS.md),落地一句话让 LLM 知道"这条铁律对我意味着什么"。对齐 §2.6 输出简洁原则。

### D3: vibe 字段的约束力度

- **问题**:`vibe` 是强制还是可选?
- **选择**:**可选(MAY)**,仅关键 review/decide agent SHOULD 添加。
- **理由**:Forge agent 多为功能性 subagent,不是 agency-agents 那种"人格即产品"。强制 `vibe` 会增加无意义的形式负担。轻量工具型 agent(`explore`)不需要情绪定调。

## 接口设计

`templates/AGENT-TEMPLATE.md` 结构:
```markdown
---
name: <agent-name>
description: "<imperative> what this agent does. Use when <trigger>."
vibe: "<one-sentence behavioral anchor>"   # 可选
tools: Read, Grep, Glob
---

# <Agent Name> — <Role>

## Identity
- **Role**: ...
- **Personality**: ...

## Mission
<核心职责,2-4 条>

## Critical Rules
- §<宪法编号> <一句话落地>
- <agent 特定约束>

## Deliverables
<产出物格式>

## Communication Style
<输出语调>
```

## 风险

| 风险 | 缓解 |
|------|------|
| 现有 agent 改造工作量 | 仅 review/decide 关键 agent 改(R2/R3),轻量 agent 保持原样;分批进行 |
| vibe 字段被工具忽略 | vibe 是 Forge 自定义字段,Claude Code frontmatter 允许扩展字段;Codex TOML 则由 convert 决定是否保留(spec #1 R2.5) |
| 铁律内嵌与 AGENTS.md 顶层重复致维护双份 | D2 的"引用 + 落地"形式:正文只在 AGENTS.md,agent 内是引用指针 |
