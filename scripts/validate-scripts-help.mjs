#!/usr/bin/env node
// category: internal-only
// ============================================================================
// validate-scripts-help.mjs — Verify user-facing scripts have --help
//
// Scans scripts/*.{sh,mjs} for category comments, checks user-facing scripts
// respond to --help with output containing "Usage:". Exempt scripts listed in
// scripts/.help-exempt are skipped.
//
// Rules mirrored from src/script-help.ts, inline implementation.
//
// Usage:
//   node scripts/validate-scripts-help.mjs
//
// Exit code:
//   0  All user-facing scripts pass --help check
//   1  At least one user-facing script fails
// ============================================================================

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = __dirname;
const EXEMPT_FILE = join(SCRIPTS_DIR, ".help-exempt");

// ---------------------------------------------------------------------------
// Pure functions (mirrors src/script-help.ts)
// ---------------------------------------------------------------------------

const CATEGORY_RE = /(?:\/\/|#)\s*category:\s*(user-facing|internal-only|one-off)/;

function parseScriptCategory(content) {
  const match = CATEGORY_RE.exec(content);
  return match ? match[1] : "unclear";
}

function parseHelpExempt(content) {
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

const SCRIPT_EXTENSIONS = [".sh", ".mjs"];

let pass = 0;
let fail = 0;
let skip = 0;

// Load exempt list
const exemptSet = new Set();
if (existsSync(EXEMPT_FILE)) {
  const exemptContent = readFileSync(EXEMPT_FILE, "utf-8");
  for (const entry of parseHelpExempt(exemptContent)) {
    exemptSet.add(entry);
  }
}

// Scan scripts
const files = readdirSync(SCRIPTS_DIR);
const scriptFiles = files.filter((f) =>
  SCRIPT_EXTENSIONS.some((ext) => f.endsWith(ext)),
);

for (const file of scriptFiles) {
  const fullPath = join(SCRIPTS_DIR, file);
  const relPath = `scripts/${file}`;

  if (exemptSet.has(relPath)) {
    skip++;
    continue;
  }

  const content = readFileSync(fullPath, "utf-8");
  const category = parseScriptCategory(content);

  if (category !== "user-facing") {
    skip++;
    continue;
  }

  // Execute --help
  const runner = file.endsWith(".sh") ? "bash" : "node";
  try {
    const output = execFileSync(runner, [fullPath, "--help"], {
      timeout: 10000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (output.includes("Usage:")) {
      pass++;
    } else {
      fail++;
      console.log(`FAIL ${relPath} — --help output missing "Usage:"`);
    }
  } catch (e) {
    fail++;
    console.log(`FAIL ${relPath} — --help failed: ${e.message}`);
  }
}

console.log(`\nScripts Help Check: ${pass} passed, ${fail} failed, ${skip} skipped`);

if (fail > 0) {
  process.exit(1);
}
