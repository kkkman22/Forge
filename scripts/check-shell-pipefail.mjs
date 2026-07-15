#!/usr/bin/env node
// category: internal-only

/**
 * check-shell-pipefail.mjs — verify every user-facing .sh sets `pipefail`.
 *
 * Audit P1: 33 of 52 .sh scripts lacked `set -euo pipefail`. Pipe-failures in
 * the middle of a pipeline (`check-something | grep`) are silently swallowed,
 * letting a gate script report "pass" when an internal step failed — directly
 * undermining Forge's quality-gate value proposition.
 *
 * Rule: every .sh under scripts/ must contain `set -...o pipefail` or
 * `set -...pipefail` in its first 15 lines, unless listed in .pipefail-exempt.
 * Internal/generated scripts that legitimately cannot use -e (e.g. init.sh
 * companion installs guarded by `|| true`) may set `set -uo pipefail` (no -e)
 * and still pass.
 *
 * Exit codes:
 *   0 — all .sh compliant
 *   1 — one or more .sh missing pipefail
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = __dirname;
const EXEMPT_FILE = join(SCRIPTS_DIR, ".pipefail-exempt");

const PIPEFAIL_RE = /set\s+-[a-zA-Z]*o[^\n]*pipefail|set\s+-[a-zA-Z]*pipefail/;

function parseExemptList(content) {
  return content
    .split("\n")
    .map((line) => {
      const stripped = line.trim();
      if (stripped === "" || stripped.startsWith("#")) return null;
      return stripped.split("#")[0].trim() || null;
    })
    .filter((entry) => entry !== null);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;
let skip = 0;

const exemptSet = new Set();
if (existsSync(EXEMPT_FILE)) {
  const exemptContent = readFileSync(EXEMPT_FILE, "utf-8");
  for (const entry of parseExemptList(exemptContent)) {
    exemptSet.add(entry);
  }
}

const files = readdirSync(SCRIPTS_DIR);
const shFiles = files.filter((f) => f.endsWith(".sh"));

for (const file of shFiles) {
  const fullPath = join(SCRIPTS_DIR, file);
  const relPath = `scripts/${file}`;

  if (exemptSet.has(relPath) || exemptSet.has(file)) {
    skip++;
    continue;
  }

  const content = readFileSync(fullPath, "utf-8");
  // Check the shebang/option header (first 25 lines — some scripts carry a
  // long docstring before the `set` line). `set` much later in the file (e.g.
  // re-enabled after a conditional block) doesn't protect the whole script.
  const header = content.split("\n").slice(0, 25).join("\n");

  if (PIPEFAIL_RE.test(header)) {
    pass++;
  } else {
    console.log(`FAIL ${relPath} — missing 'set -o pipefail' in header (add 'set -euo pipefail' after the shebang, or list in scripts/.pipefail-exempt with a reason)`);
    fail++;
  }
}

console.log(`Shell pipefail check: ${pass} passed, ${fail} failed, ${skip} skipped`);
if (fail > 0) process.exit(1);
