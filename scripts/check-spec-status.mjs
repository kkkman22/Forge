#!/usr/bin/env node
// category: user-facing
/**
 * check-spec-status.mjs - Spec status inventory linter (T-06, REQ-06).
 *
 * Scans the .forge/specs tree (requirements.md / design.md / tasks.md / spec.md)
 * frontmatter for a status field and reports the distribution
 * (draft/approved/locked/completed/etc.) plus warnings for specs that are
 * missing or inconsistent. Read-only - never modifies spec content. Use --fix
 * to backfill ONLY missing status fields (as status: draft); existing values
 * are never overwritten.
 *
 * Spec: .forge/specs/arch-review-remediate-0626 REQ-06.
 *
 * Usage:
 *   node scripts/check-spec-status.mjs [specs-dir] [--fix] [--help]
 *
 * Options:
 *   specs-dir   Specs root to scan (default: .forge/specs)
 *   --fix       Backfill missing status fields as `status: draft` (no overwrite)
 *   --help      Show this help message
 *
 * Exit codes: 0 always (warnings are informational, not blocking).
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SPECS_DIR = path.join(import.meta.dirname, "..", ".forge", "specs");
const SPEC_FILE_NAMES = new Set(["requirements.md", "design.md", "tasks.md", "spec.md"]);
const VALID_STATUSES = new Set([
  "draft",
  "approved",
  "locked",
  "completed",
  "superseded",
  "deferred",
  "archived",
]);

function showHelp() {
  // Read own header docblock for usage (single source of truth).
  const self = fs.readFileSync(path.join(import.meta.dirname, "check-spec-status.mjs"), "utf-8");
  const match = self.match(/\/\*\*([\s\S]*?)\*\//);
  console.log(match ? match[1].replace(/^\s*\*\s?/gm, "").trim() : "check-spec-status.mjs");
}

/** Parse `status:` from frontmatter (first `---...---` block). */
function parseStatus(content) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { status: null, hasFrontmatter: false };
  const m = fm[1].match(/^status:\s*(\S+)/m);
  return { status: m ? m[1] : null, hasFrontmatter: true };
}

/** Recursively collect spec markdown files. */
function collectSpecFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (SPEC_FILE_NAMES.has(entry.name) && entry.name.endsWith(".md")) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }
  const wantFix = args.includes("--fix");
  const positional = args.filter((a) => !a.startsWith("-"));
  const specsDir = positional[0] ? path.resolve(positional[0]) : DEFAULT_SPECS_DIR;

  const files = collectSpecFiles(specsDir);
  const distribution = new Map();
  const warnings = [];
  let missingCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const { status, hasFrontmatter } = parseStatus(content);
    const rel = path.relative(specsDir, file);

    if (!hasFrontmatter || status === null) {
      missingCount += 1;
      warnings.push(`${rel}: missing status field`);
      if (wantFix && hasFrontmatter) {
        const fixed = content.replace(/^---\r?\n/, `---\nstatus: draft\n`);
        if (fixed !== content) {
          fs.writeFileSync(file, fixed);
          console.log(`fixed: ${rel} (backfilled status: draft)`);
        }
      }
    } else {
      distribution.set(status, (distribution.get(status) ?? 0) + 1);
      if (!VALID_STATUSES.has(status)) {
        warnings.push(`${rel}: unrecognized status "${status}"`);
      }
    }
  }

  // Report distribution
  console.log(`Spec status inventory - ${specsDir}`);
  console.log(`Scanned ${files.length} spec file(s).`);
  if (distribution.size === 0 && files.length === 0) {
    console.log("(no spec files found)");
  } else {
    const sorted = [...distribution.entries()].sort((a, b) => b[1] - a[1]);
    for (const [status, count] of sorted) {
      console.log(`  ${status}: ${count}`);
    }
  }
  if (missingCount > 0) {
    console.log(`  (missing status): ${missingCount}`);
  }

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  // Read-only inventory: exit 0 regardless of warnings (informational).
  process.exit(0);
}

main();
