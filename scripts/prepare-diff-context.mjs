#!/usr/bin/env node
// category: internal-only
/**
 * prepare-diff-context.mjs — Script-based Step 1.5 of /tinkerman review.
 *
 * Replaces the manual 4-step prompt flow in skills/tinkerman-review/SKILL.md §2.0
 * with a single bash invocation. Reuses the pure `truncateDiffContent` function
 * from src/mcp/tools/forge-git.ts (compiled to dist/) for file-priority
 * truncation, with zero MCP runtime dependency.
 *
 * Output schema is byte-equivalent to the prior `forge_git(diff-content)`
 * code path, frontmatter source field set to `shell_with_truncate_lib`.
 *
 * Usage:
 *   node scripts/prepare-diff-context.mjs            # writes the file
 *   node scripts/prepare-diff-context.mjs --dry-run  # prints to stdout only
 *
 * @see .kiro/specs/forge-review-diff-context-fidelity/{bugfix,design}.md
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OUTPUT_PATH = ".tinkerman/reviews/.diff-context.md";
const EXCLUDE_GLOBS = [
  ":(exclude)*.lock",
  ":(exclude)package-lock.json",
  ":(exclude)dist/*",
  ":(exclude)*.d.ts",
];
const FALLBACK_MAX_BYTES = 200000;

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Count files in a `git diff --stat` output.
 * @param {string} stat - The raw stat string.
 * @returns {number}
 */
export function parseFileCount(stat) {
  if (!stat || !stat.trim()) return 0;
  // Match per-file lines (path | <count> <symbols>); summary line has no `|`.
  const lines = stat.split("\n").filter((line) => / \| /.test(line));
  return lines.length;
}

/**
 * Extract `{added, removed}` from the summary line of a `git diff --stat` output.
 * Tolerates singular forms (1 insertion(+)) and missing halves.
 * @param {string} stat
 * @returns {{added: number, removed: number}}
 */
export function parseAddedRemoved(stat) {
  if (!stat || !stat.trim()) return { added: 0, removed: 0 };
  const insMatch = stat.match(/(\d+)\s+insertions?\(\+\)/);
  const delMatch = stat.match(/(\d+)\s+deletions?\(-\)/);
  return {
    added: insMatch ? Number.parseInt(insMatch[1], 10) : 0,
    removed: delMatch ? Number.parseInt(delMatch[1], 10) : 0,
  };
}

/**
 * Render the `.diff-context.md` frontmatter block from structured input.
 * @param {Object} input
 * @param {string} input.base
 * @param {string} input.head
 * @param {number} input.fileCount
 * @param {number} input.totalAdded
 * @param {number} input.totalRemoved
 * @param {boolean} input.truncated
 * @param {string} input.source
 * @returns {string} Block including delimiters and trailing newline.
 */
export function formatFrontmatter(input) {
  const lines = [
    "---",
    `base: ${input.base}`,
    `head: ${input.head}`,
    `file_count: ${input.fileCount}`,
    `total_added: ${input.totalAdded}`,
    `total_removed: ${input.totalRemoved}`,
    `truncated: ${input.truncated ? "true" : "false"}`,
    `source: ${input.source}`,
    "---",
    "",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Orchestration (only runs when invoked as script entry, not on import)
// ---------------------------------------------------------------------------

function tryExec(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

async function loadTruncate() {
  // Lazy import; if dist is missing or import fails, fall back to byte-cap.
  try {
    const mod = await import("../dist/src/mcp/tools/forge-git.js");
    if (typeof mod.truncateDiffContent === "function") {
      return mod.truncateDiffContent;
    }
  } catch {
    // fall through
  }
  return (raw) => {
    if (!raw || !raw.trim()) return "（无 diff 内容）";
    return raw.length > FALLBACK_MAX_BYTES
      ? `${raw.slice(0, FALLBACK_MAX_BYTES)}\n[... fallback byte-cap truncation at ${FALLBACK_MAX_BYTES} bytes]`
      : raw;
  };
}

async function main(argv) {
  const dryRun = argv.includes("--dry-run");

  const head = tryExec("git rev-parse HEAD");
  if (!head) {
    process.stderr.write(
      "ERROR: cannot resolve HEAD (not a git repo, or git unavailable)\n",
    );
    process.exit(1);
  }

  const base = tryExec("git merge-base main HEAD") || "HEAD~1";
  const stat = tryExec(`git diff --stat ${base}...HEAD`) || "";
  const excludeArgs = EXCLUDE_GLOBS.map((g) => `'${g}'`).join(" ");
  const rawDiff =
    tryExec(`git diff ${base}...HEAD -- ${excludeArgs}`) || "";

  const truncate = await loadTruncate();
  const truncatedDiff = truncate(rawDiff);
  const wasTruncated = rawDiff.length > 0 && truncatedDiff.length < rawDiff.length;

  const fileCount = parseFileCount(stat);
  const { added, removed } = parseAddedRemoved(stat);

  const frontmatter = formatFrontmatter({
    base,
    head,
    fileCount,
    totalAdded: added,
    totalRemoved: removed,
    truncated: wasTruncated,
    source: "shell_with_truncate_lib",
  });

  const content =
    `${frontmatter}\n## Diff Stat\n\n${stat || "（无 diff stat）"}\n\n## Diff Content\n\n${truncatedDiff}\n`;

  if (dryRun) {
    process.stdout.write(content);
    return;
  }

  try {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, content);
    process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
  } catch (err) {
    process.stderr.write(`ERROR: failed to write ${OUTPUT_PATH}: ${err.message}\n`);
    process.exit(2);
  }
}

// Detect direct invocation vs import. Node ESM has no `require.main`; use
// import.meta.url comparison.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]);

if (isDirectInvocation) {
  main(process.argv.slice(2));
}
