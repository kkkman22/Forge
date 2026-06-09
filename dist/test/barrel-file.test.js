/**
 * Unit tests for the public API barrel file (`src/index.ts`).
 *
 * Verifies that:
 * - All expected public value exports are accessible via the barrel file
 * - Value exports are the correct type (class/function)
 * - Internal modules are NOT re-exported through the barrel file
 *
 * **Validates: Requirements 3.1–3.11, 10.1–10.4**
 */
import { describe, expect, it } from "vitest";
import * as deprecated from "../src/deprecated.js";
import * as barrel from "../src/index.js";
// ---------------------------------------------------------------------------
// 1. Expected public value exports exist (Requirement 10.1, 10.2)
// ---------------------------------------------------------------------------
describe("barrel file exports expected public values", () => {
    it("exports ForgeError as a function (class)", () => {
        expect(barrel.ForgeError).toBeDefined();
        expect(typeof barrel.ForgeError).toBe("function");
    });
    it("exports CliError as a function (class)", () => {
        expect(barrel.CliError).toBeDefined();
        expect(typeof barrel.CliError).toBe("function");
    });
    it("exports evaluateReviewGate as a function", () => {
        expect(barrel.evaluateReviewGate).toBeDefined();
        expect(typeof barrel.evaluateReviewGate).toBe("function");
    });
    it("exports evaluateTestGate as a function", () => {
        expect(barrel.evaluateTestGate).toBeDefined();
        expect(typeof barrel.evaluateTestGate).toBe("function");
    });
    it("exports evaluateShipGate as a function", () => {
        expect(barrel.evaluateShipGate).toBeDefined();
        expect(typeof barrel.evaluateShipGate).toBe("function");
    });
});
// ---------------------------------------------------------------------------
// 2. Exported classes maintain correct identity (Requirement 10.1)
// ---------------------------------------------------------------------------
describe("barrel file exports maintain class identity", () => {
    it("CliError extends ForgeError", () => {
        const err = new barrel.CliError("test");
        expect(err).toBeInstanceOf(barrel.ForgeError);
        expect(err).toBeInstanceOf(Error);
    });
    it("evaluateReviewGate returns a GateResult-shaped object", () => {
        const result = barrel.evaluateReviewGate("");
        expect(result).toHaveProperty("status");
        expect(result).toHaveProperty("reason");
    });
    it("evaluateTestGate returns a GateResult-shaped object", () => {
        const result = barrel.evaluateTestGate("");
        expect(result).toHaveProperty("status");
        expect(result).toHaveProperty("reason");
    });
});
// ---------------------------------------------------------------------------
// 3. Internal modules are NOT re-exported (Requirement 10.3, 3.2)
// ---------------------------------------------------------------------------
describe("barrel file does not expose internal modules", () => {
    const exports = barrel;
    // Internal value exports from pua-engine.ts
    it("does not export determinePressureLevel (pua-engine internal)", () => {
        expect(exports.determinePressureLevel).toBeUndefined();
    });
    it("does not export selectMethodology (pua-engine internal)", () => {
        expect(exports.selectMethodology).toBeUndefined();
    });
    it("does not export getMethodologyChain (pua-engine internal)", () => {
        expect(exports.getMethodologyChain).toBeUndefined();
    });
    it("does not export advanceMethodology (pua-engine internal)", () => {
        expect(exports.advanceMethodology).toBeUndefined();
    });
    it("does not export detectFailurePattern (pua-engine internal)", () => {
        expect(exports.detectFailurePattern).toBeUndefined();
    });
    it("does not export buildPressurePrompt (pua-engine internal)", () => {
        expect(exports.buildPressurePrompt).toBeUndefined();
    });
    it("does not export getStallResponse (pua-engine internal)", () => {
        expect(exports.getStallResponse).toBeUndefined();
    });
    it("does not export SPINNING_JACCARD_THRESHOLD (pua-engine internal)", () => {
        expect(exports.SPINNING_JACCARD_THRESHOLD).toBeUndefined();
    });
    it("does not export MAX_SUMMARY_HISTORY (pua-engine internal)", () => {
        expect(exports.MAX_SUMMARY_HISTORY).toBeUndefined();
    });
    // Internal value exports from status-file-ext.ts
    it("does not export extractLoopFields (status-file-ext internal)", () => {
        expect(exports.extractLoopFields).toBeUndefined();
    });
    it("does not export writeLoopFields (status-file-ext internal)", () => {
        expect(exports.writeLoopFields).toBeUndefined();
    });
    it("does not export clearLoopFields (status-file-ext internal)", () => {
        expect(exports.clearLoopFields).toBeUndefined();
    });
    it("does not export extractPuaFields (status-file-ext internal)", () => {
        expect(exports.extractPuaFields).toBeUndefined();
    });
    it("does not export writePuaFields (status-file-ext internal)", () => {
        expect(exports.writePuaFields).toBeUndefined();
    });
    // Internal value exports from context-accumulator.ts
    it("does not export formatListSection (context-accumulator internal)", () => {
        expect(exports.formatListSection).toBeUndefined();
    });
    it("does not export formatIterationEntry (context-accumulator internal)", () => {
        expect(exports.formatIterationEntry).toBeUndefined();
    });
    it("does not export buildIterationPrompt (context-accumulator internal)", () => {
        expect(exports.buildIterationPrompt).toBeUndefined();
    });
    it("does not export buildSkillAwarePrompt (context-accumulator internal)", () => {
        expect(exports.buildSkillAwarePrompt).toBeUndefined();
    });
    // Removed internal modules (error-recovery, process, backlog, episode, branch)
    it("does not export parseGitLog (error-recovery internal)", () => {
        expect(exports.parseGitLog).toBeUndefined();
    });
    it("does not export classifyInterruption (error-recovery internal)", () => {
        expect(exports.classifyInterruption).toBeUndefined();
    });
    it("does not export ProcessRegistry (process-registry internal)", () => {
        expect(exports.ProcessRegistry).toBeUndefined();
    });
    it("does not export cleanupOrphans (orphan-detector internal)", () => {
        expect(exports.cleanupOrphans).toBeUndefined();
    });
    it("does not export parseBacklog (backlog internal)", () => {
        expect(exports.parseBacklog).toBeUndefined();
    });
    it("does not export renderEpisode (episode internal)", () => {
        expect(exports.renderEpisode).toBeUndefined();
    });
    it("does not export checkBranchTopicGate (branch-lifecycle retired)", () => {
        expect(exports.checkBranchTopicGate).toBeUndefined();
    });
    // Verify the total number of value exports
    it("has exactly 140 value exports", () => {
        const valueExports = Object.keys(exports).filter((key) => typeof exports[key] !== "undefined");
        expect(valueExports).toHaveLength(140);
        expect(valueExports.sort()).toEqual([
            "CLASSIFICATION_MAP",
            "CliError",
            "DEFAULT_SEVERITY",
            "FORBIDDEN_PLACEHOLDERS",
            "ForgeError",
            "GLOSSARY_BLOCK_POLICY",
            "INCREMENTAL_THRESHOLD",
            "THRESHOLD_MILESTONES",
            "TRACE_ID_PATTERN",
            "VALID_TRANSITIONS",
            "allEntriesVerified",
            "archiveTaskStatus",
            "buildCatalog",
            "buildCliSdkWorkerArgs",
            "buildFailureWorkerSummary",
            "buildSkipGateAnnotation",
            "buildSubagentInvocations",
            "buildSubagentWorkerInvocation",
            "buildVerificationCriteria",
            "canParseTestOutput",
            "checkContradictions",
            "checkFallbackLadderGate",
            "checkOrphanSolutions",
            "checkPlanStructure",
            "checkProgressGate",
            "checkReferenceIntegrity",
            "checkReviewFreshness",
            "checkReviewGate",
            "checkShipGate",
            "checkShipGateWithChecklist",
            "checkShipGateWithForceSkip",
            "checkShipGateWithFreshness",
            "checkSpecHealth",
            "checkTestGate",
            "checkVersionCompatibility",
            "classifySource",
            "classifyVerdict",
            "computeAmbiguityScore",
            "computeInputFilePaths",
            "computeSpecHash",
            "createChecklist",
            "deserializeContextBudgetReport",
            "deserializeExploreSummary",
            "deserializeGitDiff",
            "deserializeGitStatus",
            "deserializeReviewSummary",
            "deserializeSubagentSummary",
            "deserializeTestOutput",
            "detectPlanFormat",
            "detectRuntimeConfigDrift",
            "determineVerificationStrategy",
            "dispatchKnowledgeEvent",
            "evaluateFallbackLadder",
            "evaluateReviewGate",
            "evaluateShipGate",
            "evaluateTestGate",
            "extractHeadingAnchors",
            "formatInlineGrillInjection",
            "generateP1Fixlist",
            "generateTraceId",
            "getAdvisoryPath",
            "getMostRecentActiveTask",
            "hasTaskName",
            "hashCandidates",
            "hashEvent",
            "installSkill",
            "isCatalogStale",
            "isFixCandidate",
            "isMultiTaskMode",
            "isThrottled",
            "isValidTraceId",
            "isValidTransition",
            "lintKnowledgeIntegrity",
            "listActiveTasks",
            "loadSkillsFromDir",
            "mergeSkillLists",
            "migrateToMultiTask",
            "normalizeInput",
            "normalizeWorkerSummary",
            "parseChecklist",
            "parseEvolvedRulesSummary",
            "parseFailureSummary",
            "parseFixRecoveryGitLog",
            "parseHealthCache",
            "parseP1Fixlist",
            "parseReviewConfig",
            "parseSolutionFrontmatter",
            "parseStatusEntries",
            "persistGateResults",
            "readTaskStatus",
            "reconstructStateFromGit",
            "recordForceSkip",
            "removeTaskEntry",
            "renderBranchGateAdvisory",
            "renderBranchGatePrompt",
            "renderCatalog",
            "renderGlossaryAdvisory",
            "renderGlossaryConflictPrompt",
            "renderInlineGrillAdvisory",
            "renderInlineGrillConfirmPrompt",
            "renderPendingAdvisoryNotice",
            "renderSpecHealthAdvisory",
            "repairRuntimeConfig",
            "resolveStatusPath",
            "runAllGates",
            "runBranchGate",
            "runCliSdkWorker",
            "runGlossaryCheck",
            "runSubagentWorker",
            "runSubagentsInParallel",
            "runSubagentsWithConcurrency",
            "scanForPlaceholders",
            "serializeChecklist",
            "serializeContextBudgetReport",
            "serializeExploreResult",
            "serializeExploreSummary",
            "serializeGitDiff",
            "serializeGitStatus",
            "serializeReviewSummary",
            "serializeStatusEntries",
            "serializeSubagentSummary",
            "serializeTestOutput",
            "shouldRecompute",
            "shouldTriggerEpisodeThreshold",
            "shouldTriggerInlineGrill",
            "slugify",
            "updateEntryStatus",
            "updateFixlistWithCommits",
            "upsertTaskEntry",
            "validateAtomicTask",
            "validateDependencies",
            "validateDesignReferences",
            "validateLightweightPlan",
            "validateLightweightTask",
            "validateManifest",
            "validatePlan",
            "validatePlanTasks",
            "validateSkipGateOptions",
            "validateSpecLocked",
            "writeTaskStatus",
        ]);
    });
});
// ---------------------------------------------------------------------------
// 4. Deprecated re-exports still accessible (backward compatibility)
// ---------------------------------------------------------------------------
describe("deprecated re-exports provide backward compatibility", () => {
    const dep = deprecated;
    it("re-exports parseGitLog from error-recovery", () => {
        expect(dep.parseGitLog).toBeDefined();
        expect(typeof dep.parseGitLog).toBe("function");
    });
    it("re-exports ProcessRegistry from process-registry", () => {
        expect(dep.ProcessRegistry).toBeDefined();
        expect(typeof dep.ProcessRegistry).toBe("function");
    });
    it("re-exports cleanupOrphans from orphan-detector", () => {
        expect(dep.cleanupOrphans).toBeDefined();
        expect(typeof dep.cleanupOrphans).toBe("function");
    });
    it("re-exports parseBacklog from backlog", () => {
        expect(dep.parseBacklog).toBeDefined();
        expect(typeof dep.parseBacklog).toBe("function");
    });
    it("re-exports renderEpisode from episode", () => {
        expect(dep.renderEpisode).toBeDefined();
        expect(typeof dep.renderEpisode).toBe("function");
    });
    it("branch-lifecycle exports retired (Wave 3)", () => {
        expect(dep.checkBranchTopicGate).toBeUndefined();
    });
});
//# sourceMappingURL=barrel-file.test.js.map