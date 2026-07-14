#!/usr/bin/env node
// category: internal-only
/**
 * check-router-no-new-types.mjs — R1-4 CI guard.
 *
 * AST-scans src/router.ts for exported interface/type declarations.
 * Compares against a baseline snapshot. Any new or removed top-level
 * type/interface = non-zero exit.
 *
 * Exit codes:
 *   0: baseline matches
 *   1: new or removed types detected
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ROUTER_PATH = resolve(ROOT, "src/router.ts");

// Baseline: the allowed exported types/interfaces DEFINED directly in router.ts.
// P3-2: TaskType, ProjectPhase, RouteHint moved to router-types.ts (re-exported
// via `export type {...} from`, which this AST scan does not count as a
// definition). Only the 6 still defined inline in router.ts remain.
const BASELINE_TYPES = new Set([
  "Tier",
  "WorkNature",
  "TaskSignals",
  "ProjectType",
  "ProjectContext",
  "ClassificationResult",
]);

function extractExportedTypes(source) {
  const types = new Set();
  // Match: export type X = ... / export interface X { / export interface X{
  const regex = /export\s+(?:type|interface)\s+(\w+)/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    types.add(match[1]);
  }
  return types;
}

function main() {
  const source = readFileSync(ROUTER_PATH, "utf-8");
  const current = extractExportedTypes(source);

  const added = [...current].filter((t) => !BASELINE_TYPES.has(t));
  const removed = [...BASELINE_TYPES].filter((t) => !current.has(t));

  if (added.length > 0) {
    console.error(`❌ New exported types in router.ts: ${added.join(", ")}`);
    console.error("   If intentional, update BASELINE_TYPES in this script.");
  }
  if (removed.length > 0) {
    console.error(`❌ Removed exported types from router.ts: ${removed.join(", ")}`);
    console.error("   If intentional, update BASELINE_TYPES in this script.");
  }

  if (added.length > 0 || removed.length > 0) {
    process.exit(1);
  }

  console.log(`✅ router.ts exported types match baseline (${current.size} types)`);
}

main();
