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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** SKILL phase identifiers used by the scheduler state machine. */
export type SkillPhase =
  | "router"
  | "plan"
  | "build"
  | "build-light"
  | "review"
  | "test"
  | "ship"
  | "learn"
  | "refactor-scan"
  | "refactor-apply"
  | "fix-analyze"
  | "fix-apply"
  | "completed"
  | "aborted";

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Command sequences per tier for the SKILL scheduler.
 *
 * These differ from the Router's `COMMAND_SEQUENCES` — the Scheduler omits
 * `decide` and `spec` because it handles only SKILL execution phases. The
 * Router owns the full interactive workflow (including decision and
 * specification), while the Scheduler picks up from `plan` onward.
 *
 * @see src/router.ts COMMAND_SEQUENCES
 */
const SKILL_COMMAND_SEQUENCES: Record<string, SkillPhase[]> = {
  light: ["build-light", "review"],
  standard: ["plan", "build", "review", "test", "ship"],
  full: ["plan", "build", "review", "test", "ship", "learn"],
  // Refactor workflow sequences
  refactor_light: ["refactor-apply", "review"],
  refactor_standard: ["refactor-scan", "refactor-apply", "review", "test", "ship"],
  // Bug-fix workflow sequences
  fix_light: ["fix-apply", "review"],
  fix_standard: ["fix-analyze", "fix-apply", "review", "test", "ship"],
};

/** Default command sequence when tier is unknown. */
const DEFAULT_SEQUENCE: SkillPhase[] = SKILL_COMMAND_SEQUENCES.standard;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function determineNextSkill(input: SchedulerInput): SchedulerResult {
  const { currentPhase, tier, planStatus, hasIncompleteTasks, reviewResult, testPassed } = input;

  // Circuit breaker: review-fix loop exceeded max attempts
  if (input.reviewFixAttempts >= input.maxReviewFixAttempts && reviewResult === "fail") {
    return {
      nextPhase: "aborted",
      reason: `Review-fix loop exceeded maximum attempts (${input.reviewFixAttempts}/${input.maxReviewFixAttempts})`,
    };
  }

  // Phase missing or "router" → router
  if (!currentPhase || currentPhase === "router") {
    return {
      nextPhase: "router",
      reason:
        currentPhase === "router"
          ? "Router phase in progress"
          : "No phase set, starting with router",
    };
  }

  // Plan phase
  if (currentPhase === "plan") {
    if (planStatus === "approved") {
      return { nextPhase: "build", reason: "Plan approved, proceeding to build" };
    }
    return { nextPhase: "plan", reason: "Plan not yet approved, continuing planning" };
  }

  // Build phase
  // Conservative: undefined hasIncompleteTasks → assume incomplete (stay in build)
  if (currentPhase === "build") {
    if (hasIncompleteTasks !== false) {
      return { nextPhase: "build", reason: "Incomplete tasks remain, continuing build" };
    }
    return { nextPhase: "review", reason: "All tasks complete, proceeding to review" };
  }

  // Build-light phase (same transitions as build)
  // Conservative: undefined hasIncompleteTasks → assume incomplete
  if (currentPhase === "build-light") {
    if (hasIncompleteTasks !== false) {
      return {
        nextPhase: "build-light",
        reason: "Incomplete tasks remain, continuing build-light",
      };
    }
    return { nextPhase: "review", reason: "All tasks complete, proceeding to review" };
  }

  // Review phase
  if (currentPhase === "review") {
    if (reviewResult === "fail") {
      return { nextPhase: "build", reason: "Review failed, entering fix loop" };
    }
    if (reviewResult === "pass") {
      return { nextPhase: "test", reason: "Review passed, proceeding to test" };
    }
    // Review result not yet determined — stay in review
    return { nextPhase: "review", reason: "Review in progress" };
  }

  // Test phase
  if (currentPhase === "test") {
    if (testPassed) {
      return { nextPhase: "ship", reason: "Tests passed, proceeding to ship" };
    }
    return { nextPhase: "test", reason: "Tests not yet passed, continuing test" };
  }

  // Ship phase
  if (currentPhase === "ship") {
    if (tier === "full") {
      return { nextPhase: "learn", reason: "Full tier, proceeding to learn after ship" };
    }
    return { nextPhase: "completed", reason: "Ship complete" };
  }

  // Learn phase
  if (currentPhase === "learn") {
    return { nextPhase: "completed", reason: "Learning complete, all phases done" };
  }

  // Refactor-scan phase → refactor-apply
  if (currentPhase === "refactor-scan") {
    return { nextPhase: "refactor-apply", reason: "Refactor scan complete, proceeding to apply" };
  }

  // Refactor-apply phase
  // Conservative: undefined hasIncompleteTasks → assume incomplete
  if (currentPhase === "refactor-apply") {
    if (hasIncompleteTasks !== false) {
      return {
        nextPhase: "refactor-apply",
        reason: "Incomplete refactor tasks remain, continuing apply",
      };
    }
    return { nextPhase: "review", reason: "All refactor tasks complete, proceeding to review" };
  }

  // Fix-analyze phase → fix-apply
  if (currentPhase === "fix-analyze") {
    return { nextPhase: "fix-apply", reason: "Fix analysis complete, proceeding to apply" };
  }

  // Fix-apply phase
  // Conservative: undefined hasIncompleteTasks → assume incomplete
  if (currentPhase === "fix-apply") {
    if (hasIncompleteTasks !== false) {
      return { nextPhase: "fix-apply", reason: "Incomplete fix tasks remain, continuing apply" };
    }
    return { nextPhase: "review", reason: "All fix tasks complete, proceeding to review" };
  }

  // Completed / aborted — terminal states
  if (currentPhase === "completed") {
    return { nextPhase: "completed", reason: "Already completed" };
  }
  if (currentPhase === "aborted") {
    return { nextPhase: "aborted", reason: "Already aborted" };
  }

  // Unknown phase — fall back to router
  return { nextPhase: "router", reason: `Unknown phase "${currentPhase}", restarting from router` };
}

/**
 * Get the SKILL command sequence for a given tier.
 *
 * Returns the ordered list of SKILL phases that should be executed.
 * Falls back to the standard sequence for unknown tiers.
 *
 * Consumed by `sdk-status-helpers.initializeLoopFields()` and
 * `sdk-status-helpers.getLoopSkillSequence()`.
 *
 * @param tier - The routing tier (light, standard, full, refactor_light, etc.).
 * @returns Ordered array of SKILL phases.
 */
export function getCommandSequence(tier: string): SkillPhase[] {
  return Object.hasOwn(SKILL_COMMAND_SEQUENCES, tier)
    ? SKILL_COMMAND_SEQUENCES[tier]
    : DEFAULT_SEQUENCE;
}

// ---------------------------------------------------------------------------
// Commit strategy
// ---------------------------------------------------------------------------

/** Phases that produce code changes and should be committed on success. */
const COMMITABLE_PHASES = new Set<string>([
  "build",
  "build-light",
  "plan",
  "fix",
  "refactor-apply",
  "fix-apply",
]);

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
 * **Validates: Requirements 11.1, 11.3, 11.4, 11.5**
 *
 * @param phase - The SKILL phase that just completed.
 * @param success - Whether the phase completed successfully.
 * @returns `true` if a commit should be performed, `false` otherwise.
 */
export function shouldCommitForPhase(phase: string, success: boolean): boolean {
  if (!success) return false;
  return COMMITABLE_PHASES.has(phase);
}
