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
