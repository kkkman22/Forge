/**
 * Tests for truncation-triggered serial retry in the review pipeline.
 *
 * When all 3 review layers are truncated after L0 succeeds, the pipeline
 * retries with serial execution. If retry still truncated → L3 (blocks ship).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubagentInvocation, SubagentResult } from "../src/loop-types.js";

// Mock the subagent-runner module
vi.mock("../src/subagent-runner.js", () => ({
  runSubagentsWithConcurrency: vi.fn(),
}));

// Mock review-final-block to pass through results (simplifies test setup)
vi.mock("../src/review-final-block.js", () => ({
  enforceFinalReportContract: (r: SubagentResult) => r,
  validateFinalReportBlock: () => ({ valid: true, reason: "" }),
}));

import { runReviewWithTruncationHandling } from "../src/review.js";
import { runSubagentsWithConcurrency } from "../src/subagent-runner.js";

const mockedRunner = runSubagentsWithConcurrency as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPLETE_REPORT = `<!-- REPORT_START -->
## Layer 1: spec-check Review
### P0 Issues
None
### Summary
Clean.
<!-- REPORT_END -->

<!-- review-final -->`;

const TRUNCATED_OUTPUT = `Reading diff context...
Now let me check the auth middleware...`;

const COMPLETE_QUALITY = `<!-- REPORT_START -->
## Layer 2: quality-check Review
### P0 Issues
None
### Summary
Clean.
<!-- REPORT_END -->

<!-- review-final -->`;

const COMPLETE_SECURITY = `<!-- REPORT_START -->
## Layer 3: security-check Review
### P0 Issues
None
### Summary
Clean.
<!-- REPORT_END -->

<!-- review-final -->`;

function makeSuccessResult(agentType: string, output: string): SubagentResult {
  return { agentType, status: "success", output };
}

function makeInvocations(): SubagentInvocation[] {
  return [
    { agentType: "spec-check", prompt: "Review spec", permissionMode: "default", maxTurns: 15 },
    {
      agentType: "quality-check",
      prompt: "Review quality",
      permissionMode: "default",
      maxTurns: 12,
    },
    {
      agentType: "security-check",
      prompt: "Review security",
      permissionMode: "default",
      maxTurns: 10,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runReviewWithTruncationHandling", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no truncation → proceeds with subagent-parallel methodology", async () => {
    mockedRunner.mockResolvedValue({
      succeeded: [
        { agentType: "spec-check", result: COMPLETE_REPORT },
        { agentType: "quality-check", result: COMPLETE_QUALITY },
        { agentType: "security-check", result: COMPLETE_SECURITY },
      ],
      failed: [],
    });

    const result = await runReviewWithTruncationHandling({
      invocations: makeInvocations(),
      executor: async (inv) => makeSuccessResult(inv.agentType, COMPLETE_REPORT),
    });

    expect(result.methodology).toBe("subagent-parallel");
    expect(result.truncationAssessment).toBeDefined();
    expect(result.truncationAssessment?.action).toBe("proceed");
    expect(result.truncationAssessment?.truncatedCount).toBe(0);
  });

  it("1 layer truncated → annotate, no retry", async () => {
    mockedRunner.mockResolvedValue({
      succeeded: [
        { agentType: "spec-check", result: TRUNCATED_OUTPUT },
        { agentType: "quality-check", result: COMPLETE_QUALITY },
        { agentType: "security-check", result: COMPLETE_SECURITY },
      ],
      failed: [],
    });

    const result = await runReviewWithTruncationHandling({
      invocations: makeInvocations(),
      executor: async (inv) => makeSuccessResult(inv.agentType, "ok"),
    });

    expect(result.methodology).toBe("subagent-parallel");
    expect(result.truncationAssessment?.action).toBe("annotate");
    // Only called once (L0), no retry for single-layer truncation
    expect(mockedRunner).toHaveBeenCalledTimes(1);
  });

  it("all 3 truncated → serial retry → retry succeeds → subagent-serial", async () => {
    let callCount = 0;
    mockedRunner.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // L0: all truncated
        return {
          succeeded: [
            { agentType: "spec-check", result: TRUNCATED_OUTPUT },
            { agentType: "quality-check", result: TRUNCATED_OUTPUT },
            { agentType: "security-check", result: TRUNCATED_OUTPUT },
          ],
          failed: [],
        };
      }
      // Serial retry: all complete
      return {
        succeeded: [
          { agentType: "spec-check", result: COMPLETE_REPORT },
          { agentType: "quality-check", result: COMPLETE_QUALITY },
          { agentType: "security-check", result: COMPLETE_SECURITY },
        ],
        failed: [],
      };
    });

    const result = await runReviewWithTruncationHandling({
      invocations: makeInvocations(),
      executor: async (inv) => makeSuccessResult(inv.agentType, "ok"),
    });

    expect(mockedRunner).toHaveBeenCalledTimes(2);
    expect(result.methodology).toBe("subagent-serial");
    expect(result.truncationAssessment?.action).toBe("proceed");
    expect(result.retryCount).toBe(1);
    // Retry results should be used
    expect(result.succeeded).toHaveLength(3);
  });

  it("all 3 truncated → serial retry → retry still all truncated → unavailable (L3)", async () => {
    mockedRunner.mockResolvedValue({
      succeeded: [
        { agentType: "spec-check", result: TRUNCATED_OUTPUT },
        { agentType: "quality-check", result: TRUNCATED_OUTPUT },
        { agentType: "security-check", result: TRUNCATED_OUTPUT },
      ],
      failed: [],
    });

    const result = await runReviewWithTruncationHandling({
      invocations: makeInvocations(),
      executor: async (inv) => makeSuccessResult(inv.agentType, TRUNCATED_OUTPUT),
    });

    expect(mockedRunner).toHaveBeenCalledTimes(2);
    expect(result.methodology).toBe("unavailable");
    expect(result.truncationAssessment?.action).toBe("degrade");
    expect(result.truncationAssessment?.truncatedCount).toBe(3);
    expect(result.retryCount).toBe(1);
  });

  it("execution failure (L0 all-fail) skips truncation check", async () => {
    let callCount = 0;
    mockedRunner.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // L0 all fail
        return {
          succeeded: [],
          failed: [
            { agentType: "spec-check", error: "No task found" },
            { agentType: "quality-check", error: "No task found" },
            { agentType: "security-check", error: "No task found" },
          ],
        };
      }
      // L1 all fail too
      return {
        succeeded: [],
        failed: [
          { agentType: "spec-check", error: "No task found" },
          { agentType: "quality-check", error: "No task found" },
          { agentType: "security-check", error: "No task found" },
        ],
      };
    });

    const result = await runReviewWithTruncationHandling({
      invocations: makeInvocations(),
      executor: async (inv) => makeSuccessResult(inv.agentType, "ok"),
    });

    // Standard fallback ladder handles this — no truncation involved
    expect(result.methodology).toBe("unavailable");
    expect(result.truncationAssessment).toBeUndefined();
  });

  it("serial retry uses concurrency=1", async () => {
    const concurrencyValues: number[] = [];
    let callCount = 0;
    mockedRunner.mockImplementation((_invs: unknown, _exec: unknown, concurrency: number) => {
      concurrencyValues.push(concurrency);
      callCount++;
      if (callCount === 1) {
        return {
          succeeded: [
            { agentType: "spec-check", result: TRUNCATED_OUTPUT },
            { agentType: "quality-check", result: TRUNCATED_OUTPUT },
            { agentType: "security-check", result: TRUNCATED_OUTPUT },
          ],
          failed: [],
        };
      }
      return {
        succeeded: [
          { agentType: "spec-check", result: COMPLETE_REPORT },
          { agentType: "quality-check", result: COMPLETE_QUALITY },
          { agentType: "security-check", result: COMPLETE_SECURITY },
        ],
        failed: [],
      };
    });

    await runReviewWithTruncationHandling({
      invocations: makeInvocations(),
      executor: async (inv) => makeSuccessResult(inv.agentType, "ok"),
    });

    // First call: L0 with concurrency=3, second call: truncation retry with concurrency=1
    expect(concurrencyValues).toEqual([3, 1]);
  });

  it("2 layers truncated → warn, no retry", async () => {
    mockedRunner.mockResolvedValue({
      succeeded: [
        { agentType: "spec-check", result: TRUNCATED_OUTPUT },
        { agentType: "quality-check", result: TRUNCATED_OUTPUT },
        { agentType: "security-check", result: COMPLETE_SECURITY },
      ],
      failed: [],
    });

    const result = await runReviewWithTruncationHandling({
      invocations: makeInvocations(),
      executor: async (inv) => makeSuccessResult(inv.agentType, "ok"),
    });

    expect(result.methodology).toBe("subagent-parallel");
    expect(result.truncationAssessment?.action).toBe("warn");
    expect(mockedRunner).toHaveBeenCalledTimes(1);
  });
});
