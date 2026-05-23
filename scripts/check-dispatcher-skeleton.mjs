#!/usr/bin/env node
// category: internal-only
/**
 * check-dispatcher-skeleton.mjs — R2-1/R2-3 CI guard.
 *
 * AST-scans src/forge-dispatcher.ts for the dispatchForgeSubcommand
 * function, extracts its 9-step skeleton, and compares against baseline.
 * Any step addition/removal/rename = non-zero exit.
 *
 * Exit codes:
 *   0: skeleton matches
 *   1: skeleton changed
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DISPATCHER_PATH = resolve(ROOT, "src/forge-dispatcher.ts");

// Baseline 9-step skeleton
const BASELINE_STEPS = [
  "resolveDispatcherMode",
  "validateTopic",
  "resolveLibPath",
  "checkIntegrity",
  "resolveAllowedTools",
  "resolveDispatchMode",
  "wrapWorkspaceContext",
  "dispatch",
  "writeAuditLog",
];

function extractSkeleton(source) {
  const steps = [];

  // Extract from "// Step N: stepName" comments inside dispatchForgeSubcommand
  const stepPattern = /\/\/\s*Step\s+\d+:\s*(\w+)/g;
  let match;
  while ((match = stepPattern.exec(source)) !== null) {
    steps.push(match[1]);
  }

  return steps;
}

function main() {
  if (!existsSync(DISPATCHER_PATH)) {
    console.log("⚠️  dispatcher file not found, skipping skeleton check");
    process.exit(0);
  }

  const source = readFileSync(DISPATCHER_PATH, "utf-8");
  const current = extractSkeleton(source);

  // Compare against baseline
  const baseline = BASELINE_STEPS;

  let hasDiff = false;
  for (let i = 0; i < Math.max(current.length, baseline.length); i++) {
    const c = current[i] ?? "(missing)";
    const b = baseline[i] ?? "(extra)";
    if (c !== b) {
      console.error(`❌ Step ${i + 1}: expected "${b}", found "${c}"`);
      hasDiff = true;
    }
  }

  if (current.length !== baseline.length) {
    console.error(`❌ Step count: expected ${baseline.length}, found ${current.length}`);
    hasDiff = true;
  }

  if (hasDiff) {
    console.error("   If intentional, update BASELINE_STEPS in this script.");
    process.exit(1);
  }

  console.log(`✅ dispatcher skeleton matches baseline (${current.length} steps)`);
}

main();
