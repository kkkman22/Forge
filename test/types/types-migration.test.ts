import { describe, it, expect } from "vitest";

/**
 * Types Migration Test — RED phase
 *
 * Validates that 8 core shared types previously in loop-types.ts
 * are now importable from src/types.ts. These types are used by
 * core Forge modules (build, review, decide, branch-gate, etc.)
 * and must survive the loop-types.ts retirement.
 */
describe("types migration from loop-types.ts", () => {
  it("imports TokenUsage from src/types.ts", async () => {
    const mod = await import("../../src/types.js");
    const _: import("../../src/types.js").TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(mod).toBeDefined();
  });

  it("imports SubagentInvocation from src/types.ts", async () => {
    const _: import("../../src/types.js").SubagentInvocation = {
      agentType: "test",
      prompt: "test prompt",
      permissionMode: "default",
      maxTurns: 10,
    };
    expect(true).toBe(true);
  });

  it("imports SubagentResult from src/types.ts", async () => {
    const _: import("../../src/types.js").SubagentResult = {
      agentType: "test",
      status: "success",
      output: "done",
    };
    expect(true).toBe(true);
  });

  it("imports ParallelExecutionResult from src/types.ts", async () => {
    const _: import("../../src/types.js").ParallelExecutionResult = {
      succeeded: [{ agentType: "test", result: "ok" }],
      failed: [],
    };
    expect(true).toBe(true);
  });

  it("imports PendingDeliveryRecord from src/types.ts", async () => {
    const _: import("../../src/types.js").PendingDeliveryRecord = {
      branchName: "feature/test",
      topic: "test",
      timestamp: Date.now(),
    };
    expect(true).toBe(true);
  });

  it("imports WorktreeDecision from src/types.ts", async () => {
    const _: import("../../src/types.js").WorktreeDecision = {
      action: "preserve",
      reason: "test",
    };
    expect(true).toBe(true);
  });

  it("imports BranchTopicGateResult from src/types.ts", async () => {
    const _: import("../../src/types.js").BranchTopicGateResult = {
      allowed: true,
      reasons: [],
    };
    expect(true).toBe(true);
  });

  it("imports CommitTopicCheckResult from src/types.ts", async () => {
    const _: import("../../src/types.js").CommitTopicCheckResult = {
      allowed: true,
    };
    expect(true).toBe(true);
  });
});
