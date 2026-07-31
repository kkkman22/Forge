/**
 * P2 R6 (T11/V13): capability-driven adaptation — the decisive evidence.
 *
 * This is the proof that capability-driven governance is strictly better than
 * a config-switch or platform-name strategy. We simulate a *future* Claude
 * model shipping with 1M context + Long Horizon, feed it through the same
 * deriveGovernance() used today, and assert it auto-adopts the GLM-5.2-shaped
 * policy (800K budget, optional worker isolation, inline-lean dispatch,
 * per-phase reasoning effort) — with ZERO code change.
 *
 * A config-switch (`if (isZcode)`) or platform-Strategy (`GlmBudget` class)
 * approach CANNOT do this: both would need code edits to handle a Claude 1M
 * model. Capability-driven needs none.
 *
 * Validates: requirement R6-AC3 (V13).
 */
import { describe, expect, it } from "vitest";
import {
  CLAUDE_CAPABILITIES,
  GLM52_CAPABILITIES,
  type ModelCapabilities,
} from "../../src/host/capabilities";
import { deriveGovernance } from "../../src/host/governance";

describe("V13 — future Claude 1M model auto-adapts (capability-driven)", () => {
  // Simulate a future Claude model with 1M context + Long Horizon. Same
  // capability *shape* as GLM-5.2 — that's the whole point: the driver is
  // capability, not platform name.
  const FUTURE_CLAUDE_1M: ModelCapabilities = {
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    supportsLongHorizon: true,
    supportsReasoningEffort: true,
    supportsThinkingMode: true,
    contextCacheEfficiency: 0.85,
  };

  it("derives the GLM-5.2-shaped policy with zero code change", () => {
    const futurePolicy = deriveGovernance(FUTURE_CLAUDE_1M, {});
    const glm52Policy = deriveGovernance(GLM52_CAPABILITIES, {});
    expect(futurePolicy).toEqual(glm52Policy);
  });

  it("budget auto-widens to 800K (0.8 × 1M)", () => {
    expect(deriveGovernance(FUTURE_CLAUDE_1M, {}).contextBudget).toBe(800_000);
  });

  it("worker isolation auto-relaxes to optional (Long Horizon)", () => {
    expect(deriveGovernance(FUTURE_CLAUDE_1M, {}).workerIsolation).toBe("optional");
  });

  it("concurrency auto-lifts to 8 (>= 500K)", () => {
    expect(deriveGovernance(FUTURE_CLAUDE_1M, {}).maxParallelAgents).toBe(8);
  });

  it("dispatch auto-shifts to inline-lean (>= 500K)", () => {
    expect(deriveGovernance(FUTURE_CLAUDE_1M, {}).decideDispatchMode).toBe("inline-lean");
  });

  it("reasoning effort auto-enables (supported)", () => {
    expect(deriveGovernance(FUTURE_CLAUDE_1M, {}).reasoningEffort).toBeDefined();
  });

  it("contrast: today's Claude 200K stays on the small-context policy", () => {
    // The current Claude model is NOT auto-widened — its capability hasn't
    // changed, so its governance hasn't changed (capability-equal guarantee).
    const today = deriveGovernance(CLAUDE_CAPABILITIES, {});
    expect(today.contextBudget).toBe(160_000);
    expect(today.workerIsolation).toBe("required");
    expect(today.maxParallelAgents).toBe(6);
  });
});
