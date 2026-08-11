/**
 * Resume engine — core logic extracted from forge-resume/SKILL.md.
 *
 * Implements:
 *   - generateResumeOutput: Produces the five-question recovery output
 *
 * Property 16: Resume 五问题完整输出
 *   - Given valid plan, progress, and findings, output must contain
 *     answers to all 5 questions:
 *     1. What problem are we solving? (plan Objective)
 *     2. Where are we now? (progress "in progress" items)
 *     3. What do we know? (findings)
 *     4. What's next? (plan Task Breakdown)
 *     5. What's blocking? (progress blockers)
 *   **Validates: Requirements 12.2**
 */

import type { ExecutionMetadata } from "./status-file-ext.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanContext {
  /** The objective / problem statement from the plan. */
  objective: string;
  /** Ordered list of tasks from the plan's Task Breakdown. */
  tasks: string[];
}

export interface ProgressContext {
  /** Tasks marked as completed. */
  completedTasks: string[];
  /** Tasks currently in progress. */
  inProgressTasks: string[];
  /** Items listed as blockers. */
  blockers: string[];
}

export interface FindingsContext {
  /** Findings from research / execution phases. */
  findings: string[];
}

export interface ProjectState {
  plan: PlanContext;
  progress: ProgressContext;
  findings: FindingsContext;
  packages?: {
    currentPackage?: string;
    completedPackages?: string[];
    nextPackage?: string;
    packageCount?: number;
  };
  executionMetadata?: ExecutionMetadata;
}

export interface ResumeQuestion {
  question: string;
  answer: string;
}

export interface ResumeOutput {
  questions: ResumeQuestion[];
  /** The task to auto-locate to (if any). */
  autoLocateTask: string | null;
  /** The execution package to auto-locate to (if any). */
  autoLocatePackage: string | null;
}

// ---------------------------------------------------------------------------
// Five-question labels
// ---------------------------------------------------------------------------

const QUESTION_LABELS = [
  "正在解决什么问题？",
  "当前在哪一步？",
  "已知发现",
  "下一步是什么？",
  "有什么阻塞？",
] as const;

// ---------------------------------------------------------------------------
// Resume output generation (Property 16)
// ---------------------------------------------------------------------------

/**
 * Generate the five-question resume output from a project state.
 *
 * Per SKILL.md §2 and design Property 16:
 *   Q1: What problem? → plan.objective
 *   Q2: Current step? → progress.inProgressTasks
 *   Q3: Known findings? → findings.findings
 *   Q4: What's next? → next task from plan.tasks after current
 *   Q5: Blockers? → progress.blockers
 *
 * The output always contains exactly 5 questions with non-empty answers.
 */
export function generateResumeOutput(state: ProjectState): ResumeOutput {
  // Q1: What problem are we solving?
  const q1Answer = state.plan.objective || "未找到计划目标";

  // Q2: Where are we now?
  const q2Base =
    state.progress.inProgressTasks.length > 0
      ? state.progress.inProgressTasks.join("、")
      : "未找到进行中的任务";
  const packageSummary = formatPackageSummary(state.packages);
  const metadataSummary = formatExecutionMetadataSummary(state.executionMetadata);
  const q2Details = [packageSummary, metadataSummary].filter(Boolean);
  const q2Answer = q2Details.length > 0 ? `${q2Base}\n${q2Details.join("\n")}` : q2Base;

  // Q3: What do we know?
  const q3Answer =
    state.findings.findings.length > 0 ? state.findings.findings.join("\n") : "暂无发现";

  // Q4: What's next?
  const nextTask = findNextTask(state.plan.tasks, state.progress);
  const q4Answer = nextTask || "所有任务已完成";

  // Q5: What's blocking?
  const q5Answer =
    state.progress.blockers.length > 0 ? state.progress.blockers.join("、") : "无阻塞";

  const questions: ResumeQuestion[] = [
    { question: QUESTION_LABELS[0], answer: q1Answer },
    { question: QUESTION_LABELS[1], answer: q2Answer },
    { question: QUESTION_LABELS[2], answer: q3Answer },
    { question: QUESTION_LABELS[3], answer: q4Answer },
    { question: QUESTION_LABELS[4], answer: q5Answer },
  ];

  // Auto-locate: prefer in-progress task, then first incomplete task
  const autoLocateTask =
    state.progress.inProgressTasks.length > 0 ? state.progress.inProgressTasks[0] : nextTask;

  return {
    questions,
    autoLocateTask,
    autoLocatePackage: state.packages?.currentPackage ?? state.packages?.nextPackage ?? null,
  };
}

function formatPackageSummary(packages: ProjectState["packages"]): string {
  if (!packages) return "";
  const parts: string[] = [];
  if (packages.currentPackage) parts.push(`current_package=${packages.currentPackage}`);
  if (packages.completedPackages && packages.completedPackages.length > 0) {
    parts.push(`completed_packages=${packages.completedPackages.join(",")}`);
  }
  if (packages.nextPackage) parts.push(`next_package=${packages.nextPackage}`);
  if (packages.packageCount !== undefined) parts.push(`package_count=${packages.packageCount}`);
  return parts.join("; ");
}

function formatExecutionMetadataSummary(metadata: ExecutionMetadata | undefined): string {
  if (!metadata) return "";
  const parts: string[] = [];
  if (metadata.claude_version) parts.push(`claude=${metadata.claude_version}`);
  if (metadata.dispatch_mode) parts.push(`dispatch=${metadata.dispatch_mode}`);
  if (metadata.diagnostic_mode !== undefined) parts.push(`diagnostic=${metadata.diagnostic_mode}`);
  if (metadata.tier) parts.push(`tier=${metadata.tier}`);
  if (metadata.branch) parts.push(`branch=${metadata.branch}`);
  if (metadata.forge_flags && metadata.forge_flags.length > 0) {
    parts.push(`forge_flags=${metadata.forge_flags.join(",")}`);
  }
  return parts.length > 0 ? `metadata: ${parts.join("; ")}` : "";
}

/**
 * Find the next task to execute from the plan's task list.
 *
 * Logic:
 *   1. If there are in-progress tasks, the next task is the one after the first in-progress task.
 *   2. Otherwise, the next task is the first task not in completedTasks.
 *   3. If all tasks are completed, return null.
 */
function findNextTask(planTasks: string[], progress: ProgressContext): string | null {
  const completedSet = new Set(progress.completedTasks);
  const inProgressSet = new Set(progress.inProgressTasks);

  // Find the first task that is neither completed nor in progress
  for (const task of planTasks) {
    if (!completedSet.has(task) && !inProgressSet.has(task)) {
      return task;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// State reconstruction integration (State Resilience Layer 3)
// ---------------------------------------------------------------------------

import { parseGitStatus } from "./error-recovery/change-detector.js";
import {
  buildRecoveryReport,
  type CommitTaskMatch,
  classifyInterruption,
  extractCommitPatterns,
  filterCommitsSince,
  findDependencyGaps,
  findPhaseInconsistencies,
  findProgressInconsistencies,
  type GitCommitEntry,
  type GitScanResult,
  type InterruptionClassification,
  matchCommitsToTasks,
  type ProgressTaskEntry,
  parseGitLog,
  type RecoveryReport,
  type TaskCommitPattern,
  type UncommittedChangeResult,
} from "./error-recovery/index.js";
import { parseStatusFileGraceful, type StatusFields } from "./state.js";
import { type ReconstructedState, reconstructStateFromGit } from "./status-resolver.js";

/** Result of attempting to recover the current phase. */
export interface PhaseRecoveryResult {
  /** The recovered phase (from StatusFile or reconstructed). */
  phase: string;
  /** Whether the phase was reconstructed (not from StatusFile). */
  reconstructed: boolean;
  /** The full StatusFile fields if available. */
  statusFields: StatusFields | null;
  /** The reconstruction details if reconstructed. */
  reconstruction: ReconstructedState | null;
}

/**
 * Attempt to recover the current workflow phase when StatusFile may be
 * missing or inconsistent.
 *
 * Priority:
 *   1. Parse StatusFile with graceful fallback → use phase if non-default
 *   2. Reconstruct from .forge/ file presence → suggest phase
 *
 * Reconstructed state is NOT written to disk — caller must present to user
 * for confirmation.
 */
export function recoverPhase(
  statusContent: string | undefined,
  forgeFiles: string[],
): PhaseRecoveryResult {
  const { parsed } = parseStatusFileGraceful(statusContent);

  // If status file has a non-default phase, trust it
  if (parsed.phase !== "router" && statusContent !== undefined && statusContent.trim() !== "") {
    return {
      phase: parsed.phase,
      reconstructed: false,
      statusFields: parsed,
      reconstruction: null,
    };
  }

  // Status file is missing/default — try reconstruction
  const reconstruction = reconstructStateFromGit(forgeFiles);

  return {
    phase: reconstruction.inferredPhase,
    reconstructed: true,
    statusFields: parsed,
    reconstruction,
  };
}

// ---------------------------------------------------------------------------
// Recovery priority chain (error-recovery-strategy R7)
// ---------------------------------------------------------------------------
//
// R7 requires /tinkerman resume to execute an 8-step recovery priority chain in a
// fixed order, collecting ALL inconsistencies into a single Recovery_Report
// rather than stopping at the first one found. The detection primitives already
// exist as pure functions in src/error-recovery/; this orchestrator wires them
// in the spec-mandated order and produces the report.

/** Inputs to the recovery chain. Callers gather raw git/file state and pass it
 * in — the chain itself is deterministic and side-effect free. */
export interface RecoveryChainInput {
  /** Raw `git log` output (any format `parseGitLog` accepts). Step 3. */
  gitLogRaw: string;
  /** Raw `git status --porcelain` output. Step 4. */
  gitStatusRaw: string;
  /** The Status_Document frontmatter phase (from .forge/status.md). Step 6. */
  currentPhase: string;
  /** The Forge tier used to derive the legal phase sequence. Step 6.
   *
   * Audit P1-2 (2026-07-16): canonical value is `"light"` (matches
   * Status_Document schema); was previously `"lightweight"`. */
  tier: "light" | "standard" | "full";
  /** The current task/topic name (from Status_Document). Header field. */
  taskName: string;
  /** Progress_Document task entries (parsed from .forge/progress/<topic>.md). Step 5. */
  progressEntries: ProgressTaskEntry[];
  /** The ordered task ids from the plan (for dependency-gap detection). Step 5. */
  taskOrder: string[];
  /** The plan markdown (to extract commit→task patterns). Step 3. */
  planContent: string;
  /** Optional: commit SHA marking where the current run started (filters git
   * log to only this run's commits). Step 3. */
  runStartCommit?: string;
}

/** The 8 steps of the recovery chain, in fixed order (R7.1). */
export const RECOVERY_CHAIN_STEPS = [
  "read-status-document",
  "read-interim-log",
  "scan-git-log",
  "check-git-status",
  "reconcile-progress",
  "reconcile-phase",
  "classify-interruption",
  "generate-report",
] as const;

export type RecoveryChainStep = (typeof RECOVERY_CHAIN_STEPS)[number];

/**
 * Execute the 8-step recovery priority chain and return a Recovery_Report.
 *
 * Order is fixed per error-recovery-strategy R7.1:
 *   1. read Status_Document — caller-supplied via currentPhase/tier
 *   2. read Interim_Log — folded into git log scan (steps 2+3 share git data)
 *   3. scan git log for commit→task matching
 *   4. check git status for uncommitted changes
 *   5. reconcile Progress_Document against git log
 *   6. reconcile phase against progress
 *   7. classify interruption point
 *   8. generate Recovery_Report (collects all inconsistencies; never stops
 *      early — R7.2)
 *
 * This function is pure: it applies no fixes. R7.3/R7.4 (present + apply fixes
 * after user confirmation) are the caller's responsibility.
 */
export function runRecoveryChain(input: RecoveryChainInput): RecoveryReport {
  // Steps 1–2: Status_Document + Interim_Log are caller-supplied (currentPhase,
  // progressEntries). No I/O here — the chain is deterministic.

  // Step 3: scan git log for commit matching.
  let commits: GitCommitEntry[] = parseGitLog(input.gitLogRaw);
  if (input.runStartCommit) {
    commits = filterCommitsSince(commits, input.runStartCommit);
  }
  const patterns: TaskCommitPattern[] = extractCommitPatterns(input.planContent);
  const matches: CommitTaskMatch[] = matchCommitsToTasks(commits, patterns);

  // Step 4: check git status for uncommitted changes.
  const changedFiles = parseGitStatus(input.gitStatusRaw);
  const uncommittedResult: UncommittedChangeResult = {
    changes: changedFiles,
    relevantChanges: changedFiles,
    isClean: changedFiles.length === 0,
  };

  // Step 5: reconcile Progress_Document against git log.
  const progressInconsistencies = findProgressInconsistencies(matches, input.progressEntries);
  const dependencyGaps = findDependencyGaps(
    progressInconsistencies,
    input.progressEntries,
    input.taskOrder,
  );

  // Step 6: reconcile phase against progress.
  const allTasksCompleted =
    input.taskOrder.length > 0 &&
    input.progressEntries.length >= input.taskOrder.length &&
    input.taskOrder.every((id) =>
      input.progressEntries.some((e) => e.taskId === id && e.completed),
    );
  const phaseInconsistency = findPhaseInconsistencies(
    allTasksCompleted,
    input.currentPhase as ForgePhaseLike,
    input.tier,
  );

  // Step 7: classify the interruption point.
  const gitScanResult: GitScanResult = {
    commits,
    matches,
    noNewCommits: commits.length === 0,
  };
  const classification: InterruptionClassification = classifyInterruption(
    uncommittedResult,
    gitScanResult,
    progressInconsistencies,
    phaseInconsistency,
    null,
  );

  // Step 8: generate the Recovery_Report — collects EVERY inconsistency,
  // never stops at the first (R7.2).
  return buildRecoveryReport(
    {
      taskName: input.taskName,
      tier: input.tier,
      phase: input.currentPhase as ForgePhaseLike,
      lastUpdate: new Date().toISOString(),
      interruptionCategory: classification.category,
    },
    progressInconsistencies,
    phaseInconsistency,
    classification,
    uncommittedResult,
    dependencyGaps,
  );
}

// ForgePhase is re-exported by the error-recovery barrel as a string union;
// alias to avoid importing the full type for the single cast sites above.
type ForgePhaseLike = Parameters<typeof findPhaseInconsistencies>[1];
