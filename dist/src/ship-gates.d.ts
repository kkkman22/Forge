/**
 * Ship gate I/O functions — file-system aware gate checks.
 *
 * These pure functions read from .forge/ directories and produce
 * structured GateResult objects. They complement the existing
 * checkShipGate() in ship.ts which operates on already-parsed inputs.
 *
 * **Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.4, 4.1, 4.2, 4.3, 4.4**
 */
import type { Methodology } from "./schemas/review-report.js";
/** Name of a specific gate. */
export type GateName = "review" | "test" | "progress";
/** Structured result of a single gate check. */
export interface GateResult {
    gate: GateName;
    passed: boolean;
    reason: string;
    details?: {
        p0Count?: number;
        p1Count?: number;
        untestedFiles?: string[];
        incompleteTasks?: string[];
    };
}
/** P1 Fix Checklist issue entry (JSON format). */
export interface P1FixlistEntry {
    id: string;
    title: string;
    file: string;
    line: number;
    fixCommit: string | null;
}
/** P1 Fix Checklist persisted to .forge/reviews/<run-id>-p1-fixlist.json. */
export interface P1Fixlist {
    runId: string;
    p1Issues: P1FixlistEntry[];
    allFixed: boolean;
}
/** Options for the skip-gate mechanism. */
export interface SkipGateOptions {
    skipGates: GateName[];
    skipAll: boolean;
    force: boolean;
    isInteractive: boolean;
}
/** Persisted gate results written to .forge/ship/<run-id>-gates.json. */
export interface ShipGateReport {
    runId: string;
    feature: string;
    timestamp: string;
    gates: GateResult[];
    allPassed: boolean;
    skipGate: string | null;
}
/**
 * Check the review gate by scanning .forge/reviews/ for the latest report.
 *
 * Flow:
 *   1. Find latest review report in reviewDir
 *   2. Parse P0/P1 counts from frontmatter
 *   3. Check methodology — if "unavailable", block (HARD-GATE)
 *   4. If P0 count > 0, block
 *   5. If P1 count > 0, look for p1-fixlist.json
 *   6. For each unfixed P1 in fixlist, search git log for [fix P1] commits
 *   7. All P1 fixed (or no P1) → passed
 *
 * @param reviewDir - Path to .forge/reviews/
 * @param _latestCommitHash - Current HEAD commit hash (reserved for freshness check)
 * @param gitLogFn - Optional function to search git log for fix commits
 */
export declare function checkReviewGate(reviewDir: string, _latestCommitHash: string, gitLogFn?: (file: string) => string[]): GateResult;
/**
 * Check the test gate by reading .forge/test-results/.
 *
 * Looks for the latest test result file. If it contains passing indicators,
 * the gate passes. If configCICheck is provided, it is noted but the actual
 * execution is left to the caller (to keep this function pure/synchronous).
 *
 * @param testResultsDir - Path to .forge/test-results/
 * @param configCICheck - Optional CI check command from config.md
 */
export declare function checkTestGate(testResultsDir: string, configCICheck?: string): GateResult;
/**
 * Check the progress gate by reading .forge/progress/<feature>.md.
 *
 * Per design:
 *   - All tasks completed → passed
 *   - Has in_progress tasks → passed + warning (non-blocking)
 *   - No progress file → passed + warning (lightweight path)
 *
 * @param progressDir - Path to .forge/progress/
 * @param featureName - Name of the current feature
 */
export declare function checkProgressGate(progressDir: string, featureName: string): GateResult;
/**
 * Parse P1 fixlist from JSON content.
 *
 * Validates the structure: runId (string), p1Issues (array of entries),
 * allFixed (boolean). Returns null for invalid input.
 */
export declare function parseP1Fixlist(content: string): P1Fixlist | null;
/**
 * Generate a P1 fixlist from review findings.
 *
 * Filters to P1 severity only, assigns sequential IDs (P1-001, P1-002, ...),
 * and sets all fixCommit to null (unfixed by default).
 */
export declare function generateP1Fixlist(runId: string, findings: Array<{
    severity: string;
    filePath: string;
    lineNumber: number;
    description: string;
}>): P1Fixlist;
/**
 * Update P1 fixlist with discovered fix commits.
 *
 * For each P1 issue with fixCommit=null, searches git log via gitLogFn
 * for commits matching the pattern [fix P1] in the relevant file.
 */
export declare function updateFixlistWithCommits(fixlist: P1Fixlist, gitLogFn: (file: string) => string[]): P1Fixlist;
/**
 * L0-L3 fallback ladder level conditions.
 */
export interface FallbackLadderConditions {
    /** L0: Interactive mode */
    isInteractive: boolean;
    /** L0: CLAUDE_CODE_WORKFLOWS=1 */
    workflowsEnvSet: boolean;
    /** L0: tengu_workflows_enabled gate ON */
    workflowsEnabled: boolean;
    /** L0: workflow file exists */
    workflowFileExists: boolean;
    /** L0: node --check passes */
    workflowSyntaxValid: boolean;
    /** L0: concurrency bridge available */
    concurrencyBridgeAvailable: boolean;
    /** L1+: subagent available (for L1/L2) */
    subagentAvailable: boolean;
}
/**
 * Evaluate the fallback ladder and return the resulting methodology.
 *
 * L0: All conditions met → workflow
 * L1: Any L0 condition fails + subagent available → subagent-parallel
 * L2: Subagent available but serial only → subagent-serial
 * L3: All levels unavailable → unavailable
 */
export declare function evaluateFallbackLadder(conditions: FallbackLadderConditions): {
    level: "L0" | "L1" | "L2" | "L3";
    methodology: Methodology;
};
/**
 * Check whether the fallback ladder state should block ship.
 *
 * L0 (workflow), L1 (subagent-parallel), L2 (subagent-serial), L2-ci (ci-evidence) -> passed.
 * L3 (unavailable) -> blocked with HARD-GATE message.
 */
export declare function checkFallbackLadderGate(methodology: Methodology): GateResult;
/**
 * Persist gate results to .forge/ship/<run-id>-gates.json.
 *
 * Creates the directory if it does not exist.
 */
export declare function persistGateResults(report: ShipGateReport, shipDir: string): void;
/**
 * Validate --skip-gate options.
 *
 * Rules:
 *   - --skip-gate=all in interactive mode → always error
 *   - --skip-gate=all requires --force
 *   - Specific gate skips are always valid
 *
 * Returns an error string if invalid, or null if valid.
 */
export declare function validateSkipGateOptions(options: SkipGateOptions): string | null;
/**
 * Build skip-gate annotation for ship commit message.
 *
 * Format: [skip-gate: <gate-name> reason=<reason>]
 * For all: [skip-gate: all reason=<reason>]
 */
export declare function buildSkipGateAnnotation(options: SkipGateOptions): string;
export interface RunAllGatesInput {
    reviewDir: string;
    testResultsDir: string;
    progressDir: string;
    featureName: string;
    latestCommitHash: string;
    methodology?: Methodology;
    configCICheck?: string;
    gitLogFn?: (file: string) => string[];
    skipOptions?: SkipGateOptions;
}
/**
 * Run all three gates in sequence: Review -> Test -> Progress.
 *
 * Applies skip-gate options. Returns ShipGateReport suitable for
 * persistence via persistGateResults.
 *
 * Returns early if a blocking gate fails (review or test).
 * Progress gate is non-blocking (warnings only).
 */
export declare function runAllGates(input: RunAllGatesInput): ShipGateReport;
