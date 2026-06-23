#!/usr/bin/env node
// category: internal-only
/**
 * inject-plan-context.mjs — Plan context injection for Claude Code hooks.
 *
 * Scans .forge/plans/*.md for active plans, extracts headers respecting token
 * budget constraints, and outputs them to stdout for UserPromptSubmit hook.
 *
 * Supports --phase <phase> for minimal loading per stage:
 *   build:  only active (incomplete) tasks
 *   review: only headers + acceptance criteria
 *   test:   only task titles
 *   ship:   only progress summary
 *
 * Supports --compact: only task titles, no descriptions.
 *
 * Fail-open: errors produce no output rather than blocking the user.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { shouldSkipForSubagent } from "./lib/hook-stdin-router.mjs";

const PLANS_DIR = ".forge/plans";
const SPECS_DIR = ".forge/specs";
const ACTIVE_PLAN_FILE = ".forge/state/active-plan.json";
const MAX_PLANS = 3;
const MAX_LINES_PER_PLAN = 50;
const MAX_CHARS_PER_PLAN = 2000;
const MAX_TOTAL_CHARS = 8000; // ~2000 tokens

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const phaseIdx = args.indexOf("--phase");
const explicitPhase = phaseIdx !== -1 ? args[phaseIdx + 1] : null;
const compact = args.includes("--compact");

function readStatusContext() {
  if (!existsSync(".forge/status.md")) return { phase: null, currentPackage: null };
  const status = readFileSync(".forge/status.md", "utf-8");
  const phaseMatch = status.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
  const packageMatch = status.match(/^current_package:\s*"?([^"\n]*)"?\s*$/m);
  return {
    phase: phaseMatch?.[1]?.trim() || null,
    currentPackage: packageMatch?.[1]?.trim() || null,
  };
}

const statusContext = readStatusContext();
const phase = explicitPhase ?? statusContext.phase;
const currentPackage = statusContext.currentPackage;

// ---------------------------------------------------------------------------
// Plan filtering
// ---------------------------------------------------------------------------

function isActive(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  return /^status:\s*["']?(active|approved)["']?/m.test(fm[1]);
}

// ---------------------------------------------------------------------------
// R3: active-plan.json pointer (single source of truth) + realpath guard
// ---------------------------------------------------------------------------

/**
 * Read .forge/state/active-plan.json and return the pointed plan content.
 *
 * Security (N-3 fix): uses fs.realpathSync() to resolve the PHYSICAL path and
 * verify it falls inside .forge/plans/. path.resolve() only does lexical
 * normalization (collapses ..) and does NOT resolve symlinks — a symlink inside
 * .forge/plans/ pointing to /etc/passwd would pass a lexical startsWith check
 * but is rejected by realpath, which produces the true filesystem location.
 *
 * Returns null when: pointer missing, malformed, path escapes, or file unreadable
 * (caller falls back to legacy mtime scan).
 */
function tryReadActivePlanPointer() {
  if (!existsSync(ACTIVE_PLAN_FILE)) return null;
  let pointer;
  try {
    pointer = JSON.parse(readFileSync(ACTIVE_PLAN_FILE, "utf-8"));
  } catch {
    return null;
  }
  if (!pointer || typeof pointer.plan_path !== "string") return null;

  const planPath = pointer.plan_path;
  try {
    // Physical path resolution — resolves symlinks, rejects traversal.
    const realPlan = realpathSync(resolve(planPath));
    const realPlansRoot = realpathSync(resolve(PLANS_DIR));
    // Ensure the resolved plan lives inside the resolved plans dir.
    const rel = relative(realPlansRoot, realPlan);
    if (rel.startsWith("..") || resolve(realPlansRoot, rel) !== realPlan) {
      // Escaped .forge/plans/ — refuse, degrade to legacy scan.
      return null;
    }
    const content = readFileSync(realPlan, "utf-8");
    return { content, path: planPath };
  } catch {
    // File missing, symlink broken, or realpath failed — degrade.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase-aware extraction
// ---------------------------------------------------------------------------

/**
 * Extract only active (incomplete) tasks for build phase.
 * Filters out lines starting with - [x] (completed tasks).
 */
function extractBuildTasks(content) {
  const bodyStart = content.indexOf("---", 4); // skip frontmatter
  if (bodyStart === -1) return extractHead(content);
  const body = content.slice(bodyStart + 3);

  // Keep only incomplete task lines and their section headers
  const lines = body.split("\n");
  const filtered = [];
  for (const line of lines) {
    if (line.match(/^##\s/)) {
      filtered.push(line); // Section headers (Wave 1, Wave 2, etc.)
    } else if (line.match(/^- \[ \]/)) {
      filtered.push(compact ? line.replace(/\s*_.+$/, "") : line); // Incomplete tasks
    }
  }
  const result = filtered.join("\n");
  return result.length > MAX_CHARS_PER_PLAN
    ? result.slice(0, MAX_CHARS_PER_PLAN) + "\n[... truncated]"
    : result;
}

/**
 * Extract headers + acceptance criteria for review phase.
 */
function extractReviewContext(content) {
  const bodyStart = content.indexOf("---", 4);
  if (bodyStart === -1) return extractHead(content);
  const body = content.slice(bodyStart + 3);

  // Keep section headers and task titles only
  const lines = body.split("\n");
  const filtered = lines.filter((l) => l.match(/^##\s/) || l.match(/^- \[.\]/));
  const result = filtered.join("\n");
  return result.length > MAX_CHARS_PER_PLAN
    ? result.slice(0, MAX_CHARS_PER_PLAN) + "\n[... truncated]"
    : result;
}

/**
 * Extract only task titles for test/ship phases.
 */
function extractTitles(content) {
  const bodyStart = content.indexOf("---", 4);
  if (bodyStart === -1) return "";
  const body = content.slice(bodyStart + 3);

  const lines = body.split("\n");
  const titles = lines.filter((l) => l.match(/^- \[.\]/));
  return titles.join("\n");
}

function extractHead(content) {
  const lines = content.split("\n").slice(0, MAX_LINES_PER_PLAN);
  const body = lines.join("\n");
  return body.length > MAX_CHARS_PER_PLAN
    ? body.slice(0, MAX_CHARS_PER_PLAN) + "\n[... truncated]"
    : body;
}

function extractExecutionPackages(content) {
  const section = content.match(/## Execution Packages[\s\S]*?```json\n([\s\S]*?)```/);
  if (!section) return [];
  try {
    const parsed = JSON.parse(section[1]);
    return Array.isArray(parsed.execution_packages) ? parsed.execution_packages : [];
  } catch {
    return [];
  }
}

function extractPackageBuildTasks(content, packageId) {
  if (!packageId) return extractBuildTasks(content);
  const packages = extractExecutionPackages(content);
  const pkg = packages.find((candidate) => candidate && candidate.id === packageId);
  if (!pkg || !Array.isArray(pkg.tasks)) return extractBuildTasks(content);

  const bodyStart = content.indexOf("---", 4);
  const body = bodyStart === -1 ? content : content.slice(bodyStart + 3);
  const taskIds = new Set(pkg.tasks);
  const lines = body.split("\n");
  const filtered = [];
  let include = false;

  for (const line of lines) {
    const heading = line.match(/^###\s+([^\s]+)\s+/);
    if (heading) {
      include = taskIds.has(heading[1]);
      if (include) filtered.push(line);
      continue;
    }
    if (include && line.match(/^- \[ \]/)) {
      filtered.push(compact ? line.replace(/\s*_.+$/, "") : line);
    }
  }

  const result = filtered.join("\n");
  return result.length > MAX_CHARS_PER_PLAN
    ? result.slice(0, MAX_CHARS_PER_PLAN) + "\n[... truncated]"
    : result;
}

function extractForPhase(content, phase) {
  if (!phase) return extractHead(content);

  switch (phase) {
    case "build":
      return extractPackageBuildTasks(content, currentPackage);
    case "review":
      return extractReviewContext(content);
    case "test":
    case "ship":
      return extractTitles(content);
    default:
      return extractHead(content);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  if (await shouldSkipForSubagent()) process.exit(0);

  // R3: active-plan.json pointer takes precedence (single source of truth).
  // When present and valid, inject ONLY the pointed plan; otherwise fall back
  // to the legacy mtime-scan path (backward compatible).
  const pointerActive = tryReadActivePlanPointer();
  if (pointerActive !== null) {
    const { content, path } = pointerActive;
    if (isActive(content)) {
      const body = phase ? extractForPhase(content, phase) : extractHead(content);
      if (body.length > 0) {
        let output = "=== Forge Context ===\n";
        if (phase)
          output += `[phase: ${phase}${currentPackage ? ` package: ${currentPackage}` : ""}${compact ? " compact" : ""}]\n`;
        output += `\n--- ${path} ---\n${body}\n`;
        // Respect total budget even for single-pointer injection.
        if (output.length > MAX_TOTAL_CHARS) {
          output = output.slice(0, MAX_TOTAL_CHARS) + "\n[... truncated due to token budget]\n";
        }
        process.stdout.write(output);
      }
    }
    process.exit(0);
  }

  // Legacy path: no active-plan.json — scan plans/ by mtime (backward compat).
  let entries;
  try {
    entries = readdirSync(PLANS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ path: join(PLANS_DIR, f), mtime: statSync(join(PLANS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    // Plans directory doesn't exist — nothing to inject
    process.exit(0);
  }

  const active = [];
  for (const e of entries) {
    if (active.length >= MAX_PLANS) break;
    const content = readFileSync(e.path, "utf-8");
    if (isActive(content)) {
      const body = phase ? extractForPhase(content, phase) : extractHead(content);
      if (body.length > 0) active.push({ path: e.path, body });
    }
  }

  if (active.length === 0) process.exit(0);

  let output = "=== Forge Context ===\n";
  if (phase) output += `[phase: ${phase}${currentPackage ? ` package: ${currentPackage}` : ""}${compact ? " compact" : ""}]\n`;
  let total = output.length;
  for (let i = 0; i < active.length; i++) {
    const chunk = `\n--- ${active[i].path} ---\n${active[i].body}\n`;
    if (total + chunk.length > MAX_TOTAL_CHARS) {
      output += `\n[... ${active.length - i} plans truncated due to token budget]\n`;
      break;
    }
    output += chunk;
    total += chunk.length;
  }

  process.stdout.write(output);
} catch {
  // fail-open: don't inject rather than error
  process.exit(0);
}
