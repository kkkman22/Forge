---
status: draft
feature: agency-borrow-04-i18n-governance
layout: requirements
created: 2026-06-23
tier: light
---

# 治理文档 i18n 策略 — 需求文档

## 背景

调研 [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) 后识别的第四个借鉴点(详见调研报告 §二.4)。

agency-agents 有 `CONTRIBUTING.md`(16K 英文)与 `CONTRIBUTING_zh-CN.md`(9.6K 中文)双语,且 `scripts/i18n` 目录管理翻译。

**Forge 现状(已核实)**:全单语——`AGENTS.md`/`CONTRIBUTING.md`/`CLAUDE.md`/`README.md` 均无中文版;但 `AGENTS.md` 正文是中文为主、`.claude/agents/architect.md` 的 description 却是英文,呈现**文档单语但内容中英混杂**的不一致状态。这正是 spec #1 R4"description 语言策略"的决策依赖项。

## 目标

1. 明确 Forge 治理文档(AGENTS.md/CONTRIBUTING.md 等)的源语言策略。
2. 决定是否提供中文版治理文档(供 spec #1 R4 与未来国际化参考)。
3. **分层消除不一致**:治理文档(AGENTS/CONTRIBUTING/CLAUDE/SECURITY)要求单语一致;agent 的 frontmatter 元数据(`description`)归入治理范畴需一致;agent 指令正文(frontmatter 外)是**显式折衷区**,接受跟随开发语言、不强制统一(详见非目标)。

## 术语

- **源语言(source language)**:治理文档的权威语言版本,其他语言由它翻译。
- **治理文档(governance docs)**:AGENTS.md / CONTRIBUTING.md / CLAUDE.md / SECURITY.md 等项目宪法与规范类文档(不含代码注释、commit message)。

## 需求

### Requirement 1: 源语言决策(需用户决策)

**User Story:** 作为 Forge 维护者,我希望明确治理文档以哪种语言为源,消除当前混杂。

#### 验收标准

1. THE Forge SHALL 确定治理文档的源语言(中文 or 英文),并记录决策于 ADR。
2. WHEN 源语言定为中文,THEN 现有英文片段(`.claude/agents/*.md` 的 description)SHALL 统一为中文。
3. WHEN 源语言定为英文,THEN `AGENTS.md` 等中文正文 SHALL 提供英文版,或明确"中文为源、英文待翻译"。
4. THE agent description(frontmatter 元数据)的语言 SHALL 遵循本决策,归入"治理范畴"需一致(供 spec #1 R4 落地)。
5. THE agent 指令正文(frontmatter 外的 Markdown 正文)SHALL **不**强制遵循本决策——正文是折衷区,接受跟随开发语言(详见非目标),这是显式接受而非目标失败。
6. THE 因此,"消除混杂"目标(目标 3)的作用域**限定**为:治理文档全文 + agent 的 frontmatter 元数据;**不含** agent 正文。即:若选英文源,治理文档与 agent description 统一英文,但 agent 正文允许保留中文(折衷),此状态视为目标达成。

### Requirement 2: 翻译契约(若提供双语)

**User Story:** 作为国际化贡献者,我希望有明确的翻译维护机制,避免译文与原文腐化。

#### 验收标准

1. IF Forge 提供双语治理文档,THEN SHALL 明确"源为准,译文跟版"的契约(译文 header 标注对应源版本/日期)。
2. IF 译文与源冲突,THE 源语言版本 SHALL 为准。
3. THE 翻译维护范围 SHALL 限定治理文档,不强制覆盖代码注释、commit message、agent 指令正文(那些跟随代码变更,翻译成本过高)。

## 验收标准(整体)

- [ ] 一份 ADR 记录源语言决策与理由。
- [ ] **治理文档**(AGENTS/CONTRIBUTING/CLAUDE/SECURITY)无"同文档中英混杂"(纯单语或双语对照)。
- [ ] **agent 的 frontmatter 元数据**(`description`)语言一致。
- [ ] **agent 指令正文**允许混杂(折衷区,不验收)。
- [ ] spec #1 R4 的 description 语言可依据本决策落地。

## 依赖

- 无技术依赖。本 spec 是决策类,产出为 ADR + 文档规范化。
- 下游依赖方:spec #1(`agency-borrow-01-unified-agent-source`)R4。

## 非目标

- **不**翻译 agent 指令正文(成本高、收益低,且 LLM 对中英混合指令兼容)。
- **不**翻译代码注释、commit message、CHANGELOG。
- **不**引入 i18n 自动化工具链(如 i18next)——治理文档是静态 markdown,手工或脚本同步即可。
- **不**在本 spec 内强制落地翻译(仅定策略,翻译是后续可选工作)。
