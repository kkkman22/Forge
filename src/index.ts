/**
 * Public API barrel file for forge-loop.
 *
 * Exports only the types and functions intended for external consumption.
 * Internal modules (pua-engine, status-file-ext, context-accumulator,
 * context-injection, frontmatter, state, skill-scheduler, sleep-preventer)
 * are intentionally excluded.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type {
  AgentInterface,
  AgentOutput,
  AgentResult,
  AgentRunOptions,
  LoopConfig,
  RunLimits,
  TokenUsage,
} from "./loop-types.js";

// ---------------------------------------------------------------------------
// Error hierarchy
// ---------------------------------------------------------------------------

export { CliError } from "./cli-error.js";
export { ForgeError } from "./forge-error.js";

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export { SdkDriver, type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver.js";

// ---------------------------------------------------------------------------
// Agent adapter
// ---------------------------------------------------------------------------

export { SdkAgentAdapter, type SdkAgentAdapterConfig } from "./sdk-agent-adapter.js";

// ---------------------------------------------------------------------------
// Quality gate (public evaluation functions)
// ---------------------------------------------------------------------------

export type { GateResult } from "./quality-gate.js";
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "./quality-gate.js";

// ---------------------------------------------------------------------------
// Plan engine
// ---------------------------------------------------------------------------

export type {
  AtomicTask,
  DesignReferenceEntry,
  DesignReferenceValidation,
  LightweightTask,
  PlanFormat,
  TDDSteps,
} from "./plan.js";
export {
  detectPlanFormat,
  extractHeadingAnchors,
  FORBIDDEN_PLACEHOLDERS,
  scanForPlaceholders,
  validateAtomicTask,
  validateDependencies,
  validateDesignReferences,
  validateLightweightPlan,
  validateLightweightTask,
  validatePlan,
  validatePlanTasks,
  validateSpecLocked,
} from "./plan.js";

// ---------------------------------------------------------------------------
// Context budget management
// ---------------------------------------------------------------------------

export type {
  ClassificationEntry,
  ContextBudgetReport,
  ExploreSummary,
  GitDiffSummary,
  GitStatusSummary,
  InformationLifecycle,
  ReviewSummary,
  SubagentSummary,
  TestOutputSummary,
} from "./context-budget.js";
export {
  CLASSIFICATION_MAP,
  canParseTestOutput,
  classifySource,
  deserializeContextBudgetReport,
  deserializeExploreSummary,
  deserializeGitDiff,
  deserializeGitStatus,
  deserializeReviewSummary,
  deserializeSubagentSummary,
  deserializeTestOutput,
  serializeContextBudgetReport,
  serializeExploreResult,
  serializeExploreSummary,
  serializeGitDiff,
  serializeGitStatus,
  serializeReviewSummary,
  serializeSubagentSummary,
  serializeTestOutput,
} from "./context-budget.js";

// ---------------------------------------------------------------------------
// Subagent runner
// ---------------------------------------------------------------------------

export type {
  ParallelExecutionResult,
  SubagentInvocation,
  SubagentResult,
} from "./loop-types.js";

export {
  buildSubagentInvocations,
  runSubagentsInParallel,
} from "./subagent-runner.js";

// ---------------------------------------------------------------------------
// Error recovery strategy
// ---------------------------------------------------------------------------

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
// Fix checklist (P0/P1 tracking state machine)
// ---------------------------------------------------------------------------

export type { ChecklistEntry, ChecklistStatus } from "./fix-checklist.js";
export {
  allEntriesVerified,
  createChecklist,
  isValidTransition,
  parseChecklist,
  serializeChecklist,
  updateEntryStatus,
  VALID_TRANSITIONS,
} from "./fix-checklist.js";

// ---------------------------------------------------------------------------
// Incremental verifier
// ---------------------------------------------------------------------------

export type { VerificationDecision, VerificationResult } from "./incremental-verifier.js";
export {
  buildVerificationCriteria,
  determineVerificationStrategy,
  INCREMENTAL_THRESHOLD,
} from "./incremental-verifier.js";

// ---------------------------------------------------------------------------
// Fix recovery (git history)
// ---------------------------------------------------------------------------

export type { RecoveryCandidate, RecoveryResult } from "./fix-recovery.js";
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog } from "./fix-recovery.js";

// ---------------------------------------------------------------------------
// Ship gate (extended)
// ---------------------------------------------------------------------------

export type {
  ProgressResult,
  ReviewFreshnessResult,
  ReviewResult,
  ShipGateResult,
  TestResult,
} from "./ship.js";
export {
  checkReviewFreshness,
  checkShipGate,
  checkShipGateWithChecklist,
  checkShipGateWithFreshness,
} from "./ship.js";

// ---------------------------------------------------------------------------
// Multi-task status tracking
// ---------------------------------------------------------------------------

export type { TaskStatusEntry } from "./state.js";
export {
  hasTaskName,
  parseStatusEntries,
  removeTaskEntry,
  serializeStatusEntries,
  upsertTaskEntry,
} from "./state.js";

// ---------------------------------------------------------------------------
// Parallel status tracking (file-based multi-task)
// ---------------------------------------------------------------------------

export type {
  ManagedTaskEntry,
  StatusManagerIO,
} from "./status-manager.js";
export {
  archiveTaskStatus,
  getMostRecentActiveTask,
  listActiveTasks,
  migrateToMultiTask,
  readTaskStatus,
  writeTaskStatus,
} from "./status-manager.js";
export type {
  ReconstructedState,
  ResolvedStatus,
  ResolverContext,
} from "./status-resolver.js";
export {
  isMultiTaskMode,
  reconstructStateFromGit,
  resolveStatusPath,
  slugify,
} from "./status-resolver.js";

// ---------------------------------------------------------------------------
// Process lifecycle management
// ---------------------------------------------------------------------------

export type { OrphanProcess, PidFileContent } from "./orphan-detector.js";
export {
  cleanupOrphans,
  cleanupStaleSessions,
  deletePidFile,
  detectPpidOrphans,
  readPidFile,
  writePidFile,
} from "./orphan-detector.js";
export type {
  ProcessMetadata,
  SerializedRegistry,
  ShutdownResult,
} from "./process-registry.js";
export { ProcessRegistry } from "./process-registry.js";
export type { ProcessTreeNode } from "./process-tree-cleaner.js";
export {
  getDescendants,
  killProcessGroup,
  killProcessTree,
} from "./process-tree-cleaner.js";

// ---------------------------------------------------------------------------
// Backlog (P2/P3 findings capture)
// ---------------------------------------------------------------------------

export type { BacklogEntry } from "./backlog.js";
export {
  appendToBacklog,
  findOverlappingEntries,
  generateBacklogHeader,
  parseBacklog,
  resolveEntry,
  serializeBacklog,
} from "./backlog.js";

// ---------------------------------------------------------------------------
// Episode & pattern confidence lifecycle (Phase 4)
// ---------------------------------------------------------------------------

export type {
  Episode,
  EpisodeOutcome,
  EpisodeTier,
} from "./episode.js";
export {
  generateEpisodeId,
  parseEpisode,
  renderEpisode,
} from "./episode.js";
export type {
  EvolutionBySkill,
  EvolutionMarker,
  EvolutionReport,
  ValidationResult,
} from "./evolution-marker.js";
export {
  aggregateEvolutionMarkers,
  parseEvolutionMarkers,
  validateEvolutionTarget,
} from "./evolution-marker.js";
export type {
  FailureContext,
  FailureTrigger,
} from "./failure-sink.js";
export {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
} from "./failure-sink.js";
export type {
  Pattern,
  UpgradeSuggestion,
} from "./pattern-stats.js";
export {
  findStaleOrDecayedPatterns,
  findUpgradableEpisodes,
  parseInstinct,
  renderInstincts,
  updatePatternStats,
} from "./pattern-stats.js";

// ---------------------------------------------------------------------------
// Branch lifecycle enforcement
// ---------------------------------------------------------------------------

export {
  checkBranchTopicGate,
  checkCommitTopicMatch,
  detectStaleBranches,
  detectUnshippedBranches,
  extractBranchTopic,
  recordPendingDelivery,
} from "./branch-lifecycle.js";

// ---------------------------------------------------------------------------
// SKILL plugin mechanism
// ---------------------------------------------------------------------------

export type {
  BranchTopicGateResult,
  CommitTopicCheckResult,
  PendingDeliveryRecord,
  UnshippedBranchWarning,
} from "./loop-types.js";
export type { SkillManifest, SkillPhase } from "./skill-loader.js";
export {
  installSkill,
  loadSkillsFromDir,
  mergeSkillLists,
} from "./skill-loader.js";
export type { ValidationResult as SkillValidationResult } from "./skill-validator.js";
export {
  checkVersionCompatibility,
  validateManifest,
} from "./skill-validator.js";
