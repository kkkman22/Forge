---
feature: plan-pre-flight-check
date: 2026-06-21
layout: design
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
---

# Design Document: Plan Pre-flight Check

## Overview

在 `/forge build` 的 Pre-build Checks 表追加第 5 道 Plan Self-Consistency Gate,位于 Branch Gate 之后、Charter Grounding(§2.5)之前。检查 plan 文档内容的内部冲突和自带违规。改动 = build instructions Markdown 追加 + 新增轻量 TS 校验函数 + references 文档。

## Architecture

```
build/instructions.md §2 Pre-build Checks 表
  ├─ 1 Spec Gate        (现有)
  ├─ 2 Plan Gate        (现有)
  ├─ 3 Dir Integrity    (现有)
  ├─ 4 Branch Gate      (现有)
  ├─ 5 Plan Self-Consistency Gate  ← 新增(本 spec)
  └─ §2.5 Charter Grounding        (现有,非门禁)
```

预检函数位置:`src/build/plan-preflight.ts`,导出 `runPlanPreflight(planPath, config): PreflightResult`,被 `checkBuildGate(config)` 在 Branch Gate 之后调用。Light tier 无 plan 时跳过。

## Component Interfaces

```typescript
type PreflightResult =
  | { kind: "pass"; checks_run: number; checks_triggered: number }
  | { kind: "fail"; violations: PreflightViolation[] };

type PreflightViolation = {
  rule: string;        // 如 "R2.AC1 文件操作冲突"
  task_ids: string[];  // 涉及的 Task 编号
  evidence: string;    // plan 中的具体行/字段
};

function runPlanPreflight(args: {
  planPath: string;
  config: ForgeConfig;
}): PreflightResult;
```

### 关键设计决策

- **复用现有 plan 解析器**:预检依赖一个 `parsePlan(planPath)` 函数把 plan 文档解析为结构化对象(Task 列表、File Mapping、Spec Coverage、Depends On)。该函数是否已存在需在 Current State 核实;若不存在,作为本 spec 的 T-01 一并产出。
- **检测规则落在 references**:R2/R3 的具体检测项(含关键词模式)放 `skills/forge/lib/build/references/plan-preflight.md`,避免 instructions.md 膨胀。
- **关键词模式保守**:初始关键词宁少勿多,误报通过豁免注释 + 审计日志迭代。

## Data Model

预检不持久化数据,仅在 build 启动时运行并输出结果。豁免记录追加到 `.tinkerman/progress/<topic>.md` 的预检日志段(纯文本追加)。

## Error Handling

| 情况 | 处理 |
|------|------|
| plan 文件不存在 | 走现有 Plan Gate 报错路径,不由预检负责 |
| plan 解析失败(格式错误) | 预检返回 pass 并输出告警,由现有 Plan Gate 兜底(预检只在解析成功后跑) |
| config 缺 Verify-By 白名单 | 白名单检测项跳过 + 告警,不阻断 |
| `preflight_enabled: false` | 整个预检跳过 + 告警 |

## Testing Strategy

- **单元测试**(`test/build/plan-preflight.test.ts`):每个 AC 一个测试,构造 fixtures plan 触发对应规则;Light tier 跳过;豁免注释生效;通过输出。
- **集成测试**:把 `runPlanPreflight` 接入 `checkBuildGate`,测 Standard/Full 触发、Light 跳过。
- **回归**:现有 plan(无违规)通过预检;`npm run check` 全量通过。

## Current State

现有实现引用(file:line 准确性以 build 时复核为准):

| 现有产物 | 位置 | 现有行为 |
|---------|------|---------|
| Pre-build Checks 表 | `skills/forge/lib/build/instructions.md:101-118` | 4 行门禁(Spec/Plan/Dir/Branch),无第 5 行 |
| Rejection Output 格式 | `skills/forge/lib/build/instructions.md:112` | 统一格式 `🚫 Build 前置检查未通过 — 命名/证据/建议/重入` |
| checkBuildGate 函数 | `src/build/`(确切路径 build 时核实) | 检查 Spec/Plan/Dir,不含 plan 内容预检 |
| Verify-By 白名单 | `.tinkerman/config.md` | 被 spec-check R6 规则使用,本 spec 复用 |
| Charter Grounding | `skills/forge/lib/build/instructions.md:120-129`(§2.5) | 预检插入点在其之前 |
| plan 解析器 | `src/build/plan-parser.ts`(确切路径 build 时核实) | 是否存在待核实;若不存在 T-01 产出 |

## Proposed Change

### 要改变的
- build/instructions.md §2 表追加第 5 行 Plan Self-Consistency + 函数调用说明 + Rejection 示例。
- 新增 `src/build/plan-preflight.ts`(若 plan-parser 不存在则一并产出)。
- 新增 `skills/forge/lib/build/references/plan-preflight.md`(检测规则清单)。
- `checkBuildGate` 在 Branch Gate 之后调用 `runPlanPreflight`。
- `.tinkerman/config.md` 加 `preflight_enabled` 开关(默认 true)。

### 明确不改变的
- 现有四道门禁逻辑不变。
- Charter Grounding 位置与行为不变。
- plan 文档格式不变(预检只读)。
- review 阶段 spec-check 职责不变。
- Rejection Output 统一格式不变(复用)。

## Reversibility

### Rollback Checklist
1. 还原 `skills/forge/lib/build/instructions.md` §2 表(删除第 5 行 + 函数调用段)。
2. 删除 `src/build/plan-preflight.ts` 及其测试 `test/build/plan-preflight.test.ts`。
3. 删除 `skills/forge/lib/build/references/plan-preflight.md`。
4. 还原 `checkBuildGate` 移除对 runPlanPreflight 的调用。
5. 还原 `.tinkerman/config.md` 移除 `preflight_enabled`。
6. 跑 `npm run check` 确认无回归。

### Mount Points
- `skills/forge/lib/build/instructions.md` §2 Pre-build Checks 表。
- `checkBuildGate` 函数(Branch Gate 之后插入调用)。
- `.tinkerman/config.md`(新增开关)。
- `.tinkerman/progress/<topic>.md`(豁免日志追加)。

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| 关键词检测误报率高拖慢正常 build | 豁免注释机制 + 误报记录到 progress 供优化;初始关键词保守;`preflight_enabled` 开关紧急关闭 |
| plan 解析器对非标准格式脆弱 | 复用现有 parsePlan;解析失败走 Plan Gate 报错,预检不背锅 |
| 预检增加 build 启动延迟 | 纯字符串解析无 IO,实测 <100ms;开关可关 |
| 与 review spec-check 职责重叠 | 分工明确:预检查 plan 内部一致性(早期),spec-check 查实现 vs spec(终态),不冲突 |

## Rollout

- 纯文档 + 轻量 TS,无数据迁移。
- 一次性 ship,`preflight_enabled` 默认 true;若线上出现误报风暴可临时设 false。
- 向后兼容:现有无违规 plan 正常通过。

## Open Questions

- `parsePlan` 函数是否已存在?若存在其返回结构是什么?需在 plan 阶段核实,决定 T-01 是否含解析器产出。
- Verify-By 白名单在 config 的确切字段名?需核实 spec-check R6 规则的读取方式以复用。
