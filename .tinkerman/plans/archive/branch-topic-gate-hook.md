---
topic: "branch-topic-gate-hook"
status: "approved"
date: "2026-05-14"
spec_ref: ".tinkerman/specs/branch-topic-gate-hook/spec.md"
format: "full"
---

# Plan: Branch Topic Gate Hook

> 来源: `.tinkerman/specs/branch-topic-gate-hook/spec.md`

## Objective

新增 `src/branch-gate.ts` 统一调度层，将现有 `src/branch-lifecycle.ts` 的 5 个纯函数包装为所有 skill 通用的 branch gate hook。不修改 branch-lifecycle.ts，不修改全局 main 保护规则。

## 文件映射

| File | Action | Reason |
|------|--------|--------|
| `src/branch-gate.ts` | CREATE | 统一调度层（types + runBranchGate + render + DEFAULT_SEVERITY） |
| `test/branch-gate.test.ts` | CREATE | 单元测试覆盖所有 result kinds |
| `test/branch-gate.property.test.ts` | CREATE | PBT：频率控制、严重度完备性、auto_fixed |
| `test/branch-gate-skill-integration.test.ts` | CREATE | 7 skill 接入点契约测试 |
| `src/index.ts` | MODIFY | barrel 导出 branch-gate 公共 API |
| `skills/forge-plan/SKILL.md` | MODIFY | §1.5 Pre-flight 增加 branch gate |
| `skills/forge-review/SKILL.md` | MODIFY | 同上 |
| `skills/forge-test/SKILL.md` | MODIFY | 同上 |
| `skills/forge-debug/SKILL.md` | MODIFY | 同上 |
| `skills/forge-learn/SKILL.md` | MODIFY | 同上 |
| `skills/forge-build/SKILL.md` | MODIFY | §2 Branch Gate 改为引用统一 hook |
| `skills/forge-ship/SKILL.md` | MODIFY | 同上 |

Spec 偏差说明：`BranchGateInput` 增加 `isCleanTree: boolean` 字段。Spec 接口未包含此字段，但 pure function 需要 tree clean 信息才能决定是否返回 `auto_fixed`。

---

## Task 1: runBranchGate 核心逻辑 + 类型 + DEFAULT_SEVERITY

**Files**:
- Create: `test/branch-gate.test.ts`
- Create: `src/branch-gate.ts`

### RED — 写失败测试

File: `test/branch-gate.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  runBranchGate,
  DEFAULT_SEVERITY,
  type BranchGateInput,
  type BranchGateResult,
  type BranchGateSkill,
} from "../src/branch-gate.js";
import type { PendingDeliveryRecord } from "../src/loop-types.js";

const baseInput = (overrides: Partial<BranchGateInput> = {}): BranchGateInput => ({
  skill: "build",
  mode: "interactive",
  currentBranch: "feature/my-task",
  currentTask: "my-task",
  pendingDeliveries: [],
  alreadyCheckedThisPhase: false,
  isCleanTree: true,
  ...overrides,
});

describe("runBranchGate", () => {
  it("returns passed when branch topic matches task", () => {
    const result = runBranchGate(baseInput());
    expect(result).toEqual({ kind: "passed" });
  });

  it("returns skipped when alreadyCheckedThisPhase is true", () => {
    const result = runBranchGate(baseInput({ alreadyCheckedThisPhase: true }));
    expect(result).toEqual({ kind: "skipped", reason: "already_checked_this_phase" });
  });

  it("returns skipped when currentTask is null", () => {
    const result = runBranchGate(baseInput({ currentTask: null }));
    expect(result).toEqual({ kind: "skipped", reason: "no_current_task" });
  });

  it("returns passed when on main branch (delegates to global protection)", () => {
    const result = runBranchGate(baseInput({ currentBranch: "main" }));
    expect(result).toEqual({ kind: "passed" });
  });

  it("returns passed when on master branch", () => {
    const result = runBranchGate(baseInput({ currentBranch: "master" }));
    expect(result).toEqual({ kind: "passed" });
  });

  it("returns blocked when branch topic mismatches and severity is block", () => {
    const result = runBranchGate(baseInput({
      currentBranch: "feature/other-task",
      currentTask: "my-task",
      skill: "build",
    }));
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.suggestedBranch).toBe("feature/my-task");
    }
  });

  it("returns warned when branch topic mismatches and severity is warn", () => {
    const result = runBranchGate(baseInput({
      currentBranch: "feature/other-task",
      currentTask: "my-task",
      skill: "plan",
    }));
    expect(result.kind).toBe("warned");
    if (result.kind === "warned") {
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.suggestedBranch).toBe("feature/my-task");
    }
  });

  it("returns blocked when branch format is invalid (not feature/forge)", () => {
    const result = runBranchGate(baseInput({
      currentBranch: "random-branch",
      currentTask: "my-task",
    }));
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reasons.some(r => r.includes("不符合"))).toBe(true);
    }
  });

  it("returns auto_fixed when autonomous + topic mismatch + clean tree + forge branch", () => {
    const result = runBranchGate(baseInput({
      mode: "autonomous",
      currentBranch: "forge/other-task",
      currentTask: "my-task",
      isCleanTree: true,
    }));
    expect(result.kind).toBe("auto_fixed");
    if (result.kind === "auto_fixed") {
      expect(result.previousBranch).toBe("forge/other-task");
      expect(result.newBranch).toBe("feature/my-task");
    }
  });

  it("returns blocked when autonomous + topic mismatch + dirty tree", () => {
    const result = runBranchGate(baseInput({
      mode: "autonomous",
      currentBranch: "feature/other-task",
      currentTask: "my-task",
      isCleanTree: false,
      skill: "build",
    }));
    expect(result.kind).toBe("blocked");
  });

  it("returns warned when unshipped branches detected", () => {
    const deliveries: PendingDeliveryRecord[] = [
      { branchName: "feature/old-task", topic: "old-task", timestamp: Date.now() - 86400000 },
    ];
    const result = runBranchGate(baseInput({ pendingDeliveries: deliveries }));
    expect(result.kind).toBe("warned");
    if (result.kind === "warned") {
      expect(result.reasons.some(r => r.includes("未完成"))).toBe(true);
    }
  });

  it("severityOverride overrides default severity", () => {
    const result = runBranchGate(baseInput({
      currentBranch: "feature/other-task",
      currentTask: "my-task",
      skill: "debug",
      severityOverride: "block",
    }));
    expect(result.kind).toBe("blocked");
  });

  it("warn severity with format-invalid branch returns warned not blocked", () => {
    const result = runBranchGate(baseInput({
      currentBranch: "random-branch",
      currentTask: "my-task",
      skill: "plan",
    }));
    expect(result.kind).toBe("warned");
  });
});

describe("DEFAULT_SEVERITY", () => {
  it("maps every skill to a severity", () => {
    const skills: BranchGateSkill[] = ["plan", "build", "review", "test", "ship", "debug", "learn"];
    for (const skill of skills) {
      expect(DEFAULT_SEVERITY[skill]).toBeDefined();
    }
  });

  it("build, review, test, ship are block", () => {
    expect(DEFAULT_SEVERITY.build).toBe("block");
    expect(DEFAULT_SEVERITY.review).toBe("block");
    expect(DEFAULT_SEVERITY.test).toBe("block");
    expect(DEFAULT_SEVERITY.ship).toBe("block");
  });

  it("plan, debug, learn are warn", () => {
    expect(DEFAULT_SEVERITY.plan).toBe("warn");
    expect(DEFAULT_SEVERITY.debug).toBe("warn");
    expect(DEFAULT_SEVERITY.learn).toBe("warn");
  });
});
```

Run: `npx vitest run test/branch-gate.test.ts`
Expected: FAIL -- "Cannot find module ../src/branch-gate.js"

### GREEN — 实现最少代码通过测试

File: `src/branch-gate.ts`

```typescript
/**
 * Branch gate — unified dispatch layer for branch-topic consistency checks.
 *
 * Wraps the 5 pure functions from branch-lifecycle.ts into a single entry point
 * used by all forge skills at their §1.5 Pre-flight step.
 *
 * Pure function — no side effects. The SKILL layer handles I/O
 * (reading git state, running checkout, persisting findings).
 */

import {
  checkBranchTopicGate,
  detectUnshippedBranches,
  extractBranchTopic,
} from "./branch-lifecycle.js";
import type { PendingDeliveryRecord } from "./loop-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BranchGateSkill =
  | "plan" | "build" | "review" | "test" | "ship" | "debug" | "learn";

export type BranchGateMode = "autonomous" | "interactive";

export type BranchGateSeverity = "block" | "warn";

export type BranchGateResult =
  | { kind: "passed" }
  | { kind: "skipped"; reason: "already_checked_this_phase" | "no_current_task" }
  | { kind: "blocked"; reasons: string[]; suggestedBranch: string }
  | { kind: "warned"; reasons: string[]; suggestedBranch: string }
  | { kind: "auto_fixed"; previousBranch: string; newBranch: string };

export interface BranchGateInput {
  skill: BranchGateSkill;
  mode: BranchGateMode;
  currentBranch: string;
  currentTask: string | null;
  pendingDeliveries: PendingDeliveryRecord[];
  alreadyCheckedThisPhase: boolean;
  isCleanTree: boolean;
  severityOverride?: BranchGateSeverity;
}

// ---------------------------------------------------------------------------
// Default severity mapping
// ---------------------------------------------------------------------------

export const DEFAULT_SEVERITY: Record<BranchGateSkill, BranchGateSeverity> = {
  plan: "warn",
  build: "block",
  review: "block",
  test: "block",
  ship: "block",
  debug: "warn",
  learn: "warn",
};

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

/**
 * Unified branch gate — all skills call this at §1.5 Pre-flight.
 * Pure function: no I/O, no side effects.
 */
export function runBranchGate(input: BranchGateInput): BranchGateResult {
  // 1. Frequency control
  if (input.alreadyCheckedThisPhase) {
    return { kind: "skipped", reason: "already_checked_this_phase" };
  }

  // 2. No current task
  if (input.currentTask === null) {
    return { kind: "skipped", reason: "no_current_task" };
  }

  // 3. main/master — delegate to global protection in commands/forge.md
  if (input.currentBranch === "main" || input.currentBranch === "master") {
    return { kind: "passed" };
  }

  const severity = input.severityOverride ?? DEFAULT_SEVERITY[input.skill];

  // 4. Branch topic gate
  const gateResult = checkBranchTopicGate(input.currentBranch, input.currentTask);

  if (!gateResult.allowed) {
    const suggestedBranch = `feature/${input.currentTask}`;
    const branchTopic = extractBranchTopic(input.currentBranch);

    // Autonomous auto-fix: topic mismatch (not format issue), clean tree
    if (
      input.mode === "autonomous"
      && branchTopic !== null
      && input.isCleanTree
    ) {
      return {
        kind: "auto_fixed",
        previousBranch: input.currentBranch,
        newBranch: suggestedBranch,
      };
    }

    if (severity === "block") {
      return { kind: "blocked", reasons: gateResult.reasons, suggestedBranch };
    }
    return { kind: "warned", reasons: gateResult.reasons, suggestedBranch };
  }

  // 5. Unshipped branches — always advisory (never block)
  const unshipped = detectUnshippedBranches(input.pendingDeliveries, input.currentTask);
  if (unshipped.length > 0) {
    return {
      kind: "warned",
      reasons: unshipped.map(u => u.message),
      suggestedBranch: input.currentBranch,
    };
  }

  return { kind: "passed" };
}

// ---------------------------------------------------------------------------
// Render helpers (Task 2)
// ---------------------------------------------------------------------------

export function renderBranchGatePrompt(_result: BranchGateResult): string {
  return "";
}

export function renderBranchGateAdvisory(_result: BranchGateResult): string {
  return "";
}
```

Run: `npx vitest run test/branch-gate.test.ts`
Expected: exit 0

### REFACTOR — 类型对齐、命名一致性

Run: `npx vitest run test/branch-gate.test.ts`
Expected: exit 0

Commit: `feat(branch-gate): add runBranchGate core dispatch + DEFAULT_SEVERITY + types`

---

## Task 2: renderBranchGatePrompt + renderBranchGateAdvisory

**Files**:
- Modify: `test/branch-gate.test.ts`
- Modify: `src/branch-gate.ts`

### RED — 写失败测试

追加到 `test/branch-gate.test.ts`：

```typescript
import { renderBranchGatePrompt, renderBranchGateAdvisory } from "../src/branch-gate.js";

describe("renderBranchGatePrompt", () => {
  it("renders blocked result with Chinese 3-option prompt", () => {
    const result = renderBranchGatePrompt({
      kind: "blocked",
      reasons: ["分支 topic \"other\" 与任务 topic \"my-task\" 不匹配"],
      suggestedBranch: "feature/my-task",
    });
    expect(result).toContain("feature/my-task");
    expect(result).toContain("强制继续");
    expect(result).toContain("中止");
  });

  it("renders warned result with Chinese notice", () => {
    const result = renderBranchGatePrompt({
      kind: "warned",
      reasons: ["分支 \"feature/old\" (topic: old) 有未完成的交付记录"],
      suggestedBranch: "feature/my-task",
    });
    expect(result).toContain("警告");
  });

  it("renders auto_fixed result", () => {
    const result = renderBranchGatePrompt({
      kind: "auto_fixed",
      previousBranch: "feature/old",
      newBranch: "feature/my-task",
    });
    expect(result).toContain("feature/my-task");
    expect(result).toContain("已自动切换");
  });

  it("renders empty for passed", () => {
    expect(renderBranchGatePrompt({ kind: "passed" })).toBe("");
  });

  it("renders empty for skipped", () => {
    expect(renderBranchGatePrompt({ kind: "skipped", reason: "already_checked_this_phase" })).toBe("");
  });
});

describe("renderBranchGateAdvisory", () => {
  it("renders autonomous blocked advisory", () => {
    const result = renderBranchGateAdvisory({
      kind: "blocked",
      reasons: ["分支 topic \"other\" 与任务 topic \"my-task\" 不匹配"],
      suggestedBranch: "feature/my-task",
    });
    expect(result).toContain("branch-gate-blocked");
    expect(result).toContain("feature/my-task");
  });

  it("renders unshipped branches advisory", () => {
    const result = renderBranchGateAdvisory({
      kind: "warned",
      reasons: ["分支 \"feature/old\" 有未完成的交付记录"],
      suggestedBranch: "feature/current",
    });
    expect(result).toContain("未交付");
  });

  it("renders empty for passed", () => {
    expect(renderBranchGateAdvisory({ kind: "passed" })).toBe("");
  });
});
```

Run: `npx vitest run test/branch-gate.test.ts`
Expected: FAIL -- "renders blocked" 或 "renders warned" 断言失败（render 函数返回空字符串）

### GREEN — 实现渲染函数

替换 `src/branch-gate.ts` 中 render 函数的 stub：

```typescript
export function renderBranchGatePrompt(result: BranchGateResult): string {
  switch (result.kind) {
    case "passed":
    case "skipped":
      return "";
    case "blocked":
      return [
        `🚫 分支门禁阻断：`,
        ...result.reasons.map(r => `  - ${r}`),
        ``,
        `建议分支：${result.suggestedBranch}`,
        ``,
        `选项：`,
        `  1. 切换到 ${result.suggestedBranch}`,
        `  2. 强制继续（覆盖严重度）`,
        `  3. 中止 skill`,
      ].join("\n");
    case "warned":
      return [
        `⚠️ 分支门禁警告：`,
        ...result.reasons.map(r => `  - ${r}`),
        ``,
        `建议分支：${result.suggestedBranch}`,
      ].join("\n");
    case "auto_fixed":
      return `✅ 已自动切换到 ${result.newBranch}（原分支：${result.previousBranch}）`;
  }
}

export function renderBranchGateAdvisory(result: BranchGateResult): string {
  switch (result.kind) {
    case "passed":
    case "skipped":
      return "";
    case "blocked":
      return [
        `## Branch Gate Advisory (branch-gate-blocked)`,
        ``,
        `Branch gate blocked execution.`,
        ...result.reasons.map(r => `- ${r}`),
        ``,
        `Suggested branch: ${result.suggestedBranch}`,
        `Action: switch to the suggested branch and retry.`,
      ].join("\n");
    case "warned":
      return [
        `## Branch Gate Advisory (branch-gate-warned)`,
        ``,
        ...result.reasons.map(r => `- ${r}`),
        ``,
        `未交付分支 detected — consider completing their lifecycle (merge/PR/discard).`,
      ].join("\n");
    case "auto_fixed":
      return `Branch gate auto-fixed: ${result.previousBranch} → ${result.newBranch}`;
  }
}
```

Run: `npx vitest run test/branch-gate.test.ts`
Expected: exit 0

### REFACTOR

Run: `npx vitest run test/branch-gate.test.ts`
Expected: exit 0

Commit: `feat(branch-gate): add renderBranchGatePrompt + renderBranchGateAdvisory`

---

## Task 3: Barrel 导出

**Files**:
- Modify: `src/index.ts`

### GREEN — 添加导出

在 `src/index.ts` 的 `// Plan engine` 注释块之前添加：

```typescript
// Branch gate
export {
  DEFAULT_SEVERITY,
  type BranchGateInput,
  type BranchGateMode,
  type BranchGateResult,
  type BranchGateSeverity,
  type BranchGateSkill,
  renderBranchGateAdvisory,
  renderBranchGatePrompt,
  runBranchGate,
} from "./branch-gate.js";
```

Run: `npx vitest run test/branch-gate.test.ts`
Expected: exit 0

Run: `npx vitest run test/barrel-file.test.ts`
Expected: exit 0

Commit: `feat(branch-gate): add barrel exports to index.ts`

---

## Task 4: PBT 测试

**Files**:
- Create: `test/branch-gate.property.test.ts`

### RED + GREEN

File: `test/branch-gate.property.test.ts`

```typescript
/**
 * Property-based tests for branch-gate module.
 *
 * Invariants:
 * 1. Frequency control: alreadyCheckedThisPhase=true always returns skipped
 * 2. Severity mapping: every BranchGateSkill has a DEFAULT_SEVERITY entry
 * 3. auto_fixed only when mode=autonomous + clean tree + valid branch format
 * 4. main/master always passes
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEVERITY,
  runBranchGate,
  type BranchGateInput,
  type BranchGateSkill,
} from "../src/branch-gate.js";

const branchSkillArb = fc.constantFrom<BranchGateSkill>(
  "plan", "build", "review", "test", "ship", "debug", "learn",
);

const branchNameArb = fc.oneof(
  fc.tuple(fc.constantFrom("feature", "forge"), fc.string({ minLength: 1, maxLength: 20 }))
    .map(([prefix, topic]) => `${prefix}/${topic}`),
  fc.string({ minLength: 1, maxLength: 20 }),
);

const baseInput = (overrides: Partial<BranchGateInput> = {}): BranchGateInput => ({
  skill: "build",
  mode: "interactive",
  currentBranch: "feature/test-task",
  currentTask: "test-task",
  pendingDeliveries: [],
  alreadyCheckedThisPhase: false,
  isCleanTree: true,
  ...overrides,
});

describe("Branch Gate PBT", () => {
  it("alreadyCheckedThisPhase=true always returns skipped", () => {
    fc.assert(
      fc.property(branchSkillArb, branchNameArb, fc.string({ minLength: 1 }), (skill, branch, task) => {
        const result = runBranchGate(baseInput({
          skill,
          currentBranch: branch,
          currentTask: task,
          alreadyCheckedThisPhase: true,
        }));
        return result.kind === "skipped"
          && (result as { reason: string }).reason === "already_checked_this_phase";
      }),
    );
  });

  it("currentTask=null always returns skipped", () => {
    fc.assert(
      fc.property(branchSkillArb, branchNameArb, (skill, branch) => {
        const result = runBranchGate(baseInput({
          skill,
          currentBranch: branch,
          currentTask: null,
        }));
        return result.kind === "skipped"
          && (result as { reason: string }).reason === "no_current_task";
      }),
    );
  });

  it("DEFAULT_SEVERITY covers all skills", () => {
    const skills: BranchGateSkill[] = ["plan", "build", "review", "test", "ship", "debug", "learn"];
    for (const skill of skills) {
      expect(["block", "warn"]).toContain(DEFAULT_SEVERITY[skill]);
    }
  });

  it("main/master branch always passes regardless of other inputs", () => {
    fc.assert(
      fc.property(branchSkillArb, fc.constantFrom("autonomous", "interactive"), (skill, mode) => {
        const result = runBranchGate(baseInput({
          skill,
          mode: mode as BranchGateInput["mode"],
          currentBranch: "main",
          currentTask: "anything",
        }));
        return result.kind === "passed";
      }),
    );
  });

  it("auto_fixed only when autonomous + clean tree + valid format + topic mismatch", () => {
    fc.assert(
      fc.property(
        branchSkillArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter(t => t !== "target-task"),
        (skill, otherTopic) => {
          // clean tree + autonomous → auto_fixed
          const resultClean = runBranchGate(baseInput({
            skill,
            mode: "autonomous",
            currentBranch: `feature/${otherTopic}`,
            currentTask: "target-task",
            isCleanTree: true,
          }));
          if (resultClean.kind !== "auto_fixed") return false;

          // dirty tree → not auto_fixed
          const resultDirty = runBranchGate(baseInput({
            skill,
            mode: "autonomous",
            currentBranch: `feature/${otherTopic}`,
            currentTask: "target-task",
            isCleanTree: false,
          }));
          return resultDirty.kind !== "auto_fixed";
        },
      ),
    );
  });
});
```

Run: `npx vitest run test/branch-gate.property.test.ts`
Expected: exit 0

Commit: `test(branch-gate): add property-based tests for invariants`

---

## Task 5: Skill 集成测试

**Files**:
- Create: `test/branch-gate-skill-integration.test.ts`

### RED + GREEN

File: `test/branch-gate-skill-integration.test.ts`

```typescript
/**
 * Integration tests verifying each skill's default severity and
 * the contract between skill access points and runBranchGate.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEVERITY,
  runBranchGate,
  type BranchGateInput,
  type BranchGateSkill,
} from "../src/branch-gate.js";

const skills: BranchGateSkill[] = ["plan", "build", "review", "test", "ship", "debug", "learn"];

const baseInput = (overrides: Partial<BranchGateInput> = {}): BranchGateInput => ({
  skill: "build",
  mode: "interactive",
  currentBranch: "feature/my-task",
  currentTask: "my-task",
  pendingDeliveries: [],
  alreadyCheckedThisPhase: false,
  isCleanTree: true,
  ...overrides,
});

describe("Skill integration", () => {
  it.each(skills)("skill %s: correct branch → passed", (skill) => {
    const result = runBranchGate(baseInput({ skill, currentBranch: `feature/my-task`, currentTask: "my-task" }));
    expect(result.kind).toBe("passed");
  });

  it.each(skills)("skill %s: wrong branch obeys default severity", (skill) => {
    const result = runBranchGate(baseInput({
      skill,
      currentBranch: "feature/other-task",
      currentTask: "my-task",
    }));
    const expected = DEFAULT_SEVERITY[skill] === "block" ? "blocked" : "warned";
    expect(result.kind).toBe(expected);
  });

  it.each(skills)("skill %s: severityOverride overrides default", (skill) => {
    const result = runBranchGate(baseInput({
      skill,
      currentBranch: "feature/other-task",
      currentTask: "my-task",
      severityOverride: "block",
    }));
    expect(result.kind).toBe("blocked");
  });

  it.each(skills)("skill %s: alreadyCheckedThisPhase skips", (skill) => {
    const result = runBranchGate(baseInput({
      skill,
      alreadyCheckedThisPhase: true,
    }));
    expect(result.kind).toBe("skipped");
  });

  it("debug with --cross-branch (severityOverride: warn) allows cross-branch", () => {
    const result = runBranchGate(baseInput({
      skill: "debug",
      currentBranch: "feature/other-task",
      currentTask: "my-task",
      severityOverride: "warn",
    }));
    expect(result.kind).toBe("warned");
  });
});
```

Run: `npx vitest run test/branch-gate-skill-integration.test.ts`
Expected: exit 0

Commit: `test(branch-gate): add skill integration tests for 7 access points`

---

## Task 6: SKILL.md §1.5 Pre-flight 更新

**Files**:
- Modify: `skills/forge-plan/SKILL.md`
- Modify: `skills/forge-review/SKILL.md`
- Modify: `skills/forge-test/SKILL.md`
- Modify: `skills/forge-debug/SKILL.md`
- Modify: `skills/forge-learn/SKILL.md`
- Modify: `skills/forge-build/SKILL.md`
- Modify: `skills/forge-ship/SKILL.md`

### 实施说明

对每个 SKILL.md，在 Overview（§1）之后、主流程（§2）之前插入：

```markdown
### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "<skill_name>", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

默认严重度：<severity_value>。可通过 `severityOverride` 覆盖。
```

各 skill 的 severity 值：
- forge-plan: `warn`
- forge-build: `block`（替换现有 §2 Branch Gate 逻辑为引用 hook）
- forge-review: `block`
- forge-test: `block`
- forge-ship: `block`（替换现有逻辑为引用 hook）
- forge-debug: `warn`
- forge-learn: `warn`

**forge-build / forge-ship 特殊处理**：现有 §2 Branch Gate 的 inline 逻辑改为 `runBranchGate` 调用，行为零回归。

Run: `grep -c "Branch Gate" skills/forge-*/SKILL.md`
Expected: 每个文件至少 1 match

Commit: `docs(skills): add §1.5 Branch Gate pre-flight to all 7 skills`

---

## Self-Check

| Check | Result |
|-------|--------|
| Spec Coverage | 验收标准 1-10 全部覆盖 |
| Placeholder Scan | 零占位符 |
| Type Consistency | BranchGateInput 引用 PendingDeliveryRecord（loop-types.ts 已定义）|
| Dependencies | Task 1-2 无外部依赖；Task 3 依赖 Task 1；Task 4-5 依赖 Task 1；Task 6 独立 |
