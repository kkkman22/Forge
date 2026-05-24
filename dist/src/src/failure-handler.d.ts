/**
 * Layered failure handling — soft/hard failure differentiation, exponential
 * backoff, and circuit breaker logic.
 *
 * All functions are pure: they accept state and return new state without
 * side effects.
 *
 * Design reference: gnhf-inspired-enhancements § failure-handler.ts
 * **Validates: Requirements 5.1–5.8**
 */
import type { FailureKind, FailureState } from "./loop-types.js";
/**
 * Create a zero-value initial failure state.
 *
 * Both counters start at zero, indicating no failures have occurred.
 */
export declare function createInitialFailureState(): FailureState;
/**
 * Apply a failure event to the current failure state.
 *
 * - **Soft failure**: `consecutiveFailures` increments by 1,
 *   `consecutiveErrors` resets to 0 (the agent ran normally, the iteration
 *   just didn't succeed).
 * - **Hard failure**: both `consecutiveFailures` and `consecutiveErrors`
 *   increment by 1 (the agent itself crashed or timed out).
 *
 * @param state  Current failure state.
 * @param kind   Whether the failure is "soft" or "hard".
 * @returns A new `FailureState` with updated counters.
 */
export declare function applyFailure(state: FailureState, kind: FailureKind): FailureState;
/**
 * Apply a success event, resetting all failure counters to zero.
 *
 * A successful iteration proves the system is healthy, so both counters
 * are cleared.
 *
 * @param _state  Current failure state (unused — success always resets).
 * @returns A fresh zero-value `FailureState`.
 */
export declare function applySuccess(_state: FailureState): FailureState;
/**
 * Calculate the exponential backoff delay in milliseconds.
 *
 * Formula: `baseMs × 2^(consecutiveErrors - 1)`
 *
 * | consecutiveErrors | delay (default baseMs = 60 000) |
 * |-------------------|---------------------------------|
 * | 1                 | 60 000 ms (1 min)               |
 * | 2                 | 120 000 ms (2 min)              |
 * | 3                 | 240 000 ms (4 min)              |
 *
 * @param consecutiveErrors  Number of consecutive hard errors. Values below 1
 *                           are clamped to 1 so the result is always ≥ baseMs.
 * @param baseMs             Base delay in milliseconds. Defaults to 60 000.
 * @returns Backoff duration in milliseconds (always ≥ baseMs).
 */
export declare function calculateBackoffMs(consecutiveErrors: number, baseMs?: number): number;
/**
 * Determine whether the circuit breaker should trip.
 *
 * Returns `true` when the number of consecutive failures (soft + hard
 * combined) reaches or exceeds the threshold.
 *
 * @param consecutiveFailures  Current consecutive failure count.
 * @param threshold            Failure count that triggers the breaker.
 *                             Defaults to 3.
 * @returns `true` if the circuit should break.
 */
export declare function shouldCircuitBreak(consecutiveFailures: number, threshold?: number): boolean;
