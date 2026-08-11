---
feature: agency-borrow-05-install-wizard
layout: tasks
created: 2026-06-23
spec_ref: ".forge/specs/agency-borrow-05-install-wizard/requirements.md"
---

# Tasks

## Task 1: 落地决策 ADR(P3 前置)

- [ ] 1.1 在 `.forge/decisions/` 新建 ADR,记录是否引入 agent 选择性安装、交互形式选择(A vs B)
- [ ] 1.2 ADR 含:现状(init.sh 全量装)、候选、推荐(方案 A 朴素 read)、触发落地条件(marketplace 需求明确)

**Verify-By**: manual — ADR 存在且含结论
**关联需求**: R1, R2

## Task 2: (条件性)实现 --agents 子集选项

> 仅当 ADR 决定落地时执行;否则本 Task 搁置。

- [ ] 2.1 在 `scripts/init.sh` 或 `convert-agents.mjs` 加 `--agents <slug,slug>` 选项
- [ ] 2.2 实现朴素 read 多选提示(方案 A):分组列出 agent,用户输编号
- [ ] 2.3 convert 生成器仅处理选定子集
- [ ] 2.4 `--non-interactive` + `--agents` 组合仍可用(指定子集无交互)

**Verify-By**: bash — `scripts/init.sh --non-interactive --agents spec-check,quality-check --name test` 仅装选定 agent
**关联需求**: R1

## Task 3: 回归验证(条件性)

- [ ] 3.1 现有 `init.sh` 全量安装行为不回归(不带 `--agents` 时)
- [ ] 3.2 `npm run check` 通过

**Verify-By**: bash
**关联需求**: R2.3
