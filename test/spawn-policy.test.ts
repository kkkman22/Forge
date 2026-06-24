/**
 * Unit tests for spawn-policy.ts
 *
 * Validates R2 (spawn-time policy) and R3 (subagent depth):
 *   R2 AC1-AC5: checkSpawnPolicy identity + lineage evaluation
 *   R3 AC1-AC4: depth limit enforcement
 *
 * **Validates: Requirements R2 AC1-AC5, R3 AC1-AC4**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkSpawnPolicy,
  type LineageEntry,
  SPAWN_TOOL_NAMES,
  type SpawnContext,
} from "../src/spawn-policy.js";

// ---------------------------------------------------------------------------
// Lineage fixtures
// ---------------------------------------------------------------------------

/** spec-check / quality-check / security-check all disallow Agent (real frontmatter). */
const NO_SPAWN_LINEAGE: LineageEntry[] = [
  { agent: "spec-check", disallowed: new Set(["Bash", "Write", "Edit", "Agent"]) },
];

/** explore disallows only Write/Edit — spawning children allowed. */
const SPAWN_OK_LINEAGE: LineageEntry[] = [
  { agent: "explore", disallowed: new Set(["Write", "Edit"]) },
];

const EMPTY_LINEAGE: LineageEntry[] = [];

function ctx(identity: string, lineage: LineageEntry[], depth: number, maxDepth = 5): SpawnContext {
  return { subagentIdentity: identity, lineage, depth, maxDepth };
}

// ---------------------------------------------------------------------------
// R2 — Agent-spawn-forbidden (lineage contains Agent)
// ---------------------------------------------------------------------------

describe("checkSpawnPolicy — R2 Agent-spawn-forbidden", () => {
  it("AC1+AC2: blocks spawn when lineage disallows Agent", () => {
    const result = checkSpawnPolicy(ctx("quality-check", NO_SPAWN_LINEAGE, 1));
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("blocked");
    expect(result.rule).toBe("spawn-tool-forbidden");
    expect(result.blockedAt).toBe("spec-check");
  });

  it("P1-7: blocks spawn for any spawn-tool-name in SPAWN_TOOL_NAMES", () => {
    // Task / dispatch_agent — alternative CC spawn tool names
    const taskLineage: LineageEntry[] = [{ agent: "worker", disallowed: new Set(["Task"]) }];
    expect(checkSpawnPolicy(ctx("child", taskLineage, 1)).rule).toBe("spawn-tool-forbidden");

    const dispatchLineage: LineageEntry[] = [
      { agent: "worker", disallowed: new Set(["dispatch_agent"]) },
    ];
    expect(checkSpawnPolicy(ctx("child", dispatchLineage, 1)).rule).toBe("spawn-tool-forbidden");
  });

  it("SPAWN_TOOL_NAMES includes Agent and Task", () => {
    expect(SPAWN_TOOL_NAMES.has("Agent")).toBe(true);
    expect(SPAWN_TOOL_NAMES.has("Task")).toBe(true);
  });

  it("AC3: allows spawn when lineage has no Agent prohibition", () => {
    const result = checkSpawnPolicy(ctx("worker-a", SPAWN_OK_LINEAGE, 1));
    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe("ok");
  });

  it("AC3: allows spawn with empty lineage", () => {
    const result = checkSpawnPolicy(ctx("worker", EMPTY_LINEAGE, 1));
    expect(result.allowed).toBe(true);
  });

  it("reports blockedAt = the offending ancestor", () => {
    const lineage: LineageEntry[] = [
      { agent: "explore", disallowed: new Set(["Write"]) },
      { agent: "quality-check", disallowed: new Set(["Agent"]) },
    ];
    const result = checkSpawnPolicy(ctx("child", lineage, 2));
    expect(result.blockedAt).toBe("quality-check");
  });

  it("first offending ancestor wins when multiple disallow Agent", () => {
    const lineage: LineageEntry[] = [
      { agent: "security-check", disallowed: new Set(["Agent"]) },
      { agent: "spec-check", disallowed: new Set(["Agent"]) },
    ];
    const result = checkSpawnPolicy(ctx("child", lineage, 2));
    expect(result.blockedAt).toBe("security-check");
  });
});

// ---------------------------------------------------------------------------
// R3 — depth limit
// ---------------------------------------------------------------------------

describe("checkSpawnPolicy — R3 depth limit", () => {
  it("AC1: allows spawn at depth = maxDepth - 1 (child fits under limit)", () => {
    const result = checkSpawnPolicy(ctx("child", SPAWN_OK_LINEAGE, 4, 5));
    expect(result.allowed).toBe(true);
  });

  it("AC1: blocks spawn when depth = maxDepth (would exceed)", () => {
    const result = checkSpawnPolicy(ctx("child", SPAWN_OK_LINEAGE, 5, 5));
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("max-depth-exceeded");
  });

  it("AC2: respects configured maxDepth", () => {
    // maxDepth=3 → depth=3 blocked
    const result = checkSpawnPolicy(ctx("child", SPAWN_OK_LINEAGE, 3, 3));
    expect(result.verdict).toBe("max-depth-exceeded");
  });

  it("depth check takes precedence over lineage check", () => {
    // both exceeded: depth verdict wins (checked first per design order)
    const result = checkSpawnPolicy(ctx("child", NO_SPAWN_LINEAGE, 5, 5));
    expect(result.verdict).toBe("max-depth-exceeded");
  });
});

// ---------------------------------------------------------------------------
// Properties — concurrency isolation (R3 AC3)
// ---------------------------------------------------------------------------

describe("checkSpawnPolicy — properties", () => {
  it("depth evaluation is pure: same inputs → same result (no global state)", () => {
    const arb = fc.record({
      depth: fc.integer({ min: 0, max: 10 }),
      maxDepth: fc.integer({ min: 1, max: 10 }),
    });
    fc.assert(
      fc.property(
        arb,
        fc.array(fc.integer({ min: 0, max: 10 })),
        ({ depth, maxDepth }, _otherDepths) => {
          const c = ctx("x", SPAWN_OK_LINEAGE, depth, maxDepth);
          const r1 = checkSpawnPolicy(c);
          const r2 = checkSpawnPolicy(c);
          return r1.verdict === r2.verdict && r1.allowed === r2.allowed;
        },
      ),
    );
  });

  it("concurrent chains do not cross-contaminate depth", () => {
    // Simulate two independent dispatch chains interleaved; depth must not leak.
    const chainA = ctx("a", SPAWN_OK_LINEAGE, 2, 5);
    const chainB = ctx("b", SPAWN_OK_LINEAGE, 4, 5);
    const a1 = checkSpawnPolicy(chainA);
    const b1 = checkSpawnPolicy(chainB);
    const a2 = checkSpawnPolicy(chainA); // re-eval A after B touched the fn
    expect(a1.verdict).toBe(a2.verdict);
    expect(b1.allowed).toBe(true);
  });
});
