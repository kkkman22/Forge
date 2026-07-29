#!/usr/bin/env node
// category: user-facing
/**
 * check-circular-deps.mjs — Gate new circular dependencies in src/.
 *
 * Runs `madge --circular` over src/ and compares the detected cycles against a
 * frozen allowlist (`scripts/.circular-allowlist.json`). The allowlist captures
 * the pre-existing cycles so this gate fails ONLY on newly introduced cycles,
 * freezing the存量 and letting teams clear them incrementally.
 *
 * Cycle signature = the sorted set of module basenames in the cycle, joined by
 * ` -> `. Order-insensitive so a cycle reported in either direction matches.
 *
 * Usage:
 *   node scripts/check-circular-deps.mjs          # gate (exit 1 on new cycle)
 *   node scripts/check-circular-deps.mjs --update  # rewrite allowlist to current
 *   node scripts/check-circular-deges.mjs --help    # (handled below)
 *
 * Exits:
 *   0 — no new cycles (all detected cycles are in the allowlist)
 *   1 — one or more new cycles detected, OR a previously-allowlisted cycle has
 *       been resolved (stale allowlist entry) in strict mode
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const ALLOWLIST_PATH = resolve(SCRIPT_DIR, ".circular-allowlist.json");

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "Usage: node scripts/check-circular-deps.mjs [--update]",
      "",
      "Gate new circular dependencies in src/ against a frozen allowlist.",
      "",
      "Options:",
      "  --update   Rewrite the allowlist to match the currently detected cycles",
      "             (use after intentionally clearing/changing the cycle set).",
      "  --help     Show this help.",
      "",
      "Exit codes: 0 = no new cycles, 1 = new cycles (or stale allowlist).",
      "",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

const updateMode = args.includes("--update");

// ── Run madge via its programmatic API ─────────────────────────────────────
// Using the API (not the CLI) avoids depending on node_modules/.bin being on
// PATH, which fails under CI / npx invocation.
const require = createRequire(import.meta.url);
const madge = require("madge");

/** @type {string[][]} */
let cycles;
try {
  const result = await madge(["src/"], {
    extensions: ["ts"],
    fileExtensions: ["ts"],
  });
  cycles = result.circular();
} catch (err) {
  process.stderr.write(`ERROR: madge invocation failed: ${err?.message ?? err}\n`);
  process.exit(1);
}

// ── Normalize cycle signatures ─────────────────────────────────────────────
/**
 * A cycle is an ordered path of modules. Normalize to a signature that is
 * stable regardless of traversal direction: the sorted set of leaf basenames.
 * Strips the `src/` prefix and directory components so `grill/glossary.ts` and
 * `glossary.ts` from different dirs still fingerprint the same logical cycle.
 */
function signature(cycle) {
  const basenames = cycle.map((mod) => {
    const leaf = mod.split("/").pop();
    return leaf;
  });
  return [...new Set(basenames)].sort().join(" -> ");
}

const detected = new Map(); // sig -> raw cycle
for (const cycle of cycles) {
  detected.set(signature(cycle), cycle);
}

// ── --update: rewrite allowlist to current state (no prior allowlist needed) ──
if (updateMode) {
  const sigs = [...detected.keys()].sort();
  const next = {
    version: 1,
    frozen_at: new Date().toISOString().slice(0, 10),
    cycles: sigs,
  };
  writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(
    `Updated ${ALLOWLIST_PATH}: ${sigs.length} cycle(s) frozen.\n` +
      sigs.map((s) => `  - ${s}`).join("\n") +
      "\n",
  );
  process.exit(0);
}

// ── Load allowlist ─────────────────────────────────────────────────────────
/** @type {{ version: number, frozen_at: string, cycles: string[] }} */
let allowlist;
try {
  allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8"));
} catch {
  process.stderr.write(`ERROR: allowlist not found at ${ALLOWLIST_PATH}\n`);
  process.stderr.write("       Run `node scripts/check-circular-deps.mjs --update` to seed it.\n");
  process.exit(1);
}

const allowed = new Set(allowlist.cycles);

// ── Gate: new cycles vs allowlist ──────────────────────────────────────────
const newCycles = [...detected.keys()].filter((sig) => !allowed.has(sig));
const staleEntries = [...allowed].filter((sig) => !detected.has(sig));

if (newCycles.length === 0 && staleEntries.length === 0) {
  process.stdout.write(
    `✓ No new circular dependencies (${detected.size} frozen cycle(s) present).\n`,
  );
  process.exit(0);
}

process.stdout.write("✗ Circular dependency gate failed.\n");
if (newCycles.length > 0) {
  process.stdout.write(`\nNEW cycles (${newCycles.length}) — must break before merge:\n`);
  for (const sig of newCycles) {
    const cycle = detected.get(sig);
    process.stdout.write(`  • ${sig}\n`);
    process.stdout.write(`    path: ${cycle.join(" -> ")}\n`);
  }
  process.stdout.write(
    "\nBreak by extracting shared types into a `*-types.ts` module (repo precedent:\n" +
      "router-types.ts, session-types.ts, grill/types.ts). See audit §3.1.\n",
  );
}
if (staleEntries.length > 0) {
  process.stdout.write(
    `\nSTALE allowlist entries (${staleEntries.length}) — cycle resolved, clean up the allowlist:\n`,
  );
  for (const sig of staleEntries) {
    process.stdout.write(`  • ${sig}\n`);
  }
  process.stdout.write("  Run `node scripts/check-circular-deps.mjs --update` to refresh.\n");
}
process.exit(1);
