/**
 * SKILL scheduler — pure functions for determining the next SKILL phase
 * based on current state, and retrieving command sequences per tier.
 *
 * All functions are pure: they accept data and return results without
 * side effects. The SdkDriver layer is responsible for actual I/O.
 *
 * Design reference: loop-skills-fusion § skill-scheduler.ts
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11**
 */
/** SKILL phase identifiers used by the scheduler state machine. */
export type SkillPhase = "router" | "plan" | "build" | "build-light" | "review" | "test" | "ship" | "learn" | "refactor-scan" | "refactor-apply" | "fix-analyze" | "fix-apply" | "completed" | "aborted";
/**
 * Input for the scheduler's `determineNextSkill()` function.
 * All fields are extracted from StatusFile, Plan, Progress, and Review files.
 */
export interface SchedulerInput {
    /** StatusFile `phase` field. */
    currentPhase?: string;
    /** StatusFile `tier` field. */
    tier?: string;
    /** Plan file `status` field. */
    planStatus?: string;
    /** Whether Progress contains incomplete tasks. */
    hasIncompleteTasks?: boolean;
    /** Review report `result` field. */
    reviewResult?: string;
    /** Whether tests passed. */
    testPassed?: boolean;
    /** Number of consecutive review-fix loop iterations. */
    reviewFixAttempts: number;
    /** Maximum allowed review-fix loop iterations before circuit breaker. */
    maxReviewFixAttempts: number;
}
/** Result of the scheduler's phase determination. */
export interface SchedulerResult {
    /** The next SKILL phase to execute. */
    nextPhase: SkillPhase;
    /** Human-readable explanation for the transition. */
    reason: string;
}
/**
 * Determine the next SKILL phase to execute based on current state.
 *
 * Implements the scheduler state machine:
 * - phase missing or "router" → router
 * - router completed → plan
 * - plan + status ≠ approved → plan
 * - plan + status = approved → build
 * - build + hasIncompleteTasks → build
 * - build + all tasks complete → review
 * - review + result=fail + fixAttempts < max → build (fix loop)
 * - review + result=pass → test
 * - test + passed → ship
 * - ship + tier=full → learn
 * - ship + tier≠full → completed
 * - learn → completed
 * - refactor-scan completed → refactor-apply
 * - refactor-apply + hasIncompleteTasks → refactor-apply
 * - refactor-apply + all tasks complete → review
 * - fix-analyze completed → fix-apply
 * - fix-apply + hasIncompleteTasks → fix-apply
 * - fix-apply + all tasks complete → review
 * - fixAttempts ≥ max + result=fail → aborted
 *
 * @param input - Scheduler input derived from state files.
 * @returns The next phase and a human-readable reason.
 */
export declare function determineNextSkill(input: SchedulerInput): SchedulerResult;
/**
 * Get the SKILL command sequence for a given tier.
 *
 * Returns the ordered list of SKILL phases that should be executed.
 * Falls back to the standard sequence for unknown tiers.
 *
 * @visibleForTesting Currently only used in tests. May be connected to
 * production call points in the future when the SdkDriver queries
 * sequences directly from the Skill Scheduler.
 *
 * @param tier - The routing tier (light, standard, full).
 * @returns Ordered array of SKILL phases.
 */
export declare function getCommandSequence(tier: string): SkillPhase[];
/**
 * Determine whether a completed SKILL phase should trigger a Git commit.
 *
 * Commit strategy per phase:
 * - **build** success → commit (code changes produced)
 * - **plan** approved → commit (plan files produced)
 * - **fix** success → commit (fix is a special case of build)
 * - **refactor-apply** success → commit (refactor produces code changes)
 * - **fix-apply** success → commit (fix produces code changes)
 * - **refactor-scan** → no commit (only produces analysis documents)
 * - **fix-analyze** → no commit (only produces analysis documents)
 * - **review** completed → no commit (only produces reports)
 * - **test** → no commit (only produces test results)
 * - **ship** → no commit (handles its own commit/merge)
 * - **router** → no commit (only produces routing analysis)
 * - **learn** → no commit (only produces knowledge updates)
 * - Any phase with `success=false` → no commit
 *
 * @visibleForTesting Currently only used in tests. May be connected to
 * production call points in the future when the SdkDriver delegates
 * commit decisions to the Skill Scheduler.
 *
 * **Validates: Requirements 11.1, 11.3, 11.4, 11.5**
 *
 * @param phase - The SKILL phase that just completed.
 * @param success - Whether the phase completed successfully.
 * @returns `true` if a commit should be performed, `false` otherwise.
 */
export declare function shouldCommitForPhase(phase: string, success: boolean): boolean;
