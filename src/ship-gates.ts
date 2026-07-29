/**
 * Ship gate I/O functions — file-system aware gate checks.
 *
 * These pure functions read from .forge/ directories and produce
 * structured GateResult objects. They complement the existing
 * checkShipGate() in ship.ts which operates on already-parsed inputs.
 *
 * This file is now a re-export barrel. The implementations live in the
 * `ship-gates/` submodules (god-file split, following the `context-budget/`
 * + `pua-engine/` precedent). All public exports are re-exported here so
 * existing `import { … } from "../ship-gates.js"` callers — including the
 * `src/index.ts` barrel — keep working unchanged.
 *
 * **Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.4, 4.1, 4.2, 4.3, 4.4**
 */

import type { Methodology } from "./schemas/review-report.js";
import type { FallbackLadderConditions } from "./ship-gates/fallback-ladder.js";
import { checkFallbackLadderGate } from "./ship-gates/fallback-ladder.js";
import type { PersistGateResultsOptions, PersistGateResultsResult } from "./ship-gates/persist.js";
import { persistGateResults } from "./ship-gates/persist.js";
import { checkPolicyProfileArtifactGate } from "./ship-gates/policy-artifact-gate.js";
import type { P1Fixlist, P1FixlistEntry } from "./ship-gates/review-gate.js";
import {
  checkReviewGate,
  generateP1Fixlist,
  parseP1Fixlist,
  updateFixlistWithCommits,
} from "./ship-gates/review-gate.js";
import type { PackageCompletionInput } from "./ship-gates/test-progress-gates.js";
import {
  checkPackageCompletionGate,
  checkProgressGate,
  checkTestGate,
} from "./ship-gates/test-progress-gates.js";

// ---------------------------------------------------------------------------
// Core types — defined in the leaf `ship-gates/types.ts` so submodules import
// from there (not from this barrel), avoiding a barrel↔submodule cycle.
// Re-exported here for public-API stability.
// ---------------------------------------------------------------------------

export type { GateName, GateResult, ShipGateReport, SkipGateOptions } from "./ship-gates/types.js";

import type { GateName, GateResult, ShipGateReport, SkipGateOptions } from "./ship-gates/types.js";

// ---------------------------------------------------------------------------
// Re-exported public API (definitions live in submodules)
// ---------------------------------------------------------------------------

export type { FallbackLadderConditions } from "./ship-gates/fallback-ladder.js";
// Fallback ladder
export {
  checkFallbackLadderGate,
  evaluateFallbackLadder,
} from "./ship-gates/fallback-ladder.js";
export type {
  PersistGateResultsOptions,
  PersistGateResultsResult,
} from "./ship-gates/persist.js";
// Gate result persistence
export { persistGateResults } from "./ship-gates/persist.js";
// Policy profile artifact gate
export { checkPolicyProfileArtifactGate } from "./ship-gates/policy-artifact-gate.js";
// Review gate + P1 fixlist
export type { P1Fixlist, P1FixlistEntry } from "./ship-gates/review-gate.js";
export {
  checkReviewGate,
  generateP1Fixlist,
  parseP1Fixlist,
  updateFixlistWithCommits,
} from "./ship-gates/review-gate.js";
export type { PackageCompletionInput } from "./ship-gates/test-progress-gates.js";
// Test + progress + package completion gates
export {
  checkPackageCompletionGate,
  checkProgressGate,
  checkTestGate,
} from "./ship-gates/test-progress-gates.js";

// ---------------------------------------------------------------------------
// Task 9: --skip-gate mechanism (GREEN)
// ---------------------------------------------------------------------------

/**
 * Validate --skip-gate options.
 *
 * Rules:
 *   - --skip-gate=all in interactive mode → always error
 *   - --skip-gate=all requires --force
 *   - Specific gate skips are always valid
 *
 * Returns an error string if invalid, or null if valid.
 */
export function validateSkipGateOptions(options: SkipGateOptions): string | null {
  if (options.skipAll) {
    if (options.isInteractive) {
      return "--skip-gate=all is not allowed in interactive mode. Skip gates individually.";
    }
    if (!options.force) {
      return "--skip-gate=all requires --force confirmation.";
    }
  }

  // Validate individual gate names
  const validGates: readonly string[] = ["review", "test", "progress"];
  for (const gate of options.skipGates) {
    if (!validGates.includes(gate)) {
      return `Invalid gate name: ${gate}. Valid gates: ${validGates.join(", ")}`;
    }
  }

  return null;
}

/**
 * Build skip-gate annotation for ship commit message.
 *
 * Format: [skip-gate: <gate-name> reason=<reason>]
 * For all: [skip-gate: all reason=<reason>]
 */
export function buildSkipGateAnnotation(options: SkipGateOptions): string {
  if (options.skipAll && options.force) {
    return "[skip-gate: all reason=forced-by-user]";
  }

  if (options.skipGates.length === 0) {
    return "";
  }

  const gates = options.skipGates.join(",");
  return `[skip-gate: ${gates} reason=individual-skip]`;
}

// ---------------------------------------------------------------------------
// Task 10: Gate orchestration — runAllGates
// ---------------------------------------------------------------------------

export interface RunAllGatesInput {
  reviewDir: string;
  testResultsDir: string;
  progressDir: string;
  featureName: string;
  latestCommitHash: string;
  methodology?: Methodology;
  configCICheck?: string;
  gitLogFn?: (file: string) => string[];
  skipOptions?: SkipGateOptions;
}

/**
 * Run all three gates in sequence: Review -> Test -> Progress.
 *
 * Applies skip-gate options. Returns ShipGateReport suitable for
 * persistence via persistGateResults.
 *
 * Returns early if a blocking gate fails (review or test).
 * Progress gate is non-blocking (warnings only).
 */
export function runAllGates(input: RunAllGatesInput): ShipGateReport {
  const runId = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
  const timestamp = new Date().toISOString();
  const gates: GateResult[] = [];
  let skipGate: string | null = null;

  const skipped = new Set<GateName>();
  if (input.skipOptions) {
    if (input.skipOptions.skipAll) {
      skipped.add("review");
      skipped.add("test");
      skipped.add("progress");
      skipGate = "all";
    }
    for (const g of input.skipOptions.skipGates) {
      skipped.add(g);
      if (!skipGate) skipGate = g;
    }
  }

  // Review gate (includes fallback ladder check)
  if (skipped.has("review")) {
    gates.push({
      gate: "review",
      passed: true,
      reason: "Skipped via --skip-gate=review.",
    });
  } else {
    // First check methodology (fallback ladder)
    if (input.methodology) {
      const ladderResult = checkFallbackLadderGate(input.methodology);
      if (!ladderResult.passed) {
        gates.push(ladderResult);
      } else {
        gates.push(checkReviewGate(input.reviewDir, input.latestCommitHash, input.gitLogFn));
      }
    } else {
      gates.push(checkReviewGate(input.reviewDir, input.latestCommitHash, input.gitLogFn));
    }
  }

  // Test gate
  if (skipped.has("test")) {
    gates.push({
      gate: "test",
      passed: true,
      reason: "Skipped via --skip-gate=test.",
    });
  } else {
    gates.push(checkTestGate(input.testResultsDir, input.configCICheck));
  }

  // Progress gate (non-blocking)
  if (skipped.has("progress")) {
    gates.push({
      gate: "progress",
      passed: true,
      reason: "Skipped via --skip-gate=progress.",
    });
  } else {
    gates.push(checkProgressGate(input.progressDir, input.featureName));
  }

  const blockingGates = gates.filter((g) => !g.passed && g.gate !== "progress");
  const allPassed = blockingGates.length === 0;

  return {
    runId,
    feature: input.featureName,
    timestamp,
    gates,
    allPassed,
    skipGate,
  };
}
