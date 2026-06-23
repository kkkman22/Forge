#!/usr/bin/env node
// category: user-facing
/**
 * set-active-plan.mjs — active-plan.json writer (R3 single source of truth).
 *
 * **Requirement 3 (planning-with-files-borrow spec) — writer half**
 *
 * Populates `.forge/state/active-plan.json`, the pointer consumed by
 * inject-plan-context.mjs's reader (`tryReadActivePlanPointer`). Without this
 * writer, the pointer reader is dead code in production (SC-1 P0 fix).
 *
 * Two modes:
 *   set-active-plan.mjs <plan_path>              Set pointer (plan approve time)
 *   set-active-plan.mjs --phase <phase>          Update phase only (build start / phase switch)
 *
 * Set mode extracts spec_ref from the plan's frontmatter, defaults phase to
 * "build", and stamps pinned_at. Idempotent.
 *
 * Security: validates plan_path resolves (via realpathSync) inside .forge/plans/
 * — refuses to write a pointer to a plan outside the plans dir (path traversal
 * / symlink guard, mirroring the reader's N-3 fix). Also validates spec_ref
 * falls inside .forge/specs/ (SC-3 fix).
 *
 * Fail-open: exits 0 on any error (never blocks the agent).
 *
 * Usage:
 *   node scripts/set-active-plan.mjs .forge/plans/feature-x.md
 *   node scripts/set-active-plan.mjs --phase review
 *   node scripts/set-active-plan.mjs --help
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const CWD = process.cwd();
const STATE_DIR = ".forge/state";
const POINTER_FILE = ".forge/state/active-plan.json";
const PLANS_DIR = ".forge/plans";
const SPECS_DIR = ".forge/specs";

const args = process.argv.slice(2);

// --help (black-box convention §2.8)
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    `set-active-plan.mjs — write/update .forge/state/active-plan.json (R3 pointer)

Usage:
  node scripts/set-active-plan.mjs <plan_path>        Set active plan pointer (plan approve time)
  node scripts/set-active-plan.mjs --phase <phase>    Update phase field only (phase switch)

Options:
  --help, -h    Show this help message

The pointer is the single source of truth consumed by inject-plan-context.mjs.
Set mode extracts spec_ref from plan frontmatter and validates plan_path resolves
inside .forge/plans/ (path-traversal guard). Fail-open: exits 0 on any error.
`,
  );
  process.exit(0);
}

/** Resolve a path physically and verify it falls inside an allowed root dir. */
function resolvesInside(targetPath, allowedRoot) {
  try {
    const realTarget = realpathSync(resolve(targetPath));
    const realRoot = realpathSync(resolve(allowedRoot));
    const rel = relative(realRoot, realTarget);
    // Reject if it escapes (starts with ..) or is on another volume (absolute).
    if (rel.startsWith("..") || rel === "") return rel === "";
    return !rel.startsWith("..") && resolve(realRoot, rel) === realTarget;
  } catch {
    return false;
  }
}

/**
 * Like resolvesInside, but for targets that may not yet exist (e.g. spec_ref
 * file written after plan approve). Validates the *lexical* normalized path
 * falls under the allowed root (resolves .. but not symlinks). Use realpath
 * variant for paths that must exist.
 */
function resolvesInsideOrUnder(targetPath, allowedRoot) {
  try {
    const normTarget = resolve(targetPath);
    const realRoot = realpathSync(resolve(allowedRoot));
    // Normalize the target relative to the (real) root lexically.
    const combined = resolve(realRoot, relative(resolve(allowedRoot), normTarget));
    const rel = relative(realRoot, combined);
    return !rel.startsWith("..") && rel !== "" && !rel.startsWith("/");
  } catch {
    return false;
  }
}

/** Extract spec_ref from plan frontmatter. Returns null if absent. */
function extractSpecRef(planPath) {
  try {
    const content = readFileSync(planPath, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return null;
    const match = fm[1].match(/^spec_ref:\s*["']?([^"'\n]+)["']?\s*$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function readExistingPointer() {
  try {
    return JSON.parse(readFileSync(POINTER_FILE, "utf-8"));
  } catch {
    return null;
  }
}

try {
  // Phase-update mode: --phase <phase>
  const phaseIdx = args.indexOf("--phase");
  if (phaseIdx !== -1) {
    const phase = args[phaseIdx + 1];
    if (!phase) {
      process.stderr.write("set-active-plan: --phase requires a value\n");
      process.exit(0);
    }
    const existing = readExistingPointer();
    if (!existing) {
      // No pointer to update — fail-open, silent.
      process.exit(0);
    }
    existing.phase = phase;
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(POINTER_FILE, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
    process.exit(0);
  }

  // Set mode: <plan_path>
  const planPath = args[0];
  if (!planPath) {
    process.stderr.write("set-active-plan: missing plan_path argument (see --help)\n");
    process.exit(0);
  }

  // Validate plan exists and resolves inside .forge/plans/.
  if (!existsSync(planPath)) {
    process.stderr.write(`set-active-plan: plan not found: ${planPath}\n`);
    process.exit(0);
  }
  if (!resolvesInside(planPath, PLANS_DIR)) {
    process.stderr.write(
      `set-active-plan: refused — ${planPath} resolves outside .forge/plans/\n`,
    );
    process.exit(0);
  }

  // Extract spec_ref from frontmatter; validate it if present (SC-3 fix).
  const specRef = extractSpecRef(planPath);
  if (specRef && !resolvesInsideOrUnder(specRef, SPECS_DIR)) {
    process.stderr.write(
      `set-active-plan: refused — spec_ref ${specRef} resolves outside .forge/specs/\n`,
    );
    process.exit(0);
  }

  const pointer = {
    plan_path: planPath,
    spec_ref: specRef ?? null,
    phase: "build",
    pinned_at: new Date().toISOString().slice(0, 10),
  };

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(POINTER_FILE, `${JSON.stringify(pointer, null, 2)}\n`, "utf-8");
  process.stdout.write(`set-active-plan: pinned ${planPath} (phase: build)\n`);
} catch (err) {
  // fail-open: exit 0 on any error
  process.stderr.write(`set-active-plan: ${String(err)}\n`);
}

process.exit(0);
