#!/usr/bin/env node
// category: internal-only
/**
 * Backward-compatible entry point for registry regeneration.
 *
 * The canonical chain is scripts/sync-command-registry.mjs, which generates
 * registry -> allowlist -> docs -> plugin metadata -> SKILL.md counts.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2).map((arg) => (arg === "--check-only" ? "--check" : arg));
const result = spawnSync(process.execPath, ["scripts/sync-command-registry.mjs", ...args], {
  cwd: ROOT,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
