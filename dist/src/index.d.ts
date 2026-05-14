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
export { CliError } from "./cli-error.js";
export { CLASSIFICATION_MAP, type ClassificationEntry, type ContextBudgetReport, canParseTestOutput, classifySource, deserializeContextBudgetReport, deserializeExploreSummary, deserializeGitDiff, deserializeGitStatus, deserializeReviewSummary, deserializeSubagentSummary, deserializeTestOutput, type ExploreSummary, type GitDiffSummary, type GitStatusSummary, type InformationLifecycle, type ReviewSummary, type SubagentSummary, serializeContextBudgetReport, serializeExploreResult, serializeExploreSummary, serializeGitDiff, serializeGitStatus, serializeReviewSummary, serializeSubagentSummary, serializeTestOutput, type TestOutputSummary, } from "./context-budget.js";
export { allEntriesVerified, type ChecklistEntry, type ChecklistStatus, createChecklist, isValidTransition, parseChecklist, serializeChecklist, updateEntryStatus, VALID_TRANSITIONS, } from "./fix-checklist.js";
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog, type RecoveryCandidate, type RecoveryResult, } from "./fix-recovery.js";
export { ForgeError } from "./forge-error.js";
export { buildVerificationCriteria, determineVerificationStrategy, INCREMENTAL_THRESHOLD, type VerificationDecision, type VerificationResult, } from "./incremental-verifier.js";
export { buildCatalog, type CatalogInput, type EvolvedRulesSummary, type FailureSummary, parseEvolvedRulesSummary, parseFailureSummary, parseSolutionFrontmatter, renderCatalog, type SolutionSummary, } from "./knowledge-catalog.js";
export { checkContradictions, checkOrphanSolutions, checkReferenceIntegrity, type IntegrityFinding, type IntegrityInput, lintKnowledgeIntegrity, } from "./knowledge-integrity.js";
export type { AgentInterface, AgentOutput, AgentResult, AgentRunOptions, BranchTopicGateResult, CommitTopicCheckResult, LoopConfig, ParallelExecutionResult, PendingDeliveryRecord, RunLimits, SubagentInvocation, SubagentResult, TokenUsage, UnshippedBranchWarning, } from "./loop-types.js";
export { type AtomicTask, checkPlanStructure, type DesignReferenceEntry, type DesignReferenceValidation, detectPlanFormat, extractHeadingAnchors, FORBIDDEN_PLACEHOLDERS, type LightweightTask, type PlanFormat, type SplitTriggerResult, scanForPlaceholders, type TDDSteps, validateAtomicTask, validateDependencies, validateDesignReferences, validateLightweightPlan, validateLightweightTask, validatePlan, validatePlanTasks, validateSpecLocked, } from "./plan.js";
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate, type GateResult, } from "./quality-gate.js";
export { SdkAgentAdapter, type SdkAgentAdapterConfig } from "./sdk-agent-adapter.js";
export { SdkDriver, type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver.js";
export { checkReviewFreshness, checkShipGate, checkShipGateWithChecklist, checkShipGateWithFreshness, type ProgressResult, type ReviewFreshnessResult, type ReviewResult, type ShipGateResult, type TestResult, } from "./ship.js";
export { installSkill, loadSkillsFromDir, mergeSkillLists, type SkillManifest, type SkillPhase, } from "./skill-loader.js";
export { checkVersionCompatibility, type ValidationResult as SkillValidationResult, validateManifest, } from "./skill-validator.js";
export { hasTaskName, parseStatusEntries, removeTaskEntry, serializeStatusEntries, type TaskStatusEntry, upsertTaskEntry, } from "./state.js";
export { archiveTaskStatus, getMostRecentActiveTask, listActiveTasks, type ManagedTaskEntry, migrateToMultiTask, readTaskStatus, type StatusManagerIO, writeTaskStatus, } from "./status-manager.js";
export { isMultiTaskMode, type ReconstructedState, type ResolvedStatus, type ResolverContext, reconstructStateFromGit, resolveStatusPath, slugify, } from "./status-resolver.js";
export { buildSubagentInvocations, runSubagentsInParallel } from "./subagent-runner.js";
