/**
 * Ship gate I/O functions — file-system aware gate checks.
 *
 * These pure functions read from .forge/ directories and produce
 * structured GateResult objects. They complement the existing
 * checkShipGate() in ship.ts which operates on already-parsed inputs.
 *
 * **Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.4, 4.1, 4.2, 4.3, 4.4**
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type EvidenceArtifact,
  type EvidenceArtifactKind,
  isArtifactFreshForCommit,
  queryEvidenceArtifacts,
  writeEvidenceArtifact,
} from "./evidence-artifact.js";
import type { Methodology } from "./schemas/review-report.js";
import { getPolicyGateRequirements, type PolicyProfile } from "./workflow-graph.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Name of a specific gate. */
export type GateName = "review" | "test" | "progress" | "policy";

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

export interface PersistGateResultsOptions {
  projectRoot?: string;
  commit?: string;
  producer?: string;
  command?: string;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  createdAt?: string;
}

export interface PersistGateResultsResult {
  reportPath: string;
  artifactPath?: string;
  artifactError?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ParsedReviewReport {
  p0Count: number;
  p1Count: number;
  methodology: Methodology;
  result: string;
}

/**
 * Extract frontmatter fields from review report content.
 */
function parseReviewReportFrontmatter(content: string): ParsedReviewReport | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const fmText = match[1];
  const p0Match = fmText.match(/^p0_count:\s*(\d+)/m);
  const p1Match = fmText.match(/^p1_count:\s*(\d+)/m);
  const methodMatch = fmText.match(/^methodology:\s*(\S+)/m);
  const resultMatch = fmText.match(/^result:\s*(\S+)/m);

  if (!p0Match && !p1Match && !methodMatch && !resultMatch) return null;

  const p0Count = p0Match ? Number.parseInt(p0Match[1], 10) : 0;
  const p1Count = p1Match ? Number.parseInt(p1Match[1], 10) : 0;
  const methodRaw = methodMatch?.[1] ?? "subagent-parallel";
  const methodology = isValidMethodology(methodRaw) ? methodRaw : "subagent-parallel";

  return { p0Count, p1Count, methodology, result: resultMatch?.[1] ?? "incomplete" };
}

const VALID_METHODOLOGIES: readonly string[] = [
  "saved-workflow",
  "subagent-parallel",
  "subagent-serial",
  "ci-evidence",
  "unavailable",
] as const;

function isValidMethodology(value: string): value is Methodology {
  return (VALID_METHODOLOGIES as readonly string[]).includes(value);
}

/**
 * Find the most recently modified .md file in a directory.
 */
function findLatestFile(dir: string, suffix: string): string | null {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch (_err: unknown) {
    return null;
  }

  const matching = files.filter((f) => f.endsWith(suffix));
  if (matching.length === 0) return null;

  // Sort by name descending (assuming ISO date prefix in filenames)
  matching.sort().reverse();
  return join(dir, matching[0]);
}

/**
 * Parse P1 fixlist from JSON string.
 */
function safeParseP1Fixlist(content: string): P1Fixlist | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    if (typeof obj.runId !== "string" || obj.runId.length === 0) return null;
    if (!Array.isArray(obj.p1Issues)) return null;

    for (const issue of obj.p1Issues) {
      if (typeof issue !== "object" || issue === null) return null;
      const i = issue as Record<string, unknown>;
      if (typeof i.id !== "string" || typeof i.title !== "string") return null;
      if (typeof i.file !== "string" || typeof i.line !== "number") return null;
      // fixCommit can be null or string
      if (i.fixCommit !== null && typeof i.fixCommit !== "string") return null;
    }

    return {
      runId: obj.runId,
      p1Issues: obj.p1Issues as P1FixlistEntry[],
      allFixed: typeof obj.allFixed === "boolean" ? obj.allFixed : false,
    };
  } catch (_err: unknown) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Task 3: checkReviewGate (GREEN)
// ---------------------------------------------------------------------------

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
export function checkReviewGate(
  reviewDir: string,
  _latestCommitHash: string,
  gitLogFn?: (file: string) => string[],
): GateResult {
  // Step 1: Find latest review report
  const reportPath = findLatestFile(reviewDir, ".md");
  if (!reportPath) {
    return {
      gate: "review",
      passed: false,
      reason: "No review report found in .forge/reviews/. Run /forge review first.",
    };
  }

  // Step 2: Parse report
  let content: string;
  try {
    content = readFileSync(reportPath, "utf-8");
  } catch (_err: unknown) {
    return {
      gate: "review",
      passed: false,
      reason: `Failed to read review report: ${reportPath}`,
    };
  }

  const report = parseReviewReportFrontmatter(content);
  if (!report) {
    return {
      gate: "review",
      passed: false,
      reason: `Failed to parse review report frontmatter: ${reportPath}`,
    };
  }

  // Step 3: Methodology check (HARD-GATE)
  if (report.methodology === "unavailable") {
    return {
      gate: "review",
      passed: false,
      reason:
        "Review unavailable: methodology=unavailable (L3 fallback ladder exhausted). HARD-GATE: main agent must not substitute for review.",
      details: { p0Count: report.p0Count, p1Count: report.p1Count },
    };
  }

  // Step 4: P0 check
  if (report.p0Count > 0) {
    return {
      gate: "review",
      passed: false,
      reason: `Review has ${report.p0Count} P0 issue(s). P0 blocks ship.`,
      details: { p0Count: report.p0Count, p1Count: report.p1Count },
    };
  }

  // Step 5-6: P1 check with fixlist
  if (report.p1Count > 0) {
    // Look for fixlist
    const fixlistPath = findLatestFile(reviewDir, "-p1-fixlist.json");
    if (fixlistPath) {
      try {
        const fixlistContent = readFileSync(fixlistPath, "utf-8");
        const fixlist = safeParseP1Fixlist(fixlistContent);

        if (fixlist && gitLogFn) {
          const updated = updateFixlistWithCommits(fixlist, gitLogFn);
          if (updated.allFixed) {
            return {
              gate: "review",
              passed: true,
              reason: `All ${report.p1Count} P1 issue(s) have fix commits.`,
              details: { p0Count: 0, p1Count: report.p1Count },
            };
          }
          const unfixed = updated.p1Issues.filter((i) => i.fixCommit === null);
          return {
            gate: "review",
            passed: false,
            reason: `${unfixed.length} P1 issue(s) still unfixed: ${unfixed.map((i) => i.id).join(", ")}`,
            details: { p0Count: 0, p1Count: unfixed.length },
          };
        }

        if (fixlist?.allFixed) {
          return {
            gate: "review",
            passed: true,
            reason: `All ${report.p1Count} P1 issue(s) marked as fixed in fixlist.`,
            details: { p0Count: 0, p1Count: report.p1Count },
          };
        }
      } catch (_err: unknown) {
        // fixlist unreadable — fall through to default P1 block
      }
    }

    return {
      gate: "review",
      passed: false,
      reason: `Review has ${report.p1Count} P1 issue(s). Run /forge review and fix all P1 issues before shipping.`,
      details: { p0Count: 0, p1Count: report.p1Count },
    };
  }

  // All clear
  return {
    gate: "review",
    passed: true,
    reason: "Review passed: no P0/P1 issues.",
    details: { p0Count: 0, p1Count: 0 },
  };
}

// ---------------------------------------------------------------------------
// Task 4: checkTestGate (GREEN)
// ---------------------------------------------------------------------------

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
export function checkTestGate(testResultsDir: string, configCICheck?: string): GateResult {
  // Find latest test result
  let files: string[];
  try {
    files = readdirSync(testResultsDir);
  } catch (_err: unknown) {
    return {
      gate: "test",
      passed: false,
      reason: "No test results directory found. Run tests first.",
    };
  }

  const resultFiles = files.filter(
    (f) => f.endsWith(".json") || f.endsWith(".md") || f.endsWith(".txt"),
  );
  if (resultFiles.length === 0) {
    return {
      gate: "test",
      passed: false,
      reason: "No test results found in .forge/test-results/. Run tests first.",
    };
  }

  // Sort by name descending (ISO date prefix)
  resultFiles.sort().reverse();
  const latestPath = join(testResultsDir, resultFiles[0]);

  let content: string;
  try {
    content = readFileSync(latestPath, "utf-8");
  } catch (_err: unknown) {
    return {
      gate: "test",
      passed: false,
      reason: `Failed to read test results: ${latestPath}`,
    };
  }

  // Check for failure indicators in content
  const lower = content.toLowerCase();
  const hasFailure =
    lower.includes('"passed": false') ||
    lower.includes('"passed":false') ||
    lower.includes('"status": "failed"') ||
    lower.includes('"status":"failed"') ||
    lower.includes("test failed") ||
    lower.includes("tests failed") ||
    (lower.includes("failures:") &&
      !lower.includes("failures: 0") &&
      !lower.includes("failures:0"));

  const hasPass =
    lower.includes('"passed": true') ||
    lower.includes('"passed":true') ||
    lower.includes('"status": "passed"') ||
    lower.includes('"status":"passed"') ||
    lower.includes("all tests passed") ||
    (lower.includes("pass") && !hasFailure);

  if (hasFailure) {
    return {
      gate: "test",
      passed: false,
      reason: "Tests failed. Fix failing tests before shipping.",
      details: { untestedFiles: [] },
    };
  }

  if (hasPass) {
    const ciNote = configCICheck ? ` (CI check: ${configCICheck})` : "";
    return {
      gate: "test",
      passed: true,
      reason: `All tests passing.${ciNote}`,
      details: { untestedFiles: [] },
    };
  }

  // Unclear result — conservatively block
  return {
    gate: "test",
    passed: false,
    reason: `Could not determine test status from: ${latestPath}`,
    details: { untestedFiles: [] },
  };
}

export function checkPolicyProfileArtifactGate(
  projectRoot: string,
  topic: string,
  currentHead: string,
  policyProfile: PolicyProfile,
): GateResult {
  const requiredKinds = requiredArtifactKinds(policyProfile);
  const failures: string[] = [];

  for (const kind of requiredKinds) {
    const latest = queryEvidenceArtifacts(projectRoot, { topic, kind })[0];
    if (!latest) {
      failures.push(`required ${kind} artifact is missing`);
      continue;
    }
    if (latest.result !== "pass") {
      failures.push(`latest ${kind} artifact result is ${latest.result}`);
    }
    const freshness = isArtifactFreshForCommit(latest, currentHead);
    if (!freshness.fresh) {
      failures.push(freshness.reason);
    }
  }

  if (failures.length > 0) {
    return {
      gate: "policy",
      passed: false,
      reason: failures.join("; "),
      details: { incompleteTasks: failures },
    };
  }

  return {
    gate: "policy",
    passed: true,
    reason: `${policyProfile} policy artifact requirements satisfied.`,
  };
}

function requiredArtifactKinds(policyProfile: PolicyProfile): EvidenceArtifactKind[] {
  const gates = getPolicyGateRequirements(policyProfile, "ship");
  const requiredKinds: EvidenceArtifactKind[] = [];
  if (gates.review === "basic" || gates.review === "required" || gates.review === "full") {
    requiredKinds.push("review");
  }
  if (gates.test === "required" || gates.test === "full") {
    requiredKinds.push("test");
  }
  if (gates.mutation === "required" || gates.mutation === "full") {
    requiredKinds.push("mutation");
  }
  return requiredKinds;
}

// ---------------------------------------------------------------------------
// Task 5: checkProgressGate (GREEN)
// ---------------------------------------------------------------------------

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
export function checkProgressGate(progressDir: string, featureName: string): GateResult {
  const progressFile = join(progressDir, `${featureName}.md`);

  let content: string;
  try {
    content = readFileSync(progressFile, "utf-8");
  } catch (_err: unknown) {
    // No progress file — lightweight path, pass with warning
    return {
      gate: "progress",
      passed: true,
      reason: "No progress file found (lightweight path). Progress gate skipped.",
    };
  }

  // Parse task status from markdown checkboxes: - [ ] / - [x]
  const allTasks = content.match(/- \[[ x]\]/g) ?? [];
  const incompleteTasks = content.match(/- \[ \]/g) ?? [];

  if (allTasks.length === 0) {
    return {
      gate: "progress",
      passed: true,
      reason: "No tasks found in progress file.",
    };
  }

  const incompleteNames: string[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^- \[ \]/)) {
      // Extract task name from the checkbox line
      const taskName = line.replace(/^- \[ \]\s*/, "").trim();
      if (taskName.length > 0) {
        incompleteNames.push(taskName.slice(0, 80));
      }
    }
  }

  if (incompleteTasks.length === 0) {
    return {
      gate: "progress",
      passed: true,
      reason: `All ${allTasks.length} tasks completed.`,
      details: { incompleteTasks: [] },
    };
  }

  // Incomplete tasks — warning only (non-blocking per design D2)
  const taskList = incompleteNames.slice(0, 5).join(", ");
  const suffix = incompleteNames.length > 5 ? ` (+${incompleteNames.length - 5} more)` : "";
  return {
    gate: "progress",
    passed: true,
    reason: `Warning: ${incompleteTasks.length}/${allTasks.length} tasks still in progress: ${taskList}${suffix}`,
    details: { incompleteTasks: incompleteNames },
  };
}

// ---------------------------------------------------------------------------
// Task 6: P1 Fix Checklist functions (GREEN)
// ---------------------------------------------------------------------------

/**
 * Parse P1 fixlist from JSON content.
 *
 * Validates the structure: runId (string), p1Issues (array of entries),
 * allFixed (boolean). Returns null for invalid input.
 */
export function parseP1Fixlist(content: string): P1Fixlist | null {
  return safeParseP1Fixlist(content);
}

/**
 * Generate a P1 fixlist from review findings.
 *
 * Filters to P1 severity only, assigns sequential IDs (P1-001, P1-002, ...),
 * and sets all fixCommit to null (unfixed by default).
 */
export function generateP1Fixlist(
  runId: string,
  findings: Array<{
    severity: string;
    filePath: string;
    lineNumber: number;
    description: string;
  }>,
): P1Fixlist {
  const p1Issues: P1FixlistEntry[] = findings
    .filter((f) => f.severity === "P1")
    .map((f, i) => ({
      id: `P1-${String(i + 1).padStart(3, "0")}`,
      title: f.description,
      file: f.filePath,
      line: f.lineNumber,
      fixCommit: null,
    }));

  return {
    runId,
    p1Issues,
    allFixed: p1Issues.length === 0,
  };
}

/**
 * Update P1 fixlist with discovered fix commits.
 *
 * For each P1 issue with fixCommit=null, searches git log via gitLogFn
 * for commits matching the pattern [fix P1] in the relevant file.
 */
export function updateFixlistWithCommits(
  fixlist: P1Fixlist,
  gitLogFn: (file: string) => string[],
): P1Fixlist {
  const updatedIssues = fixlist.p1Issues.map((issue) => {
    if (issue.fixCommit !== null) return issue;

    const logLines = gitLogFn(issue.file);
    for (const line of logLines) {
      // Match pattern: <hash> [fix P1] ...
      const m = line.match(/^([a-f0-9]+)\s+\[fix P1\]/);
      if (m) {
        return { ...issue, fixCommit: m[1] };
      }
    }
    return issue;
  });

  const allFixed = updatedIssues.every((i) => i.fixCommit !== null);
  return { ...fixlist, p1Issues: updatedIssues, allFixed };
}

// ---------------------------------------------------------------------------
// Task 7: Fallback Ladder gate check (GREEN)
// ---------------------------------------------------------------------------

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
export function evaluateFallbackLadder(conditions: FallbackLadderConditions): {
  level: "L0" | "L1" | "L2" | "L3";
  methodology: Methodology;
} {
  // L0 check
  const l0Met =
    conditions.isInteractive &&
    conditions.workflowsEnvSet &&
    conditions.workflowsEnabled &&
    conditions.workflowFileExists &&
    conditions.workflowSyntaxValid &&
    conditions.concurrencyBridgeAvailable;

  if (l0Met) {
    return { level: "L0", methodology: "saved-workflow" };
  }

  // L1/L2: subagent available
  if (conditions.subagentAvailable) {
    // Distinguish L1 (parallel) from L2 (serial) based on concurrency
    if (conditions.concurrencyBridgeAvailable) {
      return { level: "L1", methodology: "subagent-parallel" };
    }
    return { level: "L2", methodology: "subagent-serial" };
  }

  // L3: all exhausted
  return { level: "L3", methodology: "unavailable" };
}

/**
 * Check whether the fallback ladder state should block ship.
 *
 * L0 (workflow), L1 (subagent-parallel), L2 (subagent-serial), L2-ci (ci-evidence) -> passed.
 * L3 (unavailable) -> blocked with HARD-GATE message.
 */
export function checkFallbackLadderGate(methodology: Methodology): GateResult {
  if (methodology === "unavailable") {
    return {
      gate: "review",
      passed: false,
      reason:
        "Review unavailable: methodology=unavailable. HARD-GATE (L3): all review paths (L0+L1+L2) exhausted. Main agent must NOT substitute for review. Ship is blocked.",
    };
  }

  return {
    gate: "review",
    passed: true,
    reason: `Review produced via ${methodology}.`,
  };
}

// ---------------------------------------------------------------------------
// Task 8: Gate result persistence (GREEN)
// ---------------------------------------------------------------------------

/**
 * Persist gate results to .forge/ship/<run-id>-gates.json.
 *
 * Creates the directory if it does not exist.
 */
export function persistGateResults(
  report: ShipGateReport,
  shipDir: string,
  options: PersistGateResultsOptions = {},
): PersistGateResultsResult {
  mkdirSync(shipDir, { recursive: true });
  const filePath = join(shipDir, `${report.runId}-gates.json`);
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  const projectRoot = options.projectRoot ?? inferProjectRootFromShipDir(shipDir);
  if (!projectRoot) {
    return { reportPath: filePath };
  }

  const artifactId = `${report.runId}-ship-gate`;
  const artifact: EvidenceArtifact = {
    schema_version: 1,
    artifact_id: artifactId,
    kind: "ship_gate",
    topic: report.feature,
    run_id: report.runId,
    commit: options.commit ?? "unknown",
    result: report.allPassed ? "pass" : "blocked",
    producer: options.producer ?? "forge-ship",
    created_at: options.createdAt ?? report.timestamp,
  };
  if (options.command !== undefined) artifact.command = options.command;
  if (options.exitCode !== undefined) artifact.exit_code = options.exitCode;
  if (options.stdoutTail !== undefined) artifact.stdout_tail = options.stdoutTail;
  if (options.stderrTail !== undefined) artifact.stderr_tail = options.stderrTail;

  const writeResult = writeEvidenceArtifact(projectRoot, artifact);

  if (!writeResult.ok) {
    return { reportPath: filePath, artifactError: writeResult.message };
  }

  return { reportPath: filePath, artifactPath: writeResult.path };
}

function inferProjectRootFromShipDir(shipDir: string): string | null {
  if (basename(shipDir) !== "ship") return null;
  const forgeDir = dirname(shipDir);
  if (basename(forgeDir) !== ".forge") return null;
  return dirname(forgeDir);
}

// ---------------------------------------------------------------------------
// Task 9: --skip-gate mechanism (GREEN)
// ---------------------------------------------------------------------------

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
export function validateSkipGateOptions(options: SkipGateOptions): string | null {
  if (options.skipAll) {
    if (options.isInteractive) {
      return "--skip-gate=all is not allowed in interactive mode. Skip gates individually.";
    }
    if (!options.force) {
      return "--skip-gate=all requires --force confirmation.";
    }
  }

  // Validate individual gate names
  const validGates: readonly string[] = ["review", "test", "progress"];
  for (const gate of options.skipGates) {
    if (!validGates.includes(gate)) {
      return `Invalid gate name: ${gate}. Valid gates: ${validGates.join(", ")}`;
    }
  }

  return null;
}

/**
 * Build skip-gate annotation for ship commit message.
 *
 * Format: [skip-gate: <gate-name> reason=<reason>]
 * For all: [skip-gate: all reason=<reason>]
 */
export function buildSkipGateAnnotation(options: SkipGateOptions): string {
  if (options.skipAll && options.force) {
    return "[skip-gate: all reason=forced-by-user]";
  }

  if (options.skipGates.length === 0) {
    return "";
  }

  const gates = options.skipGates.join(",");
  return `[skip-gate: ${gates} reason=individual-skip]`;
}

// ---------------------------------------------------------------------------
// Task 10: Gate orchestration — runAllGates
// ---------------------------------------------------------------------------

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
export function runAllGates(input: RunAllGatesInput): ShipGateReport {
  const runId = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
  const timestamp = new Date().toISOString();
  const gates: GateResult[] = [];
  let skipGate: string | null = null;

  const skipped = new Set<GateName>();
  if (input.skipOptions) {
    if (input.skipOptions.skipAll) {
      skipped.add("review");
      skipped.add("test");
      skipped.add("progress");
      skipGate = "all";
    }
    for (const g of input.skipOptions.skipGates) {
      skipped.add(g);
      if (!skipGate) skipGate = g;
    }
  }

  // Review gate (includes fallback ladder check)
  if (skipped.has("review")) {
    gates.push({
      gate: "review",
      passed: true,
      reason: "Skipped via --skip-gate=review.",
    });
  } else {
    // First check methodology (fallback ladder)
    if (input.methodology) {
      const ladderResult = checkFallbackLadderGate(input.methodology);
      if (!ladderResult.passed) {
        gates.push(ladderResult);
      } else {
        gates.push(checkReviewGate(input.reviewDir, input.latestCommitHash, input.gitLogFn));
      }
    } else {
      gates.push(checkReviewGate(input.reviewDir, input.latestCommitHash, input.gitLogFn));
    }
  }

  // Test gate
  if (skipped.has("test")) {
    gates.push({
      gate: "test",
      passed: true,
      reason: "Skipped via --skip-gate=test.",
    });
  } else {
    gates.push(checkTestGate(input.testResultsDir, input.configCICheck));
  }

  // Progress gate (non-blocking)
  if (skipped.has("progress")) {
    gates.push({
      gate: "progress",
      passed: true,
      reason: "Skipped via --skip-gate=progress.",
    });
  } else {
    gates.push(checkProgressGate(input.progressDir, input.featureName));
  }

  const blockingGates = gates.filter((g) => !g.passed && g.gate !== "progress");
  const allPassed = blockingGates.length === 0;

  return {
    runId,
    feature: input.featureName,
    timestamp,
    gates,
    allPassed,
    skipGate,
  };
}

// ---------------------------------------------------------------------------
// Package completion gate
// ---------------------------------------------------------------------------

export interface PackageCompletionInput {
  executionPackages: Array<{ id: string; tasks: string[] }>;
  completedPackages: string[];
  severity?: "block" | "warn";
}

/**
 * Check that all execution packages are complete before feature-scoped ship.
 * Package-scoped review/test may still use this with severity="warn".
 */
export function checkPackageCompletionGate(input: PackageCompletionInput): GateResult {
  const completed = new Set(input.completedPackages);
  const incomplete = input.executionPackages
    .map((pkg) => pkg.id)
    .filter((id) => !completed.has(id));

  if (incomplete.length === 0) {
    return {
      gate: "progress",
      passed: true,
      reason: `All ${input.executionPackages.length} execution package(s) completed.`,
    };
  }

  const reason = `Incomplete execution package(s): ${incomplete.join(", ")}`;
  if (input.severity === "warn") {
    return {
      gate: "progress",
      passed: true,
      reason: `Package completion warning: ${reason}`,
      details: { incompleteTasks: incomplete.map((id) => `package:${id}`) },
    };
  }

  return {
    gate: "progress",
    passed: false,
    reason,
    details: { incompleteTasks: incomplete.map((id) => `package:${id}`) },
  };
}
