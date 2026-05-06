/**
 * Feature: audit-remediation-v221, Property 7: Terminal/idle state guards
 * Feature: audit-remediation-v221, Property 8: stop_condition_met increments iteration
 *
 * **Validates: Requirements 18.1, 18.2, 19.1**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { transition } from "../src/orchestrator.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary TokenUsage with non-negative integer fields. */
const tokenUsageArb = fc.record({
    inputTokens: fc.nat({ max: 100_000 }),
    outputTokens: fc.nat({ max: 100_000 }),
    cacheReadTokens: fc.nat({ max: 100_000 }),
    cacheCreationTokens: fc.nat({ max: 100_000 }),
});
/** Arbitrary non-empty summary string. */
const summaryArb = fc.string({ minLength: 1, maxLength: 100 });
/** Arbitrary RunLimits. */
const runLimitsArb = fc.record({
    maxIterations: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
    maxTokens: fc.option(fc.integer({ min: 1, max: 10_000_000 }), { nil: undefined }),
});
/** Base state fields shared across all state generators. */
const baseStateFieldsArb = fc.record({
    currentIteration: fc.nat({ max: 100 }),
    totalInputTokens: fc.nat({ max: 100_000 }),
    totalOutputTokens: fc.nat({ max: 100_000 }),
    commitCount: fc.nat({ max: 100 }),
    successCount: fc.nat({ max: 100 }),
    failCount: fc.nat({ max: 100 }),
    consecutiveFailures: fc.nat({ max: 20 }),
    consecutiveErrors: fc.nat({ max: 20 }),
    waitingUntilMs: fc.option(fc.nat({ max: 10_000_000 }), { nil: null }),
});
/** Arbitrary OrchestratorState in "aborted" status. */
const abortedStateArb = baseStateFieldsArb.map((fields) => ({
    ...fields,
    status: "aborted",
}));
/** Arbitrary OrchestratorState in "stopped" status. */
const stoppedStateArb = baseStateFieldsArb.map((fields) => ({
    ...fields,
    status: "stopped",
}));
/** Arbitrary OrchestratorState in terminal status (aborted or stopped). */
const terminalStateArb = fc.oneof(abortedStateArb, stoppedStateArb);
/** Arbitrary OrchestratorState in "idle" status. */
const idleStateArb = baseStateFieldsArb.map((fields) => ({
    ...fields,
    status: "idle",
}));
/** Arbitrary OrchestratorState in "running" status. */
const runningStateArb = baseStateFieldsArb.map((fields) => ({
    ...fields,
    status: "running",
    waitingUntilMs: null,
}));
/** Arbitrary OrchestratorEvent — all possible event types. */
const anyEventArb = fc.oneof(fc.record({ type: fc.constant("start"), limits: runLimitsArb }), fc.record({
    type: fc.constant("iteration_success"),
    summary: summaryArb,
    tokenUsage: tokenUsageArb,
}), fc.record({
    type: fc.constant("iteration_soft_failure"),
    summary: summaryArb,
    tokenUsage: tokenUsageArb,
}), fc.record({
    type: fc.constant("iteration_hard_failure"),
    error: summaryArb,
    tokenUsage: tokenUsageArb,
}), fc.constant({ type: "stop_condition_met" }), fc.constant({ type: "user_interrupt" }), fc.constant({ type: "backoff_elapsed" }));
/** Arbitrary non-start OrchestratorEvent — all event types except "start". */
const nonStartEventArb = fc.oneof(fc.record({
    type: fc.constant("iteration_success"),
    summary: summaryArb,
    tokenUsage: tokenUsageArb,
}), fc.record({
    type: fc.constant("iteration_soft_failure"),
    summary: summaryArb,
    tokenUsage: tokenUsageArb,
}), fc.record({
    type: fc.constant("iteration_hard_failure"),
    error: summaryArb,
    tokenUsage: tokenUsageArb,
}), fc.constant({ type: "stop_condition_met" }), fc.constant({ type: "user_interrupt" }), fc.constant({ type: "backoff_elapsed" }));
// ---------------------------------------------------------------------------
// Feature: audit-remediation-v221, Property 7: Terminal/idle state guards
// ---------------------------------------------------------------------------
describe("Feature: audit-remediation-v221, Property 7: Terminal/idle state guards", () => {
    /**
     * **Validates: Requirements 18.1**
     *
     * For any event applied to an aborted or stopped state, transition
     * returns the state unchanged with an empty effects array.
     */
    it("terminal states (aborted/stopped) reject all events — state unchanged, effects empty", () => {
        fc.assert(fc.property(terminalStateArb, anyEventArb, runLimitsArb, (state, event, limits) => {
            const result = transition(state, event, limits);
            expect(result.state).toEqual(state);
            expect(result.effects).toEqual([]);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 18.1**
     *
     * Specifically for aborted state: any event returns state unchanged.
     */
    it("aborted state rejects all events — state unchanged, effects empty", () => {
        fc.assert(fc.property(abortedStateArb, anyEventArb, (state, event) => {
            const result = transition(state, event);
            expect(result.state).toEqual(state);
            expect(result.effects).toEqual([]);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 18.1**
     *
     * Specifically for stopped state: any event returns state unchanged.
     */
    it("stopped state rejects all events — state unchanged, effects empty", () => {
        fc.assert(fc.property(stoppedStateArb, anyEventArb, (state, event) => {
            const result = transition(state, event);
            expect(result.state).toEqual(state);
            expect(result.effects).toEqual([]);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 18.2**
     *
     * For any non-start event applied to an idle state, transition
     * returns the state unchanged with an empty effects array.
     */
    it("idle state rejects non-start events — state unchanged, effects empty", () => {
        fc.assert(fc.property(idleStateArb, nonStartEventArb, runLimitsArb, (state, event, limits) => {
            const result = transition(state, event, limits);
            expect(result.state).toEqual(state);
            expect(result.effects).toEqual([]);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 18.2**
     *
     * Idle state does accept "start" events (sanity check — should NOT
     * return state unchanged).
     */
    it("idle state accepts start events — transitions to running", () => {
        fc.assert(fc.property(idleStateArb, runLimitsArb, (state, limits) => {
            const event = { type: "start", limits };
            const result = transition(state, event, limits);
            expect(result.state.status).toBe("running");
            expect(result.effects.length).toBeGreaterThan(0);
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Feature: audit-remediation-v221, Property 8: stop_condition_met increments iteration
// ---------------------------------------------------------------------------
describe("Feature: audit-remediation-v221, Property 8: stop_condition_met increments iteration", () => {
    /**
     * **Validates: Requirements 19.1**
     *
     * For any running state, stop_condition_met produces
     * currentIteration + 1 and status === "aborted".
     */
    it("stop_condition_met on running state increments currentIteration and sets status to aborted", () => {
        fc.assert(fc.property(runningStateArb, (state) => {
            const event = { type: "stop_condition_met" };
            const result = transition(state, event);
            expect(result.state.currentIteration).toBe(state.currentIteration + 1);
            expect(result.state.status).toBe("aborted");
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 19.1**
     *
     * stop_condition_met emits an abort effect with reason "stop condition met".
     */
    it("stop_condition_met emits abort effect with reason 'stop condition met'", () => {
        fc.assert(fc.property(runningStateArb, (state) => {
            const event = { type: "stop_condition_met" };
            const result = transition(state, event);
            expect(result.effects).toHaveLength(1);
            expect(result.effects[0]).toEqual({ type: "abort", reason: "stop condition met" });
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 19.1**
     *
     * stop_condition_met preserves all other state fields besides
     * currentIteration and status.
     */
    it("stop_condition_met preserves all other state fields", () => {
        fc.assert(fc.property(runningStateArb, (state) => {
            const event = { type: "stop_condition_met" };
            const result = transition(state, event);
            // All fields except currentIteration and status should be unchanged
            expect(result.state.totalInputTokens).toBe(state.totalInputTokens);
            expect(result.state.totalOutputTokens).toBe(state.totalOutputTokens);
            expect(result.state.commitCount).toBe(state.commitCount);
            expect(result.state.successCount).toBe(state.successCount);
            expect(result.state.failCount).toBe(state.failCount);
            expect(result.state.consecutiveFailures).toBe(state.consecutiveFailures);
            expect(result.state.consecutiveErrors).toBe(state.consecutiveErrors);
            expect(result.state.waitingUntilMs).toBe(state.waitingUntilMs);
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=orchestrator.property.test.js.map