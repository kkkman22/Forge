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

// Error hierarchy
export { CliError } from "./cli-error.js";
// Context budget management
export {
    CLASSIFICATION_MAP, canParseTestOutput,
    classifySource,
    deserializeContextBudgetReport,
    deserializeExploreSummary,
    deserializeGitDiff,
    deserializeGitStatus,
    deserializeReviewSummary,
    deserializeSubagentSummary,
    deserializeTestOutput, serializeContextBudgetReport,
    serializeExploreResult,
    serializeExploreSummary,
    serializeGitDiff,
    serializeGitStatus,
    serializeReviewSummary,
    serializeSubagentSummary,
    serializeTestOutput, type ClassificationEntry,
    type ContextBudgetReport, type ExploreSummary,
    type GitDiffSummary,
    type GitStatusSummary,
    type InformationLifecycle,
    type ReviewSummary,
    type SubagentSummary, type TestOutputSummary
} from "./context-budget.js";
// Fix checklist
export {
    VALID_TRANSITIONS, allEntriesVerified, createChecklist,
    isValidTransition,
    parseChecklist,
    serializeChecklist,
    updateEntryStatus, type ChecklistEntry,
    type ChecklistStatus
} from "./fix-checklist.js";
// Fix recovery
export {
    isFixCandidate,
    parseGitLog as parseFixRecoveryGitLog,
    type RecoveryCandidate,
    type RecoveryResult
} from "./fix-recovery.js";
export { ForgeError } from "./forge-error.js";
// Incremental verifier
export {
    INCREMENTAL_THRESHOLD, buildVerificationCriteria,
    determineVerificationStrategy, type VerificationDecision,
    type VerificationResult
} from "./incremental-verifier.js";
// Core types (from loop-types.js)
export type {
    AgentInterface,
    AgentOutput,
    AgentResult,
    AgentRunOptions,
    BranchTopicGateResult,
    CommitTopicCheckResult,
    LoopConfig,
    ParallelExecutionResult,
    PendingDeliveryRecord,
    RunLimits,
    SubagentInvocation,
    SubagentResult,
    TokenUsage,
    UnshippedBranchWarning
} from "./loop-types.js";
// Plan engine
export {
    FORBIDDEN_PLACEHOLDERS, checkPlanStructure, detectPlanFormat,
    extractHeadingAnchors, scanForPlaceholders, validateAtomicTask,
    validateDependencies,
    validateDesignReferences,
    validateLightweightPlan,
    validateLightweightTask,
    validatePlan,
    validatePlanTasks,
    validateSpecLocked, type AtomicTask, type DesignReferenceEntry,
    type DesignReferenceValidation, type LightweightTask,
    type PlanFormat,
    type SplitTriggerResult, type TDDSteps
} from "./plan.js";
// Quality gate
// Quality gate
export {
    evaluateReviewGate,
    evaluateShipGate,
    evaluateTestGate,
    type GateResult
} from "./quality-gate.js";
// Agent adapter
export { SdkAgentAdapter, type SdkAgentAdapterConfig } from "./sdk-agent-adapter.js";
// Driver
export { SdkDriver, type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver.js";
// Ship gate
export {
    checkReviewFreshness,
    checkShipGate,
    checkShipGateWithChecklist,
    checkShipGateWithFreshness,
    type ProgressResult,
    type ReviewFreshnessResult,
    type ReviewResult,
    type ShipGateResult,
    type TestResult
} from "./ship.js";
// SKILL plugin mechanism
export {
    installSkill,
    loadSkillsFromDir,
    mergeSkillLists,
    type SkillManifest,
    type SkillPhase
} from "./skill-loader.js";
export {
    checkVersionCompatibility, validateManifest, type ValidationResult as SkillValidationResult
} from "./skill-validator.js";
// Multi-task status tracking
export {
    hasTaskName,
    parseStatusEntries,
    removeTaskEntry,
    serializeStatusEntries, upsertTaskEntry, type TaskStatusEntry
} from "./state.js";
// Status manager
export {
    archiveTaskStatus,
    getMostRecentActiveTask,
    listActiveTasks, migrateToMultiTask,
    readTaskStatus, writeTaskStatus, type ManagedTaskEntry, type StatusManagerIO
} from "./status-manager.js";
// Status resolver
export {
    isMultiTaskMode, reconstructStateFromGit,
    resolveStatusPath,
    slugify, type ReconstructedState,
    type ResolvedStatus,
    type ResolverContext
} from "./status-resolver.js";
// Subagent runner
export { buildSubagentInvocations, runSubagentsInParallel } from "./subagent-runner.js";
// Knowledge catalog (Layer A progressive index)
export {
    buildCatalog, parseEvolvedRulesSummary,
    parseFailureSummary,
    parseSolutionFrontmatter,
    renderCatalog, type CatalogInput,
    type EvolvedRulesSummary,
    type FailureSummary, type SolutionSummary
} from "./knowledge-catalog.js";
// Knowledge integrity linter
export {
    checkContradictions,
    checkOrphanSolutions,
    checkReferenceIntegrity, lintKnowledgeIntegrity, type IntegrityFinding,
    type IntegrityInput
} from "./knowledge-integrity.js";

