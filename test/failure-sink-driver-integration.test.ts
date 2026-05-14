/**
 * Driver integration tests for failure-sink extended triggers.
 *
 * Validates that each driver module exports a context-builder helper
 * that produces a correctly shaped FailureContext for its trigger.
 */

import { describe, expect, it } from "vitest";
import { buildFailureEpisode } from "../src/failure-sink.js";

const FIXED_NOW = new Date("2026-05-14T10:00:00.000Z");

// ---------------------------------------------------------------------------
// debug_resolved
// ---------------------------------------------------------------------------

import {
  buildDebugResolvedContext,
  type DebugResolvedInput,
} from "../src/debug.js";

describe("debug driver — debug_resolved trigger integration", () => {
  it("buildDebugResolvedContext produces valid FailureContext with trigger=debug_resolved", () => {
    const ctx = buildDebugResolvedContext({
      topic: "auth-timeout",
      tier: "standard",
      rootCause: "Token expiry check used < instead of <=",
    });
    expect(ctx.trigger).toBe("debug_resolved");
    expect(ctx.skill).toBe("forge-debug");
    expect(ctx.topic).toBe("auth-timeout");
    expect(ctx.rootCause).toBe("Token expiry check used < instead of <=");
  });

  it("emitted episode has correct structure", () => {
    const ctx = buildDebugResolvedContext({
      topic: "auth-timeout",
      tier: "standard",
      rootCause: "Token expiry check used < instead of <=",
    });
    const ep = buildFailureEpisode(ctx, FIXED_NOW, 1);
    expect(ep.outcome).toBe("failure");
    expect(ep.body).toContain("trigger: debug_resolved");
    expect(ep.root_cause).toBe("Token expiry check used < instead of <=");
  });
});

// ---------------------------------------------------------------------------
// grill_abandoned
// ---------------------------------------------------------------------------

import {
  buildGrillAbandonedContext,
  type GrillAbandonedInput,
} from "../src/grill.js";

describe("grill driver — grill_abandoned trigger integration", () => {
  it("buildGrillAbandonedContext produces valid FailureContext", () => {
    const ctx = buildGrillAbandonedContext({
      topic: "api-design",
      tier: "standard",
      lastPendingNode: "是否支持分页？",
    });
    expect(ctx.trigger).toBe("grill_abandoned");
    expect(ctx.skill).toBe("forge-grill");
    expect(ctx.rootCause).toBe("未完成边界对齐，最后待决问题：是否支持分页？");
  });

  it("works without lastPendingNode", () => {
    const ctx = buildGrillAbandonedContext({
      topic: "api-design",
      tier: "standard",
    });
    expect(ctx.trigger).toBe("grill_abandoned");
    expect(ctx.rootCause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// loop_circuit_broken
// ---------------------------------------------------------------------------

import {
  buildLoopCircuitBrokenContext,
  type LoopCircuitBrokenInput,
} from "../src/orchestrator.js";

describe("loop driver — loop_circuit_broken trigger integration", () => {
  it("buildLoopCircuitBrokenContext produces valid FailureContext", () => {
    const ctx = buildLoopCircuitBrokenContext({
      topic: "auto-fix-loop",
      tier: "standard",
      consecutiveFailures: 5,
      failureCategory: "指数退避达上限",
    });
    expect(ctx.trigger).toBe("loop_circuit_broken");
    expect(ctx.skill).toBe("forge-loop");
    expect(ctx.rootCause).toContain("5 次连续失败");
  });

  it("builds situation with runId when provided", () => {
    const ctx = buildLoopCircuitBrokenContext({
      topic: "auto-fix-loop",
      tier: "standard",
      consecutiveFailures: 3,
      runId: "run-2026-05-14-001",
    });
    expect(ctx.situation).toContain("run-2026-05-14-001");
  });
});
