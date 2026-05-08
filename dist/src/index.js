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
export { ForgeError } from "./forge-error.js";
// Driver
export { SdkDriver } from "./sdk-driver.js";
// Agent adapter
export { SdkAgentAdapter } from "./sdk-agent-adapter.js";
// Quality gate
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "./quality-gate.js";
// Plan engine
export { detectPlanFormat, extractHeadingAnchors, FORBIDDEN_PLACEHOLDERS, scanForPlaceholders, validateAtomicTask, validateDependencies, validateDesignReferences, validateLightweightPlan, validateLightweightTask, validatePlan, validatePlanTasks, validateSpecLocked, } from "./plan.js";
// Context budget management
export { CLASSIFICATION_MAP, canParseTestOutput, classifySource, deserializeContextBudgetReport, deserializeExploreSummary, deserializeGitDiff, deserializeGitStatus, deserializeReviewSummary, deserializeSubagentSummary, deserializeTestOutput, serializeContextBudgetReport, serializeExploreResult, serializeExploreSummary, serializeGitDiff, serializeGitStatus, serializeReviewSummary, serializeSubagentSummary, serializeTestOutput, } from "./context-budget.js";
// Subagent runner
export { buildSubagentInvocations, runSubagentsInParallel } from "./subagent-runner.js";
// Fix checklist
export { allEntriesVerified, createChecklist, isValidTransition, parseChecklist, serializeChecklist, updateEntryStatus, VALID_TRANSITIONS } from "./fix-checklist.js";
// Incremental verifier
export { buildVerificationCriteria, determineVerificationStrategy, INCREMENTAL_THRESHOLD } from "./incremental-verifier.js";
// Fix recovery
export { isFixCandidate, parseGitLog as parseFixRecoveryGitLog } from "./fix-recovery.js";
// Ship gate
export { checkReviewFreshness, checkShipGate, checkShipGateWithChecklist, checkShipGateWithFreshness } from "./ship.js";
// Multi-task status tracking
export { hasTaskName, parseStatusEntries, removeTaskEntry, serializeStatusEntries, upsertTaskEntry } from "./state.js";
// Status manager
export { archiveTaskStatus, getMostRecentActiveTask, listActiveTasks, migrateToMultiTask, readTaskStatus, writeTaskStatus } from "./status-manager.js";
// Status resolver
export { isMultiTaskMode, reconstructStateFromGit, resolveStatusPath, slugify } from "./status-resolver.js";
// SKILL plugin mechanism
export { installSkill, loadSkillsFromDir, mergeSkillLists } from "./skill-loader.js";
export { checkVersionCompatibility, validateManifest } from "./skill-validator.js";
//# sourceMappingURL=index.js.map