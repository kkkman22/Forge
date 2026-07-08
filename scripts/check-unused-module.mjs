#!/usr/bin/env node
// category: internal-only
// ============================================================================
// check-unused-module.mjs — Four-dimensional dead-code detector.
//
// Given a module path (e.g. `src/state-machine/`), decide whether it is dead
// code by scanning FOUR dimensions for references:
//   (a) src dimension   — `import ... from "...<module>"` in src/**/*.ts
//   (b) scripts dimension — same, in scripts/**/*.{ts,mjs}
//   (c) test dimension  — test/ imports the module OR calls its exported symbols
//   (d) data dimension  — heuristic: map `state-machine` ↔ `state_machines` and
//                          grep packs/*/pack.yaml manifest + packs/*/state-machines/*.yaml
//
// Any hit → report (file:line + dimension) + exit 1 (NOT dead code).
// Zero hits → exit 0 (dead code).
//
// Skip mechanism (three states, mirrors check-dist-sync.mjs):
//   • FORGE_SKIP_UNUSED_CHECK=1                  → exit 0 + warn
//   • `[unused-check-skip]` in last commit msg   → exit 0 + warn
//   • NO module argument (bare invocation)       → exit 0 + warn
//     (avoids false-positives when wired into `npm run check` against the whole repo)
//
// Read-only (INV-1): grep-level scans only, zero writes, zero new dependencies.
//
// Usage:
//   node scripts/check-unused-module.mjs <module-path>
//   node scripts/check-unused-module.mjs --help
// ============================================================================

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SKIP_ENV = "FORGE_SKIP_UNUSED_CHECK";
const SKIP_COMMIT_TAG = "[unused-check-skip]";

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`${msg}\n`);
}

/**
 * Print usage and exit 0.
 */
function printHelp() {
  log("check-unused-module.mjs — four-dimensional dead-code detector");
  log("");
  log("Usage:");
  log("  node scripts/check-unused-module.mjs <module-path>");
  log("  node scripts/check-unused-module.mjs --help");
  log("");
  log("Scans src/ scripts/ test/ packs/ for references to <module-path>.");
  log("Exits 1 (NOT dead code) if any reference is found; 0 if none (dead).");
  log("");
  log("Skip (exit 0):");
  log(`  ${SKIP_ENV}=1   |   '${SKIP_COMMIT_TAG}' in commit msg   |   no module arg`);
  process.exit(0);
}

/**
 * Resolve a module argument to a repo-relative directory + a set of import
 * specifier candidates to grep for. Returns null if the path does not exist.
 *
 * Candidates cover the common relative-import shapes the module can be
 * referenced by, derived from its path tail (e.g. `state-machine/registry.js`,
 * `state-machine/index.js`, `state-machine`).
 */
function resolveModule(moduleArg) {
  const abs = path.isAbsolute(moduleArg) ? moduleArg : path.resolve(REPO_ROOT, moduleArg);
  if (!fs.existsSync(abs)) return null;
  // Normalize to repo-relative if inside the repo; otherwise keep the basename.
  let rel = abs.startsWith(REPO_ROOT) ? path.relative(REPO_ROOT, abs) : abs;
  rel = rel.replace(/\\/g, "/");
  // Strip a trailing index file: `src/state-machine/index.ts` → `src/state-machine`
  rel = rel.replace(/\/index\.(ts|js|d\.ts)$/, "").replace(/\.(ts|js|d\.ts)$/, "");
  // Derive the module "name" — the last path segment.
  const segments = rel.split("/").filter(Boolean);
  const name = segments[segments.length - 1] || rel;
  return { rel, name, abs };
}

/**
 * Build the set of grep needles for a module. Order matters only for reporting;
 * the broadest (the path tail) is included so absolute-path fixtures (outside
 * the repo) still match on their unique basename.
 */
function buildNeedles(mod) {
  const { rel, name } = mod;
  const needles = new Set();
  // 1. The bare directory name (e.g. "state-machine"). Catches `from ".../state-machine/..."`,
  //    test imports, and absolute-path fixtures whose basename is unique.
  needles.add(name);
  // 2. Repo-relative path fragments after each `src/` (e.g. "state-machine/registry").
  //    Imports like `from "../state-machine/registry.js"` should match.
  const srcIdx = rel.indexOf("src/");
  if (srcIdx >= 0) {
    const afterSrc = rel.slice(srcIdx + 4); // drop leading "src/"
    needles.add(afterSrc);
    needles.add(afterSrc.replace(/\/index$/, ""));
  }
  // 3. Whole repo-relative path (for scripts/data greps).
  needles.add(rel);
  return [...needles];
}

// ---------------------------------------------------------------------------
// Pure scan functions — each returns an array of { file, line, text, needle } hits.
// ---------------------------------------------------------------------------

/**
 * Is this line a comment line (its `from`/`require`/symbol text would be prose)?
 * Shared by scanImports and scanTestPublicApiUsage to avoid divergence.
 */
function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/** Collect files under a repo dir matching given extensions (on-disk). */
function collectFiles(dir, exts) {
  const root = path.resolve(REPO_ROOT, dir);
  const out = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
        walk(full);
      } else if (exts.some((x) => e.name.endsWith(x))) {
        out.push(path.relative(REPO_ROOT, full).replace(/\\/g, "/"));
      }
    }
  }
  if (fs.existsSync(root)) walk(root);
  return out;
}

/**
 * Dimension (a)/(b): imports of the module in src/ or scripts/.
 * Looks for `from "..."` or `require("...")` lines containing a needle.
 */
function scanImports(scope /* "src" | "scripts" */) {
  const exts = scope === "scripts" ? [".ts", ".mjs", ".js"] : [".ts", ".mts"];
  const files = collectFiles(scope, exts);
  const importHits = [];
  // Avoid self-reference: the detector's own source mentions module names in
  // comments/examples and must not count itself as a consumer.
  const selfPath = path.relative(REPO_ROOT, new URL(import.meta.url).pathname).replace(/^\.\//, "");
  for (const file of files) {
    if (file === selfPath) continue;
    let content;
    try {
      content = fs.readFileSync(path.resolve(REPO_ROOT, file), "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines — their `from`/`require` text is prose, not a real import.
      if (isCommentLine(line)) continue;
      if (!/(\bfrom\s+["']|require\s*\(\s*["']|import\s*\(.*["'])/.test(line)) continue;
      for (const needle of scanImports._needles) {
        if (line.includes(needle)) {
          importHits.push({ file, line: i + 1, text: line.trim(), needle });
          break;
        }
      }
    }
  }
  return importHits;
}
// Needles are injected by the caller (runCheck) to keep scanImports a pure fn.
scanImports._needles = [];

/**
 * Dimension (c): test/ usage — either the test imports the module, OR it calls
 * one of the module's exported symbols.
 */
function scanTestPublicApiUsage(mod) {
  const testFiles = collectFiles("test", [".ts"]);
  const needles = buildNeedles(mod);
  // Also gather exported symbol names from the module to catch bare calls.
  const symbols = collectModuleExports(mod.abs).map((s) => s.name);
  const exportNeedles = symbols.filter((s) => s.length >= 4); // avoid short false-positives
  const hits = [];
  for (const file of testFiles) {
    let content;
    try {
      content = fs.readFileSync(path.resolve(REPO_ROOT, file), "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // import line referencing the module path
      if (/(\bfrom\s+["']|require\s*\(\s*["']|import\s*\(.*["'])/.test(line)) {
        for (const needle of needles) {
          if (line.includes(needle)) {
            hits.push({ file, line: i + 1, text: line.trim(), needle, via: "import" });
            break;
          }
        }
        if (hits.length && hits[hits.length - 1].file === file && hits[hits.length - 1].line === i + 1) continue;
      }
      // usage of an exported symbol on a non-import line
      for (const sym of exportNeedles) {
        const re = new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        if (re.test(line) && !isCommentLine(line)) {
          hits.push({ file, line: i + 1, text: line.trim(), needle: sym, via: "symbol" });
          break;
        }
      }
    }
  }
  return hits;
}

/**
 * Extract exported symbol names from a module dir using the spec-provided regex
 * (mirrors scripts/check-public-api.mjs:80-95).
 */
function collectModuleExports(moduleAbs) {
  const symbols = [];
  const isDir = fs.statSync(moduleAbs).isDirectory();
  const files = isDir ? collectAbsFiles(moduleAbs, [".ts"]) : [moduleAbs];
  const RE = /(?:export\s+(?:declare\s+)?(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)|export\s+\{([^}]+)\})/;
  for (const file of files) {
    if (file.endsWith(".d.ts")) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const m = line.match(RE);
      if (!m) continue;
      if (m[1]) {
        symbols.push({ name: m[1], file });
      } else if (m[2]) {
        for (const part of m[2].split(",")) {
          const t = part.trim().replace(/^type\s+/, "");
          const name = t.includes(" as ") ? t.split(" as ").pop().trim() : t;
          if (name) symbols.push({ name, file });
        }
      }
    }
  }
  return symbols;
}

/** Collect absolute file paths under a dir (node_modules excluded). */
function collectAbsFiles(dir, exts) {
  const out = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        walk(full);
      } else if (exts.some((x) => e.name.endsWith(x))) {
        out.push(full);
      }
    }
  }
  walk(dir);
  return out;
}

/**
 * Dimension (d): heuristic data-dir usage.
 * Maps `state-machine` ↔ `state_machines`, then greps:
 *   - packs/{name}/pack.yaml manifest keys (e.g. `state_machines:`)
 *   - packs/{name}/state-machines/...yaml file existence
 */
function scanDataDirUsage(mod) {
  const hits = [];
  const name = mod.name;
  // Build alias set: kebab ↔ snake_case, plus singular ↔ plural
  // (state-machine ↔ state_machines ↔ state-machines ↔ state_machine).
  const base = [name, name.replace(/-/g, "_"), name.replace(/_/g, "-")];
  const aliases = new Set();
  for (const b of base) {
    aliases.add(b);
    aliases.add(`${b}s`); // plural
    aliases.add(b.endsWith("s") ? b.slice(0, -1) : `${b}s`); // inverse
  }
  // Manifest: packs/<pack>/pack.yaml lines referencing any alias.
  const packsDir = path.resolve(REPO_ROOT, "packs");
  if (fs.existsSync(packsDir)) {
    for (const pack of fs.readdirSync(packsDir, { withFileTypes: true })) {
      if (!pack.isDirectory()) continue;
      const manifest = path.join(packsDir, pack.name, "pack.yaml");
      if (!fs.existsSync(manifest)) continue;
      const relManifest = path.relative(REPO_ROOT, manifest).replace(/\\/g, "/");
      const lines = fs.readFileSync(manifest, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const alias of aliases) {
          if (lines[i].includes(alias)) {
            hits.push({ file: relManifest, line: i + 1, text: lines[i].trim(), needle: alias });
            break;
          }
        }
      }
    }
  }
  // Direct data files: packs/<pack>/<alias>/...yaml existence.
  // Report the data DIRECTORY path (e.g. packs/pms/state-machines) so callers
  // can locate the concrete asset, per DoD.
  const yamlFiles = collectFiles("packs", [".yaml"]);
  const seenDirs = new Set();
  for (const f of yamlFiles) {
    for (const alias of aliases) {
      const seg = `${alias}/`;
      const idx = f.indexOf(`/${seg}`);
      if (idx < 0 && !f.endsWith(`/${alias}.yaml`)) continue;
      // Derive the data directory path (packs/<pack>/<alias>).
      if (idx >= 0) {
        const dirEnd = idx + 1 + seg.length - 1; // position of trailing slash of alias
        const dirPath = f.slice(0, dirEnd);
        if (!seenDirs.has(dirPath)) {
          seenDirs.add(dirPath);
          hits.push({ file: dirPath, line: 0, text: "(data directory)", needle: alias });
        }
      } else {
        hits.push({ file: f, line: 0, text: "(data file)", needle: alias });
      }
      break;
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Skip wiring (mirrors check-dist-sync.mjs)
// ---------------------------------------------------------------------------

function checkSkip() {
  if (process.env[SKIP_ENV] === "1") {
    log(`⚠️  unused-module: SKIPPED (${SKIP_ENV}=1)`);
    return true;
  }
  try {
    const msg = execSync("git log -1 --format=%B", { encoding: "utf-8", cwd: REPO_ROOT }).trim();
    if (msg.includes(SKIP_COMMIT_TAG)) {
      log(`⚠️  unused-module: SKIPPED ('${SKIP_COMMIT_TAG}' in commit message)`);
      return true;
    }
  } catch {
    /* no commits yet — ignore */
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function runCheck(moduleArg) {
  const mod = resolveModule(moduleArg);
  if (!mod) {
    logError(`✗ unused-module: path not found: ${moduleArg}`);
    process.exit(1);
  }

  const needles = buildNeedles(mod);
  scanImports._needles = needles;

  const results = {
    "(a) src imports": scanImports("src"),
    "(b) scripts imports": scanImports("scripts"),
    "(c) test usage": scanTestPublicApiUsage(mod),
    "(d) data dir": scanDataDirUsage(mod),
  };

  const total = Object.values(results).reduce((n, h) => n + h.length, 0);

  if (total === 0) {
    log(`unused-module: OK — no references to '${mod.rel}' (appears to be dead code)`);
    process.exit(0);
  }

  log(`✗ unused-module: '${mod.rel}' is REFERENCED — not dead code\n`);
  for (const [dim, hits] of Object.entries(results)) {
    if (hits.length === 0) continue;
    log(`── ${dim} (${hits.length}) ──`);
    for (const h of hits.slice(0, 40)) {
      const loc = h.line ? `${h.file}:${h.line}` : h.file;
      const via = h.via ? ` [${h.via}]` : "";
      log(`  ${loc}${via}  →  ${h.text}`);
    }
    if (hits.length > 40) log(`  ...and ${hits.length - 40} more`);
    log("");
  }
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  // Skip: env or commit-tag.
  if (checkSkip()) process.exit(0);

  // Skip: no module argument → exit 0 + warn (safe for `npm run check` wiring).
  if (args.length === 0) {
    log("⚠️  unused-module: SKIPPED (no module path provided — pass a module to scan)");
    process.exit(0);
  }

  runCheck(args[0]);
}

main();
