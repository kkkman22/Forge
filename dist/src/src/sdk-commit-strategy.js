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
import { shouldCommitForPhase } from "./skill-scheduler.js";
// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------
/**
 * Build a phase-specific commit message for skill-aware mode.
 *
 * @param phase - The current skill phase (e.g. "build", "plan", "fix").
 * @param iterationNumber - The current iteration number.
 * @param summary - The agent-provided summary of the iteration.
 * @param objective - The user-provided objective for the run.
 * @returns A formatted commit message string.
 */
export function buildCommitMessageForPhase(phase, iterationNumber, summary, objective) {
    switch (phase) {
        case "build":
            // Use agent summary as proxy for plan-defined commit message (Req 7.1).
            return `forge(build): ${summary}`;
        case "plan":
            return `forge(plan): ${objective} plan approved`;
        case "fix":
        case "fix-apply":
            return "forge(fix): resolve P0/P1 from review";
        case "refactor-apply":
            return "forge(refactor): apply refactoring changes";
        default:
            return `forge(${phase}): iteration ${iterationNumber} — ${summary}`;
    }
}
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
export function applySkillAwareCommitStrategy(effects, phase, success, iterationNumber, summary, objective, currentCommitCount) {
    // No skill phase reported — allow the orchestrator's default commit/rollback
    // effects through unchanged. This happens when the agent doesn't set
    // skill_phase_completed (e.g. skill-aware mode without actual SKILL usage).
    if (!phase) {
        return { effects };
    }
    if (shouldCommitForPhase(phase, success)) {
        // Replace the generic commit message with a phase-specific one (Req 7.1–7.3).
        const commitMessage = buildCommitMessageForPhase(phase, iterationNumber, summary, objective);
        const adjusted = effects.map((e) => e.type === "commit" ? { type: "commit", message: commitMessage } : e);
        return { effects: adjusted };
    }
    if (success && !shouldCommitForPhase(phase, success)) {
        // Non-commitable phase succeeded — remove the commit effect (Req 7.4).
        // Also adjust commitCount since the orchestrator incremented it.
        const filtered = effects.filter((e) => e.type !== "commit");
        if (filtered.length !== effects.length) {
            // A commit effect was removed — decrement the commitCount that the
            // orchestrator optimistically incremented.
            return {
                effects: filtered,
                stateAdjustment: { commitCount: Math.max(0, currentCommitCount - 1) },
            };
        }
        return { effects: filtered };
    }
    // Failed iteration with non-commitable phase — rollback is already in effects
    // from the orchestrator (harmless no-op on clean tree). No changes needed.
    return { effects };
}
//# sourceMappingURL=sdk-commit-strategy.js.map