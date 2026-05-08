/**
 * Public API barrel file for forge-loop.
 *
 * Exports only the types and functions intended for external consumption.
 * Internal modules (pua-engine, status-file-ext, context-accumulator,
 * context-injection, frontmatter, state, skill-scheduler, sleep-preventer,
 * error-recovery, orphan-detector, process-registry, backlog, episode,
 * pattern-stats, branch-lifecycle) are intentionally excluded.
 *
 * For deprecated symbols, import from `forge-loop/deprecated` or directly
 * from the source module.
 *
 * **Validates: Requirements 3.1–3.11, 10.1–10.4**
 */
export type { AgentInterface, AgentOutput, AgentResult, AgentRunOptions, BranchTopicGateResult, CommitTopicCheckResult, LoopConfig, ParallelExecutionResult, PendingDeliveryRecord, RunLimits, SubagentInvocation, SubagentResult, TokenUsage, UnshippedBranchWarning, } from "./loop-types.js";
export { CliError } from "./cli-error.js";
export { ForgeError } from "./forge-error.js";
export { SdkDriver, type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver.js";
export { SdkAgentAdapter, type SdkAgentAdapterConfig } from "./sdk-agent-adapter.js";
export { type GateResult, evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "./quality-gate.js";
export { type AtomicTask, type DesignReferenceEntry, type DesignReferenceValidation, type LightweightTask, type PlanFormat, type TDDSteps, detectPlanFormat, extractHeadingAnchors, FORBIDDEN_PLACEHOLDERS, scanForPlaceholders, validateAtomicTask, validateDependencies, validateDesignReferences, validateLightweightPlan, validateLightweightTask, validatePlan, validatePlanTasks, validateSpecLocked, } from "./plan.js";
export { type ClassificationEntry, type ContextBudgetReport, type ExploreSummary, type GitDiffSummary, type GitStatusSummary, type InformationLifecycle, type ReviewSummary, type SubagentSummary, type TestOutputSummary, CLASSIFICATION_MAP, canParseTestOutput, classifySource, deserializeContextBudgetReport, deserializeExploreSummary, deserializeGitDiff, deserializeGitStatus, deserializeReviewSummary, deserializeSubagentSummary, deserializeTestOutput, serializeContextBudgetReport, serializeExploreResult, serializeExploreSummary, serializeGitDiff, serializeGitStatus, serializeReviewSummary, serializeSubagentSummary, serializeTestOutput, } from "./context-budget.js";
export { buildSubagentInvocations, runSubagentsInParallel } from "./subagent-runner.js";
export { type ChecklistEntry, type ChecklistStatus, allEntriesVerified, createChecklist, isValidTransition, parseChecklist, serializeChecklist, updateEntryStatus, VALID_TRANSITIONS } from "./fix-checklist.js";
export { type VerificationDecision, type VerificationResult, buildVerificationCriteria, determineVerificationStrategy, INCREMENTAL_THRESHOLD } from "./incremental-verifier.js";
export { type RecoveryCandidate, type RecoveryResult, isFixCandidate, parseGitLog as parseFixRecoveryGitLog } from "./fix-recovery.js";
export { type ProgressResult, type ReviewFreshnessResult, type ReviewResult, type ShipGateResult, type TestResult, checkReviewFreshness, checkShipGate, checkShipGateWithChecklist, checkShipGateWithFreshness } from "./ship.js";
export { type TaskStatusEntry, hasTaskName, parseStatusEntries, removeTaskEntry, serializeStatusEntries, upsertTaskEntry } from "./state.js";
export { type ManagedTaskEntry, type StatusManagerIO, archiveTaskStatus, getMostRecentActiveTask, listActiveTasks, migrateToMultiTask, readTaskStatus, writeTaskStatus } from "./status-manager.js";
export { type ReconstructedState, type ResolvedStatus, type ResolverContext, isMultiTaskMode, reconstructStateFromGit, resolveStatusPath, slugify } from "./status-resolver.js";
export { type SkillManifest, type SkillPhase, installSkill, loadSkillsFromDir, mergeSkillLists } from "./skill-loader.js";
export { type ValidationResult as SkillValidationResult, checkVersionCompatibility, validateManifest } from "./skill-validator.js";
