/**
 *
 * Defines the deterministic next-phase logic for all tier × phase
 * combinations.  Review results (passed / failed-p0 / failed-p1) drive
 * the rollback-to-build path for P0/P1 findings.
 *
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

export interface PackageTransitionInput {
  tier: Tier;
  currentPhase: Phase;
  reviewResult?: ReviewResult;
  currentPackage: string | null;
  completedPackages: string[];
  packageIds: string[];
  packageDependencies?: Record<string, string[]>;
}

export interface PackageTransitionResult {
  phase: Phase;
  currentPackage: string | null;
  completedPackages: string[];
  nextPackage: string | null;
  completed: boolean;
  reason?: string;
}

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

/**
 * Determine package-aware loop state after the current phase completes.
 *
 * Build/review/test run package-scoped when execution packages exist. Ship and
 * learn stay feature-scoped after all packages have completed.
 */
export function getNextPackageTransition(input: PackageTransitionInput): PackageTransitionResult {
  const packageIds = input.packageIds;
  if (packageIds.length === 0 || input.currentPackage === null) {
    const phase = getNextPhase(input.currentPhase, input.tier, input.reviewResult);
    return {
      phase,
      currentPackage: input.currentPackage,
      completedPackages: unique(input.completedPackages),
      nextPackage: null,
      completed: phase === "completed",
    };
  }

  const completedPackages = unique(input.completedPackages);
  const currentPackage = input.currentPackage;
  const dependencies = input.packageDependencies?.[currentPackage] ?? [];
  const missingDependencies = dependencies.filter((id) => !completedPackages.includes(id));
  if (missingDependencies.length > 0) {
    return {
      phase: "halted",
      currentPackage,
      completedPackages,
      nextPackage: findNextIncompletePackage(packageIds, completedPackages, currentPackage),
      completed: false,
      reason: `Package ${currentPackage} depends on incomplete package(s): ${missingDependencies.join(", ")}`,
    };
  }

  if (input.currentPhase === "review") {
    const nextPhase = getNextPhase(input.currentPhase, input.tier, input.reviewResult);
    return {
      phase: nextPhase,
      currentPackage,
      completedPackages,
      nextPackage: findNextIncompletePackage(packageIds, completedPackages, currentPackage),
      completed: false,
    };
  }

  if (input.currentPhase === "build") {
    return {
      phase: "review",
      currentPackage,
      completedPackages,
      nextPackage: findNextIncompletePackage(packageIds, completedPackages, currentPackage),
      completed: false,
    };
  }

  if (input.currentPhase === "test") {
    const newlyCompleted = unique([...completedPackages, currentPackage]);
    const nextPackage = findNextIncompletePackage(packageIds, newlyCompleted, null);
    if (nextPackage) {
      return {
        phase: "build",
        currentPackage: nextPackage,
        completedPackages: newlyCompleted,
        nextPackage: findNextIncompletePackage(packageIds, newlyCompleted, nextPackage),
        completed: false,
      };
    }
    return {
      phase: "ship",
      currentPackage: null,
      completedPackages: newlyCompleted,
      nextPackage: null,
      completed: true,
    };
  }

  const nextPhase = getNextPhase(input.currentPhase, input.tier, input.reviewResult);
  return {
    phase: nextPhase,
    currentPackage,
    completedPackages,
    nextPackage: findNextIncompletePackage(packageIds, completedPackages, currentPackage),
    completed: nextPhase === "completed",
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function findNextIncompletePackage(
  packageIds: string[],
  completedPackages: string[],
  currentPackage: string | null,
): string | null {
  const completed = new Set(completedPackages);
  const currentIndex = currentPackage === null ? -1 : packageIds.indexOf(currentPackage);
  const afterCurrent = packageIds.slice(Math.max(0, currentIndex + 1));
  const beforeCurrent = packageIds.slice(0, Math.max(0, currentIndex + 1));
  return (
    [...afterCurrent, ...beforeCurrent].find((id) => !completed.has(id) && id !== currentPackage) ??
    null
  );
}
