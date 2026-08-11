---
feature: agency-borrow-04-i18n-governance
layout: tasks
created: 2026-06-23
spec_ref: ".tinkerman/specs/agency-borrow-04-i18n-governance/requirements.md"
---

# Tasks

## Task 1: 源语言决策 ADR

- [ ] 1.1 在 `.tinkerman/decisions/` 新建 ADR,记录 D1 三候选的权衡与最终选择
- [ ] 1.2 ADR 含:决策、理由、影响范围(治理文档 + agent description)、回溯条件

**Verify-By**: manual — ADR 存在且含决策结论
**关联需求**: R1

## Task 2: 文档规范化

- [ ] 2.1 依据 ADR 决策,统一治理文档语言(消除同文档中英混杂)
- [ ] 2.2 若选双语,创建 `AGENTS_zh-CN.md` 或 `AGENTS_en.md` 镜像,加翻译契约 header

**Verify-By**: bash — `grep -c '[一-龥]' AGENTS.md` 与决策一致(中文源则 >0,英文源则配合英文版)
**关联需求**: R1, R2

## Task 3: agent description 语言统一(衔接 spec #1)

- [ ] 3.1 依据 ADR,统一 `agents/*.md` 的 description 语言
- [ ] 3.2 此任务依赖 spec #1 完成源确立,可在 spec #1 Task 0.4 中一并执行

**Verify-By**: bash — `agents/*.md` 的 description 语言一致
**关联需求**: R1.4
