/**
 * Ship gate — fallback ladder evaluation + gate check.
 *
 * Extracted from `ship-gates.ts` (god-file split, following the
 * `context-budget/` + `pua-engine/` precedent). See `ship-gates.ts` for the
 * re-export barrel that preserves the public API.
 */

import type { Methodology } from "../schemas/review-report.js";
import type { GateResult } from "./types.js";

/**
 * L0-L3 fallback ladder level conditions.
 */
export interface FallbackLadderConditions {
  /** L0: Interactive mode */
  isInteractive: boolean;
  /** L0: CLAUDE_CODE_WORKFLOWS=1 */
  workflowsEnvSet: boolean;
  /** L0: tengu_workflows_enabled gate ON */
  workflowsEnabled: boolean;
  /** L0: workflow file exists */
  workflowFileExists: boolean;
  /** L0: node --check passes */
  workflowSyntaxValid: boolean;
  /** L0: concurrency bridge available */
  concurrencyBridgeAvailable: boolean;
  /** L1+: subagent available (for L1/L2) */
  subagentAvailable: boolean;
}

/**
 * Evaluate the fallback ladder and return the resulting methodology.
 *
 * L0: All conditions met → workflow
 * L1: Any L0 condition fails + subagent available → subagent-parallel
 * L2: Subagent available but serial only → subagent-serial
 * L3: All levels unavailable → unavailable
 */
export function evaluateFallbackLadder(conditions: FallbackLadderConditions): {
  level: "L0" | "L1" | "L2" | "L3";
  methodology: Methodology;
} {
  // L0 check
  const l0Met =
    conditions.isInteractive &&
    conditions.workflowsEnvSet &&
    conditions.workflowsEnabled &&
    conditions.workflowFileExists &&
    conditions.workflowSyntaxValid &&
    conditions.concurrencyBridgeAvailable;

  if (l0Met) {
    return { level: "L0", methodology: "saved-workflow" };
  }

  // L1/L2: subagent available
  if (conditions.subagentAvailable) {
    // Distinguish L1 (parallel) from L2 (serial) based on concurrency
    if (conditions.concurrencyBridgeAvailable) {
      return { level: "L1", methodology: "subagent-parallel" };
    }
    return { level: "L2", methodology: "subagent-serial" };
  }

  // L3: all exhausted
  return { level: "L3", methodology: "unavailable" };
}

/**
 * Check whether the fallback ladder state should block ship.
 *
 * L0 (workflow), L1 (subagent-parallel), L2 (subagent-serial), L2-ci (ci-evidence) -> passed.
 * L3 (unavailable) -> blocked with HARD-GATE message.
 */
export function checkFallbackLadderGate(methodology: Methodology): GateResult {
  if (methodology === "unavailable") {
    return {
      gate: "review",
      passed: false,
      reason:
        "Review unavailable: methodology=unavailable. HARD-GATE (L3): all review paths (L0+L1+L2) exhausted. Main agent must NOT substitute for review. Ship is blocked.",
    };
  }

  return {
    gate: "review",
    passed: true,
    reason: `Review produced via ${methodology}.`,
  };
}
