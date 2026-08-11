---
feature: state-resilience
layout: design
created: 2026-05-01
---

# Design Document: State Resilience

## Overview

为 Forge 的状态系统增加三层防御：宽容解析、降级执行、状态自愈。所有改动在 TypeScript 纯函数层面，不改变 SKILL.md 的执行逻辑。

## Architecture

```
状态文件读取
  │
  ├── Layer 1: 宽容解析（state.ts, review.ts, config-store.ts）
  │     缺失字段 → 使用默认值 + emit warning
  │
  ├── Layer 2: 降级执行（skill-scheduler.ts）
  │     前置文件缺失 → 留在当前阶段 + emit warning
  │     绝不基于缺失数据跳到后续阶段
  │
  └── Layer 3: 状态自愈（status-resolver.ts）
  │     StatusFile 不一致 → 从 git + 文件系统推断状态
  │     仅在 forge-resume 中调用，不自动触发
```

## Components and Interfaces

### 1. 状态文件默认值表（state.ts）

```typescript
export const STATUS_DEFAULTS: Readonly<Record<string, unknown>> = {
  current_task: "",
  tier: "standard",
  phase: "router",
  task_type: "fullstack",
  project_phase: "iteration",
  hints: "",
  assumptions: [],
  mode: "interactive",
  updated: "",
};

export const REVIEW_DEFAULTS: Readonly<Record<string, unknown>> = {
  result: "incomplete",
  p0_count: 0,
  p1_count: 0,
  p2_count: 0,
  p3_count: 0,
  reviewed_at_commit: undefined,
};

export const CONFIG_DEFAULTS: Readonly<Record<string, unknown>> = {
  project: "unknown",
  stack: ["TypeScript"],
  security_level: 1,
  knowledge_limit: 20,
  max_parallel_agents: 6,
};
```

### 2. 宽容解析函数

```typescript
/**
 * Parse StatusFile frontmatter with graceful fallback to defaults.
 * Missing or malformed fields use STATUS_DEFAULTS.
 * Returns { parsed: StatusFields, warnings: string[] }.
 */
export function parseStatusFileGraceful(
  content: string | undefined,
): { parsed: StatusFields; warnings: string[] } {
  // ...
}
```

类似的函数用于 review 报告和 config 文件。

### 3. Skill Scheduler 降级逻辑

`determineNextSkill` 的现有逻辑已经处理了大部分 undefined 情况（通过 optional chaining）。需要增加的是：

- `hasIncompleteTasks === undefined` → 视为 `true`（保守假设：有未完成任务）
- `reviewResult === undefined` → 留在 review 阶段
- `testPassed === undefined` → 留在 test 阶段

核心原则：**缺失数据永远不导致跳到后续阶段**。

### 4. 状态自愈函数（status-resolver.ts）

```typescript
export interface ReconstructedState {
  inferredPhase: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

/**
 * Infer current workflow phase from git history and .forge/ file presence.
 * Pure function — no side effects, no file writes.
 */
export function reconstructStateFromGit(
  forgeFiles: string[],  // 列出 .forge/ 下所有文件
): ReconstructedState {
  const hasPlans = forgeFiles.some(f => f.startsWith("plans/"));
  const hasProgress = forgeFiles.some(f => f.startsWith("progress/"));
  const hasReviews = forgeFiles.some(f => f.startsWith("reviews/"));

  const evidence: string[] = [];

  if (hasReviews) {
    evidence.push("found .forge/reviews/ files → at least review phase");
    return { inferredPhase: "review", confidence: "high", evidence };
  }
  if (hasProgress) {
    evidence.push("found .forge/progress/ files → at least build phase");
    return { inferredPhase: "build", confidence: "high", evidence };
  }
  if (hasPlans) {
    evidence.push("found .forge/plans/ files → at least plan phase");
    return { inferredPhase: "plan", confidence: "medium", evidence };
  }

  evidence.push("no .forge/ state files found → starting from router");
  return { inferredPhase: "router", confidence: "low", evidence };
}
```

## Correctness Properties

### Property 1: 默认值完整性

*For any* StatusFile with all fields missing, `parseStatusFileGraceful("")` SHALL return a complete object with all fields populated from STATUS_DEFAULTS.

### Property 2: 降级保守性

*For any* SchedulerInput with `undefined` optional fields, `determineNextSkill` SHALL NEVER return a phase that is later in the command sequence than the current phase. Missing data → stay or go back, never skip ahead.

### Property 3: 自愈单调性

*For any* set of .forge/ files, `reconstructStateFromGit` SHALL return a phase that is consistent with the most advanced state file present. If reviews/ exists, the inferred phase SHALL be at least "review".

### Property 4: 向后兼容

*For any* well-formed StatusFile (all fields present and valid), `parseStatusFileGraceful` SHALL return identical results to the current parser.

## Testing Strategy

### 属性测试

| Property | 测试文件 | 生成器 |
|----------|---------|--------|
| Property 1 | `test/state-resilience.property.test.ts` | 随机子集的 StatusFile 字段 |
| Property 2 | `test/skill-scheduler-resilience.property.test.ts` | 随机 SchedulerInput with undefined fields |
| Property 3 | `test/status-resolver.property.test.ts` | 随机 .forge/ 文件列表 |
| Property 4 | `test/state-resilience.property.test.ts` | 完整 StatusFile（所有字段有效） |

### 单元测试

- state.ts：每个字段缺失时使用正确默认值
- skill-scheduler.ts：undefined 输入不导致跳阶段
- status-resolver.ts：各种文件组合的推断结果
- config-store.ts：config 缺失/损坏时使用默认值

### 回归测试

- `npm run check` 全量通过
- 所有现有 state.ts、skill-scheduler.ts 测试不受影响
