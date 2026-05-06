/**
 * Property-based tests for the orchestrator state machine module.
 *
 * Covers:
 *   - Property 2: 编排器状态转换正确性
 *   - Property 3: 终止条件正确性
 *
 * **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.8**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { OrchestratorState, RunLimits, TokenUsage } from "../src/loop-types.js";
import { createInitialState, shouldAbort, transition } from "../src/orchestrator.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary TokenUsage with non-negative integer fields. */
const tokenUsageArb: fc.Arbitrary<TokenUsage> = fc.record({
  inputTokens: fc.nat(),
  outputTokens: fc.nat(),
  cacheReadTokens: fc.nat(),
  cacheCreationTokens: fc.nat(),
});

/** Arbitrary non-empty summary string. */
const summaryArb = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Arbitrary "running" OrchestratorState with consecutiveFailures below the
 * circuit breaker threshold (< 3) to avoid circuit breaker interference.
 */
/**
 * Arbitrary "running" OrchestratorState with consecutiveFailures safely
 * below the circuit breaker threshold. After a failure event the counter
 * increments by 1, so we cap at 1 to ensure the post-event value (2) is
 * still below the default threshold of 3.
 */
const runningStateArb: fc.Arbitrary<OrchestratorState> = fc
  .record({
    currentIteration: fc.nat({ max: 50 }),
    totalInputTokens: fc.nat({ max: 100_000 }),
    totalOutputTokens: fc.nat({ max: 100_000 }),
    commitCount: fc.nat({ max: 50 }),
    successCount: fc.nat({ max: 50 }),
    failCount: fc.nat({ max: 50 }),
    consecutiveFailures: fc.integer({ min: 0, max: 1 }),
    consecutiveErrors: fc.integer({ min: 0, max: 1 }),
  })
  .map((fields) => ({
    ...fields,
    status: "running" as const,
    waitingUntilMs: null,
  }));

/** Arbitrary RunLimits for shouldAbort testing. */
const _runLimitsArb: fc.Arbitrary<RunLimits> = fc.record({
  maxIterations: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  maxTokens: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 2: 编排器状态转换正确性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 2: 编排器状态转换正确性", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * Success events produce commit + schedule_iteration effects,
   * increment successCount and commitCount, reset consecutiveFailures
   * and consecutiveErrors to zero.
   */
  it("success events produce commit + schedule_iteration, increment counts, reset failure counters", () => {
    fc.assert(
      fc.property(runningStateArb, summaryArb, tokenUsageArb, (state, summary, tokenUsage) => {
        const event = { type: "iteration_success" as const, summary, tokenUsage };
        const result = transition(state, event);

        // Effects: commit followed by schedule_iteration
        const effectTypes = result.effects.map((e) => e.type);
        expect(effectTypes).toContain("commit");
        expect(effectTypes).toContain("schedule_iteration");

        // Counters
        expect(result.state.successCount).toBe(state.successCount + 1);
        expect(result.state.commitCount).toBe(state.commitCount + 1);
        expect(result.state.consecutiveFailures).toBe(0);
        expect(result.state.consecutiveErrors).toBe(0);

        // Iteration incremented
        expect(result.state.currentIteration).toBe(state.currentIteration + 1);

        // Token usage accumulated
        expect(result.state.totalInputTokens).toBe(state.totalInputTokens + tokenUsage.inputTokens);
        expect(result.state.totalOutputTokens).toBe(
          state.totalOutputTokens + tokenUsage.outputTokens,
        );
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.4**
   *
   * Soft failure events produce rollback effect (and schedule_iteration
   * if no circuit break), increment consecutiveFailures, reset
   * consecutiveErrors to zero, do NOT produce backoff.
   */
  it("soft failure events produce rollback + schedule_iteration, no backoff, reset consecutiveErrors", () => {
    fc.assert(
      fc.property(runningStateArb, summaryArb, tokenUsageArb, (state, summary, tokenUsage) => {
        const event = { type: "iteration_soft_failure" as const, summary, tokenUsage };
        const result = transition(state, event);

        const effectTypes = result.effects.map((e) => e.type);

        // Must have rollback
        expect(effectTypes).toContain("rollback");

        // Must NOT have start_backoff
        expect(effectTypes).not.toContain("start_backoff");

        // Should have schedule_iteration (no circuit break since consecutiveFailures < 3)
        expect(effectTypes).toContain("schedule_iteration");

        // consecutiveFailures incremented
        expect(result.state.consecutiveFailures).toBe(state.consecutiveFailures + 1);

        // consecutiveErrors reset to zero
        expect(result.state.consecutiveErrors).toBe(0);

        // Iteration incremented
        expect(result.state.currentIteration).toBe(state.currentIteration + 1);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.4**
   *
   * Hard failure events produce rollback + start_backoff effects
   * (when no circuit break), increment both consecutiveFailures and
   * consecutiveErrors.
   */
  it("hard failure events produce rollback + start_backoff, increment both failure counters", () => {
    fc.assert(
      fc.property(runningStateArb, tokenUsageArb, (state, tokenUsage) => {
        const event = {
          type: "iteration_hard_failure" as const,
          error: "agent crashed",
          tokenUsage,
        };
        const result = transition(state, event);

        const effectTypes = result.effects.map((e) => e.type);

        // Must have rollback
        expect(effectTypes).toContain("rollback");

        // Must have start_backoff (no circuit break since consecutiveFailures < 3)
        expect(effectTypes).toContain("start_backoff");

        // Both counters incremented
        expect(result.state.consecutiveFailures).toBe(state.consecutiveFailures + 1);
        expect(result.state.consecutiveErrors).toBe(state.consecutiveErrors + 1);

        // Iteration incremented
        expect(result.state.currentIteration).toBe(state.currentIteration + 1);

        // Status becomes "waiting" (backoff)
        expect(result.state.status).toBe("waiting");
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.8**
   *
   * User interrupt events produce rollback + stop effects,
   * status becomes "stopped".
   */
  it("user interrupt events produce rollback + stop, status becomes stopped", () => {
    fc.assert(
      fc.property(runningStateArb, (state) => {
        const event = { type: "user_interrupt" as const };
        const result = transition(state, event);

        const effectTypes = result.effects.map((e) => e.type);

        expect(effectTypes).toContain("rollback");
        expect(effectTypes).toContain("stop");
        expect(result.state.status).toBe("stopped");
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 3: 终止条件正确性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 3: 终止条件正确性", () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * shouldAbort returns a reason containing "max iterations" when
   * currentIteration >= maxIterations.
   */
  it("returns reason containing 'max iterations' when currentIteration >= maxIterations", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), fc.nat({ max: 50 }), (maxIterations, extra) => {
        const state: OrchestratorState = {
          ...createInitialState(),
          status: "running",
          currentIteration: maxIterations + extra,
        };
        const limits: RunLimits = { maxIterations };

        const reason = shouldAbort(state, limits);

        expect(reason).not.toBeNull();
        expect(reason).toContain("max iterations");
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.6**
   *
   * shouldAbort returns a reason containing "max tokens" when
   * totalInputTokens + totalOutputTokens >= maxTokens.
   */
  it("returns reason containing 'max tokens' when total tokens >= maxTokens", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.nat({ max: 500_000 }),
        (maxTokens, extra) => {
          // Split the total across input and output tokens
          const total = maxTokens + extra;
          const inputTokens = Math.floor(total / 2);
          const outputTokens = total - inputTokens;

          const state: OrchestratorState = {
            ...createInitialState(),
            status: "running",
            totalInputTokens: inputTokens,
            totalOutputTokens: outputTokens,
          };
          const limits: RunLimits = { maxTokens };

          const reason = shouldAbort(state, limits);

          expect(reason).not.toBeNull();
          expect(reason).toContain("max tokens");
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.5, 1.6**
   *
   * shouldAbort returns null when neither limit is reached.
   */
  it("returns null when neither limit is reached", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 2, max: 1_000_000 }),
        (maxIterations, maxTokens) => {
          // Ensure state is strictly below both limits
          const state: OrchestratorState = {
            ...createInitialState(),
            status: "running",
            currentIteration: maxIterations - 1,
            totalInputTokens: Math.floor((maxTokens - 2) / 2),
            totalOutputTokens: Math.floor((maxTokens - 2) / 2),
          };
          const limits: RunLimits = { maxIterations, maxTokens };

          const reason = shouldAbort(state, limits);

          expect(reason).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.5, 1.6**
   *
   * shouldAbort returns null when no limits are configured.
   */
  it("returns null when no limits are configured", () => {
    fc.assert(
      fc.property(runningStateArb, (state) => {
        const reason = shouldAbort(state, {});

        expect(reason).toBeNull();
      }),
      { numRuns: 50 },
    );
  });
});
