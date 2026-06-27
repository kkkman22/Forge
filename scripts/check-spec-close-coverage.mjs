#!/usr/bin/env node

/**
 * check-spec-close-coverage.mjs — Spec-close-coverage gate.
 *
 * Vets whether a spec is qualified to be marked `status: completed`. Closes
 * the root cause of "false close" (pms-pack-v1 was closed `completed` while
 * Requirement 4.5, a SHALL, was never delivered): the two close paths
 * (CI mark-specs-completed.mjs + manual /forge ship) keyed status flips off
 * branch/commit metadata, never on requirement coverage.
 *
 * This gate fires ONLY on the transition TO completed. It is physically
 * unreachable for already-completed specs because mark-specs-completed.mjs:169
 * short-circuits them via COMPLETABLE_STATUSES. Hence: 只防增量 — the 52
 * historical false-closed specs are not retroactively touched.
 *
 * Rules (基础档):
 *   1. HARD BLOCK (exit 1): requirements.md body has zero SHALL clauses AND
 *      zero requirement headings → hollow shell, reject completion.
 *      SHALL is the primary signal (102/102 specs); heading variants
 *      (### Requirement N:, ## REQ-NN, ### RN:, ### N.) are a fallback union.
 *   2. SOFT WARN (exit 0): tasks.md exists with 0 done AND >0 open → work may
 *      legitimately live elsewhere (e.g. inside a skill, like
 *      review-adversarial-stance). Warn loudly, do not block.
 *
 * Usage:
 *   node scripts/check-spec-close-coverage.mjs <slug> [--specs-dir <path>]
 *   node scripts/check-spec-close-coverage.mjs --help
 *
 * Skip (when invoked by mark-specs-completed.mjs, propagated by caller):
 *   FORGE_SKIP_SPEC_COMPLETION_COVERAGE=1  OR  [spec-close-coverage-skip]
 *   in the HEAD commit message → loud warning + exit 0.
 *
 * Exit: 0 qualified (pass, or pass-with-warning) | 1 not qualified (hollow)
 *
 * 对应 spec: spec-close-coverage-gate.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--specs-dir");
const DEFAULT_SPECS_DIR = join(
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
  "..",
  ".forge",
  "specs",
);
const SPECS_DIR =
  rootIndex !== -1 && args[rootIndex + 1] ? args[rootIndex + 1] : DEFAULT_SPECS_DIR;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (args.includes("--help") || args.includes("-h")) {
  console.log(`check-spec-close-coverage.mjs — Spec-close-coverage gate

Usage:
  node scripts/check-spec-close-coverage.mjs <slug> [--specs-dir <path>]
  node scripts/check-spec-close-coverage.mjs --help

Checks whether a spec is qualified to be marked status: completed:
  1. requirements.md must contain ≥1 SHALL clause or requirement heading
     (a hollow shell is HARD-BLOCKED, exit 1).
  2. If tasks.md shows 0 done with open tasks, emit a SOFT WARNING (exit 0).

Options:
  --specs-dir <path>  Specs root (default .forge/specs)
  --help, -h          Show this help message

Exit: 0 qualified | 1 not qualified (hollow requirements)`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Core logic (exported for reuse by mark-specs-completed.mjs)
// ---------------------------------------------------------------------------

/** Requirement-heading variants observed across .forge/specs/**.
 *  Note: `\d+\.` (numbered list heading) intentionally omits a trailing \b —
 *  the dot is a non-word char, so `\d+\.\b` never matches `### 1. foo`. */
const REQ_HEADING_RE = /^(?:#{2,4}\s+)(?:Requirement\s+\d+|REQ-\d+|R\d+\b|\d+\.)/im;

/** SHALL is the universal EARS signal (102/102 real specs). */
const SHALL_RE = /\bSHALL\b/;

/** Count done / open task checkboxes in a tasks.md body. */
export function countTaskCheckboxes(tasksBody) {
  const done = (tasksBody.match(/^\s*-\s*\[x\]/gim) || []).length;
  const open = (tasksBody.match(/^\s*-\s*\[\s\]/gim) || []).length;
  return { done, open };
}

/**
 * Strip YAML frontmatter; return the body (everything after the closing ---).
 * Returns the whole content if no frontmatter is present.
 */
function stripFrontmatter(content) {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return m ? m[1] : content;
}

export const COVERAGE_RESULT = Object.freeze({
  PASS: "pass",
  PASS_WITH_WARNING: "pass-with-warning",
  BLOCK: "block",
  MISSING: "missing",
});

/**
 * Vet one spec's qualification for completion.
 *
 * @param {string} slug       spec directory name
 * @param {string} specsDir   specs root (e.g. .forge/specs)
 * @returns {{ result: string, reason: string, slug: string }}
 *   - PASS: requirements have substance, tasks look done (or absent)
 *   - PASS_WITH_WARNING: requirements have substance, but tasks show 0 done / N open
 *   - BLOCK: requirements.md is a hollow shell (no SHALL, no REQ heading)
 *   - MISSING: spec directory or requirements.md not found
 */
export function checkSpecCloseCoverage(slug, specsDir) {
  const reqPath = join(specsDir, slug, "requirements.md");
  if (!existsSync(reqPath)) {
    return {
      result: COVERAGE_RESULT.MISSING,
      reason: `requirements.md not found at ${reqPath}`,
      slug,
    };
  }

  const reqRaw = readFileSync(reqPath, "utf-8");
  const reqBody = stripFrontmatter(reqRaw);

  const hasShall = SHALL_RE.test(reqBody);
  const hasReqHeading = REQ_HEADING_RE.test(reqBody);

  if (!hasShall && !hasReqHeading) {
    return {
      result: COVERAGE_RESULT.BLOCK,
      reason:
        `requirements.md is a hollow shell: no SHALL clause and no requirement heading found. ` +
        `A spec cannot be marked completed without at least one stated requirement.`,
      slug,
    };
  }

  // Requirements have substance. Check tasks.md for the soft-warning case.
  const tasksPath = join(specsDir, slug, "tasks.md");
  if (existsSync(tasksPath)) {
    const tasksBody = stripFrontmatter(readFileSync(tasksPath, "utf-8"));
    const { done, open } = countTaskCheckboxes(tasksBody);
    if (done === 0 && open > 0) {
      return {
        result: COVERAGE_RESULT.PASS_WITH_WARNING,
        reason:
          `tasks.md shows ${open} open task(s) and 0 done. The work may have been delivered ` +
          `elsewhere (e.g. merged into a skill document, like review-adversarial-stance). ` +
          `Please confirm the deliverable exists before trusting this completion.`,
        slug,
      };
    }
  }

  return { result: COVERAGE_RESULT.PASS, reason: "requirements have substance", slug };
}

// ---------------------------------------------------------------------------
// Skip convention (mirrors check-dist-sync.mjs:92-108)
// ---------------------------------------------------------------------------

function shouldSkip() {
  if (process.env.FORGE_SKIP_SPEC_COMPLETION_COVERAGE === "1") {
    console.log("⚠️  spec-close-coverage: SKIPPED (FORGE_SKIP_SPEC_COMPLETION_COVERAGE=1)");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// CLI main (only when run directly, not when imported by mark-specs-completed.mjs)
// ---------------------------------------------------------------------------

function main() {
  const positional = args.filter((a) => !a.startsWith("--"));
  const slug = positional[0];

  if (!slug) {
    console.error("Error: missing <slug> argument.");
    console.error("Usage: node scripts/check-spec-close-coverage.mjs <slug> [--specs-dir <path>]");
    process.exit(2);
  }

  if (shouldSkip()) process.exit(0);

  const verdict = checkSpecCloseCoverage(slug, SPECS_DIR);

  switch (verdict.result) {
    case COVERAGE_RESULT.MISSING:
      console.error(`✗ spec "${slug}": ${verdict.reason}`);
      process.exit(1);
    case COVERAGE_RESULT.BLOCK:
      console.error(`✗ spec "${slug}": BLOCKED from completion.`);
      console.error(`  ${verdict.reason}`);
      process.exit(1);
    case COVERAGE_RESULT.PASS_WITH_WARNING:
      console.log(`⚠️  spec "${slug}": WARNING (qualified, but verify delivery).`);
      console.log(`  ${verdict.reason}`);
      process.exit(0);
    case COVERAGE_RESULT.PASS:
      console.log(`✓ spec "${slug}": qualified for completion.`);
      process.exit(0);
    default:
      console.error(`unexpected result: ${verdict.result}`);
      process.exit(1);
  }
}

const isMainEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMainEntry) {
  main();
}
