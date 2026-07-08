---
feature: plan-pre-flight-check
date: 2026-06-21
layout: tasks
created: 2026-06-21
spec_ref: ".forge/specs/plan-pre-flight-check/requirements.md"
---

# Tasks

## Overview

为本 spec 执行 TDD:先产出 plan 解析器(若不存在)与预检骨架,再逐 AC 实现 R2/R3 检测项,最后接入 build 门禁。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01", "T-02"] },
    { "wave": 2, "tasks": ["T-03", "T-04"] },
    { "wave": 3, "tasks": ["T-05"] },
    { "wave": 4, "tasks": ["T-06", "T-07"] }
  ]
}
```

## Task Definitions

### T-01 plan 解析器与预检骨架

- **Goal**: 提供 parsePlan(若不存在)与 runPlanPreflight 骨架,先返回 pass
- **Depends On**: 无
- **TDD Steps**:
  - RED — `test/build/plan-preflight.test.ts` 写 parsePlan 成功 + 失败夹具测试;runPlanPreflight 无违规 plan 返回 pass
  - GREEN — 核实现有 parsePlan 是否存在;不存在则实现最小解析(Task 列表/File Mapping/Spec Coverage/Depends On);实现 runPlanPreflight 骨架先返回 pass
  - REFACTOR — 提取 PreflightResult / PreflightViolation 类型
- **Verify Command**: `npx vitest run test/build/plan-preflight.test.ts`
- **Definition of Done**: 骨架测试通过;parsePlan 复用或新建决策记录在 progress

### T-02 build/instructions.md 门禁表与函数调用追加

- **Goal**: 文档侧先落地第 5 行门禁
- **Depends On**: 无(可与 T-01 并行)
- **TDD Steps**:
  - RED — bash 契约测试:`grep 'Plan Self-Consistency' skills/forge/lib/build/instructions.md` 应非空
  - GREEN — §2 表第 4 行后追加第 5 行;函数调用段追加 runPlanPreflight 说明含 Light tier 跳过;Rejection Output 段补多违规列举示例
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q 'Plan Self-Consistency' skills/forge/lib/build/instructions.md"`
- **Definition of Done**: 第 5 行存在且位于 Branch Gate 之后;函数调用说明含 Light tier 跳过

### T-03 R2 内部冲突检测

- **Goal**: 实现文件操作冲突/依赖循环/Spec Coverage 缺口/Verify 白名单/重复标题 5 项检测
- **Depends On**: T-01
- **TDD Steps**:
  - RED — 每 AC 一组失败测试(R2.AC1-AC5)
  - GREEN — 实现 detectFileOperationConflicts / detectDependencyCycles / detectSpecCoverageGaps / detectVerifyWhitelistViolations / detectDuplicateTaskTitles
  - REFACTOR — 抽取公共 plan 遍历辅助
- **Verify Command**: `npx vitest run test/build/plan-preflight.test.ts`
- **Definition of Done**: 5 个 R2 测试通过

### T-04 R3 plan 自带违规检测

- **Goal**: 实现 TDD/跳过验证/阶段间确认/RED 缺失 4 项检测
- **Depends On**: T-01
- **TDD Steps**:
  - RED — 每 AC 一组失败测试(R3.AC1-AC4)
  - GREEN — 实现 detectTddViolations / detectSkipVerification / detectMidStepConfirmation / detectMissingRed,关键词模式放 references
  - REFACTOR — 关键词模式提取到常量
- **Verify Command**: `npx vitest run test/build/plan-preflight.test.ts`
- **Definition of Done**: 4 个 R3 测试通过

### T-05 豁免注释与 references 文档

- **Goal**: 实现 preflight-exempt 注释解析 + 产出 references/plan-preflight.md
- **Depends On**: T-03, T-04
- **TDD Steps**:
  - RED — 测试 preflight-exempt 注释使对应规则对对应 task 跳过;豁免记录写入 progress
  - GREEN — 实现 applyExemptions;写 references/plan-preflight.md(R2/R3 规则表 + 误报处理)
  - REFACTOR — 无
- **Verify Command**: `npx vitest run test/build/plan-preflight.test.ts`
- **Definition of Done**: 豁免测试通过;references 文档存在且含 R2/R3 全表

### T-06 接入 checkBuildGate

- **Goal**: 预检正式接入 build 门禁,失败阻断 + 一次列全
- **Depends On**: T-05
- **TDD Steps**:
  - RED — 集成测试:checkBuildGate 在 preflight fail 时输出 Rejection 列全 violations;Light tier 跳过;通过时输出 ✅ 提示
  - GREEN — 接入 checkBuildGate,Branch Gate 之后调 runPlanPreflight;按 PreflightResult.kind 处理
  - REFACTOR — 无
- **Verify Command**: `npx vitest run test/build/plan-preflight.test.ts`
- **Definition of Done**: 集成测试通过;preflight_enabled 开关生效

### T-07 全量验证

- **Goal**: 全套测试 + 契约校验通过
- **Depends On**: T-06
- **TDD Steps**: 无(验证任务)
- **Verify Command**: `npm run check`
- **Definition of Done**: `npm run check` 全量通过;`bash scripts/check-spec-contract.sh .forge/specs/plan-pre-flight-check/requirements.md` 通过;现有无违规 plan 回归通过
