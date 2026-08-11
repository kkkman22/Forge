---
feature: review-no-mainagent-fallback
layout: design
created: 2026-05-17
---

# Design Document — review-no-mainagent-fallback

## Overview

把 fallback ladder 作为 forge-review SKILL 的内置策略层，消费 Phase 1（concurrency 机制）和 Phase 2（methodology 字段）的能力。引入 1 个 Hard-gate（禁主 Agent 接管）+ 1 个 escape hatch（`--force-skip-review`）+ 1 份 ADR（细化 §3.1）。改动跨 7 个文件：3 个 SKILL/AGENTS 文档、3 个 src 模块、1 个 ADR。

## Architecture

### Fallback Ladder 总览

```
forge-review SKILL §2 启动
     │
     ▼
┌─ L0: 默认路径 ─────────────────────────────┐
│  runSubagentsWithConcurrency(             │
│    invocations,                           │
│    executor,                              │
│    parseReviewConfig().subagent_concurrency
│  )                                         │
│  全成功 → methodology: subagent-parallel  │
└────────────────────────────────────────────┘
     │ all-fail signal
     ▼
┌─ L1: 串行重试 ────────────────────────────┐
│  runSubagentsWithConcurrency(             │
│    invocations,                           │
│    executor,                              │
│    1                ← 强制串行            │
│  )                                         │
│  最少 2/3 成功 → methodology: subagent-serial
│  retry_count: 1 写入 frontmatter          │
│  l0_failure_signature 写入 frontmatter    │
└────────────────────────────────────────────┘
     │ all-fail again
     ▼
┌─ L2: CI 证据 ──────────────────────────────┐
│  if (.tinkerman/reviews/<pr>-ci.md exists     │
│      && severity_counts parsable)         │
│    methodology: ci-evidence               │
└────────────────────────────────────────────┘
     │ no CI evidence
     ▼
┌─ L3: 阻断 ─────────────────────────────────┐
│  写一份占位报告：                          │
│    methodology: unavailable               │
│    result: blocked                         │
│    failure_reason: "all subagent paths    │
│                     exhausted; no CI..."  │
│  HARD-GATE: 禁止主 Agent 接管             │
└────────────────────────────────────────────┘
```

### 反向兼容矩阵

| 调用方 | 改动前 | 改动后 |
|---|---|---|
| `src/review.ts` `buildReviewSubagents` 调用方 | 直接调 `runSubagentsWithConcurrency` | 改为调 `runReviewFallbackLadder` |
| `src/ship.ts` `checkShipGate` | 按 result 字段判断 | 增量检查 methodology |
| `src/canvas-renderer.ts` | 不消费 methodology | 不变（可选未来增强）|
| `commands/forge.md` ship | 无 force-skip 参数 | 增加 `--force-skip-review --reason` |

## Components and Interfaces

### 1. `src/review.ts` — fallback ladder 实现

```typescript
import { runSubagentsWithConcurrency } from "./subagent-runner.js";
import { parseReviewConfig } from "./config.js";
import type { Methodology } from "./schemas/review-report.js";

export interface FallbackLadderInput {
  invocations: SubagentInvocation[];
  executor: (inv: SubagentInvocation) => Promise<SubagentResult>;
  ciEvidencePath?: string;
}

export interface FallbackLadderResult {
  methodology: Methodology;
  succeeded: ParallelExecutionResult["succeeded"];
  failed: ParallelExecutionResult["failed"];
  trace: FallbackLadderTrace[];
  retryCount: number;
  l0FailureSignature?: string;
  ciEvidence?: { severity_counts: Record<string, number>; raw: string };
}

export interface FallbackLadderTrace {
  level: "L0" | "L1" | "L2" | "L3";
  startedAt: number;
  finishedAt: number;
  outcome: "all-success" | "partial-success" | "all-fail" | "ci-hit" | "ci-miss" | "unavailable";
}

export async function runReviewFallbackLadder(
  input: FallbackLadderInput,
): Promise<FallbackLadderResult> {
  const trace: FallbackLadderTrace[] = [];
  const config = parseReviewConfig(/* read .tinkerman/config.md */);

  // ─── L0 ───
  const l0Start = Date.now();
  const l0 = await runSubagentsWithConcurrency(
    input.invocations,
    input.executor,
    config.subagent_concurrency,
  );
  const l0AllFail = l0.succeeded.length === 0;
  trace.push({
    level: "L0",
    startedAt: l0Start,
    finishedAt: Date.now(),
    outcome: l0AllFail ? "all-fail" : (l0.failed.length > 0 ? "partial-success" : "all-success"),
  });

  if (!l0AllFail) {
    return { methodology: "subagent-parallel", succeeded: l0.succeeded, failed: l0.failed, trace, retryCount: 0 };
  }

  // ─── L1 ───
  const l0Sig = summarizeFailureSignature(l0.failed);
  console.warn(`⚠ L0 subagent dispatch failed (${l0Sig}); retrying with concurrency=1...`);

  const l1Start = Date.now();
  const l1 = await runSubagentsWithConcurrency(input.invocations, input.executor, 1);
  const l1AllFail = l1.succeeded.length === 0;
  trace.push({
    level: "L1",
    startedAt: l1Start,
    finishedAt: Date.now(),
    outcome: l1AllFail ? "all-fail" : (l1.failed.length > 0 ? "partial-success" : "all-success"),
  });

  console.warn(`L1 retry result: ${l1.succeeded.length}/${input.invocations.length} subagents recovered`);

  if (!l1AllFail) {
    return {
      methodology: "subagent-serial",
      succeeded: l1.succeeded,
      failed: l1.failed,
      trace,
      retryCount: 1,
      l0FailureSignature: l0Sig,
    };
  }

  // ─── L2 ───
  console.warn(`⚠ L1 retry exhausted; checking CI evidence (L2)...`);
  const l2Start = Date.now();

  if (input.ciEvidencePath) {
    const ciResult = tryParseCiEvidence(input.ciEvidencePath);
    if (ciResult) {
      trace.push({ level: "L2", startedAt: l2Start, finishedAt: Date.now(), outcome: "ci-hit" });
      return {
        methodology: "ci-evidence",
        succeeded: [],
        failed: [],
        trace,
        retryCount: 1,
        l0FailureSignature: l0Sig,
        ciEvidence: ciResult,
      };
    }
  }
  trace.push({ level: "L2", startedAt: l2Start, finishedAt: Date.now(), outcome: "ci-miss" });

  // ─── L3 ───
  trace.push({
    level: "L3",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    outcome: "unavailable",
  });

  return {
    methodology: "unavailable",
    succeeded: [],
    failed: l1.failed,
    trace,
    retryCount: 1,
    l0FailureSignature: l0Sig,
  };
}

function summarizeFailureSignature(failed: ParallelExecutionResult["failed"]): string {
  const errorTypes = new Set(failed.map(f => {
    if (/No task found with ID/.test(f.error)) return "task-id-purge";
    if (/timeout/i.test(f.error)) return "timeout";
    if (/turn limit/i.test(f.error)) return "turn-limit";
    return "other";
  }));
  return Array.from(errorTypes).join(",");
}
```

### 2. `src/review.ts` — frontmatter 序列化扩展

```typescript
function buildReviewFrontmatter(
  topic: string,
  date: string,
  result: string,
  commit: string,
  counts: SeverityCounts,
  layers: string[],
  methodology: Methodology,
  extras?: {
    retry_count?: number;
    l0_failure_signature?: string;
    failure_reason?: string;
  },
): string {
  const lines = [
    `topic: ${topic}`,
    `date: ${date}`,
    `result: ${result}`,
    `reviewed_at_commit: ${commit}`,
    `p0_count: ${counts.p0}`,
    `p1_count: ${counts.p1}`,
    `p2_count: ${counts.p2}`,
    `p3_count: ${counts.p3}`,
    `methodology: ${methodology}`,
  ];
  if (extras?.retry_count !== undefined) lines.push(`retry_count: ${extras.retry_count}`);
  if (extras?.l0_failure_signature) lines.push(`l0_failure_signature: "${extras.l0_failure_signature}"`);
  if (extras?.failure_reason) lines.push(`failure_reason: "${extras.failure_reason}"`);
  lines.push(`layers:`);
  for (const l of layers) lines.push(`  - ${l}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function renderTrace(trace: FallbackLadderTrace[]): string {
  const rows = trace.map(t => {
    const ms = t.finishedAt - t.startedAt;
    return `| ${t.level} | ${new Date(t.startedAt).toISOString()} | ${ms}ms | ${t.outcome} |`;
  });
  return [
    "## Fallback Ladder Trace",
    "",
    "| Level | Started | Duration | Outcome |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}
```

### 3. `skills/forge/lib/review/instructions.md` §2.5 + Hard-gate

在 §2 后追加：

```markdown
## 2.5 Fallback Ladder

| Level | 评审者 | 触发条件 | 可信度 | 行为 |
|---|---|---|---|---|
| L0 | 三 subagent 并行（concurrency=N，默认 3）| 默认 | 高 | `methodology: subagent-parallel` |
| L1 | 三 subagent 串行（concurrency=1）| L0 全失败 | 高（同上，仅速度慢）| `methodology: subagent-serial`，自动重试 1 次 |
| L2 | CI ultrareview 异步证据 | L1 全失败 + `.tinkerman/reviews/<pr>-ci.md` 存在 | 中 | `methodology: ci-evidence` |
| L3 | （无评审者）| L0+L1+L2 全部不可用 | — | `methodology: unavailable`、`result: blocked`、阻断 ship |

实现入口：`src/review.ts` 的 `runReviewFallbackLadder()`。

<HARD-GATE name="no-mainagent-review">

**主 Agent 在 fallback ladder 任一级失败后，禁止以以下 4 种形式接管评审**：

1. 直接 Read diff 自评：调用 Read/Grep/Bash 读源码并产出 finding
2. 调用本地工具自评：用 forge_git/forge_read 等 MCP 工具产出 finding
3. Skill 内联自评：通过 `Skill(forge, "review")` inline 路径再次进入 review SKILL 自评
4. 重写已有 subagent 报告：基于残缺 subagent output 拼凑完整 review 报告

违反此约束的 review 报告**自动判定为 invalid**，ship gate 拒绝放行。

唯一合法路径：L0 → L1 → L2 → L3。L3 之后由用户手工干预（修复 SDK / 等待上游 / 使用 `--force-skip-review` 逃生阀）。

理由：subagent 隔离的核心价值是 fresh context，不是身份。同一会话主 Agent 即使没 build 这块代码，也带有 build 阶段的上下文偏置，违反 §3.1 Execution-Assessment Separation 的设计意图。

</HARD-GATE>
```

`dist-plugin/skills/forge/lib/review/instructions.md` 通过 sync 脚本镜像。

### 4. `AGENTS.md §3.1` 追加

原文末尾追加：

```markdown
且**不允许**主 Agent 在 subagent 全部失败后自行顶替评审。Subagent 不可用时按 `forge-review` SKILL §2.5 fallback ladder 处理（L0→L1→L2→L3），L3 阻断 ship。详见 ADR `<date>-review-fallback-ladder.md`。
```

`templates/CLAUDE.md` §3.1 同步。

### 5. `src/ship.ts` — methodology 检查

```typescript
export function checkShipGate(
  review: ReviewResult & { methodology?: Methodology },
  test: TestResult,
  progress: ProgressResult,
): ShipGateResult {
  // ... 现有逻辑

  if (review.methodology === "unavailable") {
    return {
      status: "blocked",
      reasons: [
        `Review unavailable: methodology=unavailable; subagent paths exhausted (L0+L1+L2 all failed)`,
        ...existingReasons,
      ],
    };
  }

  // ... 现有逻辑
}
```

### 6. `src/ship.ts` — `--force-skip-review` 逃生阀

```typescript
export interface ShipOptions {
  forceSkipReview?: boolean;
  forceSkipReason?: string;
}

export function checkShipGateWithForceSkip(
  review: ReviewResult & { methodology?: Methodology },
  test: TestResult,
  progress: ProgressResult,
  options: ShipOptions,
): ShipGateResult {
  if (options.forceSkipReview) {
    if (!options.forceSkipReason || options.forceSkipReason.trim().length === 0) {
      throw new Error("--force-skip-review requires --reason='<non-empty>'");
    }
    return {
      status: "passed",
      reasons: [`SKIPPED-BY-FORCE: ${options.forceSkipReason}`],
      forceSkipped: true,
    };
  }
  return checkShipGate(review, test, progress);
}

export function recordForceSkip(commitHash: string, reason: string, user: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const path = `.tinkerman/findings/force-skip-review-${date}.md`;
  const entry = `\n## ${commitHash} (${user})\n\nReason: ${reason}\nTimestamp: ${new Date().toISOString()}\n`;
  // appendFileSync(path, entry)
}
```

### 7. ADR `<date>-review-fallback-ladder.md`

ADR 章节：

- §背景：SDK task registry purge bug 触发 main-agent direct review 退化
- §决策：引入 L0-L3 fallback ladder + Hard-gate 禁止主 Agent 接管
- §替代方案：
  - **A. 允许主 Agent 接管**（拒绝：违反 §3.1）
  - **B. 完全去除 background subagent**（拒绝：foreground 仍命中 task-id-purge）
  - **C. 直接迁移 task-notification 消费**（推迟：见 spec `subagent-notification-consumption-migration`）
- §回滚：把 fallback ladder 入口函数替换为 `runSubagentsInParallel` 直接调用，相当于回到 Phase 1 之前；保留 `--force-skip-review` 用作降级
- §跨版本回归：每次 Claude Code 升级时
  - 重测 `/forge review`（小 PR），观察 L0 是否成功
  - 检查上游 issue #14055/#27371/#29183 是否被修
  - 一旦上游修复，ADR 可降级为"已解决，保留作为 fail-safe"

## Data Models

### 新增类型

```typescript
// src/review.ts
export interface FallbackLadderInput {
  invocations: SubagentInvocation[];
  executor: (inv: SubagentInvocation) => Promise<SubagentResult>;
  ciEvidencePath?: string;
}

export interface FallbackLadderResult {
  methodology: Methodology;
  succeeded: ParallelExecutionResult["succeeded"];
  failed: ParallelExecutionResult["failed"];
  trace: FallbackLadderTrace[];
  retryCount: number;
  l0FailureSignature?: string;
  ciEvidence?: { severity_counts: Record<string, number>; raw: string };
}

export interface FallbackLadderTrace {
  level: "L0" | "L1" | "L2" | "L3";
  startedAt: number;
  finishedAt: number;
  outcome: "all-success" | "partial-success" | "all-fail" | "ci-hit" | "ci-miss" | "unavailable";
}

// src/ship.ts
export interface ShipOptions {
  forceSkipReview?: boolean;
  forceSkipReason?: string;
}
```

### 报告 frontmatter 字段（扩展 Phase 2 schema）

| 字段 | 类型 | 何时出现 |
|---|---|---|
| `methodology` | enum | 始终（Phase 2 引入）|
| `retry_count` | non-negative int | 仅 `methodology=subagent-serial` 或 `unavailable` |
| `l0_failure_signature` | string | 仅 L0 失败后（subagent-serial / unavailable）|
| `failure_reason` | string | 仅 `methodology=unavailable` |

## Correctness Properties

### Property 1: Hard-gate Unbypassable

测试覆盖"L3 之后不调用 Read/Grep/Bash"。任何评审分析路径调用 = 测试失败。

**Validates: Requirements 2.1, 2.2, 5.1**

### Property 2: Retry Bounded by 1

L1 之后绝不再次调用 `runSubagentsWithConcurrency`（property test）。

**Validates: Requirements 3.5**

### Property 3: Methodology and Trace Consistent

methodology=subagent-parallel ⇒ trace 含 L0=all-success；methodology=subagent-serial ⇒ trace 含 L0=all-fail+L1≠all-fail；以此类推。

**Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 5.3**

### Property 4: Force-Skip Strong Constraint

`forceSkipReview === true && forceSkipReason 空` ⇒ 抛错。

**Validates: Requirements 4.2**

### Property 5: Force-Skip Auditable

`forceSkipReview === true` ⇒ findings 文件存在且含 commit hash+reason+user。

**Validates: Requirements 4.3**

## Error Handling

| 场景 | 处理 |
|---|---|
| L0 部分成功（≥1 succeeded）| 直接进入合并管线，不进 L1 |
| L1 部分成功（≥1 succeeded）| 进入合并管线，标 subagent-serial |
| L1 之后再失败 | 不再重试，直接 L2/L3 |
| CI 证据文件存在但 severity_counts 不可解析 | 视为 L2 miss，进 L3 |
| 同一 review session L1 已跑过 | 不再触发自动重试 |
| 用户跨会话第二次 `/forge review` | 重新走 L0（新 session 重置 retry counter）|

### 回滚

| 风险 | 回滚动作 |
|---|---|
| fallback ladder 引入 bug 导致 review 全挂 | revert `src/review.ts`，调用方改回直接调用，相当于"无 fallback" |
| Hard-gate 误伤合法 main-agent fallback 场景 | （目前不存在合法场景；如发现需走新 ADR 修订）|
| `--force-skip-review` 被滥用 | findings 文件提供事后追溯；如滥用频次高，加 owner 角色检查 |

### 跨版本回归点

每次 Claude Code 升级时：

1. 跑 `npm run check` + `npx vitest run test/review/fallback-ladder.test.ts`
2. 在小 PR 上跑 `/forge review`，观察 trace section 中是否 L0=all-success
3. 检查 `.tinkerman/findings/agent-sdk-task-id-purge-2.1.143.md` 列出的上游 issue 是否标记 closed
4. 一旦上游修复，trace 应稳定显示 L0=all-success；可考虑降级 fallback ladder 为可选机制

## Testing Strategy

| 测试 | 类型 | 关键断言 |
|---|---|---|
| `fallback-ladder.test.ts` 1-5 | integration | L0/L1/L2/L3 四档行为 + Hard-gate |
| `fallback-ladder.test.ts` 6 | integration | retry_count + l0_failure_signature 字段写入 |
| `fallback-ladder.test.ts` 7 | integration | trace section 渲染 |
| `force-skip-review.test.ts` 1-3 | unit | reason 强制、commit 标记、findings 记录 |
| `checkShipGate.test.ts` 增量 | unit | methodology=unavailable 直接 blocked |
| `fallback-ladder.property.test.ts` | property | "重试不超 1 次" 不变量、"methodology 与 trace 一致" 不变量 |
