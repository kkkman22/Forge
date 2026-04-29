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
//# sourceMappingURL=index.js.map