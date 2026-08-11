#!/usr/bin/env node

/**
 * mark-specs-completed.mjs
 *
 * CI post-merge hook: scans recent merge/squash commits on main,
 * extracts spec slugs from branch names or commit messages,
 * and updates matching specs from {locked,in_progress,approved}
 * to "completed" in their requirements.md frontmatter.
 *
 * Intended to run as a step in sync-derived-data.yml BEFORE the
 * unified commit step so that spec status changes are included in
 * the same [skip ci] commit.
 *
 * Usage:
 *   node scripts/mark-specs-completed.mjs [--dry-run] [--help]
 *
 * Options:
 *   --dry-run   Print what would change without writing files
 *   --help      Show usage information
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
// Coverage gate — reuses the same vet logic as the standalone CLI.
import { checkSpecCloseCoverage, COVERAGE_RESULT } from "./check-spec-close-coverage.mjs";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const ROOT =
  rootIndex !== -1 && args[rootIndex + 1]
    ? args[rootIndex + 1]
    : join(new URL(import.meta.url).pathname, "..", "..");
const SPECS_DIR = join(ROOT, ".tinkerman", "specs");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const dryRun = args.includes("--dry-run");

if (args.includes("--help")) {
  console.log(`mark-specs-completed.mjs — Mark merged specs as completed

Usage:
  node scripts/mark-specs-completed.mjs [options]

Options:
  --dry-run   Print what would change without writing files
  --root <path>  Use <path> as project root
  --help      Show this help message

Scans recent merge commits on main, extracts spec slugs from
branch names / commit messages, and updates requirements.md
frontmatter status → completed.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Slug extraction from commit messages
// ---------------------------------------------------------------------------

const MERGE_PATTERNS = [
  // "Merge branch 'forge/<slug>'" or "Merge branch 'feature/<slug>'"
  /Merge branch '(?:forge|feature|spec)\/([a-z0-9][a-z0-9-]*)'/,
  // "Merge pull request #N from owner/forge/<slug>'"
  /Merge pull request.*from (?:[^/\s]+\/)?(?:forge|feature|spec)\/([a-z0-9][a-z0-9-]*)/,
  // "[spec:<slug>]" explicit annotation
  /\[spec:([a-z0-9][a-z0-9-]*)\]/,
];

function extractSlugsFromMessage(message) {
  const slugs = new Set();
  for (const pattern of MERGE_PATTERNS) {
    const match = message.match(pattern);
    if (match) slugs.add(match[1]);
  }
  return slugs;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing & status update
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return null;
  const afterFirst = trimmed.slice("---".length);
  const closingIndex = afterFirst.indexOf("\n---");
  if (closingIndex === -1) return null;
  return afterFirst.slice(0, closingIndex);
}

function extractStatus(raw) {
  const match = raw.match(/^status:\s*"?([^"\n]*)"?/m);
  return match ? match[1].trim() : null;
}

const COMPLETABLE_STATUSES = new Set(["locked", "in_progress", "approved"]);

function updateStatusInFrontmatter(content, newStatus) {
  // Match both quoted and unquoted status values
  return content
    .replace(/^status:\s*"?(?:locked|in_progress|approved)"?\s*$/m, `status: ${newStatus}`);
}

// ---------------------------------------------------------------------------
// Coverage gate skip (mirrors check-dist-sync.mjs:92-108 convention)
// ---------------------------------------------------------------------------

function coverageGateSkipped() {
  if (process.env.FORGE_SKIP_SPEC_COMPLETION_COVERAGE === "1") {
    console.log("⚠️  spec-close-coverage: SKIPPED (FORGE_SKIP_SPEC_COMPLETION_COVERAGE=1)");
    return true;
  }
  try {
    // Use ROOT as cwd — consistent with the slug-extraction git log in main(),
    // so the skip tag is read from the same repo being processed (not the
    // caller's cwd, which may be a different repo in tests/CI).
    const msg = execSync("git log -1 --format=%B", { encoding: "utf-8", cwd: ROOT }).trim();
    if (msg.includes("[spec-close-coverage-skip]")) {
      console.log("⚠️  spec-close-coverage: SKIPPED ([spec-close-coverage-skip] in commit message)");
      return true;
    }
  } catch (e) {
    if (e.stderr) console.error(`git log failed: ${e.stderr.slice(0, 200)}`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(SPECS_DIR)) {
    console.log("No .tinkerman/specs/ directory found. Skipping.");
    return;
  }

  // 1. Collect slugs from recent commits (HEAD~10..HEAD for safety)
  const logRange = process.env.MARK_SPECS_RANGE || "HEAD~10..HEAD";
  let logOutput;
  try {
    logOutput = execSync(`git log --format="%s" ${logRange}`, {
      encoding: "utf-8",
      cwd: ROOT,
    });
  } catch {
    console.log("Could not read git log. Skipping.");
    return;
  }

  const slugs = new Set();
  for (const line of logOutput.trim().split("\n")) {
    if (!line) continue;
    for (const slug of extractSlugsFromMessage(line)) {
      slugs.add(slug);
    }
  }

  if (slugs.size === 0) {
    console.log("No spec slugs found in recent commits. Nothing to update.");
    return;
  }

  // 2. For each slug, check and update status
  const updated = [];
  for (const slug of slugs) {
    const reqPath = join(SPECS_DIR, slug, "requirements.md");
    if (!existsSync(reqPath)) {
      console.log(`  Spec "${slug}" not found in .tinkerman/specs/. Skipping.`);
      continue;
    }

    const content = await readFile(reqPath, "utf-8");
    const raw = parseYamlFrontmatter(content);
    if (!raw) {
      console.log(`  Spec "${slug}" has no frontmatter. Skipping.`);
      continue;
    }

    const status = extractStatus(raw);
    if (!status) {
      console.log(`  Spec "${slug}" has no status field. Skipping.`);
      continue;
    }

    if (!COMPLETABLE_STATUSES.has(status)) {
      console.log(`  Spec "${slug}" status is "${status}" (not completable). Skipping.`);
      continue;
    }

    // Update
    const newContent = updateStatusInFrontmatter(content, "completed");
    if (newContent === content) {
      console.log(`  Spec "${slug}" status pattern not matched for replacement. Skipping.`);
      continue;
    }

    // Coverage gate (fires ONLY on the transition TO completed — the 52
    // already-completed specs are excluded by the COMPLETABLE_STATUSES guard
    // above, so this is non-retroactive). A hollow requirements.md blocks
    // the flip entirely; an undone tasks.md only warns.
    if (!coverageGateSkipped()) {
      const verdict = checkSpecCloseCoverage(slug, SPECS_DIR);
      if (verdict.result === COVERAGE_RESULT.BLOCK) {
        console.error(`  ✗ Spec "${slug}": BLOCKED from completion by coverage gate.`);
        console.error(`    ${verdict.reason}`);
        console.error(
          `    Override (emergency only): set FORGE_SKIP_SPEC_COMPLETION_COVERAGE=1 or add [spec-close-coverage-skip] to the commit message.`,
        );
        // Hard exit (mirrors check-dist-sync.mjs): a hollow spec being closed
        // is a defect — abort the whole batch so the CI step fails and the
        // [skip ci] sync commit is not produced.
        process.exit(1);
      }
      if (verdict.result === COVERAGE_RESULT.PASS_WITH_WARNING) {
        console.log(`  ⚠️  Spec "${slug}": coverage WARNING.`);
        console.log(`    ${verdict.reason}`);
      }
    }

    if (dryRun) {
      console.log(`  [dry-run] Would update "${slug}": ${status} → completed`);
    } else {
      await writeFile(reqPath, newContent, "utf-8");
      console.log(`  ✅ "${slug}": ${status} → completed`);
    }
    updated.push(slug);
  }

  // 3. Rebuild INDEX.md if any specs were updated
  if (updated.length > 0) {
    const rebuildScript = join(ROOT, "scripts", "rebuild-spec-index.mjs");
    if (existsSync(rebuildScript)) {
      if (dryRun) {
        console.log(`  [dry-run] Would rebuild INDEX.md`);
      } else {
        execSync(`node "${rebuildScript}"`, { encoding: "utf-8", cwd: ROOT });
        console.log("  INDEX.md rebuilt.");
      }
    }
  }

  console.log(
    dryRun
      ? `Done (dry-run). ${updated.length} spec(s) would be updated.`
      : `Done. ${updated.length} spec(s) updated.`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
