---
name: "<agent-name>"
description: "<imperative-verb> what this agent does. Use when <trigger conditions>."
vibe: "<one-sentence behavioral anchor — 默认倾向与情绪基调>"
model: inherit
tools: Read, Glob, Grep
---

<!--
  AGENT-TEMPLATE.md — Forge subagent 人格定义模板(spec#3)。

  与 SKILL-TEMPLATE.md 的边界:
  - AGENT-TEMPLATE: 面向 subagent 人格(被 Task() spawn,有 Identity/Mission)。
  - SKILL-TEMPLATE: 面向 /forge <command> 工作流(有 Trigger/Workflow/Output path)。
  判据: 有 initialPrompt/被 spawn 的是 agent;有 Trigger/Output path 的是 skill。

  lint-agents.mjs 从本文件读取推荐 section 名(## 标题),校验 agents/ 源文件。
  修改本模板的 section 标题会联动 lint 校验项。
-->

# <Agent Name> — <角色一句话>

> **Role**: <角色定位>
> **Mode**: <工作模式,如 decide 团队成员 / review Layer X>
> **Output Limit**: ≤ <N> tokens

## Identity

<你是谁。角色、性格、经验、记忆倾向。>

- **Role**: <角色>
- **Personality**: <性格特质,2-3 个词>
- **Memory**: <记忆什么(若有 memory: project)>
- **Experience**: <经验背景,1 句>

## Mission

<核心职责。2-4 条可验证的使命。>

1. <职责 1>
2. <职责 2>
3. <职责 3>

## Critical Rules

<硬约束。内嵌相关 Forge 铁律(§编号 + 一句话落地),非全文复制。>

- §<宪法编号> <这条铁律对我意味着什么>。例:§3.1 执行评估分离 — 我只读不写,不评审自己参与编写的代码。
- §<宪法编号> <落地>。例:§2.3 验证铁律 — 判定"满足"前,我要求作者提供运行证据。
- <agent 特定约束>

## Deliverables

<产出物格式。结构化输出 schema 或模板。>

```markdown
### <产出标题>
**<字段 1>**: <值>
**<字段 2>**: <值>
**Conclusion**: <结论>
```

## Communication Style

<输出语调与风格。>

- <风格原则 1>
- <风格原则 2>

<!--
  说明:
  - vibe 字段(MAY,可选):一句话锚定行为基调,防 LLM 执行时偏离。
    关键 review/decide agent SHOULD 添加。
  - Critical Rules 的铁律引用用"§编号 + 落地"形式,正文唯一源在 AGENTS.md。
  - 轻量工具型 agent(explore/debugger)可精简 section(Identity/Mission 必备,
    Deliverables/Communication Style 可省),lint 为 WARN 不阻断。
-->
