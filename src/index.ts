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
  parseGitLog,
  parseGitStatus,
  PHASE_SEQUENCES,
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
  VALID_TRANSITIONS,
  allEntriesVerified,
  createChecklist,
  isValidTransition,
  parseChecklist,
  serializeChecklist,
  updateEntryStatus,
} from "./fix-checklist.js";

// ---------------------------------------------------------------------------
// Incremental verifier
// ---------------------------------------------------------------------------

export type { VerificationDecision, VerificationResult } from "./incremental-verifier.js";
export {
  INCREMENTAL_THRESHOLD,
  buildVerificationCriteria,
  determineVerificationStrategy,
} from "./incremental-verifier.js";

// ---------------------------------------------------------------------------
// Fix recovery (git history)
// ---------------------------------------------------------------------------

export type { RecoveryCandidate, RecoveryResult } from "./fix-recovery.js";
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog } from "./fix-recovery.js";

// ---------------------------------------------------------------------------
// Ship gate (extended)
// ---------------------------------------------------------------------------

export type { ReviewResult, TestResult, ProgressResult, ShipGateResult } from "./ship.js";
export { checkShipGate, checkShipGateWithChecklist } from "./ship.js";

// ---------------------------------------------------------------------------
// Multi-task status tracking
// ---------------------------------------------------------------------------

export type { TaskStatusEntry } from "./state.js";
export {
  detectConflict,
  parseStatusEntries,
  removeTaskEntry,
  serializeStatusEntries,
  upsertTaskEntry,
} from "./state.js";

// ---------------------------------------------------------------------------
// Process lifecycle management
// ---------------------------------------------------------------------------

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

export type { OrphanProcess, PidFileContent } from "./orphan-detector.js";
export {
  cleanupOrphans,
  cleanupStaleSessions,
  deletePidFile,
  detectPpidOrphans,
  readPidFile,
  writePidFile,
} from "./orphan-detector.js";
