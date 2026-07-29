/**
 * Ship gate — test gate + progress gate + package completion gate.
 *
 * Extracted from `ship-gates.ts` (god-file split, following the
 * `context-budget/` + `pua-engine/` precedent). See `ship-gates.ts` for the
 * re-export barrel that preserves the public API.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateName, GateResult } from "./types.js";

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
