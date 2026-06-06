/**
 * Recovery Engine — build recovery reports and calculate segmentation.
 *
 * @module error-recovery/engine
 */

import type {
  CommitTaskMatch,
  DependencyGap,
  InterruptionClassification,
  PhaseInconsistency,
  ProgressInconsistency,
  RecoveryActionOption,
  RecoveryInconsistencyItem,
  RecoveryReport,
  TaskSegmentationInfo,
  UncommittedChangeResult,
} from "./types.js";

/**
 * Build the recovery report from all detection results.
 * @internal
 */
export function buildRecoveryReport(
  header: RecoveryReport["header"],
  progressInconsistencies: ProgressInconsistency[],
  phaseInconsistency: PhaseInconsistency | null,
  classification: InterruptionClassification,
  uncommittedResult: UncommittedChangeResult,
  dependencyGaps: DependencyGap[],
): RecoveryReport {
  const inconsistencies: RecoveryInconsistencyItem[] = [];
  const actions: RecoveryActionOption[][] = [];

  // Progress inconsistencies
  for (const inc of progressInconsistencies) {
    inconsistencies.push({
      category: "committed-but-not-marked",
      evidence: `Task ${inc.taskId}: commit ${inc.commitHash.slice(0, 7)} "${inc.commitMessage}" at ${inc.commitTimestamp}`,
      recommendedAction: "Mark task as completed in Progress_Document",
    });
    actions.push([
      {
        index: 1,
        description: `Auto-reconcile: mark ${inc.taskId} completed (commit ${inc.commitHash.slice(0, 7)})`,
        isDefault: true,
      },
      { index: 2, description: "Skip reconciliation and manually verify", isDefault: false },
    ]);
  }

  // Phase inconsistency
  if (phaseInconsistency) {
    inconsistencies.push({
      category: `phase-${phaseInconsistency.direction}`,
      evidence: phaseInconsistency.evidence,
      recommendedAction:
        phaseInconsistency.direction === "behind"
          ? `Advance phase from "${phaseInconsistency.currentPhase}" to "${phaseInconsistency.expectedPhase}"`
          : `Revert phase from "${phaseInconsistency.currentPhase}" to "${phaseInconsistency.expectedPhase}"`,
    });
    actions.push([
      {
        index: 1,
        description: `Apply phase ${phaseInconsistency.direction === "behind" ? "advancement" : "revert"}`,
        isDefault: true,
      },
      { index: 2, description: "Skip phase update", isDefault: false },
    ]);
  }

  // Dependency gaps
  for (const gap of dependencyGaps) {
    inconsistencies.push({
      category: "dependency-gap",
      evidence: `Task ${gap.taskId} has commit but dependency ${gap.missingDependencyTaskId} is incomplete`,
      recommendedAction: "Resolve missing dependency before proceeding",
    });
    actions.push([
      {
        index: 1,
        description: "Request user guidance before proceeding",
        isDefault: true,
      },
      {
        index: 2,
        description: `Auto-complete ${gap.missingDependencyTaskId} if matching commit found`,
        isDefault: false,
      },
    ]);
  }

  // Uncommitted changes (classification a/d)
  if (classification.category === "task-completed-not-committed") {
    if (progressInconsistencies.length === 0 && !phaseInconsistency) {
      inconsistencies.push({
        category: "uncommitted-task-work",
        evidence: `${uncommittedResult.relevantChanges.length} relevant uncommitted file(s)`,
        recommendedAction: "Commit or discard the changes",
      });
      const verificationNote = uncommittedResult.changes.length > 0;
      actions.push([
        { index: 1, description: "Commit with Plan-defined message", isDefault: verificationNote },
        { index: 2, description: "Discard changes and redo task", isDefault: !verificationNote },
      ]);
    }
  } else if (classification.category === "subagent-mid-execution") {
    if (classification.tddPhase === "red" || classification.tddPhase === "green-incomplete") {
      inconsistencies.push({
        category: "subagent-mid-execution",
        evidence: `TDD phase: ${classification.tddPhase}`,
        recommendedAction: "Preserve test files and resume from GREEN",
      });
      actions.push([
        { index: 1, description: "Preserve test files, resume from GREEN", isDefault: true },
        {
          index: 2,
          description: "Discard all uncommitted changes, restart task",
          isDefault: false,
        },
      ]);
    } else if (classification.tddPhase === "refactor-incomplete") {
      inconsistencies.push({
        category: "subagent-mid-execution",
        evidence: "TDD phase: refactor-incomplete",
        recommendedAction: "Commit current passing state",
      });
      actions.push([
        {
          index: 1,
          description: "Commit current passing state, skip refactoring",
          isDefault: true,
        },
        { index: 2, description: "Continue refactoring phase", isDefault: false },
      ]);
    } else {
      // tddPhase is null — ambiguous file state per Spec 6.5
      inconsistencies.push({
        category: "subagent-mid-execution",
        evidence: `Ambiguous TDD phase. Uncommitted files: ${uncommittedResult.changes.map((c) => c.filePath).join(", ")}`,
        recommendedAction: "Manually classify the interruption state",
      });
      actions.push([
        {
          index: 1,
          description: "Preserve all uncommitted changes for manual inspection",
          isDefault: true,
        },
        {
          index: 2,
          description: "Discard all uncommitted changes, restart task",
          isDefault: false,
        },
      ]);
    }
  }

  const totalInconsistencies = inconsistencies.length;
  const autoFixable = progressInconsistencies.length + (phaseInconsistency ? 1 : 0);

  return {
    header,
    inconsistencies,
    actions,
    summary: {
      totalInconsistencies,
      autoFixable,
      requiresUserDecision: totalInconsistencies - autoFixable,
    },
  };
}

/**
 * Calculate task segmentation for cross-session resume.
 * @internal
 */
export function calculateSegmentation(
  planTaskIds: string[],
  completedTaskIds: string[],
  commitMatches: CommitTaskMatch[],
  currentInterruption: InterruptionClassification | null,
): TaskSegmentationInfo {
  const completedSet = new Set(completedTaskIds);
  const commitMap = new Map(commitMatches.map((m) => [m.taskId, m.commit.hash]));

  const completedTasks: TaskSegmentationInfo["completedTasks"] = [];
  const remainingTasks: string[] = [];
  let currentTask: TaskSegmentationInfo["currentTask"] = null;
  let lastCompletedIndex = -1;

  for (let i = 0; i < planTaskIds.length; i++) {
    const id = planTaskIds[i];
    if (completedSet.has(id)) {
      completedTasks.push({ taskId: id, commitHash: commitMap.get(id) ?? "" });
      lastCompletedIndex = i;
    } else if (!currentTask) {
      currentTask = {
        taskId: id,
        interruptionState: currentInterruption?.category ?? "unknown",
      };
    } else {
      remainingTasks.push(id);
    }
  }

  return {
    completedTasks,
    currentTask,
    remainingTasks,
    lastCompletedIndex,
  };
}
