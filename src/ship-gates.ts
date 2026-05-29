/**
 * Ship gate I/O functions — file-system aware gate checks.
 *
 * These pure functions read from .forge/ directories and produce
 * structured GateResult objects. They complement the existing
 * checkShipGate() in ship.ts which operates on already-parsed inputs.
 *
 * **Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.3, 4.4**
 */

import type { Methodology } from "./schemas/review-report.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Signature declarations — implementations follow in Tasks 3-9
// ---------------------------------------------------------------------------

/**
 * Check the review gate by scanning .forge/reviews/ for the latest report.
 *
 * Returns GateResult with passed=true only when:
 *   - A review report exists
 *   - No P0/P1 issues remain (or all have fix commits per fixlist)
 *   - Methodology is not "unavailable"
 *
 * @param reviewDir - Path to .forge/reviews/
 * @param latestCommitHash - Current HEAD commit hash
 * @param gitLogFn - Optional function to search git log for fix commits
 */
export function checkReviewGate(
  _reviewDir: string,
  _latestCommitHash: string,
  _gitLogFn?: (file: string) => string[],
): GateResult {
  return { gate: "review", passed: false, reason: "not implemented" };
}

/**
 * Check the test gate by reading .forge/test-results/.
 *
 * Returns GateResult with passed=true only when:
 *   - Test results exist and show all tests passing
 *
 * @param testResultsDir - Path to .forge/test-results/
 * @param configCICheck - Optional CI check command from config.md
 */
export function checkTestGate(
  _testResultsDir: string,
  _configCICheck?: string,
): GateResult {
  return { gate: "test", passed: false, reason: "not implemented" };
}

/**
 * Check the progress gate by reading .forge/progress/<feature>.md.
 *
 * Returns GateResult with passed=true when:
 *   - All tasks are completed
 *   - Or no progress file exists (lightweight path — warning only)
 *
 * @param progressDir - Path to .forge/progress/
 * @param featureName - Name of the current feature
 */
export function checkProgressGate(
  _progressDir: string,
  _featureName: string,
): GateResult {
  return { gate: "progress", passed: false, reason: "not implemented" };
}

/**
 * Validate --skip-gate options.
 *
 * Returns an error string if invalid, or null if valid.
 */
export function validateSkipGateOptions(_options: SkipGateOptions): string | null {
  return null;
}

/**
 * Build skip-gate annotation for ship commit message.
 */
export function buildSkipGateAnnotation(_options: SkipGateOptions): string {
  return "";
}

/**
 * Persist gate results to .forge/ship/<run-id>-gates.json.
 */
export function persistGateResults(_report: ShipGateReport, _shipDir: string): void {
  // Task 8 implementation
}

/**
 * Parse P1 fixlist from JSON content.
 */
export function parseP1Fixlist(_content: string): P1Fixlist | null {
  return null;
}

/**
 * Update P1 fixlist with discovered fix commits.
 */
export function updateFixlistWithCommits(
  fixlist: P1Fixlist,
  _gitLogFn: (file: string) => string[],
): P1Fixlist {
  return fixlist;
}

/**
 * Check whether the fallback ladder L3 state should block ship.
 *
 * HARD-GATE: main agent must never substitute for review at L3.
 */
export function checkFallbackLadderGate(_methodology: Methodology): GateResult {
  return { gate: "review", passed: false, reason: "not implemented" };
}
