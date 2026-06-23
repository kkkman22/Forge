/**
 * Unit tests for spawn-policy wiring in agents-dispatcher.ts.
 *
 * Covers T-05/T-06 acceptance:
 *   - resolveMaxSubagentDepth reads config / defaults to 5
 *   - evaluateSpawnPolicy returns null when lineage/depth omitted (backward compat)
 *   - evaluateSpawnPolicy blocks when lineage disallows Agent
 *   - dispatch() short-circuits to failed before spawning when blocked
 *
 * **Validates: Requirements R2 AC1-AC4, R3 AC2**
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_SUBAGENT_DEPTH,
  type DispatchOptions,
  dispatch,
  evaluateSpawnPolicy,
  resolveMaxSubagentDepth,
} from "../src/forge/agents-dispatcher.js";
import type { LineageEntry } from "../src/spawn-policy.js";

// ---------------------------------------------------------------------------
// resolveMaxSubagentDepth
// ---------------------------------------------------------------------------

describe("resolveMaxSubagentDepth", () => {
  it("returns configured value within 1-10", () => {
    expect(resolveMaxSubagentDepth("max_subagent_depth: 3\n")).toBe(3);
    expect(resolveMaxSubagentDepth("max_subagent_depth: 10\n")).toBe(10);
  });

  it("defaults to 5 when absent", () => {
    expect(resolveMaxSubagentDepth("")).toBe(DEFAULT_MAX_SUBAGENT_DEPTH);
    expect(resolveMaxSubagentDepth("project: X\n")).toBe(DEFAULT_MAX_SUBAGENT_DEPTH);
  });

  it("falls back to default on invalid (out of range / non-integer)", () => {
    expect(resolveMaxSubagentDepth("max_subagent_depth: 0\n")).toBe(DEFAULT_MAX_SUBAGENT_DEPTH);
    expect(resolveMaxSubagentDepth("max_subagent_depth: 11\n")).toBe(DEFAULT_MAX_SUBAGENT_DEPTH);
    expect(resolveMaxSubagentDepth("max_subagent_depth: abc\n")).toBe(DEFAULT_MAX_SUBAGENT_DEPTH);
  });
});

// ---------------------------------------------------------------------------
// evaluateSpawnPolicy
// ---------------------------------------------------------------------------

const baseOpts = (overrides: Partial<DispatchOptions> = {}): DispatchOptions => ({
  agentType: "worker",
  prompt: "do something",
  workdir: "/tmp",
  ...overrides,
});

const lineageWithAgent: LineageEntry[] = [
  { agent: "spec-check", disallowed: new Set(["Bash", "Write", "Edit", "Agent"]) },
];

describe("evaluateSpawnPolicy", () => {
  it("returns null when lineage/depth omitted (backward compat)", () => {
    expect(evaluateSpawnPolicy(baseOpts(), "")).toBeNull();
    expect(evaluateSpawnPolicy(baseOpts({ lineage: [] }), "")).toBeNull();
    expect(evaluateSpawnPolicy(baseOpts({ depth: 1 }), "")).toBeNull();
  });

  it("blocks when lineage ancestor disallows Agent", () => {
    const decision = evaluateSpawnPolicy(
      baseOpts({ agentType: "child", lineage: lineageWithAgent, depth: 1 }),
      "",
    );
    expect(decision).not.toBeNull();
    expect(decision!.allowed).toBe(false);
    expect(decision!.verdict).toBe("blocked");
    expect(decision!.rule).toBe("Agent-spawn-forbidden");
  });

  it("allows when lineage has no Agent and depth within limit", () => {
    const decision = evaluateSpawnPolicy(
      baseOpts({
        agentType: "child",
        lineage: [{ agent: "explore", disallowed: new Set(["Write", "Edit"]) }],
        depth: 1,
      }),
      "",
    );
    expect(decision!.allowed).toBe(true);
    expect(decision!.verdict).toBe("ok");
  });

  it("respects max_subagent_depth from config", () => {
    const decision = evaluateSpawnPolicy(
      baseOpts({
        agentType: "child",
        lineage: [],
        depth: 3,
      }),
      "max_subagent_depth: 3\n",
    );
    expect(decision!.verdict).toBe("max-depth-exceeded");
  });
});

// ---------------------------------------------------------------------------
// dispatch() short-circuit (no real spawn — blocked before execFile)
// ---------------------------------------------------------------------------

describe("dispatch spawn-policy short-circuit", () => {
  it("returns failed without spawning when lineage blocks", async () => {
    const opts = baseOpts({
      agentType: "child",
      prompt: "x",
      workdir: "/tmp",
      lineage: lineageWithAgent,
      depth: 1,
      configContent: "",
    });
    const result = await dispatch(opts);
    expect(result.status).toBe("failed");
    expect(result.agent).toBe("child");
    expect(result.diagnostic).toContain("spawn-policy");
    expect(result.diagnostic).toContain("blocked");
  });

  it("returns failed on max-depth-exceeded without spawning", async () => {
    const opts = baseOpts({
      agentType: "deep-child",
      prompt: "x",
      workdir: "/tmp",
      lineage: [],
      depth: 5,
      configContent: "max_subagent_depth: 5\n",
    });
    const result = await dispatch(opts);
    expect(result.status).toBe("failed");
    expect(result.diagnostic).toContain("max-depth-exceeded");
  });
});
