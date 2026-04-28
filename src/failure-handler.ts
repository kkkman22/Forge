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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base delay in milliseconds for exponential backoff. */
const DEFAULT_BASE_MS = 60_000;

/**
 * Default consecutive-failure threshold for the circuit breaker.
 *
 * Design intent: The Circuit Breaker threshold (3) and the PUA L4 threshold (5)
 * are intentionally different. PUA L1–L3 provide progressive warnings and
 * methodology switches (2–4 failures), while the Circuit Breaker terminates
 * the loop at 3 consecutive failures. This means PUA gets 1–2 rounds of
 * escalation before the Circuit Breaker trips.
 *
 * Collaboration: PUA pressures the agent to change approach before the
 * Circuit Breaker forces termination.
 *
 * @see src/pua-engine.ts determinePressureLevel — PUA pressure level thresholds
 */
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

/**
 * Create a zero-value initial failure state.
 *
 * Both counters start at zero, indicating no failures have occurred.
 */
export function createInitialFailureState(): FailureState {
  return {
    consecutiveFailures: 0,
    consecutiveErrors: 0,
  };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

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
export function applyFailure(state: FailureState, kind: FailureKind): FailureState {
  if (kind === "soft") {
    return {
      consecutiveFailures: state.consecutiveFailures + 1,
      consecutiveErrors: 0,
    };
  }

  // hard failure
  return {
    consecutiveFailures: state.consecutiveFailures + 1,
    consecutiveErrors: state.consecutiveErrors + 1,
  };
}

/**
 * Apply a success event, resetting all failure counters to zero.
 *
 * A successful iteration proves the system is healthy, so both counters
 * are cleared.
 *
 * @param _state  Current failure state (unused — success always resets).
 * @returns A fresh zero-value `FailureState`.
 */
export function applySuccess(_state: FailureState): FailureState {
  return {
    consecutiveFailures: 0,
    consecutiveErrors: 0,
  };
}

// ---------------------------------------------------------------------------
// Backoff calculation
// ---------------------------------------------------------------------------

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
export function calculateBackoffMs(consecutiveErrors: number, baseMs = DEFAULT_BASE_MS): number {
  const clamped = Math.max(1, consecutiveErrors);
  return baseMs * 2 ** (clamped - 1);
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

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
export function shouldCircuitBreak(
  consecutiveFailures: number,
  threshold = DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
): boolean {
  return consecutiveFailures >= threshold;
}
