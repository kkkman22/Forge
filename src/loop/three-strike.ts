/**
 * @file Three-strike failure detection and Git rollback decisions.
 *
 * Tracks consecutive failures, triggers halt at ≥3, determines
 * rollback targets, and resets on success.
 *
 * @module loop-three-strike
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal state slice needed for three-strike decisions. */
export interface StrikeState {
  consecutiveFailures: number;
  phase: string;
  lastSuccessCommit: string;
}

/** State slice for rollback checks. */
export interface RollbackState {
  consecutiveFailures: number;
  lastSuccessCommit: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum consecutive failures before halting. */
export const MAX_CONSECUTIVE_FAILURES = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a failure — increments consecutive failures.
 * Does NOT automatically halt; caller must check {@link shouldHalt}.
 */
export function recordFailure(
  state: Pick<StrikeState, "consecutiveFailures" | "phase">,
): Pick<StrikeState, "consecutiveFailures" | "phase"> {
  return {
    consecutiveFailures: state.consecutiveFailures + 1,
    phase: state.phase,
  };
}

/**
 * Record a success — resets consecutive failures and updates last commit.
 */
export function recordSuccess(
  state: Pick<StrikeState, "consecutiveFailures" | "phase" | "lastSuccessCommit">,
  commitHash: string,
): Pick<StrikeState, "consecutiveFailures" | "phase" | "lastSuccessCommit"> {
  return {
    consecutiveFailures: 0,
    phase: state.phase,
    lastSuccessCommit: commitHash,
  };
}

/**
 * Whether the loop should halt due to too many consecutive failures.
 */
export function shouldHalt(
  state: Pick<StrikeState, "consecutiveFailures">,
): boolean {
  return state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

/**
 * Compute a human-readable halt reason.
 */
export function computeHaltReason(
  consecutiveFailures: number,
  lastPhase: string,
): string {
  return `Three-strike triggered after ${consecutiveFailures} consecutive failures in ${lastPhase} phase`;
}

/**
 * Whether a Git rollback should be performed before halting.
 * True when there are failures AND a known-good commit to roll back to.
 */
export function shouldRollback(state: RollbackState): boolean {
  return state.consecutiveFailures > 0 && state.lastSuccessCommit !== "";
}

/**
 * Get the commit hash to roll back to.
 */
export function getRollbackTarget(
  state: Pick<StrikeState, "lastSuccessCommit">,
): string {
  return state.lastSuccessCommit;
}
