---
feature: plan-global-constraints-and-interfaces
date: 2026-06-21
layout: tasks
created: 2026-06-21
spec_ref: ".tinkerman/specs/plan-global-constraints-and-interfaces/requirements.md"
---

# Tasks

## Overview

为本 spec 执行:先落地文档模板块(T-01/T-02/T-03),T-04 协同依赖 plan-pre-flight-check 落地。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01", "T-02"] },
    { "wave": 2, "tasks": ["T-03"] },
    { "wave": 3, "tasks": ["T-04"] }
  ]
}
```

> **依赖说明**:T-04 依赖 plan-pre-flight-check spec 已 ship runPlanPreflight。若该 spec 未先落地,T-04 标 blocked,待其完成后接续。T-01/T-02/T-03 可先行。

## Task Definitions

### T-01 plan-document-format 新增 Global Constraints 块

- **Goal**: Lightweight + Full 两个 format 段都加 Global Constraints 块
- **Depends On**: 无
- **TDD Steps**:
  - RED — bash 契约测试:`grep '## Global Constraints' skills/forge/lib/plan/references/plan-document-format.md` 应至少命中 2 次(Lightweight + Full)
  - GREEN — Lightweight body 的 Objective 之后插入 Global Constraints 块(表格 + 无约束填 None 说明 + 逐字抄录声明 + 五类约束示例);Full body 同位置插入同样块
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -c '## Global Constraints' skills/forge/lib/plan/references/plan-document-format.md | grep -q '2'"`
- **Definition of Done**: 两处块存在;表格四列齐全;五类约束示例覆盖;无约束填 None 说明存在

### T-02 plan-document-format Task 结构新增 Interfaces 子块

- **Goal**: Lightweight + Full 的 Task 结构都含 Interfaces 子块
- **Depends On**: 无(可与 T-01 并行)
- **TDD Steps**:
  - RED — bash 契约测试:Task 结构含 Interfaces 子块,下含 Consumes 与 Produces
  - GREEN — Lightweight Task 结构的 Commit 字段之后追加 Interfaces 子块(Consumes/Produces + name/signature/provider/file 四字段示例 + None 显式声明);Full Task 结构同位置追加
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q 'Interfaces' skills/forge/lib/plan/references/plan-document-format.md && grep -q 'Consumes' skills/forge/lib/plan/references/plan-document-format.md && grep -q 'Produces' skills/forge/lib/plan/references/plan-document-format.md"`
- **Definition of Done**: 两 format 的 Task 含 Interfaces;四字段示例齐全;None 声明存在

### T-03 plan/instructions.md 新增产出指导章节

- **Goal**: /forge plan 执行者明确何时产出这两个块及内容来源
- **Depends On**: T-01, T-02
- **TDD Steps**:
  - RED — bash 契约测试:`grep '## Producing Global Constraints' skills/forge/lib/plan/instructions.md` 应非空
  - GREEN — 新增章节:Global Constraints 五来源(charter/config/spec NFR/design/package.json);Interfaces 三来源(design C&I/现有代码/File Mapping);产出时机(草稿生成主动);增量 replan 维护;review 交互(缺失 = P3 advisory 不阻断)
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q '## Producing Global Constraints' skills/forge/lib/plan/instructions.md"`
- **Definition of Done**: 章节存在;五来源 + 三来源 + 产出时机 + replan 维护 + review 交互齐全

### T-04 与 plan-pre-flight-check 协同

- **Goal**: 预检优先读 Global Constraints 块为约束源,校验 Consumes/Produces 一致性,历史兼容
- **Depends On**: T-03 且 plan-pre-flight-check spec 已 ship runPlanPreflight
- **TDD Steps**:
  - RED — `test/build/plan-preflight.test.ts` 写:预检读 Global Constraints 块为约束源;Task A Consumes X 要求 Task B Produces X;无块跳过 + advisory
  - GREEN — runPlanPreflight 的 R2/R3 检测项改为优先读 Global Constraints 块;新增 Consumes/Produces 一致性校验;无块历史兼容跳过
  - REFACTOR — 提取 readGlobalConstraints / readInterfaces 辅助
- **Verify Command**: `npx vitest run test/build/plan-preflight.test.ts`
- **Definition of Done**: 三个协同测试通过;历史 plan(无块)跳过 + advisory 不阻断

### T-05 全量验证

- **Goal**: 全套测试 + 契约校验通过
- **Depends On**: T-04(若已落地)或 T-03(若 T-04 blocked)
- **TDD Steps**: 无(验证任务)
- **Verify Command**: `npm run check`
- **Definition of Done**: `npm run check` 全量通过;`bash scripts/check-spec-contract.sh .tinkerman/specs/plan-global-constraints-and-interfaces/requirements.md` 通过;现有 plan(无这两个块)回归解析不报错
