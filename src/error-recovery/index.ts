/**
 * Error Recovery sub-modules — barrel export for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./error-recovery.js"` continues to work unchanged.
 *
 * Design reference: .kiro/specs/error-recovery-strategy/design.md
 * **Validates: Requirements 1.1–11.4**
 */

// Uncommitted Change Detector
export { matchChangesToTask, parseGitStatus } from "./change-detector.js";
// Interruption Classifier
export {
  classifyInterruption,
  inferTDDPhase,
  isTestFile,
} from "./classifier.js";
// Recovery Engine
export { buildRecoveryReport, calculateSegmentation } from "./engine.js";
// Git State Scanner
export {
  extractCommitPatterns,
  filterCommitsSince,
  matchCommitsToTasks,
  parseGitLog,
} from "./git-scanner.js";

// Progress & Phase Reconciler
export {
  buildReconciliationPatch,
  findDependencyGaps,
  findPhaseInconsistencies,
  findProgressInconsistencies,
  getNextPhase,
  getPhaseSequence,
} from "./reconciler.js";
// Serialization
export {
  deserializeCheckpointMarker,
  deserializeClassification,
  deserializeRecoveryReport,
  serializeCheckpointMarker,
  serializeClassification,
  serializeRecoveryReport,
} from "./serde.js";
// Types and constants
export type {
  CheckpointMarker,
  CommitTaskMatch,
  DependencyGap,
  FileChange,
  ForgePhase,
  ForgeTier,
  GitCommitEntry,
  GitScanResult,
  InterruptionCategory,
  InterruptionClassification,
  PhaseInconsistency,
  ProgressInconsistency,
  ProgressReconciliationPatch,
  ProgressTaskEntry,
  RecoveryActionOption,
  RecoveryInconsistencyItem,
  RecoveryReport,
  TaskCommitPattern,
  TaskSegmentationInfo,
  TDDInterruptionPhase,
  UncommittedChangeResult,
} from "./types.js";
export { PHASE_SEQUENCES, TEST_FILE_PATTERNS } from "./types.js";
