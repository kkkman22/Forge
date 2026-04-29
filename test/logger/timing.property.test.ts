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

describe("Feature: observability-enhancements, Property 7: SubagentTiming 耗时不变量", () => {
  /**
   * **Validates: Requirements 4.3, 4.4**
   *
   * For any valid startMs and endMs where endMs >= startMs,
   * buildSubagentTiming() SHALL return durationMs === endMs - startMs.
   * When endMs < startMs (clock skew), durationMs SHALL be 0.
   */

  it("should satisfy durationMs === endMs - startMs when endMs >= startMs", async () => {
    const { buildSubagentTiming } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (subagentId, startMs, delta) => {
          const endMs = startMs + delta;
          const timing = buildSubagentTiming(subagentId, startMs, endMs);

          expect(timing.subagentId).toBe(subagentId);
          expect(timing.startMs).toBe(startMs);
          expect(timing.endMs).toBe(endMs);
          expect(timing.durationMs).toBe(endMs - startMs);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("should clamp durationMs to 0 when endMs < startMs (clock skew)", async () => {
    const { buildSubagentTiming } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        (subagentId, startMs, gap) => {
          // Ensure endMs < startMs
          const endMs = startMs - gap;
          fc.pre(endMs < startMs);

          const timing = buildSubagentTiming(subagentId, startMs, endMs);

          expect(timing.subagentId).toBe(subagentId);
          expect(timing.startMs).toBe(startMs);
          expect(timing.endMs).toBe(endMs);
          expect(timing.durationMs).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Feature: observability-enhancements, Property 9: 退化检测正确性", () => {
  /**
   * **Validates: Requirements 5.2, 5.4**
   *
   * For any currentMs and history array with >= 3 records,
   * detectDegradation() SHALL return isDegraded: true when currentMs > 2 × rollingAvg,
   * and isDegraded: false otherwise.
   * When history has < 3 records, SHALL always return isDegraded: false.
   */

  const iterationTimingArb = fc
    .tuple(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 1, max: 1_000_000 }),
    )
    .map(([start, agentDelta, effectDelta]) => {
      const agentEnd = start + agentDelta;
      const effectEnd = agentEnd + effectDelta;
      return {
        iterationStartMs: start,
        agentCallDurationMs: agentEnd - start,
        effectExecutionDurationMs: effectEnd - agentEnd,
        totalIterationDurationMs: effectEnd - start,
      };
    });

  it("should return isDegraded: true when currentMs > 2 × rollingAvg (history >= 3)", async () => {
    const { detectDegradation } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(fc.array(iterationTimingArb, { minLength: 3, maxLength: 50 }), (history) => {
        const sum = history.reduce((acc, t) => acc + t.totalIterationDurationMs, 0);
        const rollingAvg = sum / history.length;

        // Pick a currentMs that is strictly greater than 2 × rollingAvg
        const currentMs = Math.floor(rollingAvg * 2) + 1;

        const result = detectDegradation(currentMs, history);

        expect(result.isDegraded).toBe(true);
        expect(result.currentMs).toBe(currentMs);
        expect(result.rollingAvgMs).toBeCloseTo(rollingAvg, 5);
      }),
      { numRuns: 200 },
    );
  });

  it("should return isDegraded: false when currentMs <= 2 × rollingAvg (history >= 3)", async () => {
    const { detectDegradation } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.array(iterationTimingArb, { minLength: 3, maxLength: 50 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (history, fraction) => {
          const sum = history.reduce((acc, t) => acc + t.totalIterationDurationMs, 0);
          const rollingAvg = sum / history.length;

          // Pick a currentMs that is at most 2 × rollingAvg
          const currentMs = Math.floor(rollingAvg * 2 * fraction);

          const result = detectDegradation(currentMs, history);

          expect(result.isDegraded).toBe(false);
          expect(result.currentMs).toBe(currentMs);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("should always return isDegraded: false when history has < 3 records", async () => {
    const { detectDegradation } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.array(iterationTimingArb, { minLength: 0, maxLength: 2 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (history, currentMs) => {
          const result = detectDegradation(currentMs, history);

          expect(result.isDegraded).toBe(false);
          expect(result.currentMs).toBe(currentMs);
          expect(result.rollingAvgMs).toBe(0);
          expect(result.deviationFactor).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Feature: observability-enhancements, Property 2: SubagentTiming JSON 往返一致性", () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any valid SubagentTiming object (subagentId is a non-empty string,
   * startMs and endMs are non-negative integers), serializing via JSON.stringify()
   * and deserializing via JSON.parse() SHALL produce a deeply equal structure.
   */

  it("should round-trip SubagentTiming through JSON serialization", async () => {
    const { buildSubagentTiming } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (subagentId, startMs, endMs) => {
          const timing = buildSubagentTiming(subagentId, startMs, endMs);

          const serialized = JSON.stringify(timing);
          const deserialized = JSON.parse(serialized);

          expect(deserialized).toEqual(timing);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Feature: observability-enhancements, Property 3: 扩展 PerformanceBaseline JSON 往返一致性", () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any valid PerformanceBaseline object with extended fields
   * (subagentCallCount, avgSubagentMs, maxSubagentMs, degradationCount),
   * serializing via JSON.stringify() and deserializing via JSON.parse()
   * SHALL produce a deeply equal structure.
   */

  it("should round-trip extended PerformanceBaseline through JSON serialization", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        (
          totalRunTimeMs,
          iterationCount,
          avgIterationMs,
          maxIterationMs,
          minIterationMs,
          avgAgentCallMs,
          subagentCallCount,
          avgSubagentMs,
          maxSubagentMs,
          degradationCount,
        ) => {
          const baseline = {
            totalRunTimeMs,
            iterationCount,
            avgIterationMs,
            maxIterationMs,
            minIterationMs,
            avgAgentCallMs,
            subagentCallCount,
            avgSubagentMs,
            maxSubagentMs,
            degradationCount,
          };

          const serialized = JSON.stringify(baseline);
          const deserialized = JSON.parse(serialized);

          expect(deserialized).toEqual(baseline);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Feature: observability-enhancements, Property 8: 扩展 PerformanceBaseline 统计正确性", () => {
  /**
   * **Validates: Requirements 4.5, 6.1, 6.6**
   *
   * For any non-empty SubagentTiming array, computeExtendedBaseline() SHALL return:
   * - subagentCallCount equals array length
   * - avgSubagentMs equals arithmetic mean of all durationMs
   * - maxSubagentMs equals max of all durationMs
   * - subagentCallCount >= 0 and degradationCount >= 0
   */

  const iterationTimingArb = fc
    .tuple(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 1, max: 1_000_000 }),
    )
    .map(([start, agentDelta, effectDelta]) => {
      const agentEnd = start + agentDelta;
      const effectEnd = agentEnd + effectDelta;
      return {
        iterationStartMs: start,
        agentCallDurationMs: agentEnd - start,
        effectExecutionDurationMs: effectEnd - agentEnd,
        totalIterationDurationMs: effectEnd - start,
      };
    });

  const subagentTimingArb = fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.integer({ min: 0, max: 1_000_000_000 }),
      fc.integer({ min: 0, max: 1_000_000 }),
    )
    .map(([subagentId, startMs, delta]) => ({
      subagentId,
      startMs,
      endMs: startMs + delta,
      durationMs: delta,
    }));

  it("should compute correct subagent statistics from non-empty SubagentTiming arrays", async () => {
    const { computeExtendedBaseline } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.array(iterationTimingArb, { minLength: 1, maxLength: 50 }),
        fc.array(subagentTimingArb, { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 0, max: 100 }),
        (timings, subagentTimings, degradationCount) => {
          const baseline = computeExtendedBaseline(timings, subagentTimings, degradationCount);

          // subagentCallCount equals array length
          expect(baseline.subagentCallCount).toBe(subagentTimings.length);

          // avgSubagentMs equals arithmetic mean
          const durations = subagentTimings.map((t) => t.durationMs);
          const expectedAvg = durations.reduce((a, b) => a + b, 0) / durations.length;
          expect(baseline.avgSubagentMs).toBeCloseTo(expectedAvg, 10);

          // maxSubagentMs equals max value
          const expectedMax = Math.max(...durations);
          expect(baseline.maxSubagentMs).toBe(expectedMax);

          // Non-negative invariants
          expect(baseline.subagentCallCount).toBeGreaterThanOrEqual(0);
          expect(baseline.degradationCount).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Feature: observability-enhancements, Property 10: 格式化 Baseline 包含 Subagent 统计", () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any PerformanceBaseline object with subagentCallCount defined and > 0,
   * formatPerformanceBaseline() output SHALL contain the "Subagent" keyword
   * and the subagent call count.
   */

  it("should include Subagent keyword and call count in formatted output", async () => {
    const { formatPerformanceBaseline } = await import("../../src/logger/timing.js");

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        (
          totalRunTimeMs,
          iterationCount,
          avgIterationMs,
          maxIterationMs,
          minIterationMs,
          avgAgentCallMs,
          subagentCallCount,
          avgSubagentMs,
          maxSubagentMs,
          degradationCount,
        ) => {
          const baseline = {
            totalRunTimeMs,
            iterationCount,
            avgIterationMs,
            maxIterationMs,
            minIterationMs,
            avgAgentCallMs,
            subagentCallCount,
            avgSubagentMs,
            maxSubagentMs,
            degradationCount,
          };

          const output = formatPerformanceBaseline(baseline);

          expect(output).toContain("Subagent");
          expect(output).toContain(String(subagentCallCount));
        },
      ),
      { numRuns: 200 },
    );
  });
});
