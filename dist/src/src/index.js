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
// ---------------------------------------------------------------------------
// Local imports for consolidated re-exports (no `export` prefix → not counted
// against the barrel statement budget; see scripts/check-public-api.mjs).
// ---------------------------------------------------------------------------
import { CliError } from "./cli-error.js";
import { ForgeError } from "./forge-error.js";
import { SdkAgentAdapter } from "./sdk-agent-adapter.js";
import { SdkDriver } from "./sdk-driver.js";
import { installSkill, loadSkillsFromDir, mergeSkillLists, } from "./skill-loader.js";
import { checkVersionCompatibility, validateManifest, } from "./skill-validator.js";
import { hasTaskName, parseStatusEntries, removeTaskEntry, serializeStatusEntries, upsertTaskEntry, } from "./state.js";
import { archiveTaskStatus, getMostRecentActiveTask, listActiveTasks, migrateToMultiTask, readTaskStatus, writeTaskStatus, } from "./status-manager.js";
import { isMultiTaskMode, reconstructStateFromGit, resolveStatusPath, slugify, } from "./status-resolver.js";
// Branch gate
export { DEFAULT_SEVERITY, renderBranchGateAdvisory, renderBranchGatePrompt, runBranchGate, } from "./branch-gate.js";
// Config
export { parseReviewConfig } from "./config.js";
// Context budget management
export { CLASSIFICATION_MAP, canParseTestOutput, classifySource, deserializeContextBudgetReport, deserializeExploreSummary, deserializeGitDiff, deserializeGitStatus, deserializeReviewSummary, deserializeSubagentSummary, deserializeTestOutput, serializeContextBudgetReport, serializeExploreResult, serializeExploreSummary, serializeGitDiff, serializeGitStatus, serializeReviewSummary, serializeSubagentSummary, serializeTestOutput, } from "./context-budget.js";
// Fix checklist
export { allEntriesVerified, createChecklist, isValidTransition, parseChecklist, serializeChecklist, updateEntryStatus, VALID_TRANSITIONS, } from "./fix-checklist.js";
// Fix recovery
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog, } from "./fix-recovery.js";
// Glossary consistency hook
export { GLOSSARY_BLOCK_POLICY, getAdvisoryPath, hashCandidates, normalizeInput, renderGlossaryAdvisory, renderGlossaryConflictPrompt, renderPendingAdvisoryNotice, runGlossaryCheck, } from "./glossary-hook.js";
// Inline grill orchestration
export { formatInlineGrillInjection, renderInlineGrillAdvisory, renderInlineGrillConfirmPrompt, shouldTriggerInlineGrill, } from "./grill-inline.js";
// Incremental verifier
export { buildVerificationCriteria, determineVerificationStrategy, INCREMENTAL_THRESHOLD, } from "./incremental-verifier.js";
// Knowledge catalog (Layer A progressive index)
export { buildCatalog, parseEvolvedRulesSummary, parseFailureSummary, parseSolutionFrontmatter, renderCatalog, } from "./knowledge-catalog.js";
// Knowledge hooks (event-driven catalog rebuild + integrity lint)
export { computeInputFilePaths, dispatchKnowledgeEvent, hashEvent, isCatalogStale, isThrottled, shouldTriggerEpisodeThreshold, THRESHOLD_MILESTONES, } from "./knowledge-hooks.js";
// Knowledge integrity linter
export { checkContradictions, checkOrphanSolutions, checkReferenceIntegrity, lintKnowledgeIntegrity, } from "./knowledge-integrity.js";
// Plan engine
export { checkPlanStructure, detectPlanFormat, extractHeadingAnchors, FORBIDDEN_PLACEHOLDERS, scanForPlaceholders, validateAtomicTask, validateDependencies, validateDesignReferences, validateLightweightPlan, validateLightweightTask, validatePlan, validatePlanTasks, validateSpecLocked, } from "./plan.js";
// Quality gate
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate, } from "./quality-gate.js";
// Ship gate
export { checkReviewFreshness, checkShipGate, checkShipGateWithChecklist, checkShipGateWithForceSkip, checkShipGateWithFreshness, recordForceSkip, } from "./ship.js";
// Spec Health (merged: type-only + value blocks)
export { checkSpecHealth, classifyVerdict, computeAmbiguityScore, computeSpecHash, parseHealthCache, renderSpecHealthAdvisory, shouldRecompute, } from "./spec-health.js";
// Subagent runner
export { buildSubagentInvocations, runSubagentsInParallel, runSubagentsWithConcurrency, } from "./subagent-runner.js";
// Error hierarchy (consolidated: cli-error + forge-error)
// SDK (consolidated: sdk-agent-adapter + sdk-driver)
// SKILL plugin mechanism (consolidated: skill-loader + skill-validator)
// Status (consolidated: state + status-manager + status-resolver)
export { archiveTaskStatus, CliError, checkVersionCompatibility, ForgeError, getMostRecentActiveTask, hasTaskName, installSkill, isMultiTaskMode, listActiveTasks, loadSkillsFromDir, mergeSkillLists, migrateToMultiTask, parseStatusEntries, readTaskStatus, reconstructStateFromGit, removeTaskEntry, resolveStatusPath, SdkAgentAdapter, SdkDriver, serializeStatusEntries, slugify, upsertTaskEntry, validateManifest, writeTaskStatus, };
//# sourceMappingURL=index.js.map