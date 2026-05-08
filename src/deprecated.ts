/**
 * Deprecated re-exports — backward compatibility shim for v2.4→v2.5 migration.
 *
 * These symbols were removed from the public barrel (`src/index.ts`) in v2.4.0.
 * Import them directly from the source module or via `forge-loop/deprecated`.
 *
 * @deprecated Will be removed in v2.5.0. Import directly from source modules.
 */

// ---------------------------------------------------------------------------
// Error recovery strategy (internal)
// ---------------------------------------------------------------------------

/** @deprecated Import from forge-loop/error-recovery instead */
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
} from "./error-recovery.js";

/** @deprecated Import from forge-loop/error-recovery instead */
export {
  buildReconciliationPatch,
  buildRecoveryReport,
  calculateSegmentation,
  classifyInterruption,
  deserializeCheckpointMarker,
  deserializeClassification,
  deserializeRecoveryReport,
  extractCommitPatterns,
  filterCommitsSince,
  findDependencyGaps,
  findPhaseInconsistencies,
  findProgressInconsistencies,
  getNextPhase,
  getPhaseSequence,
  inferTDDPhase,
  isTestFile,
  matchChangesToTask,
  matchCommitsToTasks,
  PHASE_SEQUENCES,
  parseGitLog,
  parseGitStatus,
  serializeCheckpointMarker,
  serializeClassification,
  serializeRecoveryReport,
  TEST_FILE_PATTERNS,
} from "./error-recovery.js";

// ---------------------------------------------------------------------------
// Process lifecycle management (internal)
// ---------------------------------------------------------------------------

/** @deprecated Import from forge-loop/orphan-detector instead */
export type { OrphanProcess, PidFileContent } from "./orphan-detector.js";
/** @deprecated Import from forge-loop/orphan-detector instead */
export {
  cleanupOrphans,
  cleanupStaleSessions,
  deletePidFile,
  detectPpidOrphans,
  readPidFile,
  writePidFile,
} from "./orphan-detector.js";

/** @deprecated Import from forge-loop/process-registry instead */
export type { ProcessMetadata, SerializedRegistry, ShutdownResult } from "./process-registry.js";
/** @deprecated Import from forge-loop/process-registry instead */
export { ProcessRegistry } from "./process-registry.js";

/** @deprecated Import from forge-loop/process-tree-cleaner instead */
export type { ProcessTreeNode } from "./process-tree-cleaner.js";
/** @deprecated Import from forge-loop/process-tree-cleaner instead */
export { getDescendants, killProcessGroup, killProcessTree } from "./process-tree-cleaner.js";

// ---------------------------------------------------------------------------
// Backlog (internal)
// ---------------------------------------------------------------------------

/** @deprecated Import from forge-loop/backlog instead */
export type { BacklogEntry } from "./backlog.js";
/** @deprecated Import from forge-loop/backlog instead */
export {
  appendToBacklog,
  findOverlappingEntries,
  generateBacklogHeader,
  parseBacklog,
  resolveEntry,
  serializeBacklog,
} from "./backlog.js";

// ---------------------------------------------------------------------------
// Episode & pattern confidence lifecycle (internal)
// ---------------------------------------------------------------------------

/** @deprecated Import from forge-loop/episode instead */
export type { Episode, EpisodeOutcome, EpisodeTier } from "./episode.js";
/** @deprecated Import from forge-loop/episode instead */
export { generateEpisodeId, parseEpisode, renderEpisode } from "./episode.js";

/** @deprecated Import from forge-loop/evolution-marker instead */
export type {
  EvolutionBySkill,
  EvolutionMarker,
  EvolutionReport,
  ValidationResult as EvolutionValidationResult,
} from "./evolution-marker.js";
/** @deprecated Import from forge-loop/evolution-marker instead */
export {
  aggregateEvolutionMarkers,
  parseEvolutionMarkers,
  validateEvolutionTarget,
} from "./evolution-marker.js";

/** @deprecated Import from forge-loop/failure-sink instead */
export type { FailureContext, FailureTrigger } from "./failure-sink.js";
/** @deprecated Import from forge-loop/failure-sink instead */
export { buildFailureEpisode, buildFailureEvolutionMarker } from "./failure-sink.js";

/** @deprecated Import from forge-loop/pattern-stats instead */
export type { Pattern, UpgradeSuggestion } from "./pattern-stats.js";
/** @deprecated Import from forge-loop/pattern-stats instead */
export {
  findStaleOrDecayedPatterns,
  findUpgradableEpisodes,
  parseInstinct,
  renderInstincts,
  updatePatternStats,
} from "./pattern-stats.js";

// ---------------------------------------------------------------------------
// Branch lifecycle enforcement (internal)
// ---------------------------------------------------------------------------

/** @deprecated Import from forge-loop/branch-lifecycle instead */
export {
  checkBranchTopicGate,
  checkCommitTopicMatch,
  detectStaleBranches,
  detectUnshippedBranches,
  extractBranchTopic,
  recordPendingDelivery,
} from "./branch-lifecycle.js";
