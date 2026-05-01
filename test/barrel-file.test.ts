/**
 * Unit tests for the public API barrel file (`src/index.ts`).
 *
 * Verifies that:
 * - All expected public value exports are accessible via the barrel file
 * - Value exports are the correct type (class/function)
 * - Internal modules are NOT re-exported through the barrel file
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
 */

import { describe, expect, it } from "vitest";

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

  it("exports SdkDriver as a function (class)", () => {
    expect(barrel.SdkDriver).toBeDefined();
    expect(typeof barrel.SdkDriver).toBe("function");
  });

  it("exports SdkAgentAdapter as a function (class)", () => {
    expect(barrel.SdkAgentAdapter).toBeDefined();
    expect(typeof barrel.SdkAgentAdapter).toBe("function");
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
// 3. Internal modules are NOT re-exported (Requirement 10.3)
// ---------------------------------------------------------------------------

describe("barrel file does not expose internal modules", () => {
  // Cast to Record<string, unknown> to check for unexpected keys at runtime.
  const exports = barrel as unknown as Record<string, unknown>;

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

  // Verify the total number of value exports is exactly what we expect.
  // This catches any accidental additions to the barrel file.
  it("has exactly 100 value exports", () => {
    const valueExports = Object.keys(exports).filter((key) => typeof exports[key] !== "undefined");
    expect(valueExports).toHaveLength(100);
    expect(valueExports.sort()).toEqual([
      "CLASSIFICATION_MAP",
      "CliError",
      "FORBIDDEN_PLACEHOLDERS",
      "ForgeError",
      "INCREMENTAL_THRESHOLD",
      "PHASE_SEQUENCES",
      "ProcessRegistry",
      "SdkAgentAdapter",
      "SdkDriver",
      "TEST_FILE_PATTERNS",
      "VALID_TRANSITIONS",
      "allEntriesVerified",
      "buildReconciliationPatch",
      "buildRecoveryReport",
      "buildSubagentInvocations",
      "buildVerificationCriteria",
      "calculateSegmentation",
      "canParseTestOutput",
      "checkBranchTopicGate",
      "checkCommitTopicMatch",
      "checkReviewFreshness",
      "checkShipGate",
      "checkShipGateWithChecklist",
      "classifyInterruption",
      "classifySource",
      "cleanupOrphans",
      "cleanupStaleSessions",
      "createChecklist",
      "deletePidFile",
      "deserializeCheckpointMarker",
      "deserializeClassification",
      "deserializeContextBudgetReport",
      "deserializeExploreSummary",
      "deserializeGitDiff",
      "deserializeGitStatus",
      "deserializeRecoveryReport",
      "deserializeReviewSummary",
      "deserializeSubagentSummary",
      "deserializeTestOutput",
      "detectPlanFormat",
      "detectPpidOrphans",
      "detectStaleBranches",
      "detectUnshippedBranches",
      "determineVerificationStrategy",
      "evaluateReviewGate",
      "evaluateShipGate",
      "evaluateTestGate",
      "extractBranchTopic",
      "extractCommitPatterns",
      "extractHeadingAnchors",
      "filterCommitsSince",
      "findDependencyGaps",
      "findPhaseInconsistencies",
      "findProgressInconsistencies",
      "getDescendants",
      "getNextPhase",
      "getPhaseSequence",
      "hasTaskName",
      "inferTDDPhase",
      "isFixCandidate",
      "isTestFile",
      "isValidTransition",
      "killProcessGroup",
      "killProcessTree",
      "matchChangesToTask",
      "matchCommitsToTasks",
      "parseChecklist",
      "parseFixRecoveryGitLog",
      "parseGitLog",
      "parseGitStatus",
      "parseStatusEntries",
      "readPidFile",
      "recordPendingDelivery",
      "removeTaskEntry",
      "runSubagentsInParallel",
      "scanForPlaceholders",
      "serializeChecklist",
      "serializeCheckpointMarker",
      "serializeClassification",
      "serializeContextBudgetReport",
      "serializeExploreResult",
      "serializeExploreSummary",
      "serializeGitDiff",
      "serializeGitStatus",
      "serializeRecoveryReport",
      "serializeReviewSummary",
      "serializeStatusEntries",
      "serializeSubagentSummary",
      "serializeTestOutput",
      "updateEntryStatus",
      "upsertTaskEntry",
      "validateAtomicTask",
      "validateDependencies",
      "validateDesignReferences",
      "validateLightweightPlan",
      "validateLightweightTask",
      "validatePlan",
      "validatePlanTasks",
      "validateSpecLocked",
      "writePidFile",
    ]);
  });
});
