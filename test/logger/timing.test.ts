import { describe, expect, it } from "vitest";

describe("createIterationTiming", () => {
  it("should compute timing from start/end timestamps", async () => {
    const { createIterationTiming } = await import("../../src/logger/timing.js");
    const timing = createIterationTiming(1000, 2500, 3000);
    expect(timing).toEqual({
      iterationStartMs: 1000,
      agentCallDurationMs: 1500,
      effectExecutionDurationMs: 500,
      totalIterationDurationMs: 2000,
    });
  });

  it("should satisfy invariant: total >= agent + effect", async () => {
    const { createIterationTiming } = await import("../../src/logger/timing.js");
    const timing = createIterationTiming(0, 100, 200);
    expect(timing.totalIterationDurationMs).toBeGreaterThanOrEqual(
      timing.agentCallDurationMs + timing.effectExecutionDurationMs,
    );
  });
});

describe("computePerformanceBaseline", () => {
  it("should compute statistics from timing array", async () => {
    const { createIterationTiming, computePerformanceBaseline } = await import(
      "../../src/logger/timing.js"
    );
    const t1 = createIterationTiming(0, 100, 150);
    const t2 = createIterationTiming(200, 350, 400);
    const baseline = computePerformanceBaseline([t1, t2]);
    expect(baseline.iterationCount).toBe(2);
    expect(baseline.totalRunTimeMs).toBe(400);
    expect(baseline.avgIterationMs).toBe(175);
    expect(baseline.maxIterationMs).toBe(200);
    expect(baseline.minIterationMs).toBe(150);
    expect(baseline.avgAgentCallMs).toBe(125);
  });

  it("should handle empty array with N/A", async () => {
    const { computePerformanceBaseline } = await import("../../src/logger/timing.js");
    const baseline = computePerformanceBaseline([]);
    expect(baseline.iterationCount).toBe(0);
    expect(baseline.avgIterationMs).toBeNaN();
    expect(baseline.maxIterationMs).toBeNaN();
    expect(baseline.minIterationMs).toBeNaN();
    expect(baseline.avgAgentCallMs).toBeNaN();
  });

  it("should handle single iteration", async () => {
    const { createIterationTiming, computePerformanceBaseline } = await import(
      "../../src/logger/timing.js"
    );
    const t = createIterationTiming(0, 100, 150);
    const baseline = computePerformanceBaseline([t]);
    expect(baseline.iterationCount).toBe(1);
    expect(baseline.maxIterationMs).toBe(baseline.minIterationMs);
  });
});
