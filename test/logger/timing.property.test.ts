import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("Property 3: Iteration timing invariant", () => {
  it("should satisfy total >= agentCall and total >= effectExecution", async () => {
    const { createIterationTiming } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (startOffset, agentDelta, effectDelta) => {
          const iterationStartMs = 1000;
          const agentEndMs = iterationStartMs + startOffset + agentDelta;
          const effectEndMs = agentEndMs + effectDelta;

          const timing = createIterationTiming(iterationStartMs, agentEndMs, effectEndMs);

          expect(timing.totalIterationDurationMs).toBeGreaterThanOrEqual(
            timing.agentCallDurationMs,
          );
          expect(timing.totalIterationDurationMs).toBeGreaterThanOrEqual(
            timing.effectExecutionDurationMs,
          );
          expect(timing.totalIterationDurationMs).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Property 4: Performance baseline statistics correctness", () => {
  it("should satisfy avg = arithmetic mean and max >= min", async () => {
    const { createIterationTiming, computePerformanceBaseline } = await import(
      "../../src/logger/timing.js"
    );

    const timingArb = fc
      .tuple(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 1_000_000 }))
      .map(([agentDelta, effectDelta]) => {
        const start = 1000;
        const agentEnd = start + agentDelta + 1;
        const effectEnd = agentEnd + effectDelta + 1;
        return createIterationTiming(start, agentEnd, effectEnd);
      });

    fc.assert(
      fc.property(fc.array(timingArb, { minLength: 1, maxLength: 100 }), (timings) => {
        const baseline = computePerformanceBaseline(timings);

        const durations = timings.map((t) => t.totalIterationDurationMs);
        const expectedAvg = durations.reduce((a, b) => a + b, 0) / durations.length;

        expect(baseline.avgIterationMs).toBeCloseTo(expectedAvg, 10);
        expect(baseline.maxIterationMs).toBeGreaterThanOrEqual(baseline.minIterationMs);
        expect(baseline.iterationCount).toBe(timings.length);
      }),
      { numRuns: 200 },
    );
  });
});
