/**
 * Public API barrel file for forge-loop.
 *
 * Exports only the types and functions intended for external consumption.
 * Internal modules (pua-engine, status-file-ext, context-accumulator,
 * context-injection, frontmatter, state, skill-scheduler, sleep-preventer,
 * error-recovery, orphan-detector, process-registry, backlog, episode,
 * pattern-stats, branch-lifecycle) are intentionally excluded.
 *
 * **Validates: Requirements 3.1–3.11, 10.1–10.4**
 */

// ---------------------------------------------------------------------------
// Local imports for consolidated re-exports (no `export` prefix → not counted
// against the barrel statement budget; see scripts/check-public-api.mjs).
// ---------------------------------------------------------------------------
import { CliError } from "./cli-error.js";
import { ForgeError } from "./forge-error.js";
import {
  buildCliSdkWorkerArgs,
  buildFailureWorkerSummary,
  buildSubagentWorkerInvocation,
  normalizeWorkerSummary,
  resolvePhaseWorkerStrategy,
  runCliSdkWorker,
  runSubagentWorker,
} from "./phase-worker-runtime.js";
import { detectRuntimeConfigDrift, repairRuntimeConfig } from "./runtime-config-sync.js";
// SDK modules removed in Wave 3 (loop-native-fusion)
import {
  installSkill,
  loadSkillsFromDir,
  mergeSkillLists,
  type SkillManifest,
  type SkillPhase,
} from "./skill-loader.js";
import {
  checkVersionCompatibility,
  type ValidationResult as SkillValidationResult,
  validateManifest,
} from "./skill-validator.js";
import {
  hasTaskName,
  parseStatusEntries,
  removeTaskEntry,
  serializeStatusEntries,
  type TaskStatusEntry,
  upsertTaskEntry,
} from "./state.js";
import {
  archiveTaskStatus,
  getMostRecentActiveTask,
  listActiveTasks,
  type ManagedTaskEntry,
  migrateToMultiTask,
  readTaskStatus,
  type StatusManagerIO,
  writeTaskStatus,
} from "./status-manager.js";
import {
  isMultiTaskMode,
  type ReconstructedState,
  type ResolvedStatus,
  type ResolverContext,
  reconstructStateFromGit,
  resolveStatusPath,
  slugify,
} from "./status-resolver.js";

// Branch gate
export {
  type BranchGateInput,
  type BranchGateMode,
  type BranchGateResult,
  type BranchGateSeverity,
  type BranchGateSkill,
  DEFAULT_SEVERITY,
  renderBranchGateAdvisory,
  renderBranchGatePrompt,
  runBranchGate,
} from "./branch-gate.js";
// Config
export { parseReviewConfig, type ReviewConfig } from "./config.js";
// Context budget management
export {
  CLASSIFICATION_MAP,
  type ClassificationEntry,
  type ContextBudgetReport,
  canParseTestOutput,
  classifySource,
  deserializeContextBudgetReport,
  deserializeExploreSummary,
  deserializeGitDiff,
  deserializeGitStatus,
  deserializeReviewSummary,
  deserializeSubagentSummary,
  deserializeTestOutput,
  type ExploreSummary,
  type GitDiffSummary,
  type GitStatusSummary,
  type InformationLifecycle,
  type ReviewSummary,
  type SubagentSummary,
  serializeContextBudgetReport,
  serializeExploreResult,
  serializeExploreSummary,
  serializeGitDiff,
  serializeGitStatus,
  serializeReviewSummary,
  serializeSubagentSummary,
  serializeTestOutput,
  type TestOutputSummary,
} from "./context-budget.js";

import { loadContexts } from "./context/registry.js";
// Context injection — subagent context.jsonl wiring (spec context-injection-activation)
// Consolidated into the bottom re-export block (kept under the 20-statement
// barrel budget; see scripts/check-public-api.mjs).
import {
  appendContextEntry,
  type ContextEntry,
  mergeContextSources,
  readContextEntries,
} from "./context-injection.js";
import { parsePlanContextFiles, resolveContextFiles } from "./context-injection-wiring.js";
// Glossary enforcement bridge (spec glossary-enforcement-bridge — slice C)
import { type EnforcementGlossary, loadEnforcementGlossary } from "./glossary/enforcement.js";
import { mergeGlossaries } from "./glossary/merge.js";
import { loadGlossary } from "./glossary/registry.js";
// Domain knowledge threading (pack system wiring — spec domain-knowledge-threading)
import { composeDomainKnowledgeBundle, type DomainKnowledgeBundle } from "./pack/domain-bundle.js";
import { type LoadEnabledPacksResult, loadEnabledPacks } from "./pack/runtime.js";
import { type LoadedStateMachine, loadStateMachineDefinitions } from "./state-machine/index.js";

// Fix checklist
export {
  allEntriesVerified,
  type ChecklistEntry,
  type ChecklistStatus,
  createChecklist,
  isValidTransition,
  parseChecklist,
  serializeChecklist,
  updateEntryStatus,
  VALID_TRANSITIONS,
} from "./fix-checklist.js";
// Fix recovery
export {
  isFixCandidate,
  parseGitLog as parseFixRecoveryGitLog,
  type RecoveryCandidate,
  type RecoveryResult,
} from "./fix-recovery.js";
// Glossary consistency hook
export {
  GLOSSARY_BLOCK_POLICY,
  type GlossaryCheckInput,
  type GlossaryCheckMode,
  type GlossaryCheckPhase,
  type GlossaryCheckResult,
  type GlossaryConflictInfo,
  type GlossaryConflictResolution,
  getAdvisoryPath,
  hashCandidates,
  normalizeInput,
  renderGlossaryAdvisory,
  renderGlossaryConflictPrompt,
  renderPendingAdvisoryNotice,
  runGlossaryCheck,
} from "./glossary-hook.js";
// Inline grill orchestration
export {
  type AlreadyTriggered,
  formatInlineGrillInjection,
  type GrillInlineMode,
  type GrillInlineReason,
  type GrillInlineResult,
  renderInlineGrillAdvisory,
  renderInlineGrillConfirmPrompt,
  shouldTriggerInlineGrill,
} from "./grill-inline.js";
// Incremental verifier
export {
  buildVerificationCriteria,
  determineVerificationStrategy,
  INCREMENTAL_THRESHOLD,
  type VerificationDecision,
  type VerificationResult,
} from "./incremental-verifier.js";
// Knowledge catalog (Layer A progressive index)
export {
  buildCatalog,
  type CatalogInput,
  type EvolvedRulesSummary,
  type FailureSummary,
  parseEvolvedRulesSummary,
  parseFailureSummary,
  parseSolutionFrontmatter,
  renderCatalog,
  type SolutionSummary,
} from "./knowledge-catalog.js";
// Knowledge hooks (event-driven catalog rebuild + integrity lint)
export {
  computeInputFilePaths,
  dispatchKnowledgeEvent,
  hashEvent,
  isCatalogStale,
  isThrottled,
  type KnowledgeEvent,
  type KnowledgeHookInput,
  type KnowledgeHookResult,
  shouldTriggerEpisodeThreshold,
  THRESHOLD_MILESTONES,
} from "./knowledge-hooks.js";
// Knowledge integrity linter
export {
  checkContradictions,
  checkOrphanSolutions,
  checkReferenceIntegrity,
  type IntegrityFinding,
  type IntegrityInput,
  lintKnowledgeIntegrity,
} from "./knowledge-integrity.js";
// Plan engine
export {
  type AtomicTask,
  checkPlanStructure,
  type DesignReferenceEntry,
  type DesignReferenceValidation,
  detectPlanFormat,
  extractHeadingAnchors,
  FORBIDDEN_PLACEHOLDERS,
  type LightweightTask,
  type PlanFormat,
  type SplitTriggerResult,
  scanForPlaceholders,
  type TDDSteps,
  validateAtomicTask,
  validateDependencies,
  validateDesignReferences,
  validateLightweightPlan,
  validateLightweightTask,
  validatePlan,
  validatePlanTasks,
  validateSpecLocked,
} from "./plan.js";
// Quality gate
export {
  evaluateReviewGate,
  evaluateShipGate,
  evaluateTestGate,
  type GateResult,
} from "./quality-gate.js";
// Ship gate
export {
  checkReviewFreshness,
  checkShipGate,
  checkShipGateWithChecklist,
  checkShipGateWithForceSkip,
  checkShipGateWithFreshness,
  type ProgressResult,
  type ReviewFreshnessResult,
  type ReviewResult,
  recordForceSkip,
  type ShipGateResult,
  type ShipOptions,
  type TestResult,
} from "./ship.js";
// Ship gates (I/O-level gate checks)
export {
  buildSkipGateAnnotation,
  checkFallbackLadderGate,
  checkProgressGate,
  checkReviewGate,
  checkTestGate,
  evaluateFallbackLadder,
  type FallbackLadderConditions,
  type GateName,
  type GateResult as GateResultType,
  generateP1Fixlist,
  type P1Fixlist,
  type P1FixlistEntry,
  parseP1Fixlist,
  persistGateResults,
  runAllGates,
  type ShipGateReport,
  type SkipGateOptions,
  updateFixlistWithCommits,
  validateSkipGateOptions,
} from "./ship-gates.js";
// Spec Health (merged: type-only + value blocks)
export {
  checkSpecHealth,
  classifyVerdict,
  computeAmbiguityScore,
  computeSpecHash,
  type DimensionScore,
  type HealthCache,
  type HealthRecommendation,
  type HealthVerdict,
  parseHealthCache,
  renderSpecHealthAdvisory,
  type SpecHealthDimension,
  type SpecHealthInput,
  type SpecHealthReport,
  shouldRecompute,
} from "./spec-health.js";
// Subagent runner
export {
  buildSubagentInvocations,
  runSubagentsInParallel,
  runSubagentsWithConcurrency,
} from "./subagent-runner.js";
// Trace ID — cross-phase correlation for /forge command lifecycle
export { generateTraceId, isValidTraceId, TRACE_ID_PATTERN } from "./trace-id.js";
// Core types (migrated from loop-types.js to types.js)
export type {
  BranchTopicGateResult,
  CommitTopicCheckResult,
  ParallelExecutionResult,
  PendingDeliveryRecord,
  SubagentInvocation,
  SubagentResult,
  TokenUsage,
  WorktreeDecision,
} from "./types.js";
// Error hierarchy (consolidated: cli-error + forge-error)
// SDK (consolidated: sdk-agent-adapter + sdk-driver)
// SKILL plugin mechanism (consolidated: skill-loader + skill-validator)
// Status (consolidated: state + status-manager + status-resolver)
export {
  appendContextEntry,
  archiveTaskStatus,
  buildCliSdkWorkerArgs,
  buildFailureWorkerSummary,
  buildSubagentWorkerInvocation,
  CliError,
  type ContextEntry,
  checkVersionCompatibility,
  composeDomainKnowledgeBundle,
  type DomainKnowledgeBundle,
  detectRuntimeConfigDrift,
  type EnforcementGlossary,
  ForgeError,
  getMostRecentActiveTask,
  hasTaskName,
  installSkill,
  isMultiTaskMode,
  type LoadEnabledPacksResult,
  type LoadedStateMachine,
  listActiveTasks,
  loadContexts,
  loadEnabledPacks,
  loadEnforcementGlossary,
  loadGlossary,
  loadSkillsFromDir,
  loadStateMachineDefinitions,
  type ManagedTaskEntry,
  mergeContextSources,
  mergeGlossaries,
  mergeSkillLists,
  migrateToMultiTask,
  normalizeWorkerSummary,
  parsePlanContextFiles,
  parseStatusEntries,
  type ReconstructedState,
  type ResolvedStatus,
  type ResolverContext,
  readContextEntries,
  readTaskStatus,
  reconstructStateFromGit,
  removeTaskEntry,
  repairRuntimeConfig,
  resolveContextFiles,
  resolveStatusPath,
  runCliSdkWorker,
  runSubagentWorker,
  type SkillManifest,
  type SkillPhase,
  type SkillValidationResult,
  type StatusManagerIO,
  serializeStatusEntries,
  slugify,
  type TaskStatusEntry,
  upsertTaskEntry,
  validateManifest,
  writeTaskStatus,
};
