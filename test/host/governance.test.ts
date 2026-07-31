/**
 * P2 R2: capability-driven governance derivation.
 *
 * Asserts the three contract snapshots (Claude 200K / GLM-5.2 1M / future
 * Claude 1M) and that config overrides take precedence over derived defaults.
 *
 * Validates: requirements R2-AC2..AC10.
 */
import { describe, expect, it } from "vitest";
import {
  CLAUDE_CAPABILITIES,
  GLM52_CAPABILITIES,
  type ModelCapabilities,
} from "../../src/host/capabilities";
import type { GovernanceOverride } from "../../src/host/governance";
import { deriveGovernance } from "../../src/host/governance";

const NO_OVERRIDE: GovernanceOverride = {};

describe("deriveGovernance — Claude (200K) baseline", () => {
  const g = deriveGovernance(CLAUDE_CAPABILITIES, NO_OVERRIDE);
  it("contextBudget = 0.8 × 200000 = 160000", () => {
    expect(g.contextBudget).toBe(160000);
  });
  it("sliceThreshold = 0.9 × budget = 144000", () => {
    expect(g.sliceThreshold).toBe(144000);
  });
  it("workerIsolation = required (no Long Horizon)", () => {
    expect(g.workerIsolation).toBe("required");
  });
  it("maxParallelAgents = 6 (< 500K)", () => {
    expect(g.maxParallelAgents).toBe(6);
  });
  it("decideDispatchMode = auto (< 500K)", () => {
    expect(g.decideDispatchMode).toBe("auto");
  });
  it("reasoningEffort = undefined (unsupported)", () => {
    expect(g.reasoningEffort).toBeUndefined();
  });
});

describe("deriveGovernance — GLM-5.2 (1M) baseline", () => {
  const g = deriveGovernance(GLM52_CAPABILITIES, NO_OVERRIDE);
  it("contextBudget = 0.8 × 1000000 = 800000", () => {
    expect(g.contextBudget).toBe(800000);
  });
  it("sliceThreshold = 720000", () => {
    expect(g.sliceThreshold).toBe(720000);
  });
  it("workerIsolation = optional (Long Horizon)", () => {
    expect(g.workerIsolation).toBe("optional");
  });
  it("maxParallelAgents = 8 (>= 500K)", () => {
    expect(g.maxParallelAgents).toBe(8);
  });
  it("decideDispatchMode = inline-lean (>= 500K)", () => {
    expect(g.decideDispatchMode).toBe("inline-lean");
  });
  it("reasoningEffort per-phase mapping present", () => {
    expect(g.reasoningEffort).toBeDefined();
    expect(g.reasoningEffort?.decide).toBe("max");
    expect(g.reasoningEffort?.spec).toBe("max");
    expect(g.reasoningEffort?.plan).toBe("high");
    expect(g.reasoningEffort?.build).toBe("medium");
    expect(g.reasoningEffort?.review).toBe("high");
    expect(g.reasoningEffort?.ship).toBe("medium");
  });
});

describe("deriveGovernance — config override", () => {
  it("contextBudgetOverride wins over derived default", () => {
    const g = deriveGovernance(CLAUDE_CAPABILITIES, { contextBudgetOverride: 999999 });
    expect(g.contextBudget).toBe(999999);
  });

  it("maxParallelAgents override wins over derived default", () => {
    const g = deriveGovernance(GLM52_CAPABILITIES, { maxParallelAgents: 3 });
    expect(g.maxParallelAgents).toBe(3);
  });

  it("override 0 for contextBudget is treated as auto (not a real budget)", () => {
    // 0 means "auto-derive" per .zcode-plugin userConfig contract
    const g = deriveGovernance(CLAUDE_CAPABILITIES, { contextBudgetOverride: 0 });
    expect(g.contextBudget).toBe(160000);
  });
});

describe("deriveGovernance — no if(platform) branches on the abstraction", () => {
  // Capability-driven means equal capabilities => equal governance, regardless
  // of which adapter produced them. A future Claude 1M model with Long Horizon
  // must auto-derive the GLM-5.2-shaped policy with zero code change (V13).
  it("equal capabilities derive equal governance (capability-equal)", () => {
    const futureClaude1M: ModelCapabilities = { ...GLM52_CAPABILITIES };
    const a = deriveGovernance(GLM52_CAPABILITIES, NO_OVERRIDE);
    const b = deriveGovernance(futureClaude1M, NO_OVERRIDE);
    expect(b).toEqual(a);
  });
});
