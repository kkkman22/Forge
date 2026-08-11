---
topic: "grill-auto-trigger-and-inline"
status: "draft"
date: "2026-05-14"
spec_ref: ".tinkerman/specs/grill-auto-trigger-and-inline/spec.md"
format: "full"
---

## Objective

将 `forge-grill` 核心纯函数下沉为内部能力库，新增 `src/grill-inline.ts` 编排辅助模块，让 `forge-spec` 和 `forge-decide` 可在检测到需求歧义或视角分歧时自动 inline 触发 grill 子流程。保留所有现有触发路径不变。

## Research Findings

- `src/grill.ts` (984 行) 已导出全部 8 个核心纯函数，签名稳定，无需修改
- `src/grill-trigger.ts` (81 行) 提供关键词检测和 tier 建议，inline 触发与之独立
- `src/index.ts` (206 行) 未导出 grill 相关函数，需追加 barrel 导出
- 现有 7 个 grill 测试文件覆盖核心逻辑 + PBT，inline 模块需要独立的单元测试和 PBT
- zoom-out-auto-trigger spec 已定义"用户连续 3 次犹豫"触发场景，本 spec 需与其协调优先级
- 所有 grill 函数 IO-free，inline 编排模块同样保持纯函数设计

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/grill-inline.ts` | CREATE | 编排辅助纯函数（5 个导出） |
| `test/grill-inline.test.ts` | CREATE | 单元测试覆盖所有判定分支 |
| `test/grill-inline.property.test.ts` | CREATE | PBT：频率控制不变量、模式分流幂等性 |
| `src/index.ts` | MODIFY | 追加 grill-inline barrel 导出 |
| `skills/forge-spec/SKILL.md` | MODIFY | Step 2 Review 后增加 inline grill 触发分支 |
| `skills/forge-decide/SKILL.md` | MODIFY | Round 2 Critic 后增加 inline grill 触发分支 |
| `skills/forge-grill/SKILL.md` | MODIFY | 标注已支持 inline 模式被 spec/decide 调用 |

## Task Breakdown

### Task 1：grill-inline 类型与 shouldTriggerInlineGrill（5 min）

**文件**：`src/grill-inline.ts`, `test/grill-inline.test.ts`

**RED** — 写失败测试

文件：`test/grill-inline.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  shouldTriggerInlineGrill,
  type GrillInlineReason,
  type AlreadyTriggered,
} from "../src/grill-inline.js";

const freshTriggered: AlreadyTriggered = {
  spec_high_ambiguity: false,
  decide_requirement_disagreement: false,
  decide_user_hesitation: false,
};

describe("shouldTriggerInlineGrill", () => {
  it("triggers for interactive + fresh state + spec_high_ambiguity", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "spec_high_ambiguity",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(true);
    expect(result.rationale).toContain("spec_high_ambiguity");
  });

  it("skips for autonomous mode regardless of reason", () => {
    const result = shouldTriggerInlineGrill({
      mode: "autonomous",
      reason: "spec_high_ambiguity",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(false);
    expect(result.rationale).toBe("autonomous_mode");
  });

  it("skips when reason already triggered in this session", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "spec_high_ambiguity",
      alreadyTriggered: {
        ...freshTriggered,
        spec_high_ambiguity: true,
      },
    });
    expect(result.trigger).toBe(false);
    expect(result.rationale).toBe("frequency_limit");
  });

  it("triggers for interactive + decide_requirement_disagreement when fresh", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "decide_requirement_disagreement",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(true);
  });

  it("triggers for interactive + decide_user_hesitation when fresh", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "decide_user_hesitation",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(true);
  });

  it("independent reasons are tracked separately", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "decide_requirement_disagreement",
      alreadyTriggered: {
        ...freshTriggered,
        spec_high_ambiguity: true,
      },
    });
    expect(result.trigger).toBe(true);
  });
});
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：失败 — "Cannot find module ../src/grill-inline.js"

**GREEN** — 写最少代码通过

文件：`src/grill-inline.ts`

```typescript
/**
 * Inline grill orchestration helpers — pure functions for automated
 * grill sub-process triggering from spec and decide phases.
 *
 * This module produces prompts, boolean decisions, and formatted injection
 * text. The actual inline sub-process loop is driven by the spec / decide
 * skill layer using the public grill functions from `grill.ts`.
 *
 * IO-free. No dependencies on state files or the router.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrillInlineMode = "spec" | "decide";

export type GrillInlineReason =
  | "spec_high_ambiguity"
  | "decide_requirement_disagreement"
  | "decide_user_hesitation";

export type GrillInlineResult =
  | { kind: "skipped"; reason: "autonomous_mode" | "user_declined" | "frequency_limit" }
  | { kind: "completed"; tree: unknown; alignmentSummary: string }
  | { kind: "abandoned"; partialTree: unknown };

export interface AlreadyTriggered {
  spec_high_ambiguity: boolean;
  decide_requirement_disagreement: boolean;
  decide_user_hesitation: boolean;
}

// ---------------------------------------------------------------------------
// Trigger decision
// ---------------------------------------------------------------------------

/**
 * Determine whether an inline grill sub-process should be triggered.
 *
 * Returns `{ trigger: true }` when:
 *   - mode is `interactive` (user can confirm or decline)
 *   - this specific reason has not already been triggered this session
 *
 * Returns `{ trigger: false }` when:
 *   - mode is `autonomous` (skip all inline grills)
 *   - this reason was already triggered (frequency control)
 */
export function shouldTriggerInlineGrill(input: {
  mode: "interactive" | "autonomous";
  reason: GrillInlineReason;
  alreadyTriggered: AlreadyTriggered;
}): { trigger: boolean; rationale: string } {
  if (input.mode === "autonomous") {
    return { trigger: false, rationale: "autonomous_mode" };
  }

  if (input.alreadyTriggered[input.reason]) {
    return { trigger: false, rationale: "frequency_limit" };
  }

  return { trigger: true, rationale: input.reason };
}
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：退出 0

**REFACTOR** — 无需重构，函数已经最小。

**验证命令**：`npx vitest run test/grill-inline.test.ts`
**提交信息**：`feat(grill-inline): add shouldTriggerInlineGrill with type definitions`

---

### Task 2：renderInlineGrillConfirmPrompt + renderInlineGrillAdvisory（3 min）

**文件**：`src/grill-inline.ts`, `test/grill-inline.test.ts`

**RED** — 追加失败测试

文件：`test/grill-inline.test.ts`（追加 describe block）

```typescript
import {
  shouldTriggerInlineGrill,
  renderInlineGrillConfirmPrompt,
  renderInlineGrillAdvisory,
  type AlreadyTriggered,
} from "../src/grill-inline.js";

describe("renderInlineGrillConfirmPrompt", () => {
  it("renders Chinese prompt for spec_high_ambiguity", () => {
    const result = renderInlineGrillConfirmPrompt("spec_high_ambiguity");
    expect(result).toContain("检测到");
    expect(result).toContain("模糊");
    expect(result).toContain("grill");
  });

  it("renders Chinese prompt for decide_requirement_disagreement", () => {
    const result = renderInlineGrillConfirmPrompt("decide_requirement_disagreement");
    expect(result).toContain("需求侧分歧");
    expect(result).toContain("grill");
  });

  it("renders Chinese prompt for decide_user_hesitation", () => {
    const result = renderInlineGrillConfirmPrompt("decide_user_hesitation");
    expect(result).toContain("犹豫");
    expect(result).toContain("grill");
  });
});

describe("renderInlineGrillAdvisory", () => {
  it("renders advisory with spec_high_ambiguity reason", () => {
    const result = renderInlineGrillAdvisory("spec_high_ambiguity");
    expect(result).toContain("spec_high_ambiguity");
    expect(result).toContain("autonomous");
    expect(result).toContain("/forge grill");
  });

  it("renders advisory with decide_requirement_disagreement reason", () => {
    const result = renderInlineGrillAdvisory("decide_requirement_disagreement");
    expect(result).toContain("decide_requirement_disagreement");
    expect(result).toContain("/forge grill");
  });

  it("renders advisory with decide_user_hesitation reason", () => {
    const result = renderInlineGrillAdvisory("decide_user_hesitation");
    expect(result).toContain("decide_user_hesitation");
  });
});
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：失败 — "renderInlineGrillConfirmPrompt is not a function"

**GREEN** — 追加到 `src/grill-inline.ts`

```typescript
// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

const CONFIRM_PROMPTS: Record<GrillInlineReason, string> = {
  spec_high_ambiguity:
    "检测到 spec 草案存在模糊点。是否进入 grill 子流程逐项澄清？",
  decide_requirement_disagreement:
    "检测到需求侧存在分歧。是否进入 grill 子流程澄清需求边界？",
  decide_user_hesitation:
    "检测到您对决策方向多次表达犹豫。是否进入 grill 子流程帮助厘清偏好？",
};

export function renderInlineGrillConfirmPrompt(reason: GrillInlineReason): string {
  return CONFIRM_PROMPTS[reason];
}

const ADVISORY_TEMPLATES: Record<GrillInlineReason, string> = {
  spec_high_ambiguity:
    `[Autonomous Advisory] spec_high_ambiguity detected in autonomous mode. ` +
    `Inline grill skipped. Recommend running \`/forge grill\` interactively ` +
    `after reviewing the generated spec to resolve ambiguity.`,
  decide_requirement_disagreement:
    `[Autonomous Advisory] decide_requirement_disagreement detected in autonomous mode. ` +
    `Inline grill skipped. Recommend running \`/forge grill\` interactively ` +
    `to resolve requirement-side disagreement between perspectives.`,
  decide_user_hesitation:
    `[Autonomous Advisory] decide_user_hesitation detected in autonomous mode. ` +
    `Inline grill skipped. Recommend running \`/forge grill\` interactively ` +
    `when the user is available to clarify preferences.`,
};

export function renderInlineGrillAdvisory(reason: GrillInlineReason): string {
  return ADVISORY_TEMPLATES[reason];
}
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：退出 0

**REFACTOR** — 无需重构。

**验证命令**：`npx vitest run test/grill-inline.test.ts`
**提交信息**：`feat(grill-inline): add renderInlineGrillConfirmPrompt and renderInlineGrillAdvisory`

---

### Task 3：formatInlineGrillInjection（3 min）

**文件**：`src/grill-inline.ts`, `test/grill-inline.test.ts`

**RED** — 追加失败测试

```typescript
import { formatInlineGrillInjection } from "../src/grill-inline.js";

describe("formatInlineGrillInjection", () => {
  it("formats completed result for spec mode", () => {
    const result = formatInlineGrillInjection(
      { kind: "completed", tree: {}, alignmentSummary: "3 items clarified" },
      "spec",
    );
    expect(result).toContain("[Inline Grill 对齐结果]");
    expect(result).toContain("spec");
    expect(result).toContain("3 items clarified");
  });

  it("formats completed result for decide mode", () => {
    const result = formatInlineGrillInjection(
      { kind: "completed", tree: {}, alignmentSummary: "requirements aligned" },
      "decide",
    );
    expect(result).toContain("[Inline Grill 对齐结果]");
    expect(result).toContain("decide");
    expect(result).toContain("requirements aligned");
  });

  it("formats skipped result with reason", () => {
    const result = formatInlineGrillInjection(
      { kind: "skipped", reason: "user_declined" },
      "spec",
    );
    expect(result).toContain("skipped");
    expect(result).toContain("user_declined");
  });

  it("formats abandoned result", () => {
    const result = formatInlineGrillInjection(
      { kind: "abandoned", partialTree: {} },
      "decide",
    );
    expect(result).toContain("abandoned");
  });
});
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：失败 — "formatInlineGrillInjection is not a function"

**GREEN** — 追加到 `src/grill-inline.ts`

```typescript
export function formatInlineGrillInjection(
  result: GrillInlineResult,
  mode: GrillInlineMode,
): string {
  if (result.kind === "completed") {
    return [
      `[Inline Grill 对齐结果 — ${mode}]`,
      `对齐摘要：${result.alignmentSummary}`,
      "请基于以上对齐结果重新生成内容。",
    ].join("\n");
  }

  if (result.kind === "skipped") {
    return `[Inline Grill] 已跳过 (${result.reason})。保留原始内容。`;
  }

  return `[Inline Grill] 已中止（用户中途退出）。部分对齐结果已丢弃。`;
}
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：退出 0

**验证命令**：`npx vitest run test/grill-inline.test.ts`
**提交信息**：`feat(grill-inline): add formatInlineGrillInjection`

---

### Task 4：barrel 导出 grill-inline（2 min）

**文件**：`src/index.ts`

**RED** — 追加失败测试

```typescript
import {
  shouldTriggerInlineGrill as barrelTrigger,
  renderInlineGrillConfirmPrompt as barrelConfirm,
  renderInlineGrillAdvisory as barrelAdvisory,
  formatInlineGrillInjection as barrelFormat,
} from "../src/index.js";

describe("grill-inline barrel exports", () => {
  it("re-exports shouldTriggerInlineGrill from index", () => {
    expect(typeof barrelTrigger).toBe("function");
  });

  it("re-exports renderInlineGrillConfirmPrompt from index", () => {
    expect(typeof barrelConfirm).toBe("function");
  });

  it("re-exports renderInlineGrillAdvisory from index", () => {
    expect(typeof barrelAdvisory).toBe("function");
  });

  it("re-exports formatInlineGrillInjection from index", () => {
    expect(typeof barrelFormat).toBe("function");
  });
});
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：失败 — barrel 导出不存在

**GREEN** — 追加到 `src/index.ts` 末尾

```typescript
// Inline grill orchestration
export {
  type AlreadyTriggered,
  type GrillInlineMode,
  type GrillInlineReason,
  type GrillInlineResult,
  formatInlineGrillInjection,
  renderInlineGrillAdvisory,
  renderInlineGrillConfirmPrompt,
  shouldTriggerInlineGrill,
} from "./grill-inline.js";
```

运行：`npx vitest run test/grill-inline.test.ts`
预期：退出 0

**REFACTOR** — 确认 import 顺序符合约定（std → 3rd party → relative）。已是最后一个 export block，位置正确。

**验证命令**：`npx vitest run test/grill-inline.test.ts`
**提交信息**：`feat(grill-inline): add barrel exports to src/index.ts`

---

### Task 5：PBT 覆盖 — 频率控制不变量与模式分流幂等性（5 min）

**文件**：`test/grill-inline.property.test.ts`

**RED** — 写 PBT 测试

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  shouldTriggerInlineGrill,
  renderInlineGrillAdvisory,
  formatInlineGrillInjection,
  type GrillInlineReason,
  type AlreadyTriggered,
  type GrillInlineResult,
  type GrillInlineMode,
} from "../src/grill-inline.js";

const REASONS: GrillInlineReason[] = [
  "spec_high_ambiguity",
  "decide_requirement_disagreement",
  "decide_user_hesitation",
];

const alreadyTriggeredArb: fc.Arbitrary<AlreadyTriggered> = fc.record({
  spec_high_ambiguity: fc.boolean(),
  decide_requirement_disagreement: fc.boolean(),
  decide_user_hesitation: fc.boolean(),
});

describe("shouldTriggerInlineGrill properties", () => {
  it("autonomous mode always returns trigger=false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REASONS),
        alreadyTriggeredArb,
        (reason, triggered) => {
          const result = shouldTriggerInlineGrill({
            mode: "autonomous",
            reason,
            alreadyTriggered: triggered,
          });
          expect(result.trigger).toBe(false);
          expect(result.rationale).toBe("autonomous_mode");
        },
      ),
    );
  });

  it("interactive + already triggered reason always returns trigger=false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REASONS),
        (reason) => {
          const triggered: AlreadyTriggered = {
            spec_high_ambiguity: true,
            decide_requirement_disagreement: true,
            decide_user_hesitation: true,
          };
          const result = shouldTriggerInlineGrill({
            mode: "interactive",
            reason,
            alreadyTriggered: triggered,
          });
          expect(result.trigger).toBe(false);
          expect(result.rationale).toBe("frequency_limit");
        },
      ),
    );
  });

  it("interactive + fresh reason always returns trigger=true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REASONS),
        (reason) => {
          const fresh: AlreadyTriggered = {
            spec_high_ambiguity: false,
            decide_requirement_disagreement: false,
            decide_user_hesitation: false,
          };
          const result = shouldTriggerInlineGrill({
            mode: "interactive",
            reason,
            alreadyTriggered: fresh,
          });
          expect(result.trigger).toBe(true);
          expect(result.rationale).toBe(reason);
        },
      ),
    );
  });

  it("is idempotent: same input always yields same output", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("interactive", "autonomous") as fc.Arbitrary<"interactive" | "autonomous">,
        fc.constantFrom(...REASONS),
        alreadyTriggeredArb,
        (mode, reason, triggered) => {
          const input = { mode, reason, alreadyTriggered: triggered };
          const a = shouldTriggerInlineGrill(input);
          const b = shouldTriggerInlineGrill(input);
          expect(a).toEqual(b);
        },
      ),
    );
  });
});

describe("renderInlineGrillAdvisory properties", () => {
  it("output always contains the reason string and '/forge grill'", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REASONS),
        (reason) => {
          const output = renderInlineGrillAdvisory(reason);
          expect(output).toContain(reason);
          expect(output).toContain("/forge grill");
        },
      ),
    );
  });
});

describe("formatInlineGrillInjection properties", () => {
  const completedResultArb: fc.Arbitrary<GrillInlineResult> = fc.record({
    kind: fc.constant("completed"),
    tree: fc.constant({}),
    alignmentSummary: fc.string({ minLength: 1 }),
  });

  it("completed result always contains alignment summary and mode", () => {
    fc.assert(
      fc.property(
        completedResultArb,
        fc.constantFrom<GrillInlineMode>("spec", "decide"),
        (result, mode) => {
          const output = formatInlineGrillInjection(result, mode);
          expect(output).toContain(result.alignmentSummary);
          expect(output).toContain(mode);
        },
      ),
    );
  });
});
```

运行：`npx vitest run test/grill-inline.property.test.ts`
预期：退出 0（所有函数已实现）

**GREEN** — 函数已在 Task 1-3 实现，PBT 只需验证。

**REFACTOR** — 无需。

**验证命令**：`npx vitest run test/grill-inline.property.test.ts`
**提交信息**：`test(grill-inline): add PBT for frequency control and mode dispatch`

---

### Task 6：SKILL.md 更新 — forge-spec（3 min）

**文件**：`skills/forge-spec/SKILL.md`

**REFACTOR** — 在 Step 2 Review 后追加 inline grill 触发分支描述。定位 Step 2 的结尾处，插入新段落：

```markdown
### Step 2a: Inline Grill Trigger (conditional)

After Step 2 Review completes:

1. If `ambiguity_score >= threshold`:
   - Call `shouldTriggerInlineGrill({ mode, reason: "spec_high_ambiguity", alreadyTriggered })`
   - `trigger: true` (interactive): Render `renderInlineGrillConfirmPrompt("spec_high_ambiguity")`, await user confirmation
     - User confirms: Run inline grill loop using `generateDecisionTree` / `selectNextQuestion` / `applyAnswer`, then `formatInlineGrillInjection` → re-generate draft → re-run Step 2 Review
     - User declines: Continue to Step 3 Lock with ambiguity warning preserved
   - `trigger: false` (autonomous): Render `renderInlineGrillAdvisory("spec_high_ambiguity")`, write to `.tinkerman/findings/spec-ambiguity-advisory-<topic>.md`, continue to Step 3
2. If `ambiguity_score < threshold`: Skip directly to Step 3 Lock

**Constraints**:
- Inline grill does NOT write `findings/grill-<topic>.md`
- Spec frontmatter: set `inline_grill_applied: true` when grill completed
- Frequency: at most once per session per reason
```

**验证命令**：`grep -c "Inline Grill Trigger" skills/forge-spec/SKILL.md`
预期：输出包含 "1" (输出包含 "1")
**提交信息**：`docs(spec-skill): add inline grill trigger branch after Step 2 Review`

---

### Task 7：SKILL.md 更新 — forge-decide（3 min）

**文件**：`skills/forge-decide/SKILL.md`

**REFACTOR** — 在 Round 2 Critic 后追加 inline grill 触发分支：

```markdown
### Round 2a: Inline Grill Trigger (conditional)

After Round 2 Critic output:

1. If Critic flags `disagreement_kind: "requirement_side"`:
   - Call `shouldTriggerInlineGrill({ mode, reason: "decide_requirement_disagreement", alreadyTriggered })`
   - `trigger: true` (interactive): Render confirmation prompt, run inline grill loop with subset of decision categories (functionality / boundary / non_goal only), inject via `formatInlineGrillInjection(result, "decide")` → re-run Round 1 for affected perspectives only
   - `trigger: false` (autonomous): Write advisory to decision document §否决记录
2. If user expresses hesitation 3 consecutive times + requirement_side disagreement detected:
   - **grill takes priority over zoom-out** (grill resolves root cause: unclear requirements)
3. If user expresses hesitation 3 consecutive times + only technical_side disagreement:
   - **zoom-out takes priority** (positional issue, not requirements)

**Constraints**:
- Technical-side disagreement does NOT trigger inline grill (handled by critic needs_revision)
- Frequency: at most once per session per reason
```

**验证命令**：`grep -c "Inline Grill Trigger" skills/forge-decide/SKILL.md`
预期：输出包含 "1" (输出包含 "1")
**提交信息**：`docs(decide-skill): add inline grill trigger branch after Round 2 Critic`

---

### Task 8：SKILL.md 更新 — forge-grill 标注（1 min）

**文件**：`skills/forge-grill/SKILL.md`

**REFACTOR** — 在 Overview 段落后追加：

```markdown
> **Inline Mode**: The core functions of this skill (`generateDecisionTree`, `selectNextQuestion`, `applyAnswer`, etc.) can be invoked directly by `forge-spec` and `forge-decide` as inline sub-processes. Inline invocations do not write `findings/grill-<topic>.md` and are invisible to the explicit grill session state. The explicit `/forge grill` entry point and all existing trigger paths remain unchanged.
```

**验证命令**：`grep -c "Inline Mode" skills/forge-grill/SKILL.md`
预期：输出包含 "1" (输出包含 "1")
**提交信息**：`docs(grill-skill): document inline mode availability for spec/decide`

---

### Task 9：dist 同步 + 全量回归（2 min）

**文件**：无新增

**REFACTOR** — 运行构建同步 dist 并验证全量测试通过。

运行：`npm run build && npx vitest run`
预期：退出 0

运行：`node scripts/check-dist-sync.mjs`
预期：退出 0

**提交信息**：`chore: sync dist/ after grill-inline module addition`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| AC1: spec ambiguity + interactive → Chinese confirm prompt | Task 2, 6 |
| AC2: spec ambiguity + autonomous → advisory file | Task 2, 6 |
| AC3: decide requirement_disagreement + interactive → confirm prompt | Task 2, 7 |
| AC4: decide technical_side → no inline grill | Task 7 |
| AC5: inline grill completed → alignment summary injection | Task 3, 6, 7 |
| AC6: frequency control → same reason returns skipped | Task 1, 5 |
| AC7: explicit /forge grill independent of frequency | Task 8 (docs confirm unchanged) |
| AC8: autonomous → kind: "skipped", reason: "autonomous_mode" | Task 1, 5 |
| AC9: hesitation + requirement disagreement → grill priority | Task 7 |
| AC10: hesitation + technical disagreement → zoom-out priority | Task 7 |
| AC11: inline grill glossary conflict → render clarification | Spec confirms reuses existing grill functions |
| AC12: spec frontmatter inline_grill_applied: true | Task 6 |
