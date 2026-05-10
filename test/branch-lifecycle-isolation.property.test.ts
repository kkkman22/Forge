/**
 * Property-based tests for recommendIsolationStrategy.
 *
 * Validates the branch isolation recommendation logic against the decision
 * matrix defined in the branch-isolation-recommendation spec (S1–S8).
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { recommendIsolationStrategy } from "../src/branch-lifecycle.js";
import type { IsolationContext } from "../src/loop-types.js";

// ---------------------------------------------------------------------------
// S1: clean + no worktrees + light/standard → feature
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — S1 (clean tree, no worktrees)", () => {
  it("recommends feature for clean tree, no worktrees, standard tier", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 0,
      tier: "standard",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("feature");
    expect(result.secondary).toBe("worktree");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("recommends feature for clean tree, no worktrees, light tier", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 0,
      tier: "light",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("feature");
  });
});

// ---------------------------------------------------------------------------
// S2: dirty tree → worktree
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — S2 (dirty tree)", () => {
  it("recommends worktree for dirty tree", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: true,
      activeWorktrees: 0,
      tier: "standard",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
    expect(result.secondary).toBe("stash-feature");
  });

  it("recommends worktree for dirty tree regardless of tier", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: true,
      activeWorktrees: 0,
      tier: "light",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
  });
});

// ---------------------------------------------------------------------------
// S3: active worktrees ≥ 1 → worktree (consistency)
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — S3 (active worktrees)", () => {
  it("recommends worktree when active worktrees exist", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 1,
      tier: "standard",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
  });

  it("recommends worktree with 2 active worktrees", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 2,
      tier: "standard",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
  });
});

// ---------------------------------------------------------------------------
// S4: full tier → worktree
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — S4 (full tier)", () => {
  it("recommends worktree for full tier", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 0,
      tier: "full",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("worktree");
  });
});

// ---------------------------------------------------------------------------
// S5: at capacity → stash-feature fallback
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — S5 (capacity)", () => {
  it("falls back to stash-feature when worktree capacity reached", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: true,
      activeWorktrees: 3,
      tier: "standard",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("stash-feature");
  });

  it("falls back even for full tier at capacity", () => {
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 3,
      tier: "full",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("stash-feature");
  });
});

// ---------------------------------------------------------------------------
// S6: pure function input/output contract
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — S6 (pure function)", () => {
  it("returns deterministic results for same input", () => {
    const ctx: IsolationContext = {
      dirtyTree: true,
      activeWorktrees: 0,
      tier: "standard",
      maxConcurrent: 3,
    };
    const a = recommendIsolationStrategy(ctx);
    const b = recommendIsolationStrategy(ctx);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// S8: Jira-style topic compatibility (topic-agnostic)
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — S8 (topic-agnostic)", () => {
  it("ignores topic format — decision is state-based only", () => {
    // Same state → same recommendation regardless of external topic
    const result = recommendIsolationStrategy({
      dirtyTree: false,
      activeWorktrees: 0,
      tier: "standard",
      maxConcurrent: 3,
    });
    expect(result.primary).toBe("feature");
  });
});

// ---------------------------------------------------------------------------
// Property: capacity check always wins
// ---------------------------------------------------------------------------

describe("recommendIsolationStrategy — properties", () => {
  it("capacity check has highest priority", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 3, max: 10 }),
        fc.constantFrom("light" as const, "standard" as const, "full" as const),
        (dirtyTree, activeWorktrees, tier) => {
          const result = recommendIsolationStrategy({
            dirtyTree,
            activeWorktrees,
            tier,
            maxConcurrent: 3,
          });
          expect(result.primary).toBe("stash-feature");
        },
      ),
    );
  });

  it("always provides a non-empty reason", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        fc.constantFrom("light" as const, "standard" as const, "full" as const),
        (dirtyTree, activeWorktrees, tier) => {
          const result = recommendIsolationStrategy({
            dirtyTree,
            activeWorktrees,
            tier,
            maxConcurrent: 3,
          });
          expect(result.reason.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("primary is always a valid strategy", () => {
    const validStrategies = ["feature", "worktree", "stash-feature"];
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        fc.constantFrom("light" as const, "standard" as const, "full" as const),
        fc.integer({ min: 1, max: 10 }),
        (dirtyTree, activeWorktrees, tier, maxConcurrent) => {
          const result = recommendIsolationStrategy({
            dirtyTree,
            activeWorktrees,
            tier,
            maxConcurrent,
          });
          expect(validStrategies).toContain(result.primary);
        },
      ),
    );
  });
});
