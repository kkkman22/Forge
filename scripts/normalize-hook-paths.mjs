#!/usr/bin/env node
// scripts/normalize-hook-paths.mjs
//
// P1-2: strip bare-relative fallback branches from hook commands.
//
// Hook commands historically chained `|| node scripts/X.mjs` and
// `|| node forge/scripts/X.mjs` as fallback arms. These resolve to the
// *victim project's CWD* when the hook runs — so a malicious repo shipping
// `scripts/<referenced-name>.mjs` executes on SessionStart with no user
// interaction (RCE). See .forge/reviews/staff-engineer-review-2026-07-13.md
// P1-2.
//
// This normalizer removes every bare-relative arm, keeping only absolute
// invocations:
//   - `${CLAUDE_PLUGIN_ROOT:-}/...`  (marketplace install — host-set)
//   - `~/.claude/skills/forge/...`   (skill install fallback)
//   - `${CLAUDE_PROJECT_DIR}/...`    (project-root absolute — always set)
//
// Modes:
//   (default)   rewrite files in place
//   --check     exit 1 if any file would change (CI gate; no writes)
//
// Self-contained (no dist dependency): this is a config hygiene script that
// must run before any build.

import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

const CHECK = argv.includes("--check");

const FILES = [
  "hooks/hooks.json",
  "dist-plugin/hooks/hooks.json",
  "dist/claude-code/bundles/forge/hooks/hooks.json",
  ".claude/settings.json",
];

// A bare-relative fallback branch: `|| <invoker> <relpath>` where <invoker> is
// node/bash/sh and <relpath> is relative to CWD (no leading $VAR/ or ~/).
// We match the whole ` 2>/dev/null`-suffixed arm so the trailing `|| true`
// stays intact.
//
// Arm shape (after `||`):  ` node scripts/foo.mjs`  / ` bash scripts/x.sh`
//                          ` node forge/scripts/x`  / ` node dist/src/x.js`
// We must NOT match absolute invokers: `${CLAUDE_PLUGIN_ROOT:-}/scripts/...`,
// `~/...`, `${CLAUDE_PROJECT_DIR}/scripts/...`.
const BARE_RELATIVE_ARM =
  /\s*\|\|\s*(node|bash|sh)\s+(scripts\/|forge\/scripts\/|dist\/src\/)[^|]*?(?=\s*\|\||\s*\|\|\s*true|$)/g;

let dirty = 0;
const violations = [];

for (const rel of FILES) {
  let content;
  try {
    content = readFileSync(rel, "utf-8");
  } catch {
    // File may not exist in all checkouts (e.g. dist not yet built) — skip.
    continue;
  }
  // Operate on raw text so we normalize command strings inside JSON without
  // disturbing structure. Only `|| <invoker> <relpath>` arms match.
  const before = content;
  const after = content.replace(BARE_RELATIVE_ARM, "");

  // Normalize the dangling separator left behind: `cmd 2>/dev/null  || true`
  // -> `cmd 2>/dev/null || true` (collapse doubled spaces introduced when an
  // inner arm was stripped between two preserved arms).
  const cleaned = after.replace(/ {2,}\|\|/g, " ||").replace(/\|\| {2,}/g, "|| ");

  // Re-validate: no bare-relative arm survives.
  const leftover = collectCommandStrings(cleaned).filter((c) =>
    /\|\|\s*(?:node|bash|sh)\s+(?:scripts\/|forge\/scripts\/|dist\/src\/)/.test(c),
  );
  if (leftover.length > 0) {
    violations.push({ file: rel, leftover });
  }

  if (cleaned !== before) {
    dirty++;
    if (CHECK) {
      console.error(`✗ ${rel}: bare-relative hook branches present (would strip).`);
      continue;
    }
    writeFileSync(rel, cleaned, "utf-8");
    console.log(`✓ ${rel}: stripped bare-relative fallback branches.`);
  }
}

if (violations.length > 0) {
  console.error("\nFATAL: normalizer left bare-relative branches behind — regex needs fixing:");
  for (const v of violations) {
    console.error(`  ${v.file}:`);
    for (const c of v.leftover) console.error(`    ${c.slice(0, 160)}`);
  }
  exit(2);
}

if (CHECK && dirty > 0) {
  console.error(`\n${dirty} file(s) need normalization. Run: node scripts/normalize-hook-paths.mjs`);
  exit(1);
}

if (!CHECK) {
  console.log(`\nNormalized ${dirty} file(s).`);
}

/** Extract every `command` string value from a parsed-or-unparsed JSON doc. */
function collectCommandStrings(text) {
  // Cheap JSON string scan: every `"command": "..."` value. Avoids needing to
  // know the hooks schema shape.
  const out = [];
  const re = /"command"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    // Unescape \" and \\ for regex matching.
    out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
  return out;
}
