---
feature: agency-borrow-04-i18n-governance
layout: design
created: 2026-06-23
spec_ref: ".forge/specs/agency-borrow-04-i18n-governance/requirements.md"
---

# 治理文档 i18n 策略 — 设计文档

## 概述

本 spec 为决策类,核心产出是"源语言选型"ADR 与文档规范化指引。设计文档列出候选方案与权衡,供用户在 ExitPlanMode/AskUserQuestion 时决策。

## 设计决策

### D1: 源语言候选方案(需用户拍板)

- **问题**:治理文档以中文还是英文为源?
- **候选 A:中文为源**。
  - 依据:`AGENTS.md` 现状是中文,Forge 团队母语中文,宪法条款用中文表述更精准。
  - 代价:国际化贡献门槛高;`.claude/agents/*.md` 现有英文 description 需翻译回中文。
- **候选 B:英文为源**。
  - 依据:技术项目国际惯例;agent description 现多为英文;便于海外社区参与。
  - 代价(已量化,供决策):`AGENTS.md` 约 145 行 + `CONTRIBUTING.md`(约 330 行)+ `CLAUDE.md` + `SECURITY.md` 需翻译为英文,合计估算约 800-1000 行翻译工作量;中文铁律表述的细微语义可能丢失;现有中文 agent 正文需明确"折衷保留"(R1.5/6)。
  - 折衷:若选 B,agent 正文(frontmatter 外)允许保留中文(见 R1.5/6),仅治理文档与 description 强制英文。
- **候选 C:双语并行(中文为权威,英文为镜像)**。
  - 依据:兼顾国内团队与国际社区;中文版是法律/铁律权威,英文版是导航/说明。
  - 代价:维护双份,需翻译契约(R2)约束。
- **选择**:待用户决策。本 spec 提供选项,不预设。

### D2: agent description 的连带处理

- **问题**:无论选哪种,agent description(spec #1 唯一源)都要统一。
- **选择**:跟随 D1 决策。若中文为源 → description 统一中文;若英文为源 → 统一英文;若双语 → description 用源语言,convert 不翻译。
- **理由**:description 是 frontmatter 元数据,统一语言利于 lint(spec #2)与检索一致性。

## 风险

| 风险 | 缓解 |
|------|------|
| 双语维护腐化(译文滞后) | R2 翻译契约:译文 header 标注源版本,CI 可加"译文日期晚于源"检查(可选,低优先级) |
| 决策拖延阻塞 spec #1 | 本 spec 标 light + 决策类,建议尽快定 ADR;spec #1 R4 可先用"以语义更完整者为准"临时规则 |
