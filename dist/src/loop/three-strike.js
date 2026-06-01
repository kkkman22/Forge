/**
 * @file Three-strike failure detection and Git rollback decisions.
 *
 * Provides pure decision functions for failure tracking, halt detection,
 * and rollback target resolution. Actual Git operations (reset, commit)
 * are performed at the skill layer (instructions.md §6, §9), not here.
 * This separation keeps the module testable without filesystem/git side effects.
 *
 * @module loop-three-strike
 */
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
export function recordFailure(state) {
    return {
        consecutiveFailures: state.consecutiveFailures + 1,
        phase: state.phase,
    };
}
/**
 * Record a success — resets consecutive failures and updates last commit.
 */
export function recordSuccess(state, commitHash) {
    return {
        consecutiveFailures: 0,
        phase: state.phase,
        lastSuccessCommit: commitHash,
    };
}
/**
 * Whether the loop should halt due to too many consecutive failures.
 */
export function shouldHalt(state) {
    return state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}
/**
 * Compute a human-readable halt reason.
 */
export function computeHaltReason(consecutiveFailures, lastPhase) {
    return `Three-strike triggered after ${consecutiveFailures} consecutive failures in ${lastPhase} phase`;
}
/**
 * Whether a Git rollback should be performed before halting.
 * True when there are failures AND a known-good commit to roll back to.
 */
export function shouldRollback(state) {
    return state.consecutiveFailures > 0 && state.lastSuccessCommit !== "";
}
/**
 * Get the commit hash to roll back to.
 */
export function getRollbackTarget(state) {
    return state.lastSuccessCommit;
}
//# sourceMappingURL=three-strike.js.map