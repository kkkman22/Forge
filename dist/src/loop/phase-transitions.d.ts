/**
 *
 * Defines the deterministic next-phase logic for all tier × phase
 * combinations.  Review results (passed / failed-p0 / failed-p1) drive
 * the rollback-to-build path for P0/P1 findings.
 *
 */
/** Supported routing tiers. */
export type Tier = "light" | "standard" | "full";
/** Loop lifecycle phases. */
export type Phase = "init" | "plan" | "build" | "review" | "test" | "ship" | "learn" | "halted" | "completed";
/** Possible outcomes of a review phase. */
export type ReviewResult = "passed" | "failed-p0" | "failed-p1" | "not-run";
/**
 * Static transition table: `table[tier][phase] → nextPhase`.
 *
 * The `review` phase is special — its next phase depends on the review
 * result and is handled separately in {@link getNextPhase}.
 */
export declare const TRANSITION_TABLE: Record<Tier, Partial<Record<Phase, Phase>>>;
/**
 * Determine the next phase given the current phase, tier, and optional
 * review result.
 *
 * @param currentPhase - The phase the loop is currently in.
 * @param tier         - The routing tier (light / standard / full).
 * @param reviewResult - Required when `currentPhase === "review"`.
 * @returns The next phase.
 * @throws {Error} If the combination is invalid or review result is missing.
 */
export declare function getNextPhase(currentPhase: Phase, tier: Tier, reviewResult?: ReviewResult): Phase;
