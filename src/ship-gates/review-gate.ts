/**
 * Ship gate — review gate + P1 fixlist handling.
 *
 * Extracted from `ship-gates.ts` (god-file split, following the
 * `context-budget/` + `pua-engine/` precedent). See `ship-gates.ts` for the
 * re-export barrel that preserves the public API.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { splitFrontmatterAndBody } from "../review/frontmatter.js";
import { extractSeverity } from "../review/severity-parser.js";
import type { Methodology } from "../schemas/review-report.js";
import type { GateResult } from "./types.js";

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

interface ParsedReviewReport {
  p0Count: number;
  p1Count: number;
  methodology: Methodology;
  result: string;
}

/**
 * Extract frontmatter fields from review report content.
 *
 * T-05 (REQ-04, P0 fix): uses splitFrontmatterAndBody (parseYaml) instead of
 * ad-hoc regex, so nested `severity_counts` reports (block/flow YAML, lower/
 * new_/upper case) are read correctly. The outer try/catch turns any
 * YAMLParseError from malformed frontmatter into a structured fail-closed
 * block (caller returns passed:false) rather than crashing the ship command.
 */
function parseReviewReportFrontmatter(content: string): ParsedReviewReport | null {
  let fm: Record<string, unknown>;
  let fmText: string;
  try {
    const parsed = splitFrontmatterAndBody(content);
    fm = parsed.fm;
    fmText = parsed.fmText;
  } catch (err: unknown) {
    // Round 6 availability P0 + Round 7 observability: malformed YAML must
    // not crash ship; log so failures are debuggable, then signal parse failure.
    // biome-ignore lint/suspicious/noConsole: ship-gate diagnostic in gate context without logger
    console.error("[ship-gates] severity parse failed:", err);
    return null;
  }

  // No frontmatter block at all → unparseable (fail-closed upstream).
  if (fmText === "") return null;

  const methodMatch = fmText.match(/^methodology:\s*(\S+)/m);
  const resultMatch = fmText.match(/^result:\s*(\S+)/m);

  const severity = extractSeverity(fm);
  // Audit P2-5 (2026-07-16): a missing or unrecognized methodology must NOT
  // default to a trusted ladder rung. Previously an absent field silently
  // became "subagent-parallel" (the most-trusted rung), so a main-agent-written
  // report — exactly what the HARD-GATE exists to prevent — could pass ship
  // merely by omitting the field. Fail-closed: treat unknown/absent as
  // "unavailable" so checkFallbackLadderGate blocks it.
  const methodRaw = (fm.methodology as string | undefined) ?? methodMatch?.[1];
  const methodology: Methodology =
    methodRaw !== undefined && isValidMethodology(methodRaw) ? methodRaw : "unavailable";
  const result = (fm.result as string | undefined) ?? resultMatch?.[1] ?? "incomplete";

  return { p0Count: severity.p0, p1Count: severity.p1, methodology, result };
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
          // Audit P2-2 (2026-07-16): a self-attested allFixed is only credible
          // when corroborated by git. Without a gitLogFn there is no way to
          // confirm the fix commits actually exist, so a hand-edited or stale
          // fixlist could bypass the CLAUDE.md §3.3 "P0/P1 blocks ship" rule.
          // Fail-closed: require git verification rather than trusting the flag.
          if (gitLogFn) {
            return {
              gate: "review",
              passed: true,
              reason: `All ${report.p1Count} P1 issue(s) marked as fixed in fixlist (git-verified available).`,
              details: { p0Count: 0, p1Count: report.p1Count },
            };
          }
          return {
            gate: "review",
            passed: false,
            reason: `P1 fixlist claims allFixed but no git verification was provided. Re-run /forge review with commit verification or provide gitLogFn.`,
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
