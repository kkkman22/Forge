/**
 * SDK Commit Strategy — phase-specific commit message building and commit
 * effect filtering for skill-aware mode.
 *
 * Extracted from `SdkDriver` private methods as pure functions.
 * The caller (`SdkDriver`) applies any returned `stateAdjustment` to its
 * private `orchestratorState` — these functions never mutate state directly.
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 10.7**
 */
import type { OrchestratorEffect } from "./loop-types.js";
/**
 * Return type for `applySkillAwareCommitStrategy`.
 * Contains the adjusted effects array and an optional state adjustment
 * that the caller should apply to its orchestrator state.
 */
export interface CommitStrategyResult {
    effects: OrchestratorEffect[];
    stateAdjustment?: {
        commitCount: number;
    };
}
/**
 * Build a phase-specific commit message for skill-aware mode.
 *
 * @param phase - The current skill phase (e.g. "build", "plan", "fix").
 * @param iterationNumber - The current iteration number.
 * @param summary - The agent-provided summary of the iteration.
 * @param objective - The user-provided objective for the run.
 * @returns A formatted commit message string.
 */
export declare function buildCommitMessageForPhase(phase: string, iterationNumber: number, summary: string, objective: string): string;
/**
 * Apply skill-aware commit strategy to an effects array.
 *
 * For commitable phases: replaces generic commit messages with phase-specific ones.
 * For non-commitable phases with success: removes commit effects and returns a
 * `stateAdjustment` to decrement the commit count.
 * For failed iterations: returns effects unchanged.
 *
 * @param effects - The effects array from the orchestrator transition.
 * @param phase - The current skill phase.
 * @param success - Whether the iteration succeeded.
 * @param iterationNumber - The current iteration number.
 * @param summary - The agent-provided summary.
 * @param objective - The user-provided objective for the run.
 * @param currentCommitCount - The current commit count from orchestrator state.
 * @returns A `CommitStrategyResult` with adjusted effects and optional state adjustment.
 */
export declare function applySkillAwareCommitStrategy(effects: OrchestratorEffect[], phase: string, success: boolean, iterationNumber: number, summary: string, objective: string, currentCommitCount: number): CommitStrategyResult;
