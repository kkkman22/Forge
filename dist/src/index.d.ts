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
import { CliError } from "./cli-error.js";
import { ForgeError } from "./forge-error.js";
import { SdkAgentAdapter, type SdkAgentAdapterConfig } from "./sdk-agent-adapter.js";
import { SdkDriver, type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver.js";
import { installSkill, loadSkillsFromDir, mergeSkillLists, type SkillManifest, type SkillPhase } from "./skill-loader.js";
import { checkVersionCompatibility, type ValidationResult as SkillValidationResult, validateManifest } from "./skill-validator.js";
import { hasTaskName, parseStatusEntries, removeTaskEntry, serializeStatusEntries, type TaskStatusEntry, upsertTaskEntry } from "./state.js";
import { archiveTaskStatus, getMostRecentActiveTask, listActiveTasks, type ManagedTaskEntry, migrateToMultiTask, readTaskStatus, type StatusManagerIO, writeTaskStatus } from "./status-manager.js";
import { isMultiTaskMode, type ReconstructedState, type ResolvedStatus, type ResolverContext, reconstructStateFromGit, resolveStatusPath, slugify } from "./status-resolver.js";
export { type BranchGateInput, type BranchGateMode, type BranchGateResult, type BranchGateSeverity, type BranchGateSkill, DEFAULT_SEVERITY, renderBranchGateAdvisory, renderBranchGatePrompt, runBranchGate, } from "./branch-gate.js";
export { CLASSIFICATION_MAP, type ClassificationEntry, type ContextBudgetReport, canParseTestOutput, classifySource, deserializeContextBudgetReport, deserializeExploreSummary, deserializeGitDiff, deserializeGitStatus, deserializeReviewSummary, deserializeSubagentSummary, deserializeTestOutput, type ExploreSummary, type GitDiffSummary, type GitStatusSummary, type InformationLifecycle, type ReviewSummary, type SubagentSummary, serializeContextBudgetReport, serializeExploreResult, serializeExploreSummary, serializeGitDiff, serializeGitStatus, serializeReviewSummary, serializeSubagentSummary, serializeTestOutput, type TestOutputSummary, } from "./context-budget.js";
export { allEntriesVerified, type ChecklistEntry, type ChecklistStatus, createChecklist, isValidTransition, parseChecklist, serializeChecklist, updateEntryStatus, VALID_TRANSITIONS, } from "./fix-checklist.js";
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog, type RecoveryCandidate, type RecoveryResult, } from "./fix-recovery.js";
export { GLOSSARY_BLOCK_POLICY, type GlossaryCheckInput, type GlossaryCheckMode, type GlossaryCheckPhase, type GlossaryCheckResult, type GlossaryConflictInfo, type GlossaryConflictResolution, getAdvisoryPath, hashCandidates, normalizeInput, renderGlossaryAdvisory, renderGlossaryConflictPrompt, renderPendingAdvisoryNotice, runGlossaryCheck, } from "./glossary-hook.js";
export { type AlreadyTriggered, formatInlineGrillInjection, type GrillInlineMode, type GrillInlineReason, type GrillInlineResult, renderInlineGrillAdvisory, renderInlineGrillConfirmPrompt, shouldTriggerInlineGrill, } from "./grill-inline.js";
export { buildVerificationCriteria, determineVerificationStrategy, INCREMENTAL_THRESHOLD, type VerificationDecision, type VerificationResult, } from "./incremental-verifier.js";
export { buildCatalog, type CatalogInput, type EvolvedRulesSummary, type FailureSummary, parseEvolvedRulesSummary, parseFailureSummary, parseSolutionFrontmatter, renderCatalog, type SolutionSummary, } from "./knowledge-catalog.js";
export { computeInputFilePaths, dispatchKnowledgeEvent, hashEvent, isCatalogStale, isThrottled, type KnowledgeEvent, type KnowledgeHookInput, type KnowledgeHookResult, shouldTriggerEpisodeThreshold, THRESHOLD_MILESTONES, } from "./knowledge-hooks.js";
export { checkContradictions, checkOrphanSolutions, checkReferenceIntegrity, type IntegrityFinding, type IntegrityInput, lintKnowledgeIntegrity, } from "./knowledge-integrity.js";
export type { AgentInterface, AgentOutput, AgentResult, AgentRunOptions, BranchTopicGateResult, CommitTopicCheckResult, LoopConfig, ParallelExecutionResult, PendingDeliveryRecord, RunLimits, SubagentInvocation, SubagentResult, TokenUsage, UnshippedBranchWarning, } from "./loop-types.js";
export { type AtomicTask, checkPlanStructure, type DesignReferenceEntry, type DesignReferenceValidation, detectPlanFormat, extractHeadingAnchors, FORBIDDEN_PLACEHOLDERS, type LightweightTask, type PlanFormat, type SplitTriggerResult, scanForPlaceholders, type TDDSteps, validateAtomicTask, validateDependencies, validateDesignReferences, validateLightweightPlan, validateLightweightTask, validatePlan, validatePlanTasks, validateSpecLocked, } from "./plan.js";
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate, type GateResult, } from "./quality-gate.js";
export { checkReviewFreshness, checkShipGate, checkShipGateWithChecklist, checkShipGateWithFreshness, type ProgressResult, type ReviewFreshnessResult, type ReviewResult, type ShipGateResult, type TestResult, } from "./ship.js";
export { checkSpecHealth, classifyVerdict, computeAmbiguityScore, computeSpecHash, type DimensionScore, type HealthCache, type HealthRecommendation, type HealthVerdict, parseHealthCache, renderSpecHealthAdvisory, type SpecHealthDimension, type SpecHealthInput, type SpecHealthReport, shouldRecompute, } from "./spec-health.js";
export { buildSubagentInvocations, runSubagentsInParallel } from "./subagent-runner.js";
export { archiveTaskStatus, CliError, checkVersionCompatibility, ForgeError, getMostRecentActiveTask, hasTaskName, installSkill, isMultiTaskMode, listActiveTasks, loadSkillsFromDir, type ManagedTaskEntry, mergeSkillLists, migrateToMultiTask, parseStatusEntries, type ReconstructedState, type ResolvedStatus, type ResolverContext, readTaskStatus, reconstructStateFromGit, removeTaskEntry, resolveStatusPath, SdkAgentAdapter, type SdkAgentAdapterConfig, SdkDriver, type SdkDriverConfig, type SdkDriverResult, type SkillManifest, type SkillPhase, type SkillValidationResult, type StatusManagerIO, serializeStatusEntries, slugify, type TaskStatusEntry, upsertTaskEntry, validateManifest, writeTaskStatus, };
