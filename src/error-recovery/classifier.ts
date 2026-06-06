/**
 * Interruption Classifier — classify interruption point in TDD workflow.
 *
 * @module error-recovery/classifier
 */

import type {
  FileChange,
  GitScanResult,
  InterruptionCategory,
  InterruptionClassification,
  PhaseInconsistency,
  ProgressInconsistency,
  TDDInterruptionPhase,
  UncommittedChangeResult,
} from "./types.js";
import { TEST_FILE_PATTERNS } from "./types.js";

/**
 * Check if a file path matches test file naming conventions.
 * @internal
 */
export function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * Infer the TDD phase from uncommitted file changes and verification status.
 * @internal
 */
export function inferTDDPhase(
  changes: FileChange[],
  verificationPassed: boolean | null,
): TDDInterruptionPhase | null {
  const hasTestFiles = changes.some((c) => isTestFile(c.filePath));
  const hasImplFiles = changes.some((c) => !isTestFile(c.filePath));

  if (!hasTestFiles) return null;

  if (!hasImplFiles) return "red";

  if (verificationPassed === false) return "green-incomplete";

  if (verificationPassed === true && hasImplFiles) return "refactor-incomplete";

  return null;
}

/**
 * Classify the interruption point.
 *
 * Priority order: (a) task-completed-not-committed → (b) committed-not-progress-updated
 * → (c) progress-updated-not-phase-advanced → (d) subagent-mid-execution → (e) clean-state
 *
 * @internal
 */
export function classifyInterruption(
  uncommittedResult: UncommittedChangeResult,
  _gitScanResult: GitScanResult,
  progressInconsistencies: ProgressInconsistency[],
  phaseInconsistency: PhaseInconsistency | null,
  verificationPassed: boolean | null,
): InterruptionClassification {
  // (a) Task completed but not committed
  if (!uncommittedResult.isClean && uncommittedResult.relevantChanges.length > 0) {
    return {
      category: "task-completed-not-committed",
      evidence: `${uncommittedResult.relevantChanges.length} relevant uncommitted change(s): ${uncommittedResult.relevantChanges.map((c) => c.filePath).join(", ")}`,
      tddPhase: null,
    };
  }

  // (b) Committed but progress not updated
  if (progressInconsistencies.length > 0) {
    return {
      category: "committed-not-progress-updated",
      evidence: `${progressInconsistencies.length} task(s) committed but not marked: ${progressInconsistencies.map((i) => `${i.taskId} (${i.commitHash.slice(0, 7)})`).join(", ")}`,
      tddPhase: null,
    };
  }

  // (c) Progress updated but phase not advanced
  if (phaseInconsistency !== null) {
    return {
      category: "progress-updated-not-phase-advanced",
      evidence: `Phase "${phaseInconsistency.currentPhase}" ${phaseInconsistency.direction} expected "${phaseInconsistency.expectedPhase}"`,
      tddPhase: null,
    };
  }

  // (d) Subagent mid-execution
  if (!uncommittedResult.isClean) {
    const tddPhase = inferTDDPhase(uncommittedResult.changes, verificationPassed);
    return {
      category: "subagent-mid-execution",
      evidence: `Uncommitted changes with no relevant task match, TDD phase: ${tddPhase ?? "ambiguous"}`,
      tddPhase,
    };
  }

  // (e) Clean state
  return {
    category: "clean-state",
    evidence: "No inconsistencies detected across git, progress, and phase state",
    tddPhase: null,
  };
}
