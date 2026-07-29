#!/usr/bin/env node
// category: internal-only
/**
 * check-deps.mjs — Dependency safety scanner.
 *
 * Verifies:
 *   1. **Typosquatting**: each declared dependency name matches a small
 *      allow-list pattern or is flagged for manual review.
 *   2. **License compatibility**: each resolved dependency's license must
 *      appear in LICENSE_ALLOWLIST (MIT, Apache-2.0, BSD-*, ISC, etc.).
 *   3. **Version pinning**: every entry in `dependencies` must be an
 *      exact version (no leading `^`, `~`, `*`, `>=` etc.) — Forge's
 *      supply-chain policy disallows open ranges for runtime deps.
 *
 * Exit codes:
 *   - 0: clean
 *   - 1: at least one violation detected
 *
 * Run manually with:
 *   node scripts/check-deps.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG_JSON = resolve(ROOT, "package.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Dependency names that are known-good and should not trigger the typosquat
 * heuristic. When adding a new dependency, either add it here after due
 * diligence (see CONTRIBUTING.md §Secure Contribution Guide) or run this
 * script locally with --update-allowlist (not yet implemented — for now
 * edit this list in the PR).
 */
const NAME_ALLOWLIST = new Set([
  // Runtime deps
  "@anthropic-ai/claude-agent-sdk",
  "@modelcontextprotocol/sdk",
  "commander",
  "minimatch",
  "yaml",
  "zod",
  // Dev deps
  "@biomejs/biome",
  "@types/node",
  "@vitest/coverage-v8",
  "@stryker-mutator/core",
  "@stryker-mutator/vitest-runner",
  "fast-check",
  "esbuild",
  "glob",
  "typedoc",
  "typescript",
  "vitest",
  "tsx", // Dev dep — pinned for test runner stability (ADR in PR #66)
  "madge", // Dev dep — circular-dependency gate (scripts/check-circular-deps.mjs)
]);

/**
 * Licenses allowed for all direct dependencies. Anything outside this
 * list requires an ADR justifying the exception.
 */
const LICENSE_ALLOWLIST = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0", // npm transitive (argparse style)
  "BlueOak-1.0.0", // Blue Oak Model License — permissive, MIT-compatible
]);

// ---------------------------------------------------------------------------
// Runtime checks
// ---------------------------------------------------------------------------

/** Exit status — set to 1 on any violation so CI fails. */
let hadViolation = false;

function violate(message) {
  hadViolation = true;
  console.error(`::error::${message}`);
}

function warn(message) {
  console.warn(`::warning::${message}`);
}

// ---------------------------------------------------------------------------
// Load package.json
// ---------------------------------------------------------------------------

if (!existsSync(PKG_JSON)) {
  violate(`package.json not found at ${PKG_JSON}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(PKG_JSON, "utf-8"));
const runtimeDeps = pkg.dependencies ?? {};
const devDeps = pkg.devDependencies ?? {};

// ---------------------------------------------------------------------------
// Check 1: Typosquatting — every declared dep must be in NAME_ALLOWLIST
// ---------------------------------------------------------------------------

for (const name of Object.keys({ ...runtimeDeps, ...devDeps })) {
  if (!NAME_ALLOWLIST.has(name)) {
    violate(
      `dep "${name}" is not in NAME_ALLOWLIST. Add it explicitly in scripts/check-deps.mjs ` +
        "after the typosquatting and license review documented in CONTRIBUTING.md.",
    );
  }
}

// ---------------------------------------------------------------------------
// Check 2: Runtime deps must be exact-pinned
// ---------------------------------------------------------------------------

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

for (const [name, version] of Object.entries(runtimeDeps)) {
  if (!EXACT_SEMVER.test(version)) {
    violate(
      `runtime dep "${name}" has open version range "${version}". ` +
        'Pin to an exact version (no "^"/"~"/"*" prefixes).',
    );
  }
}

// ---------------------------------------------------------------------------
// Check 3: License compatibility (best-effort; skipped when node_modules missing)
// ---------------------------------------------------------------------------

const NODE_MODULES = resolve(ROOT, "node_modules");
if (!existsSync(NODE_MODULES)) {
  warn(
    "node_modules not found; skipping license compatibility check. " +
      "Run `npm ci` first for a full scan.",
  );
} else {
  const allDeps = { ...runtimeDeps, ...devDeps };
  for (const name of Object.keys(allDeps)) {
    const depPkgJson = resolve(NODE_MODULES, name, "package.json");
    if (!existsSync(depPkgJson)) {
      warn(`dep "${name}" has no resolved package.json under node_modules.`);
      continue;
    }
    let depPkg;
    try {
      depPkg = JSON.parse(readFileSync(depPkgJson, "utf-8"));
    } catch (err) {
      warn(`cannot parse ${depPkgJson}: ${err.message}`);
      continue;
    }
    const license = normalizeLicense(depPkg);
    if (license === null) {
      warn(`dep "${name}" has no license field`);
      continue;
    }
    if (license === "SEE-LICENSE-IN-FILE") {
      warn(
        `dep "${name}" uses "SEE LICENSE IN <file>"; review manually and ` +
          "either add its SPDX id to LICENSE_ALLOWLIST or document the exception in an ADR.",
      );
      continue;
    }
    if (!LICENSE_ALLOWLIST.has(license)) {
      violate(
        `dep "${name}" has license "${license}" not in LICENSE_ALLOWLIST. ` +
          "Either remove the dep or add the license after ADR review.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------

if (hadViolation) {
  console.error("\nscripts/check-deps.mjs: at least one violation detected.");
  process.exit(1);
}
console.log("scripts/check-deps.mjs: all checks passed.");
process.exit(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a canonical SPDX license identifier from a package.json. Returns
 * null when no license information is available. Unwraps the common
 * { type, url } object form and picks the first entry of OR-lists.
 */
function normalizeLicense(depPkg) {
  const raw = depPkg.license ?? depPkg.licenses ?? null;
  if (raw === null) return null;
  if (typeof raw === "string") {
    // "SEE LICENSE IN <path>" is npm's convention for non-standard licenses;
    // treat as "needs manual review" rather than an outright failure.
    if (/^SEE\s+LICENSE\s+IN/i.test(raw.trim())) {
      return "SEE-LICENSE-IN-FILE";
    }
    // Handle OR-lists like "(MIT OR Apache-2.0)".
    const match = raw.match(/[A-Za-z0-9.+-]+/);
    return match ? match[0] : null;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first && typeof first.type === "string") {
      return first.type;
    }
  }
  if (typeof raw === "object" && typeof raw.type === "string") {
    return raw.type;
  }
  return null;
}
