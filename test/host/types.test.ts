/**
 * P2 R1/R2: ModelCapabilities + GovernancePolicy data contracts.
 *
 * Asserts the fixed capability numbers for Claude (200K) and GLM-5.2 (1M),
 * and that GovernancePolicy exposes every derived field.
 *
 * Validates: requirements R1-AC3, R2-AC1.
 */
import { describe, expect, it } from "vitest";
import type { GovernancePolicy, ModelCapabilities } from "../../src/host/capabilities";
import { CLAUDE_CAPABILITIES, GLM52_CAPABILITIES } from "../../src/host/capabilities";

describe("ModelCapabilities contracts", () => {
  it("CLAUDE_CAPABILITIES reflects 200K context window", () => {
    expect(CLAUDE_CAPABILITIES.contextWindow).toBe(200000);
    expect(CLAUDE_CAPABILITIES.maxOutput).toBe(64000);
    expect(CLAUDE_CAPABILITIES.supportsLongHorizon).toBe(false);
    expect(CLAUDE_CAPABILITIES.supportsReasoningEffort).toBe(false);
    expect(CLAUDE_CAPABILITIES.supportsThinkingMode).toBe(false);
    expect(CLAUDE_CAPABILITIES.contextCacheEfficiency).toBe(0.5);
  });

  it("GLM52_CAPABILITIES reflects 1M context + Long Horizon", () => {
    expect(GLM52_CAPABILITIES.contextWindow).toBe(1000000);
    expect(GLM52_CAPABILITIES.maxOutput).toBe(128000);
    expect(GLM52_CAPABILITIES.supportsLongHorizon).toBe(true);
    expect(GLM52_CAPABILITIES.supportsReasoningEffort).toBe(true);
    expect(GLM52_CAPABILITIES.supportsThinkingMode).toBe(true);
    expect(GLM52_CAPABILITIES.contextCacheEfficiency).toBe(0.85);
  });

  it("satisfies the ModelCapabilities type shape", () => {
    const cap: ModelCapabilities = CLAUDE_CAPABILITIES;
    expect(typeof cap.contextWindow).toBe("number");
    expect(typeof cap.supportsLongHorizon).toBe("boolean");
  });
});

describe("GovernancePolicy type shape", () => {
  it("exposes every derived governance field", () => {
    const g: GovernancePolicy = {
      contextBudget: 160000,
      sliceThreshold: 144000,
      workerIsolation: "required",
      maxParallelAgents: 6,
      decideDispatchMode: "auto",
      reasoningEffort: undefined,
    };
    expect(g.contextBudget).toBe(160000);
    expect(g.workerIsolation === "required" || g.workerIsolation === "optional").toBe(true);
    expect(g.decideDispatchMode === "auto" || g.decideDispatchMode === "inline-lean").toBe(true);
  });
});
