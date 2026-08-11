---
feature: review-subagent-concurrency
layout: design
created: 2026-05-17
---

# Design Document — review-subagent-concurrency

## Overview

把 `subagent-runner.ts` 中的"并行 N 个"硬编码升级为"并发数可调的滚动窗口调度器"。改动隔离在 4 个文件：1 个 runner 模块（新函数）、1 个 config 解析（新字段）、1 个 SKILL.md（参数化文案）、1 个测试文件（机制验证）。零运行时回归风险，零外部依赖。

## Architecture

### 数据流

```
.tinkerman/config.md (review.subagent_concurrency: 3)
        │
        ▼
  parseConcurrencyConfig()  ← env FORGE_REVIEW_CONCURRENCY 覆盖
        │
        ▼  number (1-10)
  runSubagentsWithConcurrency(invocations, executor, concurrency)
        │
        ├─ concurrency >= N  → 等价 Promise.allSettled
        ├─ concurrency === 1 → 顺序 for-await
        └─ 1 < concurrency < N → 滚动窗口
        │
        ▼
  ParallelExecutionResult { succeeded, failed }
```

### 反向兼容矩阵

| 调用方 | 当前用法 | 改动后 |
|---|---|---|
| `src/review.ts` `buildReviewSubagents` | 现有调用不变 | 改为 `runSubagentsWithConcurrency(invocations, executor, parseReviewConfig().subagent_concurrency)` |
| `src/decide.ts` Round 1 并行 | 现有调用不变 | **本 spec 不改**；保留 `runSubagentsInParallel` 调用 |
| 其他调用方 | — | `runSubagentsInParallel` 保留为公开 API，行为不变 |

## Components and Interfaces

### 1. `src/subagent-runner.ts` 新增函数

```typescript
export async function runSubagentsWithConcurrency(
  invocations: SubagentInvocation[],
  executor: (inv: SubagentInvocation) => Promise<SubagentResult>,
  concurrency: number,
): Promise<ParallelExecutionResult> {
  if (concurrency < 1) throw new Error("concurrency must be >= 1");
  if (concurrency > 100) throw new Error("concurrency must be <= 100");

  // Fast path
  if (concurrency >= invocations.length) {
    return runSubagentsInParallel(invocations, executor);
  }

  // 滚动窗口
  const succeeded: ParallelExecutionResult["succeeded"] = [];
  const failed: ParallelExecutionResult["failed"] = [];
  let nextIndex = 0;
  const inflight = new Set<Promise<void>>();

  const startNext = (): boolean => {
    if (nextIndex >= invocations.length) return false;
    const i = nextIndex++;
    const inv = invocations[i];

    const p = (async () => {
      try {
        const result = await executor(inv);
        if (result.status === "success") {
          succeeded.push({ agentType: result.agentType, result: result.output ?? "" });
        } else {
          failed.push({ agentType: result.agentType, error: result.error ?? "Unknown error" });
        }
      } catch (err) {
        failed.push({
          agentType: inv.agentType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    const wrapped = p.finally(() => { inflight.delete(wrapped); });
    inflight.add(wrapped);
    return true;
  };

  for (let k = 0; k < concurrency && startNext(); k++) { /* fill window */ }

  while (inflight.size > 0) {
    await Promise.race(inflight);
    while (inflight.size < concurrency && startNext()) { /* refill */ }
  }

  return { succeeded, failed };
}
```

设计要点：

- **顺序**：`succeeded[]` / `failed[]` 内顺序由完成时序决定，与现有 `runSubagentsInParallel` 一致
- **失败隔离**：单个 reject 不污染其他槽位
- **零外部依赖**：仅 `Promise.race` + `Set`

### 2. `src/config.ts` 新增解析

```typescript
export interface ReviewConfig {
  subagent_concurrency: number;
}

export function parseReviewConfig(configContent: string | undefined): ReviewConfig {
  const DEFAULT = 3;
  const MIN = 1;
  const MAX = 10;

  const envValue = process.env.FORGE_REVIEW_CONCURRENCY;
  if (envValue !== undefined) {
    const parsed = parseInt(envValue, 10);
    if (Number.isInteger(parsed) && parsed >= MIN && parsed <= MAX) {
      return { subagent_concurrency: parsed };
    }
    console.warn(`FORGE_REVIEW_CONCURRENCY invalid (${envValue})`);
  }

  if (configContent) {
    const match = configContent.match(/^\s*review\.subagent_concurrency:\s*(\d+)\s*$/m);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (Number.isInteger(parsed) && parsed >= MIN && parsed <= MAX) {
        return { subagent_concurrency: parsed };
      }
      console.warn(`subagent_concurrency invalid in config.md (${match[1]})`);
    }
  }

  return { subagent_concurrency: DEFAULT };
}
```

设计要点：env > config > default；非法值 warn + default，**不抛**。

### 3. SKILL.md §2 改动

原文：

```markdown
**启动**：标准/全量路径并行启动 3 个（`Promise.allSettled`）；轻量/无 Spec 模式仅 quality-check + security-check。
```

改为：

```markdown
**启动**：标准/全量路径按 `review.subagent_concurrency` 启动（默认 3，可通过 `FORGE_REVIEW_CONCURRENCY` 环境变量覆盖；范围 1-10），使用 `runSubagentsWithConcurrency`；轻量/无 Spec 模式仅 quality-check + security-check。**SDK 抽风时**（命中 `Error: No task found with ID` 等 task registry purge 现象，详见 `.tinkerman/findings/agent-sdk-task-id-purge-2.1.143.md`）可临时设 `FORGE_REVIEW_CONCURRENCY=1` 完全串行。
```

`dist-plugin/skills/forge/lib/review/instructions.md` 通过 `node scripts/sync-dist-plugin.mjs` 镜像。

### 4. `.tinkerman/config.md` 模板

```markdown
review:
  subagent_concurrency: 3  # 1-10; default 3; env FORGE_REVIEW_CONCURRENCY overrides
```

## Data Models

### 复用现有类型

```typescript
// src/loop-types.ts (现有，不改)
export interface SubagentInvocation { agentType: string; prompt: string; permissionMode: string; maxTurns: number; }
export interface SubagentResult { agentType: string; status: "success" | "failed"; output?: string; error?: string; }
export interface ParallelExecutionResult {
  succeeded: Array<{ agentType: string; result: string }>;
  failed: Array<{ agentType: string; error: string }>;
}
```

### 新增类型

```typescript
// src/config.ts
export interface ReviewConfig {
  subagent_concurrency: number;  // 1-10
}
```

## Correctness Properties

### Property 1: API Compatibility

`runSubagentsWithConcurrency(invocations, executor, invocations.length)` 输出与 `runSubagentsInParallel(invocations, executor)` 等价（property test）。

**Validates: Requirements 2.1**

### Property 2: Window Upper Bound

任意时刻 `inflight.size <= concurrency`（property test）。

**Validates: Requirements 2.3**

### Property 3: Complete Coverage

所有 invocation 最终都进入 succeeded 或 failed（property test）。

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 4: Failure Isolation

单个 executor 抛错不影响其他槽位（property test）。

**Validates: Requirements 2.6**

### Property 5: Order Independence

consumer 通过 agentType 字段查找结果，不依赖数组下标。

**Validates: Requirements 2.1**

## Error Handling

| 场景 | 处理 |
|---|---|
| `concurrency < 1` | 抛 `Error("concurrency must be >= 1")` |
| `concurrency > 100` | 抛 `Error("concurrency must be <= 100")` |
| executor reject | 进入 failed[]，继续后续 invocation |
| executor 返回 `status: "failed"` | 进入 failed[] |
| config 非法 | warn + default 3，不阻断 |
| env 非法 | warn + 继续读 config |

### 回滚

| 风险 | 回滚动作 |
|---|---|
| concurrency=1 时 review 阶段耗时 +30% 影响 CI | 改 default=3，env override 仍可用 |
| 滚动窗口实现 bug | revert `subagent-runner.ts`，default=3 等价旧行为 |
| config 解析 bug | revert `config.ts`，硬编码 fallback 到 3 |

## Testing Strategy

| 测试 | 类型 | 关键断言 |
|---|---|---|
| `subagent-concurrency-runner.test.ts` 1-3 | unit | concurrency=N/1/middle 三档行为 |
| `subagent-concurrency-runner.test.ts` 4-5 | unit | 边界值抛错 |
| `subagent-concurrency-runner.test.ts` 6 | unit | 失败隔离 |
| `subagent-concurrency-runner.property.test.ts` | property | 窗口上限不变量、完整覆盖不变量 |
| `subagent-concurrency-config.test.ts` | unit | 默认值、env 覆盖、非法值回退 |
| dist-plugin 镜像 | bash | `diff -r` 退出 0 |
