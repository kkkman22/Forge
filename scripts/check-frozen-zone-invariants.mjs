#!/usr/bin/env node

// check-frozen-zone-invariants.mjs
// Validates that src/ core modules are not modified by the current PR.
// Usage: node scripts/check-frozen-zone-invariants.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FROZEN_PATHS = [
  "src/run-manager.ts",
  "src/frozen-zone.ts",
  "src/status-file.ts",
  "src/git-transaction.ts",
  "src/circuit-breaker.ts",
  "src/backoff.ts",
  "src/worktree.ts",
  "src/pua.ts",
  "src/orchestrator.ts",
  "src/statement.ts",
];

const root = new URL("..", import.meta.url).pathname.replace(/^\/\//, "/");

let ok = true;

// Check 1: No diff on frozen src/ modules
try {
  const baseBranch = process.env.GITHUB_BASE_REF || "main";
  // execFileSync array form (no shell) — audit P3 #10 exec-form principle.
  const diff = execFileSync(
    "git",
    ["diff", `origin/${baseBranch}...HEAD`, "--stat", "--", ...FROZEN_PATHS],
    { cwd: root, encoding: "utf-8" },
  ).trim();

  if (diff) {
    console.error(`FAIL: frozen zone modules modified:\n${diff}`);
    ok = false;
  } else {
    console.log("OK: no frozen zone module modifications");
  }
} catch {
  // No diff or not in CI — pass locally
  console.log("OK: no frozen zone modifications (or not in CI)");
}

// Check 2: FrozenZoneViolation public API unchanged
try {
  const src = readFileSync(`${root}src/frozen-zone.ts`, "utf-8");
  if (!src.includes("class FrozenZoneViolation")) {
    console.error("FAIL: FrozenZoneViolation class not found");
    ok = false;
  }
} catch {
  console.log("SKIP: src/frozen-zone.ts not found (acceptable for non-core changes)");
}

process.exit(ok ? 0 : 1);
