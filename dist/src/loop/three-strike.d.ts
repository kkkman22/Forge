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
/** Maximum consecutive failures before halting. */
export declare const MAX_CONSECUTIVE_FAILURES = 3;
/**
 * Record a failure — increments consecutive failures.
 * Does NOT automatically halt; caller must check {@link shouldHalt}.
 */
export declare function recordFailure(state: Pick<StrikeState, "consecutiveFailures" | "phase">): Pick<StrikeState, "consecutiveFailures" | "phase">;
/**
 * Record a success — resets consecutive failures and updates last commit.
 */
export declare function recordSuccess(state: Pick<StrikeState, "consecutiveFailures" | "phase" | "lastSuccessCommit">, commitHash: string): Pick<StrikeState, "consecutiveFailures" | "phase" | "lastSuccessCommit">;
/**
 * Whether the loop should halt due to too many consecutive failures.
 */
export declare function shouldHalt(state: Pick<StrikeState, "consecutiveFailures">): boolean;
/**
 * Compute a human-readable halt reason.
 */
export declare function computeHaltReason(consecutiveFailures: number, lastPhase: string): string;
/**
 * Whether a Git rollback should be performed before halting.
 * True when there are failures AND a known-good commit to roll back to.
 */
export declare function shouldRollback(state: RollbackState): boolean;
/**
 * Get the commit hash to roll back to.
 */
export declare function getRollbackTarget(state: Pick<StrikeState, "lastSuccessCommit">): string;
