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

/**
 * Files where a `status:` field is LEGITIMATE (the single source of truth is
 * requirements.md per spec-lifecycle §2; design.md/tasks.md must NOT carry one).
 */
const STATUS_ALLOWED_FILE = "requirements.md";

/**
 * Collect immediate spec directories (each dir = one spec). Excludes `_archived/`.
 * A spec dir is any direct child of root containing at least one spec markdown file.
 */
function collectSpecDirs(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "_archived") continue; // excluded from main distribution
    const dir = path.join(root, entry.name);
    // Nested specs (e.g. _archived handled above; deeper nesting treated as own dir)
    const hasSpecFile = fs
      .readdirSync(dir, { withFileTypes: true })
      .some((e) => e.isFile() && SPEC_FILE_NAMES.has(e.name));
    if (hasSpecFile) out.push(dir);
  }
  return out;
}

/**
 * Resolve a single representative status for a spec dir + detect rogue status
 * fields in design.md/tasks.md.
 *
 * Representative status precedence: requirements.md (source of truth) →
 * tasks.md → design.md (fallback when requirements has none).
 * Rogue: design.md/tasks.md carrying a `status:` field (must be reported).
 */
function resolveSpecStatus(dir) {
  const rel = (f) => path.join(dir, f);
  const read = (f) => (fs.existsSync(rel(f)) ? fs.readFileSync(rel(f), "utf-8") : null);
  const req = read("requirements.md");
  const des = read("design.md");
  const tas = read("tasks.md");

  const rogueFiles = [];
  // design.md / tasks.md must NOT carry status (only requirements.md may)
  for (const [name, content] of [["design.md", des], ["tasks.md", tas]]) {
    if (content === null) continue;
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm && /^status:\s*\S+/m.test(fm[1])) {
      rogueFiles.push(`${path.basename(dir)}/${name}`);
    }
  }

  let status = null;
  let hasFrontmatter = false;
  for (const content of [req, tas, des]) {
    if (content === null) continue;
    const parsed = parseStatus(content);
    if (parsed.hasFrontmatter) hasFrontmatter = true;
    if (parsed.status !== null) {
      status = parsed.status;
      break; // requirements.md wins (first in precedence list)
    }
  }
  return { status, hasFrontmatter, rogueFiles };
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

  const dirs = collectSpecDirs(specsDir);
  const distribution = new Map();
  const warnings = [];
  let missingCount = 0;
  let rogueCount = 0;

  for (const dir of dirs) {
    const rel = path.relative(specsDir, dir);
    const { status, hasFrontmatter, rogueFiles } = resolveSpecStatus(dir);

    // Rogue status fields in design.md/tasks.md (REQ-07 single source of truth)
    for (const rf of rogueFiles) {
      rogueCount += 1;
      warnings.push(`${rf}: rogue status field (status only allowed in requirements.md)`);
    }

    if (!hasFrontmatter || status === null) {
      missingCount += 1;
      warnings.push(`${rel}: missing status field`);
      if (wantFix && hasFrontmatter) {
        const reqPath = path.join(dir, "requirements.md");
        if (fs.existsSync(reqPath)) {
          const content = fs.readFileSync(reqPath, "utf-8");
          const fixed = content.replace(/^---\r?\n/, `---\nstatus: draft\n`);
          if (fixed !== content) {
            fs.writeFileSync(reqPath, fixed);
            console.log(`fixed: ${rel}/requirements.md (backfilled status: draft)`);
          }
        }
      }
    } else {
      distribution.set(status, (distribution.get(status) ?? 0) + 1);
      if (!VALID_STATUSES.has(status)) {
        warnings.push(`${rel}: unrecognized status "${status}"`);
      }
    }
  }

  // Report distribution (directory-level)
  console.log(`Spec status inventory - ${specsDir}`);
  console.log(`Scanned ${dirs.length} spec dir(s).`);
  if (distribution.size === 0 && dirs.length === 0) {
    console.log("(no spec dirs found)");
  } else {
    const sorted = [...distribution.entries()].sort((a, b) => b[1] - a[1]);
    for (const [status, count] of sorted) {
      console.log(`  ${status}: ${count}`);
    }
  }
  if (missingCount > 0) {
    console.log(`  (missing status): ${missingCount}`);
  }
  if (rogueCount > 0) {
    console.log(`  (rogue status fields): ${rogueCount}`);
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
