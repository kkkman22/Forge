---
feature: plan-global-constraints-and-interfaces
status: locked
date: 2026-06-21
layout: design
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
---

# Design Document: Plan Global Constraints & Interfaces

## Overview

在 plan 文档格式新增 Global Constraints 块(跨任务约束)和每个 Task 的 Interfaces 子块(Consumes/Produces 契约)。纯 Markdown 模板增强 + plan instructions 产出指导。与 plan-pre-flight-check spec 协同:预检优先从这两个块读约束源。

## Architecture

无架构变更。改动集中在两个 Markdown 文件:

- `skills/forge/lib/plan/references/plan-document-format.md` — 加块
- `skills/forge/lib/plan/instructions.md` — 加产出指导

并向 plan-pre-flight-check 的检测项提供新约束源(该 spec 的 R4 协同)。

```
plan-document-format.md
  ├─ ## Objective              (现有)
  ├─ ## Global Constraints     ← 新增
  ├─ ## File Mapping           (现有)
  └─ ## Task Breakdown
       └─ Task N
            ├─ Goal/File/Depends/Verify/Commit  (现有)
            └─ Interfaces                          ← 新增
                 ├─ Consumes
                 └─ Produces
```

## Component Interfaces

### 1. Global Constraints 块结构

表格形式,4 列:Constraint / Value / Source / Applies To。无约束时填 None(显式声明)。约束逐字抄录不引用外部链接。

### 2. Task Interfaces 子块结构

每个 Task 在 Verify/Commit 之后追加 Interfaces 子块,含 Consumes 与 Produces 两子段。每条 Interface 条目 4 字段:name / signature / provider / file。无依赖产出时显式 None。

### 3. plan instructions 产出指导章节

明确两个块的内容来源(Global Constraints 从 spec NFR/design/charter/config;Interfaces 从 design C&I/现有代码/File Mapping)、产出时机(草稿生成时主动)、replan 维护规则、与 review 的交互(缺失 = P3 advisory 不阻断)。

## Data Model

无新数据模型。Global Constraints 块与 Interfaces 子块是 plan Markdown 文档的结构化段落,被 plan 解析器(若支持)解析为表格/字段;当前 plan 解析器是否解析这两个块由 plan-pre-flight-check 的 T-01 决定。

## Error Handling

| 情况 | 处理 |
|------|------|
| plan 缺 Global Constraints 块(历史 plan) | 解析不报错;预检跳过 R4 协同校验 + 提示;reviewer 可标 P3 advisory |
| plan 缺 Task Interfaces 子块 | 同上,不报错 |
| Global Constraints 块格式错误(非表格) | 预检跳过该块校验 + 告警,不阻断 |
| Interfaces Consumes 的 provider task 不存在 | plan-pre-flight-check R4.AC3 校验捕获,标违规 |

## Testing Strategy

- **文档存在性测试**(bash grep):每个 AC 对应的块/字段/章节在两个 Markdown 文件中存在。
- **预检协同测试**(`test/build/plan-preflight.test.ts`,属 plan-pre-flight-check spec):预检读 Global Constraints 块、校验 Consumes/Produces 一致性、历史兼容。
- **回归**:`npm run check` 全量通过;现有 plan(无这两个块)解析不报错。

## Current State

现有实现引用(file:line 准确性以 build 时复核为准):

| 现有产物 | 位置 | 现有行为 |
|---------|------|---------|
| plan-document-format Lightweight body | `skills/forge/lib/plan/references/plan-document-format.md:25-63` | Objective → Design Reference Index → File Mapping → Task Breakdown → Spec Coverage,无 Global Constraints 块 |
| plan-document-format Full body | `skills/forge/lib/plan/references/plan-document-format.md:65-100` | Objective → Research Findings → File Mapping → Task Breakdown → Spec Coverage,无 Global Constraints 块 |
| Task 结构(Lightweight) | `plan-document-format.md:50-57` | Goal/File/Design Reference/Property/Depends On/Verify/Commit,无 Interfaces 子块 |
| plan instructions | `skills/forge/lib/plan/instructions.md` | 有 Charter Boundary 检查(review 阶段反向校验),无 Global Constraints 产出指导 |
| Charter boundary 检查 | `plan/instructions.md:207` | review 阶段验证 plan 变更不违反 charter(反向校验,非 plan 内嵌前置约束) |

## Proposed Change

### 要改变的
- plan-document-format.md:Lightweight + Full 两个 format 段都加 Global Constraints 块(在 Objective 之后);Task 结构加 Interfaces 子块。
- plan/instructions.md:新增 ## Producing Global Constraints & Interfaces 章节。
- plan-pre-flight-check 的 R4 协同(该 spec 落地后接续)。

### 明确不改变的
- plan 现有章节(Objective/File Mapping/Task Breakdown/Spec Coverage)语义不变,仅在它们之间插入新块。
- plan frontmatter 不变。
- lightweight/full 切换逻辑不变。
- review spec-check 核心职责不变(缺失块仅 P3 advisory)。
- Charter boundary 检查(review 阶段)不变。

## Reversibility

### Rollback Checklist
1. 还原 `skills/forge/lib/plan/references/plan-document-format.md`:删除 Global Constraints 块(Lightweight + Full)与 Task 的 Interfaces 子块。
2. 还原 `skills/forge/lib/plan/instructions.md`:删除 Producing 章节。
3. 若 plan-pre-flight-check 的 R4 协同已落地,还原其读 Global Constraints 的逻辑。
4. 跑 `npm run check` 确认无回归;历史 plan(无块)本来就兼容,无需处理。

### Mount Points
- `skills/forge/lib/plan/references/plan-document-format.md` body 结构(Lightweight + Full)。
- `skills/forge/lib/plan/instructions.md`(新增章节)。
- plan-pre-flight-check 的约束源读取(协同点)。

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| plan 膨胀(两个块增加文档体积) | Global Constraints 表格紧凑;Interfaces 仅跨 task 有依赖时非 None;简单 plan 块很小 |
| implementer/reviewer 仍忽略块内容 | 与 plan-pre-flight-check 协同,预检机械校验;spec-check 可查 task 是否真遵守声明的约束 |
| 块内容与 spec/design 漂移(plan 抄录后 spec 更新) | Source 列标注来源;replan 时强制重提取;Charter invariant 引用稳定 |
| 历史 plan 无块导致预检报错 | R4.AC4 + 历史兼容测试:无块时跳过 + advisory,不阻断 |

## Rollout

- 纯文档改动(T-01/T-02/T-03),无数据迁移,无 TS 改动。
- 一次性 ship;历史 plan 向后兼容(无块不报错)。
- T-04 协同依赖 plan-pre-flight-check 落地,若该 spec 未先 ship,T-04 标 blocked 待其完成。

## Open Questions

- 现有 plan 解析器(parsePlan)是否需要扩展以解析 Global Constraints 表格与 Interfaces 子块?还是预检直接按文本/正则提取?需在 plan-pre-flight-check 的 T-01 决策。
- Global Constraints 的 Applies To 列引用 task 编号时,编号体系(T-01 vs Task 1)需与现有 plan 格式统一。
