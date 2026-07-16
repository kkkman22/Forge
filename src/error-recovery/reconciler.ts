/**
 * Progress & Phase Reconciler — detect inconsistencies between git, progress, and phase state.
 *
 * @module error-recovery/reconciler
 */

import type {
  CommitTaskMatch,
  DependencyGap,
  ForgePhase,
  ForgeTier,
  PhaseInconsistency,
  ProgressInconsistency,
  ProgressReconciliationPatch,
  ProgressTaskEntry,
} from "./types.js";
import { PHASE_SEQUENCES } from "./types.js";

export { PHASE_SEQUENCES } from "./types.js";

/**
 * Find tasks that have matching commits but are not marked as completed.
 * @internal
 */
export function findProgressInconsistencies(
  matches: CommitTaskMatch[],
  progressEntries: ProgressTaskEntry[],
): ProgressInconsistency[] {
  const progressMap = new Map(progressEntries.map((e) => [e.taskId, e]));

  return matches
    .filter((m) => {
      const entry = progressMap.get(m.taskId);
      return entry && !entry.completed;
    })
    .map((m) => ({
      taskId: m.taskId,
      taskTitle: m.taskTitle,
      commitHash: m.commit.hash,
      commitMessage: m.commit.message,
      commitTimestamp: m.commit.timestamp,
      type: "committed-but-not-marked" as const,
    }));
}

/**
 * Detect dependency gaps: a committed task whose preceding task is neither
 * completed nor has a matching commit.
 * @internal
 */
export function findDependencyGaps(
  inconsistencies: ProgressInconsistency[],
  progressEntries: ProgressTaskEntry[],
  taskOrder: string[],
): DependencyGap[] {
  const progressMap = new Map(progressEntries.map((e) => [e.taskId, e]));
  const inconsistentIds = new Set(inconsistencies.map((i) => i.taskId));
  const gaps: DependencyGap[] = [];

  for (const inconsistency of inconsistencies) {
    const idx = taskOrder.indexOf(inconsistency.taskId);
    if (idx <= 0) continue;

    const prevTaskId = taskOrder[idx - 1];
    const prevProgress = progressMap.get(prevTaskId);
    const prevHasCommit = inconsistentIds.has(prevTaskId);

    if (!prevProgress?.completed && !prevHasCommit) {
      gaps.push({
        taskId: inconsistency.taskId,
        taskTitle: inconsistency.taskTitle,
        missingDependencyTaskId: prevTaskId,
        missingDependencyTitle: prevProgress?.taskTitle ?? prevTaskId,
      });
    }
  }

  return gaps;
}

/**
 * Build reconciliation patches ordered by Plan task order.
 * @internal
 */
export function buildReconciliationPatch(
  inconsistencies: ProgressInconsistency[],
  taskOrder: string[],
): ProgressReconciliationPatch[] {
  const byTask = new Map(inconsistencies.map((i) => [i.taskId, i]));

  return taskOrder
    .filter((id) => byTask.has(id))
    .map((id) => {
      // biome-ignore lint/style/noNonNullAssertion: filtered above ensures existence
      const inc = byTask.get(id)!;
      return {
        taskId: id,
        markCompleted: true as const,
        completionTime: inc.commitTimestamp,
        sourceCommitHash: inc.commitHash,
      };
    });
}

/**
 * Get the ordered phase array for a given tier.
 * @internal
 */
export function getPhaseSequence(tier: ForgeTier): ForgePhase[] {
  return PHASE_SEQUENCES[tier];
}

/**
 * Get the next phase after the current one in the tier's sequence.
 * Returns null if the current phase is the last.
 * @internal
 */
export function getNextPhase(currentPhase: ForgePhase, tier: ForgeTier): ForgePhase | null {
  const seq = PHASE_SEQUENCES[tier];
  const idx = seq.indexOf(currentPhase);
  if (idx < 0 || idx === seq.length - 1) return null;
  return seq[idx + 1];
}

/**
 * Detect phase inconsistency.
 *
 * Returns "behind" when all tasks are completed but phase hasn't advanced,
 * "ahead" when tasks are incomplete but the phase has moved past the build
 * (execution) anchor into a post-build phase (review/test/ship/learn), or null
 * when consistent.
 *
 * Audit P2-3 (2026-07-16): incomplete tasks at build or a pre-build phase
 * (plan/spec/decide) is the normal in-progress/interrupt state and is treated
 * as consistent — it must not be flagged "ahead", which previously caused a
 * default revert of a healthy build→plan on resume.
 *
 * @internal
 */
export function findPhaseInconsistencies(
  allTasksCompleted: boolean,
  currentPhase: ForgePhase,
  tier: ForgeTier,
): PhaseInconsistency | null {
  const seq = PHASE_SEQUENCES[tier];
  const phaseIdx = seq.indexOf(currentPhase);
  if (phaseIdx < 0) return null;

  // Audit P2-3 (2026-07-16): "build" is the execution anchor. Incomplete
  // tasks at build or any pre-build phase (plan/spec/decide) is the normal
  // in-progress / interrupt state, NOT an inconsistency — flagging it "ahead"
  // caused the engine to default-revert a healthy build→plan. "Ahead" is only
  // genuine when we've moved PAST build (into review/test/ship/learn) with
  // tasks still incomplete, i.e. something skipped build completion.
  const buildIdx = seq.indexOf("build");

  if (allTasksCompleted) {
    const next = phaseIdx + 1;
    if (next < seq.length) {
      return {
        currentPhase,
        expectedPhase: seq[next],
        direction: "behind",
        evidence: `All tasks completed but phase is still "${currentPhase}", expected "${seq[next]}"`,
      };
    }
  } else if (buildIdx >= 0 && phaseIdx > buildIdx) {
    const prevPhase = seq[phaseIdx - 1];
    return {
      currentPhase,
      expectedPhase: prevPhase,
      direction: "ahead",
      evidence: `Tasks incomplete but phase is "${currentPhase}", expected still at "${prevPhase}"`,
    };
  }

  return null;
}
