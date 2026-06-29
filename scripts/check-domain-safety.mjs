#!/usr/bin/env node
/**
 * check-domain-safety.mjs — safety patrol for the in-repo reference domain.
 *
 * Guards the security red lines for src/domain/ (REQ-08, INV-2/4):
 *   Layer 1 — src/domain/ contains NO unsafe runtime surface:
 *     eval / new Function / SQL string concatenation / fs writes / child_process
 *     / network (fetch/http/net) / hardcoded secrets.
 *   Layer 2 — the engine side (src/ EXCLUDING src/domain/) does NOT import the
 *     reference domain (INV-2: one-way dependency; domain may use engine, never
 *     the reverse).
 *   Layer 3 — every src/domain/*.ts file carries a @non-production header.
 *
 * Exit 0 if clean, exit 1 on any violation. Skippable via
 * FORGE_SKIP_DOMAIN_SAFETY=1 or [domain-safety-skip] in the latest commit.
 *
 * @non-production reference-domain guard — itself a Forge check, not shipped
 * inside src/domain/.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DOMAIN_DIR = join(ROOT, "src/domain");
const SRC_DIR = join(ROOT, "src");

// ── Logging ───────────────────────────────────────────────────────────
const log = (m) => process.stdout.write(`${m}\n`);
const logErr = (m) => process.stderr.write(`${m}\n`);

// ── Skip ──────────────────────────────────────────────────────────────
function checkSkip() {
  if (process.env.FORGE_SKIP_DOMAIN_SAFETY === "1") {
    log("⚠️  domain-safety: SKIPPED (FORGE_SKIP_DOMAIN_SAFETY=1)");
    return true;
  }
  try {
    const msg = execSync("git log -1 --format=%B", { encoding: "utf-8", cwd: ROOT }).trim();
    if (msg.includes("[domain-safety-skip]")) {
      log("⚠️  domain-safety: SKIPPED ([domain-safety-skip] in commit message)");
      return true;
    }
  } catch {
    // no commits — skip
  }
  return false;
}

// ── File walking ──────────────────────────────────────────────────────
function walkTs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

// ── Layer 1: unsafe patterns in src/domain/ ───────────────────────────
// Patterns chosen to avoid matching comments discussing the constraints
// (e.g. a comment saying "no eval" must NOT trip). We strip comments first.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const UNSAFE_PATTERNS = [
  { name: "eval()", re: /\beval\s*\(/ },
  { name: "new Function()", re: /new\s+Function\s*\(/ },
  { name: "SQL concatenation", re: /\b(SELECT|INSERT|UPDATE|DELETE)\b.*['"`].*\+/i },
  { name: "child_process", re: /require\s*\(\s*['"]child_process['"]\)|from\s+['"]node:child_process['"]/ },
  { name: "fs write", re: /\.(writeFile|appendFile|writeFileSync|appendFileSync)\s*\(/ },
  { name: "network fetch", re: /\bfetch\s*\(|require\s*\(\s*['"]node:http['"]\)|from\s+['"]node:http['"]|require\s*\(\s*['"]node:net['"]\)|from\s+['"]node:net['"]/ },
  { name: "hardcoded secret", re: /\b(password|secret|api_?key|token)\s*[:=]\s*['"][A-Za-z0-9]{8,}['"]/i },
];

function checkUnsafePatterns(domainFiles) {
  const violations = [];
  for (const f of domainFiles) {
    const code = stripComments(readFileSync(f, "utf-8"));
    for (const { name, re } of UNSAFE_PATTERNS) {
      if (re.test(code)) violations.push({ file: relative(ROOT, f), pattern: name });
    }
  }
  return violations;
}

// ── Layer 2: engine side must not import domain (INV-2) ───────────────
// Matches both side-effect imports (import "....domain...") and named imports
// (from "....domain...") / require("....domain...").
const DOMAIN_IMPORT_RE = /(?:^|\s)(?:import|from)\s+['"][^'"]*\/(?:src\/)?domain(?:\/[^'"]*)?['"]|(?:require\s*\(\s*)['"][^'"]*\/(?:src\/)?domain(?:\/[^'"]*)?['"]/;

function checkEngineImports(engineFiles) {
  const violations = [];
  for (const f of engineFiles) {
    const code = stripComments(readFileSync(f, "utf-8"));
    if (DOMAIN_IMPORT_RE.test(code)) {
      violations.push({ file: relative(ROOT, f) });
    }
  }
  return violations;
}

// ── Layer 3: @non-production header on all domain files ───────────────
function checkNonProductionHeader(domainFiles) {
  const violations = [];
  for (const f of domainFiles) {
    const head = readFileSync(f, "utf-8").slice(0, 400);
    if (!/@non-production|NOT FOR PRODUCTION/.test(head)) {
      violations.push({ file: relative(ROOT, f) });
    }
  }
  return violations;
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  if (checkSkip()) process.exit(0);

  let totalIssues = 0;

  const domainFiles = walkTs(DOMAIN_DIR);
  // Engine side: all src/*.ts EXCLUDING src/domain/**
  const allSrc = walkTs(SRC_DIR);
  const engineFiles = allSrc.filter((f) => !f.replace(/\\/g, "/").includes("/domain/"));

  log(`domain-safety: scanning ${domainFiles.length} domain files + ${engineFiles.length} engine files...`);

  // Layer 1
  const unsafe = checkUnsafePatterns(domainFiles);
  if (unsafe.length > 0) {
    log("❌ domain-safety: unsafe patterns in src/domain/ (INV-4)\n");
    for (const v of unsafe) log(`  ${v.pattern} — ${v.file}`);
    log("");
    totalIssues += unsafe.length;
  }

  // Layer 2
  const engineImports = checkEngineImports(engineFiles);
  if (engineImports.length > 0) {
    log("❌ domain-safety: engine imports reference domain (INV-2 violation)\n");
    for (const v of engineImports) log(`  ${v.file}`);
    log("");
    totalIssues += engineImports.length;
  }

  // Layer 3
  const missingHeader = checkNonProductionHeader(domainFiles);
  if (missingHeader.length > 0) {
    log("❌ domain-safety: missing @non-production header\n");
    for (const v of missingHeader) log(`  ${v.file}`);
    log("");
    totalIssues += missingHeader.length;
  }

  if (totalIssues > 0) {
    logErr(`domain-safety: FAILED — ${totalIssues} violation(s)`);
    process.exit(1);
  }

  log(`domain-safety: OK — ${domainFiles.length} domain files clean, no engine→domain import, all @non-production`);
  process.exit(0);
}

main();
