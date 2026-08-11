---
status: draft
feature: agency-borrow-03-agent-persona-template
layout: requirements
created: 2026-06-23
tier: light
---

# Agent 人格模板标准化 — 需求文档

## 背景

调研 [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) 后识别的第三个借鉴点(详见调研报告 §二.3)。

agency-agents 在 CONTRIBUTING.md 把 agent 写法**固化为强制结构**,并在 frontmatter 用 `vibe` 字段锚定行为基调。两个设计细节值得 Forge 学:
1. **标准化 section 结构**:`Identity / Core Mission / Critical Rules / Deliverables / Communication Style`——让每个 agent 自带"我是谁/做什么/不能违反什么"。
2. **`vibe` 字段 + "人格即防线"思想**:如 `reality-checker` 的 `vibe: "Defaults to NEEDS WORK"`,把"默认不通过"这种防线**具象成有性格的 agent**,比纯规则更易被 LLM 内化。

**Forge 现状**:Forge 已有 `templates/SKILL-TEMPLATE.md`,但**没有专门的 AGENT-TEMPLATE**;agent 的铁律(§3.1 不自我评审、§2.3 验证必须跑命令)散落在 AGENTS.md 顶层,未内嵌到每个 review agent 的 Critical Rules。这导致 LLM 执行 review 时可能"知道规则但未内化"。

## 目标

1. 提供标准化的 agent 写作模板(AGENT-TEMPLATE.md),统一 agent 文件结构。
2. 引入 `vibe` 字段(可选),锚定 agent 行为基调。
3. 把 Forge 铁律内嵌到相关 agent 的 Critical Rules section,提升 LLM 内化度。
4. 与 spec #2 的 lint 协同——lint 校验模板 section 的存在。

## 术语

- **persona**:agent 的身份与性格定义(Identity + Communication Style)。
- **operations**:agent 的职责与工作流(Mission + Deliverables + Workflow)。
- **Critical Rules**:agent 不可违反的硬约束(内嵌铁律)。
- **vibe**:frontmatter 字段,一句话锚定 agent 的行为基调与情绪倾向。

## 需求

### Requirement 1: AGENT-TEMPLATE.md 模板

**User Story:** 作为 Forge 贡献者,我希望有一个标准模板指导我如何写一个新 agent,保证结构一致。

#### 验收标准

1. THE Forge SHALL 在 `templates/` 提供 `AGENT-TEMPLATE.md`,定义 agent 文件的标准结构。
2. THE 模板 SHALL 含以下 section(对齐 agency-agents 并适配 Forge):
   - `## Identity` — 角色与性格
   - `## Mission` — 核心职责
   - `## Critical Rules` — 硬约束(内嵌相关 Forge 铁律)
   - `## Deliverables` — 产出物格式
   - `## Communication Style` — 输出语调与风格
3. THE 模板 SHALL 在 frontmatter 示例中含可选 `vibe` 字段。
4. THE 模板 SHALL 与 `SKILL-TEMPLATE.md` 区分:AGENT-TEMPLATE 面向 subagent 人格,SKILL-TEMPLATE 面向 slash command 工作流。

### Requirement 2: vibe 字段引入

**User Story:** 作为 Forge 维护者,我希望关键 agent 有一句话定调,防止 LLM 执行时偏离行为基调。

#### 验收标准

1. THE 源 agent frontmatter(spec #1 的 `agents/`)MAY 含 `vibe` 字段(可选,不强制)。
2. THE `vibe` SHALL 是一句话描述,锚定 agent 的默认倾向(如 review agent 的 "默认怀疑,要求证据")。
3. THE convert 生成器(spec #1)SHALL 保留 `vibe` 到派生的 `.claude/agents/`(若该工具支持自定义 frontmatter)。
4. THE 以下关键 agent SHOULD 添加 `vibe`:
   - `spec-check`:`vibe: "对照 spec 逐条核验,缺证据即判未满足"`
   - `quality-check`:`vibe: "找真问题,不挑风格"`
   - `security-check`:`vibe: "默认假设有漏洞,要求证明安全"`
   - `forge-review`:`vibe: "写代码者不评审自己,三层独立"`

### Requirement 3: 铁律内嵌到 Critical Rules

**User Story:** 作为 Forge 用户,我希望 review/decide agent 把相关铁律写进自己的 Critical Rules,而非只依赖顶层 AGENTS.md。

#### 验收标准

1. THE `spec-check` / `quality-check` / `security-check` 的 Critical Rules SHALL 内嵌 §3.1 "写代码的 Agent 不评审自己的代码"。
2. THE `quality-check` / `security-check` 的 Critical Rules SHALL 内嵌 §2.3 "没有运行验证命令 = 不能声明通过"的精神(适用于 review 时要求作者提供证据)。
3. THE `forge-review` 的 Critical Rules SHALL 内嵌 §3.3 P0/P1 阻断规则。
4. THE 内嵌不重复铁律全文,而是引用 + 一句话落地(如 "§3.1: 我只读不写,不评审自己参与编写的代码")。

## 验收标准(整体)

- [ ] `templates/AGENT-TEMPLATE.md` 存在且含 5 个标准 section + `vibe` 示例。
- [ ] `spec-check`/`quality-check`/`security-check` 的 Critical Rules 含 §3.1 引用。
- [ ] `lint-agents`(spec #2)能校验标准 section 的存在(WARN)。
- [ ] 现有 review agent 添加 `vibe` 后,`/forge review` 行为不回归。

## 依赖

- spec `agency-borrow-01-unified-agent-source`:模板作用于唯一源 `agents/`。
- **被 spec #2 依赖**(单向):#2 的 lint 从本 spec 的 `templates/AGENT-TEMPLATE.md` 动态读取 section 名。本 spec 不反向依赖 #2,落地时序上 #3 先于 #2 完成 section 定义。

## 非目标

- **不**引入 agency-agents 的 `color`/`emoji` 装饰字段(见调研报告 §三)。
- **不**强制所有 agent 都写满 5 个 section——`explore`/`debugger` 等轻量工具型 agent 可精简(section 为 WARN 非 ERROR)。
- **不**改变 agent 的实际工作流逻辑,仅规范化表达载体。
- **不**把 SKILL 文档纳入本 spec 范围。
