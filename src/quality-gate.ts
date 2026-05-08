/**
 * Quality gate — pure functions for evaluating review, test, and ship gates.
 *
 * All functions are pure: they accept raw file content strings and return
 * structured results without side effects. Unparseable content returns
 * `status: "skipped"` with a reason (never throws).
 *
 * Design reference: loop-skills-fusion § quality-gate.ts
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
 */

import { extractNumericField, extractStringField, parseFrontmatter } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Quality gate evaluation result. @public */
export interface GateResult {
  /** Whether the gate passed, is blocked, or was skipped due to parse failure. */
  status: "passed" | "blocked" | "skipped";
  /** Human-readable explanation of the result. */
  reason: string;
  /** Issue list (review gate only, when blocked). */
  issues?: Array<{ severity: string; description: string }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse P0/P1 issue descriptions from the body of a review report.
 * Looks for markdown sections like "## P0 Issues" and "## P1 Issues"
 * and extracts bullet items under each.
 */
function parseIssuesFromBody(body: string): Array<{ severity: string; description: string }> {
  const issues: Array<{ severity: string; description: string }> = [];

  const sections = body.split(/^## /m);
  for (const section of sections) {
    const headerMatch = section.match(/^(P0|P1)\s+Issues?\s*\n/i);
    if (!headerMatch) {
      continue;
    }
    const severity = headerMatch[1].toUpperCase();
    const lines = section.slice(headerMatch[0].length).split("\n");
    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
      if (bulletMatch) {
        issues.push({ severity, description: bulletMatch[1].trim() });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the Review quality gate.
 *
 * Parses the review report content (YAML frontmatter with `p0_count` and
 * `p1_count` fields). If either count is greater than 0, returns `blocked`
 * with the list of P0/P1 issues extracted from the body. If both are 0,
 * returns `passed`. If the content cannot be parsed, returns `skipped`.
 *
 * @param reviewContent - Raw review report content string.
 * @returns Gate evaluation result.
 * @public
 */
export function evaluateReviewGate(reviewContent: string): GateResult {
  const parsed = parseFrontmatter(reviewContent);
  if (!parsed) {
    return {
      status: "skipped",
      reason: "Review content has no valid YAML frontmatter",
    };
  }

  const p0Count = extractNumericField(parsed.raw, "p0_count");
  const p1Count = extractNumericField(parsed.raw, "p1_count");

  if (p0Count === null && p1Count === null) {
    return {
      status: "skipped",
      reason: "Review content missing p0_count and p1_count fields",
    };
  }

  const p0 = p0Count ?? 0;
  const p1 = p1Count ?? 0;

  if (p0 > 0 || p1 > 0) {
    const issues = parseIssuesFromBody(parsed.body);

    // If body parsing didn't find issues, generate summary entries from counts
    if (issues.length === 0) {
      if (p0 > 0) {
        issues.push({ severity: "P0", description: `${p0} P0 issue(s) detected` });
      }
      if (p1 > 0) {
        issues.push({ severity: "P1", description: `${p1} P1 issue(s) detected` });
      }
    }

    return {
      status: "blocked",
      reason: `Review blocked: ${p0} P0 and ${p1} P1 issue(s) found`,
      issues,
    };
  }

  return {
    status: "passed",
    reason: "Review passed: no P0 or P1 issues",
  };
}

/**
 * Evaluate the Test quality gate.
 *
 * Parses the test result content (YAML frontmatter with `failed` field or
 * `result` field). If there are failed tests (`failed > 0` or `result` is
 * not `"pass"`), returns `blocked`. If all pass, returns `passed`. If the
 * content cannot be parsed, returns `skipped`.
 *
 * @param testResultContent - Raw test result content string.
 * @returns Gate evaluation result.
 * @public
 */
export function evaluateTestGate(testResultContent: string): GateResult {
  const parsed = parseFrontmatter(testResultContent);
  if (!parsed) {
    return {
      status: "skipped",
      reason: "Test result content has no valid YAML frontmatter",
    };
  }

  const failed = extractNumericField(parsed.raw, "failed");
  const result = extractStringField(parsed.raw, "result");

  if (failed === null && result === null) {
    return {
      status: "skipped",
      reason: "Test result content missing failed count and result fields",
    };
  }

  // Check failed count first (more specific)
  if (failed !== null && failed > 0) {
    const total = extractNumericField(parsed.raw, "total");
    const passed = extractNumericField(parsed.raw, "passed");
    return {
      status: "blocked",
      reason: `Test blocked: ${failed} test(s) failed${total !== null ? ` out of ${total}` : ""}${passed !== null ? `, ${passed} passed` : ""}`,
    };
  }

  // Check result field
  if (result !== null && result !== "pass") {
    return {
      status: "blocked",
      reason: `Test blocked: result is "${result}"`,
    };
  }

  return {
    status: "passed",
    reason: "All tests passed",
  };
}

/**
 * Evaluate the Progress gate (internal helper for evaluateShipGate).
 *
 * Parses progress content (YAML frontmatter with `total_tasks` and
 * `completed_tasks` fields). If completed < total, returns `blocked`.
 * If all complete, returns `passed`. If unparseable, returns `skipped`.
 *
 * @param progressContent - Raw progress content string.
 * @returns Gate evaluation result.
 */
function evaluateProgressGate(progressContent: string): GateResult {
  const parsed = parseFrontmatter(progressContent);
  if (!parsed) {
    return {
      status: "skipped",
      reason: "Progress content has no valid YAML frontmatter",
    };
  }

  const totalTasks = extractNumericField(parsed.raw, "total_tasks");
  const completedTasks = extractNumericField(parsed.raw, "completed_tasks");

  if (totalTasks === null && completedTasks === null) {
    return {
      status: "skipped",
      reason: "Progress content missing total_tasks and completed_tasks fields",
    };
  }

  const total = totalTasks ?? 0;
  const completed = completedTasks ?? 0;

  if (completed < total) {
    return {
      status: "blocked",
      reason: `Progress blocked: ${completed}/${total} tasks completed`,
    };
  }

  return {
    status: "passed",
    reason: `All tasks completed (${completed}/${total})`,
  };
}

/**
 * Evaluate the Ship quality gate (three-gate combination).
 *
 * Combines Review + Test + Progress gates. If any one returns `blocked`,
 * the ship gate returns `blocked`. If all return `passed`, returns `passed`.
 * Skipped sub-gates are treated as non-blocking (they don't cause a block
 * on their own, but they also don't count as passed).
 *
 * @param reviewContent - Raw review report content string.
 * @param testResultContent - Raw test result content string.
 * @param progressContent - Raw progress content string.
 * @returns Gate evaluation result.
 * @public
 */
export function evaluateShipGate(
  reviewContent: string,
  testResultContent: string,
  progressContent: string,
): GateResult {
  const reviewGate = evaluateReviewGate(reviewContent);
  const testGate = evaluateTestGate(testResultContent);
  const progressGate = evaluateProgressGate(progressContent);

  const subGates = [
    { name: "Review", result: reviewGate },
    { name: "Test", result: testGate },
    { name: "Progress", result: progressGate },
  ];

  // Collect all blocked gates
  const blockedGates = subGates.filter((g) => g.result.status === "blocked");

  if (blockedGates.length > 0) {
    const blockedNames = blockedGates.map((g) => g.name).join(", ");
    const allIssues = blockedGates.flatMap((g) => g.result.issues ?? []);

    return {
      status: "blocked",
      reason: `Ship blocked by: ${blockedNames}. ${blockedGates.map((g) => g.result.reason).join("; ")}`,
      issues: allIssues.length > 0 ? allIssues : undefined,
    };
  }

  // Check if all passed (skipped gates don't block but also don't count as passed)
  const passedGates = subGates.filter((g) => g.result.status === "passed");
  const skippedGates = subGates.filter((g) => g.result.status === "skipped");

  if (passedGates.length === subGates.length) {
    return {
      status: "passed",
      reason: "Ship gate passed: all sub-gates (Review, Test, Progress) passed",
    };
  }

  if (skippedGates.length === subGates.length) {
    return {
      status: "skipped",
      reason: "Ship gate skipped: all sub-gates could not be evaluated",
    };
  }

  // Mix of passed and skipped — treat as passed (skipped is non-blocking)
  return {
    status: "passed",
    reason: `Ship gate passed: ${passedGates.map((g) => g.name).join(", ")} passed; ${skippedGates.map((g) => g.name).join(", ")} skipped`,
  };
}
