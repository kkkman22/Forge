---
id: "ADR-0009"
title: "Governance Docs & Agent Metadata Source Language: Chinese"
status: "accepted"
date: "2026-06-23"
deciders:
  - "@king (Gruby.Wang)"
related_adrs: []
---

# ADR-0009: 治理文档与 Agent 元数据的源语言定为中文

## Context

调研 [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) 后(spec 包:`.tinkerman/specs/agency-borrow-*`),识别出 Forge 治理文档语言策略不统一:

- `AGENTS.md` 正文是中文为主;
- `.claude/agents/architect.md` 的 `description` 却是英文(`Use when evaluating...`);
- 呈现"文档单语、内容中英混杂"状态。

spec#1(`unified-agent-source`)的 R4 要求统一 agent `description` 语言,但需先确定源语言。本 ADR 是 spec#4(`i18n-governance`)的产出。

## Decision

**治理文档与 agent 元数据的源语言定为中文。**

具体作用域(分层,见 spec#4 R1.5/6):

| 层级 | 范围 | 约束 |
|------|------|------|
| 强制 | 治理文档(AGENTS/CONTRIBUTING/CLAUDE/SECURITY)全文 | 中文 |
| 强制 | agent frontmatter 元数据(`description`) | 中文 |
| 折衷 | agent 指令正文(frontmatter 外 Markdown) | 允许跟随开发语言,不强制统一 |

## Rationale

1. **现状对齐**:`AGENTS.md`(项目宪法,约 145 行)已是中文,宪法条款用中文表述更精准;Forge 团队母语中文。
2. **改动成本最低**:仅需把 `.claude/agents/` 与 `.codex/agents/` 里少数英文 `description` 改为中文(spec#1 R4 执行),无需翻译大段文档(对比:英文源需翻译 800-1000 行)。
3. **铁律语义保真**:Forge 的铁律(如 §2.3 验证铁律、§3.1 执行评估分离)用中文表述,翻译成英文可能丢失细微语义张力(如"铁律""宁重勿轻")。
4. **折衷区设计**:agent 指令正文允许混杂(接受现状),因为正文跟随代码演进、翻译维护成本高、且 LLM 对中英混合指令兼容。这避免了"全统一"的不现实目标。

## Alternatives Considered

- **英文为源**:技术项目国际惯例,利于海外社区。但翻译 AGENTS.md 等约 800-1000 行工作量大,且中文铁律语义有丢失风险。**否决**。
- **双语并行(中文权威+英文镜像)**:兼顾国内外,但需维护双份 + 翻译契约,当前社区规模不足以支撑此成本。**否决,未来国际化时再评估**。

## Consequences

- **正向**:agent `description` 可立即统一为中文(spec#1 R4 解锁);铁律语义保真;改动最小。
- **负向**:海外贡献者门槛略高(治理文档中文);未来若需英文版,需额外翻译工作。
- **中和**:agent 指令正文允许中英混杂,降低维护负担;代码注释、commit message 不在此 ADR 约束内(跟随既有惯例)。

## Backward Compatibility

- 现有中文治理文档:无变化。
- 现有英文 agent `description`:spec#1 实现时统一为中文(见 spec#1 Task 0.4)。
- 现有 agent 指令正文:不变(折衷区)。

## 影响的下游 spec

- **spec#1**(`agency-borrow-01-unified-agent-source`)R4:agent `description` 统一为中文。
- 本 ADR 关闭 spec#4 的决策需求。

## 参考

- spec#4: `.tinkerman/specs/agency-borrow-04-i18n-governance/requirements.md`
- spec#1: `.tinkerman/specs/agency-borrow-01-unified-agent-source/requirements.md` R4
- 调研报告: agency-agents 项目深度调研(会话历史)
