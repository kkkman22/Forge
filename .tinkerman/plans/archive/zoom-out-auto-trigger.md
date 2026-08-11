---
topic: "zoom-out-auto-trigger"
status: "approved"
date: "2026-05-14"
spec_ref: ".tinkerman/specs/zoom-out-auto-trigger/spec.md"
format: "full"
---

# Plan: zoom-out 自动触发机制

> 来源: `.tinkerman/specs/zoom-out-auto-trigger/spec.md`

## Objective

为 zoom-out 增加两个自动触发场景（debug/fix 2 轮日志调试失败、decide 多轮无定论），保持纯函数架构、无副作用、会话级频率限制。

## 文件映射

| 操作 | 文件 | 原因 |
|------|------|------|
| MODIFY | `src/zoom-out.ts` | 新增 `shouldAutoTriggerZoomOut` + `formatAutoZoomOutInjection` + 类型 |
| MODIFY | `skills/forge-fix/SKILL.md` | §3 日志调试升级机制增加自动 zoom-out 触发点 |
| MODIFY | `skills/forge-decide/SKILL.md` | §2 两轮 Subagent 增加自动 zoom-out 触发点 |
| CREATE | `test/zoom-out-auto-trigger.property.test.ts` | 新增函数的属性测试 |

## 设计决策

1. **纯函数设计**：`shouldAutoTriggerZoomOut` 接收上下文对象（含场景、轮次、已触发标记），返回决策对象。调用方（SKILL 行为层）管理会话级计数器。
2. **类型分离**：`AutoTriggerContext` 和 `AutoTriggerDecision` 导出接口，与现有 `ZoomOutInput`/`ZoomOutOutput` 平级。
3. **注入格式函数**：`formatAutoZoomOutInjection` 将 zoom-out 输出包装为 spec 定义的注入格式（`[自动视角重置]` / `[全局位置参考]` 前缀）。
4. **不改动现有函数签名**：所有新函数为增量添加，不修改 `isZoomOutTrigger`、`pauseForZoomOut` 等现有函数。

---

### Task 1: 新增自动触发判定函数 `shouldAutoTriggerZoomOut`

**Files**:
- MODIFY: `src/zoom-out.ts`

**TDD Steps**:

**RED** — 写失败测试

文件：`test/zoom-out-auto-trigger.property.test.ts`

```typescript
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  shouldAutoTriggerZoomOut,
  formatAutoZoomOutInjection,
  type AutoTriggerContext,
  type AutoTriggerDecision,
} from "../src/zoom-out.js";

describe("shouldAutoTriggerZoomOut", () => {
  // --- debug scenario ---

  it("triggers when debug log rounds >= 2 and not yet triggered", () => {
    const ctx: AutoTriggerContext = {
      scenario: "debug",
      debugLogRounds: 2,
      alreadyTriggered: false,
    };
    const result = shouldAutoTriggerZoomOut(ctx);
    expect(result.shouldTrigger).toBe(true);
    expect(result.scenario).toBe("debug");
    expect(result.reason).toBeTruthy();
  });

  it("does not trigger when debug log rounds < 2", () => {
    const ctx: AutoTriggerContext = {
      scenario: "debug",
      debugLogRounds: 1,
      alreadyTriggered: false,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  it("does not trigger when already triggered in this session", () => {
    const ctx: AutoTriggerContext = {
      scenario: "debug",
      debugLogRounds: 2,
      alreadyTriggered: true,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  // --- decide scenario ---

  it("triggers when decide rounds >= 2 and consensus not reached", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 2,
      decideConsensusReached: false,
      alreadyTriggered: false,
    };
    const result = shouldAutoTriggerZoomOut(ctx);
    expect(result.shouldTrigger).toBe(true);
    expect(result.scenario).toBe("decide");
  });

  it("triggers when decide user hesitation >= 3", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 1,
      decideConsensusReached: true,
      decideUserHesitationCount: 3,
      alreadyTriggered: false,
    };
    const result = shouldAutoTriggerZoomOut(ctx);
    expect(result.shouldTrigger).toBe(true);
  });

  it("does not trigger when decide has consensus and no hesitation", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 2,
      decideConsensusReached: true,
      decideUserHesitationCount: 0,
      alreadyTriggered: false,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  it("does not trigger when decide already triggered", () => {
    const ctx: AutoTriggerContext = {
      scenario: "decide",
      decideRounds: 3,
      decideConsensusReached: false,
      alreadyTriggered: true,
    };
    expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
  });

  // --- property: frequency limit is absolute ---

  it("property: alreadyTriggered=true always returns shouldTrigger=false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"debug" | "decide">("debug", "decide"),
        fc.integer({ min: 0, max: 10 }),
        fc.boolean(),
        (scenario, rounds, consensus) => {
          const ctx: AutoTriggerContext = {
            scenario,
            alreadyTriggered: true,
            ...(scenario === "debug"
              ? { debugLogRounds: rounds }
              : { decideRounds: rounds, decideConsensusReached: consensus }),
          };
          expect(shouldAutoTriggerZoomOut(ctx).shouldTrigger).toBe(false);
        },
      ),
    );
  });

  // --- property: deterministic ---

  it("is deterministic: same input → same output", () => {
    fc.assert(
      fc.property(
        fc.record({
          scenario: fc.constantFrom<"debug" | "decide">("debug", "decide"),
          debugLogRounds: fc.integer({ min: 0, max: 5 }),
          decideRounds: fc.integer({ min: 0, max: 5 }),
          decideConsensusReached: fc.boolean(),
          decideUserHesitationCount: fc.integer({ min: 0, max: 5 }),
          alreadyTriggered: fc.boolean(),
        }),
        (partial) => {
          const ctx: AutoTriggerContext = {
            scenario: partial.scenario,
            alreadyTriggered: partial.alreadyTriggered,
            ...(partial.scenario === "debug"
              ? { debugLogRounds: partial.debugLogRounds }
              : {
                  decideRounds: partial.decideRounds,
                  decideConsensusReached: partial.decideConsensusReached,
                  decideUserHesitationCount: partial.decideUserHesitationCount,
                }),
          };
          const a = shouldAutoTriggerZoomOut(ctx);
          const b = shouldAutoTriggerZoomOut(ctx);
          expect(a).toEqual(b);
        },
      ),
    );
  });
});
```

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: FAIL -- "Cannot find module" or "is not exported"

**GREEN** — 写最少代码让测试通过

文件：`src/zoom-out.ts`

在文件末尾（trigger detection section 之后）添加：

```typescript
// ---------------------------------------------------------------------------
// Auto-trigger for zoom-out
// ---------------------------------------------------------------------------

/**
 * Context for deciding whether to automatically trigger a zoom-out.
 * The calling code (SKILL behavior layer) populates this from session state.
 *
 *   - scenario:              which trigger scenario is being evaluated
 *   - debugLogRounds:         (debug only) number of failed log-debug rounds
 *   - decideRounds:           (decide only) number of subagent rounds so far
 *   - decideConsensusReached: (decide only) whether a consensus was reached
 *   - decideUserHesitationCount: (decide only) consecutive user hesitation count
 *   - alreadyTriggered:       frequency guard — true if this scenario already
 *                             auto-triggered in this session
 */
export interface AutoTriggerContext {
  scenario: "debug" | "decide";
  debugLogRounds?: number;
  decideRounds?: number;
  decideConsensusReached?: boolean;
  decideUserHesitationCount?: number;
  alreadyTriggered: boolean;
}

/**
 * Decision returned by {@link shouldAutoTriggerZoomOut}.
 */
export interface AutoTriggerDecision {
  shouldTrigger: boolean;
  scenario: "debug" | "decide";
  reason: string;
}

/**
 * Pure function that determines whether a zoom-out should be automatically
 * triggered based on the current execution context.
 *
 * Rules:
 *   - debug:  trigger when debugLogRounds >= 2 and not already triggered
 *   - decide: trigger when (rounds >= 2 && !consensus) || hesitation >= 3,
 *             and not already triggered
 *   - Frequency limit: each scenario triggers at most once per session
 *
 * Pure: same input → same output. No IO.
 */
export function shouldAutoTriggerZoomOut(context: AutoTriggerContext): AutoTriggerDecision {
  const { scenario, alreadyTriggered } = context;

  if (alreadyTriggered) {
    return { shouldTrigger: false, scenario, reason: "本会话此场景已自动触发过 zoom-out" };
  }

  if (scenario === "debug") {
    const rounds = context.debugLogRounds ?? 0;
    if (rounds >= 2) {
      return {
        shouldTrigger: true,
        scenario: "debug",
        reason: `日志调试已 ${rounds} 轮失败，建议退后看全局视角`,
      };
    }
    return { shouldTrigger: false, scenario, reason: `日志调试仅 ${rounds} 轮，未达阈值` };
  }

  if (scenario === "decide") {
    const rounds = context.decideRounds ?? 0;
    const hesitation = context.decideUserHesitationCount ?? 0;
    const consensus = context.decideConsensusReached ?? true;
    const noConsensus = rounds >= 2 && !consensus;
    const highHesitation = hesitation >= 3;
    if (noConsensus || highHesitation) {
      return {
        shouldTrigger: true,
        scenario: "decide",
        reason: noConsensus
          ? `决策 ${rounds} 轮未达共识，建议退后看全局约束`
          : `用户连续 ${hesitation} 次犹豫，建议退后看全局视角`,
      };
    }
    return { shouldTrigger: false, scenario, reason: "决策进展正常" };
  }

  return { shouldTrigger: false, scenario, reason: "未知场景" };
}
```

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: exit 0

**REFACTOR** — 确保与现有代码风格一致

- 导出类型与现有 `ZoomOutInput`/`ZoomOutOutput` 平级
- 函数注释遵循现有 JSDoc 模式（Pure: same input → same output. No IO.）
- 不修改任何现有函数

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: exit 0

**Verify Command**: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
**Commit Message**: `feat(zoom-out): add shouldAutoTriggerZoomOut pure function`

---

### Task 2: 新增输出注入格式函数 `formatAutoZoomOutInjection`

**Files**:
- MODIFY: `src/zoom-out.ts`
- MODIFY: `test/zoom-out-auto-trigger.property.test.ts`

**TDD Steps**:

**RED** — 写失败测试

文件：`test/zoom-out-auto-trigger.property.test.ts`（追加 describe block）

```typescript
describe("formatAutoZoomOutInjection", () => {
  const sampleOutput: ZoomOutOutput = {
    overallLocation: "位于 src/ 核心模块",
    currentResponsibility: "负责用户认证",
    boundaryWithNeighbors: "上游 API Gateway，下游 User DB",
  };

  it("formats debug injection with [自动视角重置] prefix", () => {
    const result = formatAutoZoomOutInjection(sampleOutput, "debug");
    expect(result).toContain("[自动视角重置]");
    expect(result).toContain("整体位置");
    expect(result).toContain("位于 src/ 核心模块");
    expect(result).toContain("当前职责");
    expect(result).toContain("负责用户认证");
    expect(result).toContain("与邻居的边界");
    expect(result).toContain("上游 API Gateway，下游 User DB");
  });

  it("formats decide injection with [全局位置参考] prefix", () => {
    const result = formatAutoZoomOutInjection(sampleOutput, "decide");
    expect(result).toContain("[全局位置参考]");
  });

  it("wraps content in horizontal rules", () => {
    const result = formatAutoZoomOutInjection(sampleOutput, "debug");
    expect(result.startsWith("---")).toBe(true);
    expect(result.endsWith("---")).toBe(true);
  });

  it("is deterministic", () => {
    const out: ZoomOutOutput = {
      overallLocation: "a",
      currentResponsibility: "b",
      boundaryWithNeighbors: "c",
    };
    expect(formatAutoZoomOutInjection(out, "debug")).toBe(formatAutoZoomOutInjection(out, "debug"));
    expect(formatAutoZoomOutInjection(out, "decide")).toBe(formatAutoZoomOutInjection(out, "decide"));
  });

  it("property: always contains the three section headings", () => {
    const sectionArb = fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.replace(/\n/g, " "));
    fc.assert(
      fc.property(
        fc.record({
          overallLocation: sectionArb,
          currentResponsibility: sectionArb,
          boundaryWithNeighbors: sectionArb,
        }),
        fc.constantFrom<"debug" | "decide">("debug", "decide"),
        (output, scenario) => {
          const result = formatAutoZoomOutInjection(output, scenario);
          expect(result).toContain("## 整体位置");
          expect(result).toContain("## 当前职责");
          expect(result).toContain("## 与邻居的边界");
        },
      ),
    );
  });
});
```

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: FAIL -- "is not exported"

**GREEN** — 写最少代码让测试通过

文件：`src/zoom-out.ts`（追加到 auto-trigger section）

```typescript
/**
 * Prefix labels for auto-triggered zoom-out injection, keyed by scenario.
 */
const AUTO_TRIGGER_LABELS: Record<"debug" | "decide", string> = {
  debug: "[自动视角重置]",
  decide: "[全局位置参考]",
} as const;

/**
 * Description text for auto-triggered zoom-out injection, keyed by scenario.
 */
const AUTO_TRIGGER_DESCRIPTIONS: Record<"debug" | "decide", string> = {
  debug: "以下是当前任务在系统中的位置概览，供重新分析时参考：",
  decide: "以下是当前决策在系统中的位置概览，供下一轮评估参考：",
} as const;

/**
 * Format a {@link ZoomOutOutput} as an injection block suitable for
 * prepending to a subsequent phase's prompt context. The output is wrapped
 * in a horizontal-rule block and prefixed with a scenario-specific label
 * and description.
 *
 * Pure: same input → same output. No IO.
 */
export function formatAutoZoomOutInjection(
  output: ZoomOutOutput,
  scenario: "debug" | "decide",
): string {
  const rendered = renderZoomOut(output);
  const label = AUTO_TRIGGER_LABELS[scenario];
  const description = AUTO_TRIGGER_DESCRIPTIONS[scenario];
  return [
    "---",
    `${label} ${description}`,
    "",
    rendered,
    "---",
  ].join("\n");
}
```

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: exit 0

**REFACTOR** — 无重构需要

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: exit 0

**Verify Command**: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
**Commit Message**: `feat(zoom-out): add formatAutoZoomOutInjection for context injection`

---

### Task 3: 更新 forge-fix SKILL.md 增加自动 zoom-out 触发点

**Files**:
- MODIFY: `skills/forge-fix/SKILL.md`

**TDD Steps**:

**RED** — 验证当前 §3 日志调试升级机制不含 zoom-out 自动触发描述

Run: `grep -c "zoom-out\|zoom_out\|自动视角重置" skills/forge-fix/SKILL.md`
Expected: output contains "0"

**GREEN** — 在 §3 日志调试升级机制末尾追加自动触发描述

在 `skills/forge-fix/SKILL.md` 的 §3（"日志调试升级机制"）section 末尾，列表第 3 条（"2 轮后仍失败：回到 analyze 阶段重新做根因分析"）之后追加：

```markdown
4. **自动视角重置**：第 2 轮日志调试失败后、回到 analyze 前，检查 `shouldAutoTriggerZoomOut({ scenario: "debug", debugLogRounds: 2, alreadyTriggered })`：
   - `shouldTrigger: true` → autonomous 模式直接执行 zoom-out；interactive 模式提示「当前讨论似乎陷入局部，建议先退后一步看看整体位置。是否继续？」
   - zoom-out 输出通过 `formatAutoZoomOutInjection(output, "debug")` 包装后注入 re-analyze 上下文
   - 设置 `autoZoomOutTriggered.debug = true` 防止重复触发
```

Run: `grep -c "zoom-out" skills/forge-fix/SKILL.md`
Expected: output contains "1"（至少 1 处匹配）

**REFACTOR** — 确认与其他 SKILL.md 风格一致

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: exit 0

**Verify Command**: `grep -c "shouldAutoTriggerZoomOut" skills/forge-fix/SKILL.md`
**Commit Message**: `docs(forge-fix): add auto zoom-out trigger in log debug escalation`

---

### Task 4: 更新 forge-decide SKILL.md 增加自动 zoom-out 触发点

**Files**:
- MODIFY: `skills/forge-decide/SKILL.md`

**TDD Steps**:

**RED** — 验证当前 SKILL.md 不含 zoom-out 自动触发描述

Run: `grep -c "zoom-out\|zoom_out\|自动视角重置\|全局位置参考" skills/forge-decide/SKILL.md`
Expected: output contains "0"

**GREEN** — 在 §2 Round 2 Critic 之后追加自动触发 section

在 `skills/forge-decide/SKILL.md` 的 §2 末尾（Round 2 Critic Subagent 段落之后、"## 3." 之前）追加：

```markdown
### 自动视角重置（Auto Zoom-Out）

当 decide 阶段出现以下信号时，自动触发 zoom-out 打破局部锁定：

**触发条件**（满足任一即触发）：
- Subagent 评估 ≥ 2 轮且未达共识（`consensus_score` 低于阈值）
- 用户连续 3 次表达犹豫（「再想想」/「不确定」/「都行」）

**触发流程**：
1. 调用 `shouldAutoTriggerZoomOut({ scenario: "decide", decideRounds, decideConsensusReached, decideUserHesitationCount, alreadyTriggered })`
2. `shouldTrigger: true` → autonomous 模式直接执行 zoom-out；interactive 模式提示「当前讨论似乎陷入局部，建议先退后一步看看整体位置。是否继续？」
3. zoom-out 输出通过 `formatAutoZoomOutInjection(output, "decide")` 包装后注入下一轮 Subagent 的 system context
4. 设置 `autoZoomOutTriggered.decide = true` 防止重复触发

**与 Critic 的关系**：auto zoom-out 在 Critic 标记 `needs_revision` 后、视角修正前触发。不替代 Critic 审查。
```

Run: `grep -c "shouldAutoTriggerZoomOut" skills/forge-decide/SKILL.md`
Expected: output contains "1"

**REFACTOR** — 确认与 SKILL.md 格式风格一致

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts`
Expected: exit 0

**Verify Command**: `grep -c "shouldAutoTriggerZoomOut" skills/forge-decide/SKILL.md`
**Commit Message**: `docs(forge-decide): add auto zoom-out trigger for multi-round indecision`

---

### Task 5: 全量验证

**Files**:
- 无新增/修改

**TDD Steps**:

**RED** — 无（验证任务）

**GREEN** — 无

**REFACTOR** — 运行全量检查

Run: `npm run check`
Expected: exit 0

Run: `npx vitest run test/zoom-out-auto-trigger.property.test.ts test/zoom-out.property.test.ts`
Expected: exit 0

**Verify Command**: `npm run check`
**Commit Message**: `(no commit — verification only)`

---

## Self-Check

| Check | Result |
|-------|--------|
| Spec Coverage | 7 条验收标准全部覆盖：T1+T2 覆盖 #1-3, #5-7；T3 覆盖 #4；T4 覆盖 #2 |
| Placeholder Scan | 零占位符 |
| Type Consistency | `AutoTriggerContext`/`AutoTriggerDecision` 在 T1 定义，T3/T4 引用 |
| Dependencies | T2 依赖 T1（`renderZoomOut` 已存在）；T3/T4 依赖 T1（函数名引用）；T5 依赖全部 |
| Plan Structure | 5 tasks, <10 files, 无 split trigger |
