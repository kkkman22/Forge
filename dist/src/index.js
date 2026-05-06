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
// Error hierarchy
// ---------------------------------------------------------------------------
export { CliError } from "./cli-error.js";
export { ForgeError } from "./forge-error.js";
// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------
export { SdkDriver } from "./sdk-driver.js";
// ---------------------------------------------------------------------------
// Agent adapter
// ---------------------------------------------------------------------------
export { SdkAgentAdapter } from "./sdk-agent-adapter.js";
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "./quality-gate.js";
export { detectPlanFormat, extractHeadingAnchors, FORBIDDEN_PLACEHOLDERS, scanForPlaceholders, validateAtomicTask, validateDependencies, validateDesignReferences, validateLightweightPlan, validateLightweightTask, validatePlan, validatePlanTasks, validateSpecLocked, } from "./plan.js";
export { CLASSIFICATION_MAP, canParseTestOutput, classifySource, deserializeContextBudgetReport, deserializeExploreSummary, deserializeGitDiff, deserializeGitStatus, deserializeReviewSummary, deserializeSubagentSummary, deserializeTestOutput, serializeContextBudgetReport, serializeExploreResult, serializeExploreSummary, serializeGitDiff, serializeGitStatus, serializeReviewSummary, serializeSubagentSummary, serializeTestOutput, } from "./context-budget.js";
export { buildSubagentInvocations, runSubagentsInParallel, } from "./subagent-runner.js";
export { buildReconciliationPatch, buildRecoveryReport, calculateSegmentation, classifyInterruption, deserializeCheckpointMarker, deserializeClassification, deserializeRecoveryReport, extractCommitPatterns, filterCommitsSince, findDependencyGaps, findPhaseInconsistencies, findProgressInconsistencies, getNextPhase, getPhaseSequence, inferTDDPhase, isTestFile, matchChangesToTask, matchCommitsToTasks, PHASE_SEQUENCES, parseGitLog, parseGitStatus, serializeCheckpointMarker, serializeClassification, serializeRecoveryReport, TEST_FILE_PATTERNS, } from "./error-recovery.js";
export { allEntriesVerified, createChecklist, isValidTransition, parseChecklist, serializeChecklist, updateEntryStatus, VALID_TRANSITIONS, } from "./fix-checklist.js";
export { buildVerificationCriteria, determineVerificationStrategy, INCREMENTAL_THRESHOLD, } from "./incremental-verifier.js";
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog } from "./fix-recovery.js";
export { checkReviewFreshness, checkShipGate, checkShipGateWithChecklist } from "./ship.js";
export { hasTaskName, parseStatusEntries, removeTaskEntry, serializeStatusEntries, upsertTaskEntry, } from "./state.js";
export { cleanupOrphans, cleanupStaleSessions, deletePidFile, detectPpidOrphans, readPidFile, writePidFile, } from "./orphan-detector.js";
export { ProcessRegistry } from "./process-registry.js";
export { getDescendants, killProcessGroup, killProcessTree, } from "./process-tree-cleaner.js";
export { captureFindings, findOverlappingEntries, markResolved, readBacklog, serializeBacklog, writeBacklog, } from "./backlog.js";
// ---------------------------------------------------------------------------
// Branch lifecycle enforcement
// ---------------------------------------------------------------------------
export { checkBranchTopicGate, checkCommitTopicMatch, detectStaleBranches, detectUnshippedBranches, extractBranchTopic, recordPendingDelivery, } from "./branch-lifecycle.js";
//# sourceMappingURL=index.js.map