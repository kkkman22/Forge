/**
 * Error Recovery Strategy — pure-function module for `/forge resume`.
 *
 * All core logic (git log parsing, commit matching, state reconciliation,
 * interruption classification, report serialization) is implemented as pure
 * functions that receive data and return results. I/O operations (git command
 * execution, file reads/writes) are the caller's responsibility.
 *
 * Design reference: .kiro/specs/error-recovery-strategy/design.md
 * **Validates: Requirements 1.1–11.4**
 */
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
/** @internal Forge workflow phases. */
export type ForgePhase = "decide" | "spec" | "plan" | "build" | "review" | "test" | "ship" | "learn";
/** @internal Forge workflow tiers. */
export type ForgeTier = "lightweight" | "standard" | "full";
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
/** @internal Interruption classification categories. */
export type InterruptionCategory = "task-completed-not-committed" | "committed-not-progress-updated" | "progress-updated-not-phase-advanced" | "subagent-mid-execution" | "clean-state";
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
    completedTasks: Array<{
        taskId: string;
        commitHash: string;
    }>;
    currentTask: {
        taskId: string;
        interruptionState: string;
    } | null;
    remainingTasks: string[];
    lastCompletedIndex: number;
}
/** @internal Phase sequences for each tier. */
export declare const PHASE_SEQUENCES: Record<ForgeTier, ForgePhase[]>;
/** @internal Test file path patterns. */
export declare const TEST_FILE_PATTERNS: RegExp[];
/**
 * Parse `git log --format` output into structured commit entries.
 *
 * Expected format: `<hash>\x00<message>\x00<timestamp>` per commit,
 * separated by newlines between entries.
 *
 * Returns an empty array for empty or unparseable input.
 *
 * @internal
 */
export declare function parseGitLog(rawOutput: string): GitCommitEntry[];
/**
 * Extract commit-message patterns from a Plan_Document's markdown content.
 *
 * Looks for task entries with commit message prefixes. Each task heading
 * (`## Task N: Title`) is parsed for its ID and title, and any commit
 * message convention (e.g. `feat(topic): ...`) is captured as the prefix.
 *
 * @internal
 */
export declare function extractCommitPatterns(planContent: string): TaskCommitPattern[];
/**
 * Filter commits to only those after the given ISO 8601 timestamp.
 * @internal
 */
export declare function filterCommitsSince(commits: GitCommitEntry[], sinceTimestamp: string): GitCommitEntry[];
/**
 * Match commits to tasks using prefix + keyword matching.
 *
 * A commit matches a task when:
 * - The commit message contains the task's prefix (if non-empty)
 * - The commit message contains at least one of the task's keywords
 *
 * Confidence is "exact" when prefix and all keywords match, "fuzzy" otherwise.
 *
 * @internal
 */
export declare function matchCommitsToTasks(commits: GitCommitEntry[], patterns: TaskCommitPattern[]): CommitTaskMatch[];
/**
 * Parse `git status --porcelain` output into FileChange entries.
 *
 * Porcelain format: `XY filename` where XY are status codes.
 * Returns an empty array for empty input.
 *
 * @internal
 */
export declare function parseGitStatus(rawOutput: string): FileChange[];
/**
 * Filter changes to only those whose paths overlap with the task's expected paths.
 * @internal
 */
export declare function matchChangesToTask(changes: FileChange[], taskFilePaths: string[]): FileChange[];
/**
 * Find tasks that have matching commits but are not marked as completed.
 * @internal
 */
export declare function findProgressInconsistencies(matches: CommitTaskMatch[], progressEntries: ProgressTaskEntry[]): ProgressInconsistency[];
/**
 * Detect dependency gaps: a committed task whose preceding task is neither
 * completed nor has a matching commit.
 * @internal
 */
export declare function findDependencyGaps(inconsistencies: ProgressInconsistency[], progressEntries: ProgressTaskEntry[], taskOrder: string[]): DependencyGap[];
/**
 * Build reconciliation patches ordered by Plan task order.
 * @internal
 */
export declare function buildReconciliationPatch(inconsistencies: ProgressInconsistency[], taskOrder: string[]): ProgressReconciliationPatch[];
/**
 * Get the ordered phase array for a given tier.
 * @internal
 */
export declare function getPhaseSequence(tier: ForgeTier): ForgePhase[];
/**
 * Get the next phase after the current one in the tier's sequence.
 * Returns null if the current phase is the last.
 * @internal
 */
export declare function getNextPhase(currentPhase: ForgePhase, tier: ForgeTier): ForgePhase | null;
/**
 * Detect phase inconsistency.
 *
 * Returns "behind" when all tasks are completed but phase hasn't advanced,
 * "ahead" when tasks are incomplete but phase is beyond expected position,
 * or null when consistent.
 *
 * @internal
 */
export declare function findPhaseInconsistencies(allTasksCompleted: boolean, currentPhase: ForgePhase, tier: ForgeTier): PhaseInconsistency | null;
/**
 * Check if a file path matches test file naming conventions.
 * @internal
 */
export declare function isTestFile(filePath: string): boolean;
/**
 * Infer the TDD phase from uncommitted file changes and verification status.
 * @internal
 */
export declare function inferTDDPhase(changes: FileChange[], verificationPassed: boolean | null): TDDInterruptionPhase | null;
/**
 * Classify the interruption point.
 *
 * Priority order: (a) task-completed-not-committed → (b) committed-not-progress-updated
 * → (c) progress-updated-not-phase-advanced → (d) subagent-mid-execution → (e) clean-state
 *
 * @internal
 */
export declare function classifyInterruption(uncommittedResult: UncommittedChangeResult, _gitScanResult: GitScanResult, progressInconsistencies: ProgressInconsistency[], phaseInconsistency: PhaseInconsistency | null, verificationPassed: boolean | null): InterruptionClassification;
/**
 * Build the recovery report from all detection results.
 * @internal
 */
export declare function buildRecoveryReport(header: RecoveryReport["header"], progressInconsistencies: ProgressInconsistency[], phaseInconsistency: PhaseInconsistency | null, classification: InterruptionClassification, uncommittedResult: UncommittedChangeResult, dependencyGaps: DependencyGap[]): RecoveryReport;
/**
 * Calculate task segmentation for cross-session resume.
 * @internal
 */
export declare function calculateSegmentation(planTaskIds: string[], completedTaskIds: string[], commitMatches: CommitTaskMatch[], currentInterruption: InterruptionClassification | null): TaskSegmentationInfo;
/**
 * Serialize a RecoveryReport to structured Markdown.
 * @internal
 */
export declare function serializeRecoveryReport(report: RecoveryReport): string;
/**
 * Deserialize structured Markdown back into a RecoveryReport.
 * @internal
 */
export declare function deserializeRecoveryReport(markdown: string): RecoveryReport;
/**
 * Serialize an InterruptionClassification to structured text.
 * @internal
 */
export declare function serializeClassification(classification: InterruptionClassification): string;
/**
 * Deserialize structured text into an InterruptionClassification.
 * @internal
 */
export declare function deserializeClassification(text: string): InterruptionClassification;
/**
 * Serialize a CheckpointMarker to structured text.
 * @internal
 */
export declare function serializeCheckpointMarker(marker: CheckpointMarker): string;
/**
 * Deserialize structured text into a CheckpointMarker.
 * @internal
 */
export declare function deserializeCheckpointMarker(text: string): CheckpointMarker;
