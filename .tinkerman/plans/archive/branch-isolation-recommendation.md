---
topic: "branch-isolation-recommendation"
status: "approved"
date: "2026-05-10"
spec_ref: ".tinkerman/specs/branch-isolation-recommendation/spec.md"
format: "full"
---

## Objective

为 Branch Gate 增加隔离方式推荐逻辑。当分支不匹配时，基于工作树状态、活跃 worktree 数量、任务档位推荐 feature 分支或 worktree，通过 AskUserQuestion 让开发者选择。纯函数 + SKILL 层集成，不改现有函数签名。

## Research Findings

- `branch-lifecycle.ts` 有 `checkBranchTopicGate` 纯函数，返回 `{ allowed, reasons }` — 不改
- `worktree-manager.ts` 有 `canCreateWorktree(activeCount, maxConcurrent)` — 不改
- `run-manager.ts` 的 worktree 计数逻辑内联在 `setupWorktree()` 中（用 `git worktree list --porcelain`），需提取为独立纯函数
- 测试风格：项目用 fast-check property-based testing + vitest
- `branch-gate.md` Branch State Table 第四行（mismatch）直接阻断，是主要改动点
- `loop-types.ts` 已有 `BranchTopicGateResult` 等分支相关类型

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/branch-lifecycle.ts` | MODIFY | 新增 `IsolationRecommendation` 类型 + `recommendIsolationStrategy` 纯函数 |
| `src/worktree-manager.ts` | MODIFY | 新增 `countActiveWorktrees` 纯函数（从 porcelain 输出解析） |
| `src/loop-types.ts` | MODIFY | 新增 `IsolationRecommendation` 接口 |
| `test/branch-lifecycle-isolation.property.test.ts` | CREATE | `recommendIsolationStrategy` 属性测试 |
| `test/worktree-manager-count.property.test.ts` | CREATE | `countActiveWorktrees` 属性测试 |
| `skills/forge-build/references/branch-gate.md` | MODIFY | Branch State Table 扩展推荐行 |

## Task Breakdown

### Task 1：定义 IsolationRecommendation 类型（3 min）

**文件**：`src/loop-types.ts`

**RED** — 写失败的测试

文件：`test/branch-lifecycle-isolation.property.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { recommendIsolationStrategy } from "../src/branch-lifecycle.js";

describe("recommendIsolationStrategy", () => {
  it("recommends feature branch for clean tree with no worktrees", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 0,
      tier: "standard",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("feature");
    expect(result.secondary).toBe("worktree");
  });
});
```

Run: `npx vitest run test/branch-lifecycle-isolation.property.test.ts`
Expected: FAIL -- "recommendIsolationStrategy is not defined"

**GREEN** — 写最少代码让测试通过

文件：`src/loop-types.ts` — 新增接口

```typescript
export interface IsolationRecommendation {
  /** Recommended primary isolation strategy. */
  primary: "feature" | "worktree";
  /** Fallback strategy. */
  secondary: "stash-feature" | "feature";
  /** Human-readable reason for the recommendation. */
  reason: string;
}

export interface IsolationContext {
  dirtyTree: boolean;
  activeWorktrees: number;
  tier: "light" | "standard" | "full";
  maxConcurrent: number;
}
```

文件：`src/branch-lifecycle.ts` — 新增函数

```typescript
export function recommendIsolationStrategy(
  ctx: IsolationContext,
): IsolationRecommendation {
  // Worktree at capacity → fallback to feature
  if (ctx.activeWorktrees >= ctx.maxConcurrent) {
    return {
      primary: "stash-feature",
      secondary: "worktree",
      reason: `worktree 并发上限已满 (${ctx.activeWorktrees}/${ctx.maxConcurrent})`,
    };
  }

  // Dirty tree → recommend worktree to avoid stash
  if (ctx.dirtyTree) {
    return {
      primary: "worktree",
      secondary: "stash-feature",
      reason: "工作树有未提交变更",
    };
  }

  // Full tier → recommend worktree for stronger isolation
  if (ctx.tier === "full") {
    return {
      primary: "worktree",
      secondary: "feature",
      reason: "Full tier 任务推荐 worktree 隔离",
    };
  }

  // Has active worktrees → keep consistency
  if (ctx.activeWorktrees >= 1) {
    return {
      primary: "worktree",
      secondary: "feature",
      reason: "已有活跃 worktree，保持并行开发一致性",
    };
  }

  // Default: clean tree, no worktrees, light/standard → feature branch
  return {
    primary: "feature",
    secondary: "worktree",
    reason: "工作树干净，推荐创建 feature 分支",
  };
}
```

Run: `npx vitest run test/branch-lifecycle-isolation.property.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构，函数已最小

**验证命令**：`npx vitest run test/branch-lifecycle-isolation.property.test.ts`
**提交信息**：`feat(branch): add recommendIsolationStrategy pure function`

### Task 2：实现 countActiveWorktrees 纯函数（3 min）

**文件**：`src/worktree-manager.ts`

**RED** — 写失败的测试

文件：`test/worktree-manager-count.property.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { countActiveWorktrees } from "../src/worktree-manager.js";

describe("countActiveWorktrees", () => {
  it("returns 0 for empty porcelain output", () => {
    expect(countActiveWorktrees("")).toBe(0);
  });

  it("counts worktree lines minus 1 for main", () => {
    const output = "worktree /repo/main\nbranch main\nworktree /repo/feat\nbranch feat";
    expect(countActiveWorktrees(output)).toBe(1);
  });

  it("returns 0 for single main worktree", () => {
    const output = "worktree /repo/main\nbranch main";
    expect(countActiveWorktrees(output)).toBe(0);
  });
});
```

Run: `npx vitest run test/worktree-manager-count.property.test.ts`
Expected: FAIL -- "countActiveWorktrees is not defined"

**GREEN** — 写最少代码让测试通过

文件：`src/worktree-manager.ts` — 新增导出函数

```typescript
/**
 * Count additional (non-main) worktrees from `git worktree list --porcelain` output.
 *
 * Returns `max(0, worktreeLineCount - 1)` since the main working tree
 * is always listed first.
 *
 * @param porcelainOutput  Raw output from `git worktree list --porcelain`.
 * @returns Number of additional worktrees beyond the main one.
 */
export function countActiveWorktrees(porcelainOutput: string): number {
  if (!porcelainOutput || porcelainOutput.trim() === "") return 0;
  const worktreeLines = porcelainOutput
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
  return Math.max(0, worktreeLines.length - 1);
}
```

Run: `npx vitest run test/worktree-manager-count.property.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

**验证命令**：`npx vitest run test/worktree-manager-count.property.test.ts`
**提交信息**：`feat(worktree): add countActiveWorktrees porcelain parser`

### Task 3：扩展 Branch Gate 状态表（3 min）

**文件**：`skills/forge-build/references/branch-gate.md`

**RED** — 现有测试应保持通过

Run: `npx vitest run test/branch-lifecycle-preservation.property.test.ts`
Expected: exit 0

**GREEN** — 修改 Branch State Table

将 `branch-gate.md` 的 Branch State Table 从：

```markdown
| Branch State | Action |
|---|---|
| On matching `feature/<topic>` | ✅ Pass |
| Other, branch exists | `git checkout` |
| Other, branch missing | `git checkout -b` |
| `feature/<topic>` mismatch | 🚫 Block |
```

改为：

```markdown
| Branch State | Action |
|---|---|
| On matching `feature/<topic>` | ✅ Pass |
| Other, branch exists, clean tree | `git checkout` |
| Other, branch missing, clean tree | `git checkout -b` |
| Not on `feature/<topic>` or `forge/<topic>` | → Isolation Recommendation (below) |
| `feature/<topic>` mismatch (different topic) | 🚫 Block |

## Isolation Recommendation

When Branch Gate detects the developer is not on a matching branch, call
`recommendIsolationStrategy` with current context:

```
inputs:
  dirtyTree:      `git status --porcelain` non-empty
  activeWorktrees: countActiveWorktrees(`git worktree list --porcelain`)
  tier:           from .tinkerman/status.md routing tier
  maxConcurrent:  DEFAULT_MAX_CONCURRENT (3)
```

Present `AskUserQuestion` with:
- **Option 1 (Recommended)**: `result.primary` — with `result.reason`
- **Option 2**: `result.secondary`

Selected option → execute corresponding git command:
- `feature` → `git checkout -b feature/<topic>`
- `worktree` → create worktree via `RunManager.setupWorktree` logic
- `stash-feature` → `git stash` → `git checkout -b feature/<topic>`
```

Run: `npx vitest run test/branch-lifecycle-preservation.property.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

**验证命令**：`npx vitest run test/branch-lifecycle-preservation.property.test.ts`
**提交信息**：`docs(branch-gate): add isolation recommendation to Branch State Table`

### Task 4：补充 recommendIsolationStrategy 属性测试（3 min）

**文件**：`test/branch-lifecycle-isolation.property.test.ts`

**RED** — 扩展测试覆盖所有 spec 场景

```typescript
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { recommendIsolationStrategy } from "../src/branch-lifecycle.js";

describe("recommendIsolationStrategy properties", () => {
  // S1: clean + no worktrees + light/standard → feature
  it("recommends feature for clean tree, no worktrees, standard tier", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false, activeWorktrees: 0, tier: "standard", maxConcurrent: 3,
    });
    expect(result.primary).toBe("feature");
  });

  // S2: dirty tree → worktree
  it("recommends worktree for dirty tree", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: true, activeWorktrees: 0, tier: "standard", maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
    expect(result.secondary).toBe("stash-feature");
  });

  // S3: active worktrees ≥ 1 → worktree
  it("recommends worktree when active worktrees exist", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false, activeWorktrees: 1, tier: "standard", maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
  });

  // S4: full tier → worktree
  it("recommends worktree for full tier", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false, activeWorktrees: 0, tier: "full", maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
  });

  // S5: at capacity → stash-feature
  it("falls back to stash-feature when worktree capacity reached", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: true, activeWorktrees: 3, tier: "standard", maxConcurrent: 3,
    });
    expect(result.primary).toBe("stash-feature");
  });

  // S6: Jira-style topic compatibility (no topic validation in function)
  it("ignores topic format — decision is state-based only", () => {
    const a = recommendIsolationStrategy({
      dirtyTree: false, activeWorktrees: 0, tier: "standard", maxConcurrent: 3,
    });
    expect(a.primary).toBe("feature");
    // Same result regardless of what topic string is used externally
  });

  // Property: capacity check always wins over other conditions
  it("capacity check has highest priority", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 3, max: 10 }),
        fc.constantFrom("light", "standard", "full"),
        (dirtyTree, activeWorktrees, tier) => {
          const result = recommendIsolationStrategy({
            dirtyTree, activeWorktrees, tier, maxConcurrent: 3,
          });
          expect(result.primary).toBe("stash-feature");
        },
      ),
    );
  });

  // Property: reason is always non-empty
  it("always provides a non-empty reason", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        fc.constantFrom("light", "standard", "full"),
        (dirtyTree, activeWorktrees, tier) => {
          const result = recommendIsolationStrategy({
            dirtyTree, activeWorktrees, tier, maxConcurrent: 3,
          });
          expect(result.reason.length).toBeGreaterThan(0);
        },
      ),
    );
  });
});
```

Run: `npx vitest run test/branch-lifecycle-isolation.property.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

**验证命令**：`npx vitest run test/branch-lifecycle-isolation.property.test.ts`
**提交信息**：`test(branch): add property tests for isolation recommendation`

### Task 5：全量验证（2 min）

**文件**：无新文件

**验证命令**：`npm run check`
Expected: exit 0

**提交信息**：无单独提交，验证通过即完成

## Spec Coverage

| Spec Requirement | Covering Tasks |
|------------------|---------------|
| 需求 1 S1 (clean → feature) | Task 1, Task 4 |
| 需求 1 S2 (dirty → worktree) | Task 1, Task 4 |
| 需求 1 S3 (active worktrees → worktree) | Task 1, Task 4 |
| 需求 1 S4 (full tier → worktree) | Task 1, Task 4 |
| 需求 1 S5 (capacity → fallback) | Task 1, Task 4 |
| 需求 2 S6 (pure function) | Task 1, Task 4 |
| 需求 3 S7 (Branch Gate integration) | Task 3 |
| 需求 4 S8 (Jira topic compat) | Task 4 |
