/**
 * @file Phase transition table for the Forge Loop engine.
 *
 * Defines the deterministic next-phase logic for all tier × phase
 * combinations.  Review results (passed / failed-p0 / failed-p1) drive
 * the rollback-to-build path for P0/P1 findings.
 *
 * @module loop-phase-transitions
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported routing tiers. */
export type Tier = "light" | "standard" | "full";

/** Loop lifecycle phases. */
export type Phase =
  | "init"
  | "plan"
  | "build"
  | "review"
  | "test"
  | "ship"
  | "learn"
  | "halted"
  | "completed";

/** Possible outcomes of a review phase. */
export type ReviewResult = "passed" | "failed-p0" | "failed-p1" | "not-run";

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

/**
 * Static transition table: `table[tier][phase] → nextPhase`.
 *
 * The `review` phase is special — its next phase depends on the review
 * result and is handled separately in {@link getNextPhase}.
 */
export const TRANSITION_TABLE: Record<Tier, Partial<Record<Phase, Phase>>> = {
  light: {
    init: "build",
    build: "review",
    // review is handled via reviewResult logic
  },
  standard: {
    init: "plan",
    plan: "build",
    build: "review",
    // review is handled via reviewResult logic
    test: "ship",
    ship: "completed",
  },
  full: {
    init: "plan",
    plan: "build",
    build: "review",
    // review is handled via reviewResult logic
    test: "ship",
    ship: "learn",
    learn: "completed",
  },
};

/**
 * Review-result dispatch: for each tier, maps the review result to the
 * next phase.  P0/P1 always route back to `build` (rollback).
 */
const REVIEW_DISPATCH: Record<Tier, Record<ReviewResult, Phase>> = {
  light: {
    passed: "completed",
    "failed-p0": "build",
    "failed-p1": "build",
    "not-run": "build",
  },
  standard: {
    passed: "test",
    "failed-p0": "build",
    "failed-p1": "build",
    "not-run": "build",
  },
  full: {
    passed: "test",
    "failed-p0": "build",
    "failed-p1": "build",
    "not-run": "build",
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function getNextPhase(currentPhase: Phase, tier: Tier, reviewResult?: ReviewResult): Phase {
  // Terminal phases are idempotent
  if (currentPhase === "completed" || currentPhase === "halted") {
    return currentPhase;
  }

  // Review phase requires a review result
  if (currentPhase === "review") {
    if (!reviewResult || reviewResult === "not-run") {
      throw new Error("review phase requires a reviewResult (passed | failed-p0 | failed-p1)");
    }
    return REVIEW_DISPATCH[tier][reviewResult];
  }

  // Standard table lookup
  const tierTable = TRANSITION_TABLE[tier];
  const next = tierTable[currentPhase];

  if (!next) {
    throw new Error(`No transition defined for phase="${currentPhase}" tier="${tier}"`);
  }

  return next;
}
