/**
 * Error Recovery types and constants.
 *
 * All type definitions for the error-recovery module, plus phase
 * sequences and test-file patterns.
 *
 * @module error-recovery/types
 */

// ---------------------------------------------------------------------------
// 1. Git_State_Scanner types
// ---------------------------------------------------------------------------

/**
 * @internal
 * A single commit parsed from `git log --format` output.
 */
export interface GitCommitEntry {
  hash: string;
  message: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/**
 * @internal
 * Expected commit-message pattern for a Plan task.
 */
export interface TaskCommitPattern {
  taskId: string;
  taskTitle: string;
  /** Commit message prefix, e.g. `"feat(topic):"`. */
  prefix: string;
  /** Task-identifying keywords. */
  keywords: string[];
}

/**
 * @internal
 * Result of matching a commit to a Plan task.
 */
export interface CommitTaskMatch {
  commit: GitCommitEntry;
  taskId: string;
  taskTitle: string;
  /** Match confidence: exact (prefix + all keywords) or fuzzy (prefix + partial keywords). */
  confidence: "exact" | "fuzzy";
}

/**
 * @internal
 * Overall git-state scan result.
 */
export interface GitScanResult {
  commits: GitCommitEntry[];
  matches: CommitTaskMatch[];
  /** True when no new commits were detected since the reference timestamp. */
  noNewCommits: boolean;
}

// ---------------------------------------------------------------------------
// 2. Uncommitted_Change_Detector types
// ---------------------------------------------------------------------------

/**
 * @internal
 * A single file change parsed from `git status --porcelain` output.
 */
export interface FileChange {
  filePath: string;
  status: "modified" | "added" | "deleted" | "untracked";
}

/**
 * @internal
 * Result of uncommitted-change detection.
 */
export interface UncommittedChangeResult {
  changes: FileChange[];
  /** Changes whose paths overlap with the current task's expected file paths. */
  relevantChanges: FileChange[];
  /** True when the working directory has no uncommitted changes. */
  isClean: boolean;
}

// ---------------------------------------------------------------------------
// 3. Progress_Reconciler types
// ---------------------------------------------------------------------------

/**
 * @internal
 * A task entry from the Progress_Document.
 */
export interface ProgressTaskEntry {
  taskId: string;
  taskTitle: string;
  completed: boolean;
  completionTime: string | null;
}

/**
 * @internal
 * A task that was committed but not marked as completed in progress.
 */
export interface ProgressInconsistency {
  taskId: string;
  taskTitle: string;
  commitHash: string;
  commitMessage: string;
  commitTimestamp: string;
  type: "committed-but-not-marked";
}

/**
 * @internal
 * A patch to reconcile progress with git log.
 */
export interface ProgressReconciliationPatch {
  taskId: string;
  markCompleted: true;
  completionTime: string;
  sourceCommitHash: string;
}

/**
 * @internal
 * A missing dependency detected during reconciliation.
 */
export interface DependencyGap {
  taskId: string;
  taskTitle: string;
  missingDependencyTaskId: string;
  missingDependencyTitle: string;
}

// ---------------------------------------------------------------------------
// 4. Phase_Reconciler types
// ---------------------------------------------------------------------------

/** @internal Forge workflow phases. */
export type ForgePhase =
  | "decide"
  | "spec"
  | "plan"
  | "build"
  | "review"
  | "test"
  | "ship"
  | "learn";

/**
 * @internal Forge workflow tiers.
 *
 * Canonical value is `"light"` — matches the Status_Document schema
 * (`schemas/status-file.ts` TierSchema), router, workflow-graph, and doctor.
 * Audit P1-2 (2026-07-16): this was previously `"lightweight"`, which split
 * from the project-standard `"light"` and crashed `/forge resume` via
 * `PHASE_SEQUENCES["light"]` → `undefined.indexOf()`.
 */
export type ForgeTier = "light" | "standard" | "full";

/**
 * @internal Runtime allowlist of valid ForgeTier values, for fail-closed
 * validation of deserialized tier strings (see serde.ts).
 */
export const VALID_FORGE_TIERS: readonly ForgeTier[] = ["light", "standard", "full"];

/**
 * @internal Type guard: is `value` a canonical ForgeTier?
 */
export function isForgeTier(value: string): value is ForgeTier {
  return value === "light" || value === "standard" || value === "full";
}

/**
 * @internal
 * A detected phase inconsistency.
 */
export interface PhaseInconsistency {
  currentPhase: ForgePhase;
  expectedPhase: ForgePhase;
  /** "behind": phase lagging behind progress; "ahead": phase past progress. */
  direction: "behind" | "ahead";
  evidence: string;
}

// ---------------------------------------------------------------------------
// 5. Interruption_Classifier types
// ---------------------------------------------------------------------------

/** @internal Interruption classification categories. */
export type InterruptionCategory =
  | "task-completed-not-committed"
  | "committed-not-progress-updated"
  | "progress-updated-not-phase-advanced"
  | "subagent-mid-execution"
  | "clean-state";

/** @internal TDD interruption phases. */
export type TDDInterruptionPhase = "red" | "green-incomplete" | "refactor-incomplete";

/**
 * @internal
 * Detailed interruption classification result.
 */
export interface InterruptionClassification {
  category: InterruptionCategory;
  evidence: string;
  /** Non-null only when category is "subagent-mid-execution". */
  tddPhase: TDDInterruptionPhase | null;
}

// ---------------------------------------------------------------------------
// 6. Recovery_Engine types
// ---------------------------------------------------------------------------

/**
 * @internal
 * A single inconsistency item in the recovery report.
 */
export interface RecoveryInconsistencyItem {
  category: string;
  evidence: string;
  recommendedAction: string;
}

/**
 * @internal
 * A user-action option in the recovery report.
 */
export interface RecoveryActionOption {
  index: number;
  description: string;
  isDefault: boolean;
}

/**
 * @internal
 * The full recovery report.
 */
export interface RecoveryReport {
  header: {
    taskName: string;
    tier: ForgeTier;
    phase: ForgePhase;
    lastUpdate: string;
    interruptionCategory: InterruptionCategory;
  };
  inconsistencies: RecoveryInconsistencyItem[];
  /** Each inner array is the set of options for one inconsistency. */
  actions: RecoveryActionOption[][];
  summary: {
    totalInconsistencies: number;
    autoFixable: number;
    requiresUserDecision: number;
  };
}

/**
 * @internal
 * A checkpoint marker written to the Interim_Log.
 */
export interface CheckpointMarker {
  taskId: string;
  intendedCommitMessage: string;
  timestamp: string;
}

/**
 * @internal
 * Task segmentation info for cross-session resume.
 */
export interface TaskSegmentationInfo {
  completedTasks: Array<{ taskId: string; commitHash: string }>;
  currentTask: { taskId: string; interruptionState: string } | null;
  remainingTasks: string[];
  lastCompletedIndex: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * @internal Phase sequences for each tier.
 *
 * Audit P1-2 (2026-07-16): the `light` key was previously `lightweight`,
 * which diverged from the canonical Status_Document tier value `"light"` and
 * caused `PHASE_SEQUENCES["light"]` to be undefined on the resume path.
 */
export const PHASE_SEQUENCES: Record<ForgeTier, ForgePhase[]> = {
  light: ["build", "review"],
  standard: ["plan", "build", "review", "test", "ship"],
  full: ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
};

/** @internal Test file path patterns. */
export const TEST_FILE_PATTERNS: RegExp[] = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /^test\//,
  /\/__tests__\//,
];
