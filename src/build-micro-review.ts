/**
 * Micro-Review Engine — lightweight spec alignment check run after each atomic
 * task in `/tinkerman build`.
 *
 * Two modes:
 *   - **legacy** (planVersion="legacy", no expected_output):
 *       Only checks that gitDiff is non-empty AND verifyOutput contains a PASS
 *       indicator.
 *   - **v1**: For each acceptance_criterion, searches for evidence in the
 *       gitDiff. Scans for files changed beyond task.files (overBuilt).
 *       pass iff missing.length===0 && overBuilt.length===0.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simplified PlanTask for micro-review purposes. */
export interface PlanTask {
  title: string;
  files?: string[];
  acceptance_criteria?: string[];
  expected_output?: string;
}

export interface MicroReviewInput {
  task: PlanTask;
  gitDiff: string;
  verifyOutput: string;
  planVersion: "v1" | "legacy";
}

export interface MicroReviewResult {
  covered: Array<{ criterion: string; evidence: string }>;
  overBuilt: string[];
  missing: string[];
  verdict: "pass" | "needs_iteration";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASS_INDICATORS = ["passed", "PASS", "all tests passed", "Tests:"];

/** Check whether verifyOutput signals a successful run. */
function hasPassIndicator(output: string): boolean {
  return PASS_INDICATORS.some((ind) => output.includes(ind));
}

/**
 * Extract all file paths that appear as diff targets.
 * Matches lines like `diff --git a/path/to/f b/path/to/f`
 * and also `--- /dev/null` / `+++ b/path` new-file lines.
 */
function extractDiffFiles(diff: string): string[] {
  const files = new Set<string>();

  // Match `diff --git a/X b/X` — extract X from b/X side
  for (const match of diff.matchAll(/^diff --git a\/.+ b\/(.+)$/gm)) {
    files.add(match[1]);
  }

  // Match `+++ b/path` lines (covers new files)
  for (const match of diff.matchAll(/^\+{3}\s+b\/(.+)$/gm)) {
    files.add(match[1]);
  }

  return [...files];
}

/**
 * Normalise a word for fuzzy matching: strip trailing 's' so "exports" and
 * "export" compare equal, lower-case.
 */
function normalise(w: string): string {
  let n = w.toLowerCase();
  // strip common plural / verb suffix differences
  if (n.endsWith("ies")) n = `${n.slice(0, -3)}y`;
  else if (n.endsWith("es")) n = n.slice(0, -2);
  else if (n.endsWith("s")) n = n.slice(0, -1);
  return n;
}

/**
 * Find evidence for a criterion within the diff.
 * Strategy: split criterion into keywords, normalise them, and check if most
 * appear in any added line. Returns the best-matching diff line as evidence.
 */
function findEvidence(criterion: string, diff: string): string | null {
  const keywords = criterion
    .split(/[\s,()']+/)
    .filter((w) => w.length > 1)
    .map(normalise);

  if (keywords.length === 0) return null;

  const addedLines = diff.match(/^\+.*$/gm) ?? [];
  let bestLine: string | null = null;
  let bestScore = 0;

  for (const line of addedLines) {
    const lower = line.toLowerCase();
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  const threshold = Math.max(1, Math.ceil(keywords.length * 0.5));
  if (bestScore >= threshold && bestLine) {
    return bestLine;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function runMicroReview(input: MicroReviewInput): MicroReviewResult {
  const { task, gitDiff, verifyOutput, planVersion } = input;

  // ----- Legacy path -----
  if (planVersion === "legacy") {
    const diffEmpty = !gitDiff || gitDiff.trim().length === 0;
    const noPass = !hasPassIndicator(verifyOutput);

    if (diffEmpty || noPass) {
      const missing: string[] = [];
      if (diffEmpty) missing.push("git diff is empty — no changes detected");
      if (noPass) missing.push("verify output does not contain PASS indicator");
      return { covered: [], overBuilt: [], missing, verdict: "needs_iteration" };
    }

    return { covered: [], overBuilt: [], missing: [], verdict: "pass" };
  }

  // ----- v1 path -----
  const criteria = task.acceptance_criteria ?? [];
  const declaredFiles = new Set(task.files ?? []);

  // 1. Check acceptance criteria coverage
  const covered: Array<{ criterion: string; evidence: string }> = [];
  const missing: string[] = [];

  for (const criterion of criteria) {
    const evidence = findEvidence(criterion, gitDiff);
    if (evidence) {
      covered.push({ criterion, evidence });
    } else {
      missing.push(criterion);
    }
  }

  // 2. Check for overBuilt — files changed but not declared
  const diffFiles = extractDiffFiles(gitDiff);
  const overBuilt = diffFiles.filter((f) => !declaredFiles.has(f));

  // 3. Verdict
  const verdict = missing.length === 0 && overBuilt.length === 0 ? "pass" : "needs_iteration";

  return { covered, overBuilt, missing, verdict };
}
