---
topic: "failure-sink-trigger-expansion"
status: "approved"
date: "2026-05-14"
spec_ref: ".tinkerman/specs/failure-sink-trigger-expansion/spec.md"
format: "full"
---

## Objective

扩展 `src/failure-sink.ts` 的 `FailureTrigger` union，新增 5 个失败场景到自动 episode 沉淀机制。其中 3 个（debug_resolved / grill_abandoned / loop_circuit_broken）有可用的 TypeScript driver 接入点；test_layer_failed 和 conflict_validation_failed 因对应 driver 模块不存在而**延期**。

## Research Findings

1. **已有 caller**：`build.ts`、`review.ts`、`ship.ts`、`deprecated.ts` 导入 failure-sink，均通过 `buildFailureEpisode` + `buildFailureEvolutionMarker` 调用
2. **driver 接入点确认**：
   - `src/debug.ts` — Phase 4 Fix 阶段（行 1-50 定义结构，fix 完成即为 resolved 信号）
   - `src/grill.ts` — `resumeGrillFromFindings`（行 937）和 `grill_abandoned` 状态（行 932）
   - `src/orchestrator.ts` — `shouldCircuitBreak`（行 213、262）触发 `{ type: "abort" }`
3. **不存在的文件**：`src/test-runner.ts`、`src/conflict-resolver.ts`。forge-test 仅 SKILL.md（AI 指令驱动，无 TS 模块），fix-conflicts 依赖未完成的 conflict-resolver-hook spec
4. **测试模式**：`test/failure-sink.test.ts` 使用 `makeContext()` helper + `FIXED_NOW`，覆盖 episode 结构、marker round-trip、lesson 唯一性

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/failure-sink.ts` | MODIFY | FailureTrigger union +5 成员，lessonFor +5 case |
| `test/failure-sink-extended-triggers.test.ts` | CREATE | 5 个新 trigger 的单元测试 |
| `test/failure-sink-extended-triggers.property.test.ts` | CREATE | PBT：episode 幂等性 + lesson 完备性 |
| `src/debug.ts` | MODIFY | Phase 4 fix 完成路径 emit debug_resolved |
| `src/grill.ts` | MODIFY | grill_abandoned 状态写入路径 emit |
| `src/orchestrator.ts` | MODIFY | circuit breaker 触发路径 emit loop_circuit_broken |
| `test/failure-sink-driver-integration.test.ts` | CREATE | driver 层接入契约测试 |

**延期（不纳入本次 plan）**：

| 文件 | 原因 |
|------|------|
| `src/test-runner.ts`（不存在） | forge-test 无 TS driver，需先建模块 |
| `src/conflict-resolver.ts`（不存在） | 依赖 conflict-resolver-hook spec |
| `skills/forge-test/SKILL.md` | 随 test-runner 延期 |
| `skills/forge-fix-conflicts/SKILL.md` | 随 conflict-resolver 延期 |

## Task Breakdown

### Task 1: 扩展 FailureTrigger union 和 lessonFor（3 min）

**文件**：`src/failure-sink.ts`

**RED** — 写失败测试

文件：`test/failure-sink-extended-triggers.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
} from "../src/failure-sink.js";

const FIXED_NOW = new Date("2026-05-14T10:00:00.000Z");

function makeCtx(overrides: Partial<FailureContext> = {}): FailureContext {
  return {
    skill: "forge-debug",
    topic: "test-failure",
    tier: "standard",
    trigger: "debug_resolved",
    situation: "调试完成",
    ...overrides,
  };
}

const newTriggers: Array<{ trigger: FailureContext["trigger"]; skill: string; situation: string }> = [
  { trigger: "debug_resolved", skill: "forge-debug", situation: "调试完成，根因已记录" },
  { trigger: "grill_abandoned", skill: "forge-grill", situation: "需求澄清被用户中止" },
  { trigger: "test_layer_failed", skill: "forge-test", situation: "Layer 1 单元测试失败" },
  { trigger: "conflict_validation_failed", skill: "forge-fix-conflicts", situation: "冲突解决后验证未通过" },
  { trigger: "loop_circuit_broken", skill: "forge-loop", situation: "熔断器触发，连续错误超限" },
];

describe("failure-sink extended triggers — buildFailureEpisode", () => {
  for (const { trigger, skill, situation } of newTriggers) {
    it(`produces valid episode for trigger=${trigger}`, () => {
      const ctx = makeCtx({ trigger, skill, situation });
      const ep = buildFailureEpisode(ctx, FIXED_NOW, 1);
      expect(ep.schema_version).toBe(2);
      expect(ep.outcome).toBe("failure");
      expect(ep.skill).toBe(skill);
      expect(ep.body).toContain(`trigger: ${trigger}`);
      expect(ep.lesson).toBeTruthy();
    });
  }

  it("all 5 new triggers produce distinct lesson text", () => {
    const lessons = newTriggers.map(({ trigger, skill, situation }, i) =>
      buildFailureEpisode(makeCtx({ trigger, skill, situation }), FIXED_NOW, i + 1).lesson,
    );
    const unique = new Set(lessons);
    expect(unique.size).toBe(lessons.length);
  });
});

describe("failure-sink extended triggers — buildFailureEvolutionMarker", () => {
  for (const { trigger, skill, situation } of newTriggers) {
    it(`renders marker with target=${skill}#${trigger}`, () => {
      const ctx = makeCtx({ trigger, skill, situation });
      const marker = buildFailureEvolutionMarker(ctx, "ep-2026-05-14-001", FIXED_NOW);
      expect(marker).toContain(`target: ${skill}#${trigger}`);
      expect(marker.endsWith("\n")).toBe(true);
    });
  }
});
```

Run: `npx vitest run test/failure-sink-extended-triggers.test.ts`
Expected: FAIL -- "Type '"debug_resolved"' is not assignable to type 'FailureTrigger'"

**GREEN** — 扩展 failure-sink.ts

文件：`src/failure-sink.ts`

修改 `FailureTrigger` type（行 36）：
```typescript
export type FailureTrigger =
  | "three_strike"
  | "new_review_pattern"
  | "ship_gate_blocked"
  | "debug_resolved"
  | "grill_abandoned"
  | "test_layer_failed"
  | "conflict_validation_failed"
  | "loop_circuit_broken";
```

扩展 `lessonFor` switch（行 81-90）追加 5 个 case：
```typescript
case "debug_resolved":
  return "调试虽已结束，记录根因模式以便后续识别相同症状";
case "grill_abandoned":
  return "需求澄清中止，未完成边界对齐——后续返工风险升高";
case "test_layer_failed":
  return "测试 layer 失败暴露代码与 spec 之间的偏差，值得作为模式沉淀";
case "conflict_validation_failed":
  return "冲突解决后验证未通过，提示合并策略或测试覆盖不足";
case "loop_circuit_broken":
  return "Forge Loop 熔断暴露循环目标可能不可达或方法未收敛";
```

Run: `npx vitest run test/failure-sink-extended-triggers.test.ts`
Expected: exit 0

**REFACTOR** — 确认已有测试不受影响

Run: `npx vitest run test/failure-sink.test.ts test/failure-sink-extended-triggers.test.ts`
Expected: exit 0

**验证命令**：`npx vitest run test/failure-sink.test.ts test/failure-sink-extended-triggers.test.ts`
**提交信息**：`feat(failure-sink): extend FailureTrigger union with 5 new triggers and lessonFor mappings`

---

### Task 2: PBT — episode 生成幂等性和 lesson 完备性（3 min）

**文件**：`test/failure-sink-extended-triggers.property.test.ts`

**RED** — 写失败测试

```typescript
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
  type FailureTrigger,
} from "../src/failure-sink.js";

const ALL_TRIGGERS: FailureTrigger[] = [
  "three_strike",
  "new_review_pattern",
  "ship_gate_blocked",
  "debug_resolved",
  "grill_abandoned",
  "test_layer_failed",
  "conflict_validation_failed",
  "loop_circuit_broken",
];

const triggerArb = fc.constantFrom(...ALL_TRIGGERS);

const contextArb = triggerArb.chain((trigger) =>
  fc.record({
    skill: fc.string({ minLength: 1, maxLength: 20 }),
    topic: fc.string({ minLength: 1, maxLength: 30 }),
    tier: fc.constantFrom("light", "standard", "full"),
    trigger: fc.constant(trigger),
    situation: fc.string({ minLength: 1, maxLength: 100 }),
    rootCause: fc.optional(fc.string({ minLength: 1, maxLength: 100 })),
  }),
);

describe("failure-sink PBT — all triggers", () => {
  it("buildFailureEpisode is deterministic (idempotent)", () => {
    fc.assert(
      fc.property(contextArb, fc.date({ noInvalidDate: true }), fc.integer({ min: 1, max: 999 }), (ctx, now, seq) => {
        const a = buildFailureEpisode(ctx as FailureContext, now, seq);
        const b = buildFailureEpisode(ctx as FailureContext, now, seq);
        expect(a).toEqual(b);
      }),
    );
  });

  it("every trigger produces a non-empty lesson", () => {
    for (const trigger of ALL_TRIGGERS) {
      const ctx: FailureContext = {
        skill: "test-skill",
        topic: "test-topic",
        tier: "standard",
        trigger,
        situation: "test",
      };
      const ep = buildFailureEpisode(ctx, new Date("2026-05-14T00:00:00Z"), 1);
      expect(ep.lesson.length).toBeGreaterThan(0);
    }
  });

  it("episode id increments with sequenceInDay across triggers", () => {
    const base = new Date("2026-05-14T00:00:00Z");
    const ids = ALL_TRIGGERS.map((trigger, i) => {
      const ctx: FailureContext = {
        skill: "test-skill",
        topic: "test",
        tier: "standard",
        trigger,
        situation: "test",
      };
      return buildFailureEpisode(ctx, base, i + 1).id;
    });
    // All ids should be unique
    expect(new Set(ids).size).toBe(ids.length);
    // All should follow ep-YYYY-MM-DD-NNN pattern
    for (const id of ids) {
      expect(id).toMatch(/^ep-2026-05-14-\d{3}$/);
    }
  });
});
```

Run: `npx vitest run test/failure-sink-extended-triggers.property.test.ts`
Expected: exit 0

**GREEN** — 无需额外代码（Task 1 已提供实现），测试应直接通过。

Run: `npx vitest run test/failure-sink-extended-triggers.property.test.ts`
Expected: exit 0

**REFACTOR** — N/A（纯测试文件）

**验证命令**：`npx vitest run test/failure-sink-extended-triggers.property.test.ts`
**提交信息**：`test(failure-sink): add PBT for episode idempotency and lesson completeness across all triggers`

---

### Task 3: debug driver 接入 — debug_resolved emit（3 min）

**文件**：`src/debug.ts`

**RED** — 写失败测试

文件：`test/failure-sink-driver-integration.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { buildFailureEpisode, buildFailureEvolutionMarker, type FailureContext } from "../src/failure-sink.js";
import {
  buildDebugResolvedContext,
  // This function should exist after GREEN step
} from "../src/debug.js";

const FIXED_NOW = new Date("2026-05-14T10:00:00.000Z");

describe("debug driver — debug_resolved trigger integration", () => {
  it("buildDebugResolvedContext produces valid FailureContext with trigger=debug_resolved", () => {
    const ctx = buildDebugResolvedContext({
      topic: "auth-timeout",
      tier: "standard",
      rootCause: "Token expiry check used < instead of <=",
    });
    expect(ctx.trigger).toBe("debug_resolved");
    expect(ctx.skill).toBe("forge-debug");
    expect(ctx.topic).toBe("auth-timeout");
    expect(ctx.rootCause).toBe("Token expiry check used < instead of <=");
  });

  it("emitted episode has correct structure", () => {
    const ctx = buildDebugResolvedContext({
      topic: "auth-timeout",
      tier: "standard",
      rootCause: "Token expiry check used < instead of <=",
    });
    const ep = buildFailureEpisode(ctx, FIXED_NOW, 1);
    expect(ep.outcome).toBe("failure");
    expect(ep.body).toContain("trigger: debug_resolved");
    expect(ep.root_cause).toBe("Token expiry check used < instead of <=");
  });
});
```

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: FAIL -- "buildDebugResolvedContext is not exported"

**GREEN** — 在 `src/debug.ts` 添加 helper

在 `src/debug.ts` 末尾导出纯函数 helper：

```typescript
import { type FailureContext } from "./failure-sink.js";

export interface DebugResolvedInput {
  topic: string;
  tier: "light" | "standard" | "full";
  rootCause?: string;
}

export function buildDebugResolvedContext(input: DebugResolvedInput): FailureContext {
  return {
    skill: "forge-debug",
    topic: input.topic,
    tier: input.tier,
    trigger: "debug_resolved",
    situation: input.rootCause
      ? `调试完成，根因：${input.rootCause}`
      : "调试完成",
    rootCause: input.rootCause,
  };
}
```

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: exit 0

**REFACTOR** — 运行全部相关测试

Run: `npx vitest run test/failure-sink-driver-integration.test.ts test/failure-sink.test.ts test/failure-sink-extended-triggers.test.ts`
Expected: exit 0

**验证命令**：`npx vitest run test/failure-sink-driver-integration.test.ts`
**提交信息**：`feat(debug): add debug_resolved failure-sink driver helper`

---

### Task 4: grill driver 接入 — grill_abandoned emit（3 min）

**文件**：`src/grill.ts`、`test/failure-sink-driver-integration.test.ts`

**RED** — 追加失败测试

在 `test/failure-sink-driver-integration.test.ts` 追加：

```typescript
import { buildGrillAbandonedContext } from "../src/grill.js";

describe("grill driver — grill_abandoned trigger integration", () => {
  it("buildGrillAbandonedContext produces valid FailureContext", () => {
    const ctx = buildGrillAbandonedContext({
      topic: "api-design",
      tier: "standard",
      lastPendingNode: "是否支持分页？",
    });
    expect(ctx.trigger).toBe("grill_abandoned");
    expect(ctx.skill).toBe("forge-grill");
    expect(ctx.rootCause).toBe("未完成边界对齐，最后待决问题：是否支持分页？");
  });

  it("works without lastPendingNode", () => {
    const ctx = buildGrillAbandonedContext({
      topic: "api-design",
      tier: "standard",
    });
    expect(ctx.trigger).toBe("grill_abandoned");
    expect(ctx.rootCause).toBeUndefined();
  });
});
```

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: FAIL -- "buildGrillAbandonedContext is not exported"

**GREEN** — 在 `src/grill.ts` 添加 helper

```typescript
import { type FailureContext } from "./failure-sink.js";

export interface GrillAbandonedInput {
  topic: string;
  tier: "light" | "standard" | "full";
  lastPendingNode?: string;
}

export function buildGrillAbandonedContext(input: GrillAbandonedInput): FailureContext {
  return {
    skill: "forge-grill",
    topic: input.topic,
    tier: input.tier,
    trigger: "grill_abandoned",
    situation: input.lastPendingNode
      ? `需求澄清中止，最后待决节点：${input.lastPendingNode}`
      : "需求澄清被用户中止",
    rootCause: input.lastPendingNode
      ? `未完成边界对齐，最后待决问题：${input.lastPendingNode}`
      : undefined,
  };
}
```

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: exit 0

**REFACTOR** — 全量测试

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: exit 0

**验证命令**：`npx vitest run test/failure-sink-driver-integration.test.ts`
**提交信息**：`feat(grill): add grill_abandoned failure-sink driver helper`

---

### Task 5: loop driver 接入 — loop_circuit_broken emit（3 min）

**文件**：`src/orchestrator.ts`、`test/failure-sink-driver-integration.test.ts`

**RED** — 追加失败测试

在 `test/failure-sink-driver-integration.test.ts` 追加：

```typescript
import { buildLoopCircuitBrokenContext } from "../src/orchestrator.js";

describe("loop driver — loop_circuit_broken trigger integration", () => {
  it("buildLoopCircuitBrokenContext produces valid FailureContext", () => {
    const ctx = buildLoopCircuitBrokenContext({
      topic: "auto-fix-loop",
      tier: "standard",
      consecutiveFailures: 5,
      failureCategory: "指数退避达上限",
    });
    expect(ctx.trigger).toBe("loop_circuit_broken");
    expect(ctx.skill).toBe("forge-loop");
    expect(ctx.rootCause).toContain("5 次连续失败");
  });

  it("builds idempotency key from runId", () => {
    const ctx = buildLoopCircuitBrokenContext({
      topic: "auto-fix-loop",
      tier: "standard",
      consecutiveFailures: 3,
      runId: "run-2026-05-14-001",
    });
    expect(ctx.situation).toContain("run-2026-05-14-001");
  });
});
```

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: FAIL -- "buildLoopCircuitBrokenContext is not exported"

**GREEN** — 在 `src/orchestrator.ts` 添加 helper

```typescript
import { type FailureContext } from "./failure-sink.js";

export interface LoopCircuitBrokenInput {
  topic: string;
  tier: "light" | "standard" | "full";
  consecutiveFailures: number;
  failureCategory?: string;
  runId?: string;
}

export function buildLoopCircuitBrokenContext(input: LoopCircuitBrokenInput): FailureContext {
  const category = input.failureCategory ?? "连续错误超限";
  return {
    skill: "forge-loop",
    topic: input.topic,
    tier: input.tier,
    trigger: "loop_circuit_broken",
    situation: [
      `熔断器触发：${input.consecutiveFailures} 次连续失败`,
      input.runId ? `(run: ${input.runId})` : undefined,
      `归类：${category}`,
    ]
      .filter(Boolean)
      .join(" "),
    rootCause: `${input.consecutiveFailures} 次连续失败，${category}`,
  };
}
```

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: exit 0

**REFACTOR** — 全量测试

Run: `npx vitest run test/failure-sink-driver-integration.test.ts`
Expected: exit 0

**验证命令**：`npx vitest run test/failure-sink-driver-integration.test.ts`
**提交信息**：`feat(orchestrator): add loop_circuit_broken failure-sink driver helper`

---

### Task 6: dist 同步 + 全量回归测试（2 min）

**文件**：无新文件

**RED** — 确认 dist 同步

Run: `node scripts/check-dist-sync.mjs`
Expected: exit 0 or output lists out-of-sync files

**GREEN** — 如果不同步则重新构建

Run: `npm run dist:resync && git add dist/`
Expected: exit 0

**REFACTOR** — 全量回归

Run: `npx vitest run`
Expected: exit 0

**验证命令**：`npx vitest run && node scripts/check-dist-sync.mjs`
**提交信息**：`chore: resync dist/ for failure-sink-trigger-expansion`

## Spec Coverage

| Spec 验收标准 | 覆盖任务 | 状态 |
|--------------|---------|------|
| 1. debug Phase 4 → emit debug_resolved | Task 3 | ✅ |
| 2. grill 用户中止 → emit grill_abandoned | Task 4 | ✅ |
| 3. test Layer 失败 → emit test_layer_failed | **延期** | ⏸ 无 driver 模块 |
| 4. fix-conflicts validation → emit conflict_validation_failed | **延期** | ⏸ 依赖 conflict-resolver-hook spec |
| 5. loop 熔断 → emit loop_circuit_broken | Task 5 | ✅ |
| 6. episode id 序列单调递增 | Task 2 (PBT) | ✅ |
| 7. evolution-report 自动聚合 | 已有机制 | ✅ 自动消费新 marker |
| 8. lessonFor 非空映射（编译期保证） | Task 1, 2 | ✅ |
| 9. 写失败 console.warn 不抛异常 | 已有 R8.12 约定 | ✅ 不变 |
| 10. 已有 3 个 trigger 测试零修改通过 | Task 1 REFACTOR | ✅ |

## Deferred Items

| 延期项 | 依赖 | 恢复条件 |
|--------|------|---------|
| `test_layer_failed` driver 接入 | `src/test-runner.ts` 或等价模块创建 | forge-test TS driver 实施后 |
| `conflict_validation_failed` driver 接入 | `src/conflict-resolver.ts` 创建 | conflict-resolver-hook spec 实施后 |
| SKILL.md 更新（forge-test、fix-conflicts） | 对应 driver 就绪 | 同上 |
