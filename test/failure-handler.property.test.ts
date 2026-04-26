/**
 * Property-based tests for the failure handler module.
 *
 * Covers:
 *   - Property 11: 失败计数器差异化更新
 *   - Property 12: 退避公式正确性
 *   - Property 13: 熔断器阈值正确性
 *
 * **Validates: Requirements 5.3, 5.4, 5.7, 5.8**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyFailure,
  applySuccess,
  calculateBackoffMs,
  createInitialFailureState,
  shouldCircuitBreak,
} from "../src/failure-handler.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary FailureKind: "soft" or "hard". */
const failureKindArb = fc.constantFrom("soft" as const, "hard" as const);

/** Arbitrary FailureState with non-negative integer counters. */
const failureStateArb = fc
  .tuple(fc.nat({ max: 100 }), fc.nat({ max: 100 }))
  .map(([consecutiveFailures, consecutiveErrors]) => ({
    consecutiveFailures,
    consecutiveErrors,
  }));

/** consecutiveErrors in [1, 10] for backoff formula testing. */
const consecutiveErrorsArb = fc.integer({ min: 1, max: 10 });

/** Positive base milliseconds for backoff calculation. */
const baseMsArb = fc.integer({ min: 1, max: 1_000_000 });

/** Non-negative consecutive failure count. */
const consecutiveFailuresArb = fc.nat({ max: 200 });

/** Positive threshold for circuit breaker. */
const thresholdArb = fc.integer({ min: 1, max: 100 });

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 11: 失败計数器差異化更新
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 11: 失败计数器差异化更新", () => {
  /**
   * **Validates: Requirements 5.7, 5.8**
   */
  it("soft failure increments consecutiveFailures by 1 and resets consecutiveErrors to 0", () => {
    fc.assert(
      fc.property(failureStateArb, (state) => {
        const next = applyFailure(state, "soft");

        expect(next.consecutiveFailures).toBe(state.consecutiveFailures + 1);
        expect(next.consecutiveErrors).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.7, 5.8**
   */
  it("hard failure increments both consecutiveFailures and consecutiveErrors by 1", () => {
    fc.assert(
      fc.property(failureStateArb, (state) => {
        const next = applyFailure(state, "hard");

        expect(next.consecutiveFailures).toBe(state.consecutiveFailures + 1);
        expect(next.consecutiveErrors).toBe(state.consecutiveErrors + 1);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.7, 5.8**
   */
  it("success resets both counters to 0", () => {
    fc.assert(
      fc.property(failureStateArb, (state) => {
        const next = applySuccess(state);

        expect(next.consecutiveFailures).toBe(0);
        expect(next.consecutiveErrors).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.7, 5.8**
   */
  it("initial failure state starts at zero for both counters", () => {
    const initial = createInitialFailureState();

    expect(initial.consecutiveFailures).toBe(0);
    expect(initial.consecutiveErrors).toBe(0);
  });

  /**
   * **Validates: Requirements 5.7, 5.8**
   */
  it("applyFailure returns a new state object (immutability)", () => {
    fc.assert(
      fc.property(failureStateArb, failureKindArb, (state, kind) => {
        const next = applyFailure(state, kind);

        expect(next).not.toBe(state);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 12: 退避公式正确性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 12: 退避公式正确性", () => {
  /**
   * **Validates: Requirements 5.3**
   */
  it("calculateBackoffMs returns baseMs × 2^(consecutiveErrors - 1)", () => {
    fc.assert(
      fc.property(consecutiveErrorsArb, baseMsArb, (errors, baseMs) => {
        const result = calculateBackoffMs(errors, baseMs);
        const expected = baseMs * 2 ** (errors - 1);

        expect(result).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   */
  it("backoff with default baseMs uses 60000", () => {
    fc.assert(
      fc.property(consecutiveErrorsArb, (errors) => {
        const result = calculateBackoffMs(errors);
        const expected = 60_000 * 2 ** (errors - 1);

        expect(result).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   */
  it("backoff is monotonically increasing with consecutiveErrors", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), baseMsArb, (errors, baseMs) => {
        const current = calculateBackoffMs(errors, baseMs);
        const next = calculateBackoffMs(errors + 1, baseMs);

        expect(next).toBeGreaterThan(current);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 13: 熔断器阈值正確性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 13: 熔断器阈值正确性", () => {
  /**
   * **Validates: Requirements 5.4**
   */
  it("shouldCircuitBreak returns true iff consecutiveFailures >= threshold", () => {
    fc.assert(
      fc.property(consecutiveFailuresArb, thresholdArb, (failures, threshold) => {
        const result = shouldCircuitBreak(failures, threshold);

        expect(result).toBe(failures >= threshold);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.4**
   */
  it("shouldCircuitBreak with default threshold uses 3", () => {
    fc.assert(
      fc.property(consecutiveFailuresArb, (failures) => {
        const result = shouldCircuitBreak(failures);

        expect(result).toBe(failures >= 3);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.4**
   */
  it("exactly at threshold triggers circuit break", () => {
    fc.assert(
      fc.property(thresholdArb, (threshold) => {
        expect(shouldCircuitBreak(threshold, threshold)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.4**
   */
  it("one below threshold does not trigger circuit break", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 100 }), (threshold) => {
        expect(shouldCircuitBreak(threshold - 1, threshold)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
