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
export type { AgentInterface, AgentOutput, AgentResult, AgentRunOptions, LoopConfig, RunLimits, TokenUsage, } from "./loop-types.js";
export { CliError } from "./cli-error.js";
export { ForgeError } from "./forge-error.js";
export { SdkDriver, type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver.js";
export { SdkAgentAdapter, type SdkAgentAdapterConfig } from "./sdk-agent-adapter.js";
export type { GateResult } from "./quality-gate.js";
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "./quality-gate.js";
export type { AtomicTask, DesignReferenceEntry, DesignReferenceValidation, LightweightTask, PlanFormat, TDDSteps, } from "./plan.js";
export { detectPlanFormat, extractHeadingAnchors, FORBIDDEN_PLACEHOLDERS, scanForPlaceholders, validateAtomicTask, validateDependencies, validateDesignReferences, validateLightweightPlan, validateLightweightTask, validatePlan, validatePlanTasks, validateSpecLocked, } from "./plan.js";
export type { ClassificationEntry, ContextBudgetReport, ExploreSummary, GitDiffSummary, GitStatusSummary, InformationLifecycle, ReviewSummary, SubagentSummary, TestOutputSummary, } from "./context-budget.js";
export { CLASSIFICATION_MAP, canParseTestOutput, classifySource, deserializeContextBudgetReport, deserializeExploreSummary, deserializeGitDiff, deserializeGitStatus, deserializeReviewSummary, deserializeSubagentSummary, deserializeTestOutput, serializeContextBudgetReport, serializeExploreResult, serializeExploreSummary, serializeGitDiff, serializeGitStatus, serializeReviewSummary, serializeSubagentSummary, serializeTestOutput, } from "./context-budget.js";
export type { ParallelExecutionResult, SubagentInvocation, SubagentResult, } from "./loop-types.js";
export { buildSubagentInvocations, runSubagentsInParallel, } from "./subagent-runner.js";
export type { CheckpointMarker, CommitTaskMatch, DependencyGap, FileChange, ForgePhase, ForgeTier, GitCommitEntry, GitScanResult, InterruptionCategory, InterruptionClassification, PhaseInconsistency, ProgressInconsistency, ProgressReconciliationPatch, ProgressTaskEntry, RecoveryActionOption, RecoveryInconsistencyItem, RecoveryReport, TaskCommitPattern, TaskSegmentationInfo, TDDInterruptionPhase, UncommittedChangeResult, } from "./error-recovery.js";
export { buildReconciliationPatch, buildRecoveryReport, calculateSegmentation, classifyInterruption, deserializeCheckpointMarker, deserializeClassification, deserializeRecoveryReport, extractCommitPatterns, filterCommitsSince, findDependencyGaps, findPhaseInconsistencies, findProgressInconsistencies, getNextPhase, getPhaseSequence, inferTDDPhase, isTestFile, matchChangesToTask, matchCommitsToTasks, PHASE_SEQUENCES, parseGitLog, parseGitStatus, serializeCheckpointMarker, serializeClassification, serializeRecoveryReport, TEST_FILE_PATTERNS, } from "./error-recovery.js";
export type { ChecklistEntry, ChecklistStatus } from "./fix-checklist.js";
export { allEntriesVerified, createChecklist, isValidTransition, parseChecklist, serializeChecklist, updateEntryStatus, VALID_TRANSITIONS, } from "./fix-checklist.js";
export type { VerificationDecision, VerificationResult } from "./incremental-verifier.js";
export { buildVerificationCriteria, determineVerificationStrategy, INCREMENTAL_THRESHOLD, } from "./incremental-verifier.js";
export type { RecoveryCandidate, RecoveryResult } from "./fix-recovery.js";
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog } from "./fix-recovery.js";
export type { ProgressResult, ReviewResult, ShipGateResult, TestResult } from "./ship.js";
export { checkShipGate, checkShipGateWithChecklist } from "./ship.js";
export type { TaskStatusEntry } from "./state.js";
export { hasTaskName, parseStatusEntries, removeTaskEntry, serializeStatusEntries, upsertTaskEntry, } from "./state.js";
export type { OrphanProcess, PidFileContent } from "./orphan-detector.js";
export { cleanupOrphans, cleanupStaleSessions, deletePidFile, detectPpidOrphans, readPidFile, writePidFile, } from "./orphan-detector.js";
export type { ProcessMetadata, SerializedRegistry, ShutdownResult, } from "./process-registry.js";
export { ProcessRegistry } from "./process-registry.js";
export type { ProcessTreeNode } from "./process-tree-cleaner.js";
export { getDescendants, killProcessGroup, killProcessTree, } from "./process-tree-cleaner.js";
export { checkBranchTopicGate, checkCommitTopicMatch, detectStaleBranches, detectUnshippedBranches, extractBranchTopic, recordPendingDelivery, } from "./branch-lifecycle.js";
export type { BranchTopicGateResult, CommitTopicCheckResult, PendingDeliveryRecord, UnshippedBranchWarning, } from "./loop-types.js";
