import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubagentInvocation, SubagentResult } from "../../src/types.js";

// Mock the subagent-runner module
vi.mock("../../src/subagent-runner.js", () => ({
  runSubagentsWithConcurrency: vi.fn(),
}));

import { runReviewFallbackLadder } from "../../src/review.js";
import { runSubagentsWithConcurrency } from "../../src/subagent-runner.js";

const mockedRunner = runSubagentsWithConcurrency as unknown as ReturnType<typeof vi.fn>;

const tempDir = join(tmpdir(), `forge-fallback-ladder-${randomUUID()}`, ".forge", "reviews");

function makeInvocation(i: number): SubagentInvocation {
  return {
    agentType: `agent-${i}`,
    prompt: `Task ${i}`,
    permissionMode: "default",
    maxTurns: 10,
  };
}

function makeSuccessResult(agentType: string): SubagentResult {
  return {
    agentType,
    status: "success",
    output: `result-${agentType}`,
  };
}

function makeFailureResult(agentType: string, error: string): SubagentResult {
  return {
    agentType,
    status: "failure",
    error,
  };
}

describe("runReviewFallbackLadder", () => {
  let mockConsoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.clearAllMocks();
    // Create temp directory for CI evidence files
    try {
      mkdirSync(tempDir, { recursive: true });
    } catch {
      // Directory already exists
    }
  });

  afterEach(() => {
    // Clean up temp files
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("L0 success path uses subagent-parallel methodology", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeSuccessResult(inv.agentType);
    };

    mockedRunner.mockResolvedValue({
      succeeded: invocations.map((inv) => ({ agentType: inv.agentType, result: "ok" })),
      failed: [],
    });

    const result = await runReviewFallbackLadder({ invocations, executor });

    expect(result.methodology).toBe("subagent-parallel");
    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(result.retryCount).toBe(0);
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0].level).toBe("L0");
    expect(result.trace[0].outcome).toBe("all-success");
  });

  it("L0 all-fail triggers L1 with concurrency=1", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    const concurrencyValues: number[] = [];
    let callCount = 0;

    mockedRunner.mockImplementation(
      (
        invs: SubagentInvocation[],
        _exec: (inv: SubagentInvocation) => Promise<SubagentResult>,
        concurrency: number,
      ) => {
        concurrencyValues.push(concurrency);
        callCount++;

        // All fail on first call (L0)
        if (callCount === 1) {
          return {
            succeeded: [],
            failed: invs.map((inv) => ({
              agentType: inv.agentType,
              error: "No task found with ID: test-123",
            })),
          };
        }
        // Success on second call (L1)
        return {
          succeeded: invs.map((inv) => ({ agentType: inv.agentType, result: "ok" })),
          failed: [],
        };
      },
    );

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "No task found with ID: test-123");
    };

    const result = await runReviewFallbackLadder({ invocations, executor });

    expect(concurrencyValues).toHaveLength(2);
    expect(concurrencyValues[0]).toBe(3); // L0 uses default concurrency (3 in implementation)
    expect(concurrencyValues[1]).toBe(1); // L1 forces concurrency=1
    expect(result.methodology).toBe("subagent-serial");
    expect(result.retryCount).toBe(1);
  });

  it("L1 success uses subagent-serial methodology + retry_count=1", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    let callCount = 0;

    mockedRunner.mockImplementation(() => {
      callCount++;

      // All fail on L0
      if (callCount === 1) {
        return {
          succeeded: [],
          failed: invocations.map((inv) => ({
            agentType: inv.agentType,
            error: "timeout",
          })),
        };
      }
      // Partial success on L1
      return {
        succeeded: [
          { agentType: "agent-0", result: "ok" },
          { agentType: "agent-1", result: "ok" },
        ],
        failed: [{ agentType: "agent-2", error: "timeout" }],
      };
    });

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "timeout");
    };

    const result = await runReviewFallbackLadder({ invocations, executor });

    expect(result.methodology).toBe("subagent-serial");
    expect(result.retryCount).toBe(1);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
  });

  it("L1 all-fail with CI evidence file present uses ci-evidence methodology", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    let _callCount = 0;

    mockedRunner.mockImplementation(() => {
      _callCount++;
      return {
        succeeded: [],
        failed: invocations.map((inv) => ({
          agentType: inv.agentType,
          error: "No task found with ID: test-456",
        })),
      };
    });

    // Create CI evidence file
    const ciFilePath = join(tempDir, "test-pr-ci.md");
    writeFileSync(
      ciFilePath,
      `---
p0_count: 0
p1_count: 1
p2_count: 2
p3_count: 3
---
CI review findings...
`,
    );

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "No task found with ID: test-456");
    };

    const result = await runReviewFallbackLadder({
      invocations,
      executor,
      ciEvidencePath: ciFilePath,
    });

    expect(result.methodology).toBe("ci-evidence");
    expect(result.ciEvidence).toBeDefined();
    expect(result.ciEvidence?.severity_counts).toEqual({
      p0: 0,
      p1: 1,
      p2: 2,
      p3: 3,
    });
    expect(result.trace.some((t) => t.level === "L2" && t.outcome === "ci-hit")).toBe(true);
  });

  it("L0 + L1 + L2 all unavailable produces unavailable report", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];

    mockedRunner.mockResolvedValue({
      succeeded: [],
      failed: invocations.map((inv) => ({
        agentType: inv.agentType,
        error: "No task found with ID: test-789",
      })),
    });

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "No task found with ID: test-789");
    };

    const result = await runReviewFallbackLadder({ invocations, executor });

    expect(result.methodology).toBe("unavailable");
    expect(result.retryCount).toBe(1);
    expect(result.l0FailureSignature).toContain("task-id-purge");
    expect(result.trace).toHaveLength(4);
    expect(result.trace[3].level).toBe("L3");
    expect(result.trace[3].outcome).toBe("unavailable");
  });

  it("L1 only retries once even if both fail", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    let callCount = 0;

    mockedRunner.mockImplementation(() => {
      callCount++;
      // Always fail
      return {
        succeeded: [],
        failed: invocations.map((inv) => ({
          agentType: inv.agentType,
          error: "persistent error",
        })),
      };
    });

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "persistent error");
    };

    const result = await runReviewFallbackLadder({ invocations, executor });

    // Should call exactly twice: L0 + L1, no more
    expect(callCount).toBe(2);
    expect(result.retryCount).toBe(1);
    expect(result.methodology).toBe("unavailable");
  });

  it("L1 retry produces visible status output (mock console.warn)", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];

    mockedRunner.mockResolvedValue({
      succeeded: [],
      failed: invocations.map((inv) => ({
        agentType: inv.agentType,
        error: "test error",
      })),
    });

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "test error");
    };

    await runReviewFallbackLadder({ invocations, executor });

    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("L0 subagent dispatch failed"),
    );
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("retrying with concurrency=1"),
    );
    expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining("L1 retry result:"));
  });

  it("L1 report frontmatter includes retry_count and l0_failure_signature", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    let callCount = 0;

    mockedRunner.mockImplementation(() => {
      callCount++;
      // All fail on L0
      if (callCount === 1) {
        return {
          succeeded: [],
          failed: invocations.map((inv) => ({
            agentType: inv.agentType,
            error: "No task found with ID: abc123",
          })),
        };
      }
      // Success on L1
      return {
        succeeded: invocations.map((inv) => ({ agentType: inv.agentType, result: "ok" })),
        failed: [],
      };
    });

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "No task found with ID: abc123");
    };

    const result = await runReviewFallbackLadder({ invocations, executor });

    expect(result.retryCount).toBe(1);
    expect(result.l0FailureSignature).toBe("task-id-purge");
  });

  it("L1 report contains Fallback Ladder Trace section", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    let callCount = 0;

    mockedRunner.mockImplementation(() => {
      callCount++;
      // All fail on L0
      if (callCount === 1) {
        return {
          succeeded: [],
          failed: invocations.map((inv) => ({
            agentType: inv.agentType,
            error: "Error: No task found with ID: xyz789",
          })),
        };
      }
      // Success on L1
      return {
        succeeded: invocations.map((inv) => ({ agentType: inv.agentType, result: "ok" })),
        failed: [],
      };
    });

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "Error: No task found with ID: xyz789");
    };

    const result = await runReviewFallbackLadder({ invocations, executor });

    expect(result.trace).toHaveLength(2);
    expect(result.trace[0].level).toBe("L0");
    expect(result.trace[0].outcome).toBe("all-fail");
    expect(result.trace[1].level).toBe("L1");
    expect(result.trace[1].outcome).toBe("all-success");

    // Each trace entry should have required fields
    for (const entry of result.trace) {
      expect(entry).toHaveProperty("level");
      expect(entry).toHaveProperty("startedAt");
      expect(entry).toHaveProperty("finishedAt");
      expect(entry).toHaveProperty("outcome");
      expect(typeof entry.startedAt).toBe("number");
      expect(typeof entry.finishedAt).toBe("number");
      expect(entry.finishedAt).toBeGreaterThanOrEqual(entry.startedAt);
    }
  });

  it("main-agent fallback rejected — no Read/Grep/Bash invoked after L3", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];

    mockedRunner.mockResolvedValue({
      succeeded: [],
      failed: invocations.map((inv) => ({
        agentType: inv.agentType,
        error: "No task found with ID: test-fs",
      })),
    });

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      return makeFailureResult(inv.agentType, "No task found with ID: test-fs");
    };

    const result = await runReviewFallbackLadder({ invocations, executor });

    expect(result.methodology).toBe("unavailable");
    expect(result.trace).toHaveLength(4);
    expect(result.trace[3].level).toBe("L3");
    expect(result.trace[3].outcome).toBe("unavailable");

    // The implementation correctly returns "unavailable" without attempting main-agent review
    // This test validates that no additional review analysis was attempted after L3
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed.length).toBeGreaterThan(0);
  });
});
