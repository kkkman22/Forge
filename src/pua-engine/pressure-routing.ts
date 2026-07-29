/**
 * PUA Quality Engine — pressure-level escalation + methodology routing.
 *
 * Extracted from `pua-engine.ts` (god-file split, following the
 * `context-budget/` precedent). See `pua-engine.ts` for the re-export barrel
 * that preserves the public API.
 */

import type { FailurePattern, Methodology, PressureLevel, TaskType } from "./types.js";

// ---------------------------------------------------------------------------
// Pressure level escalation
// ---------------------------------------------------------------------------

/**
 * Ordered pressure levels for index-based lookup and stall promotion.
 * @internal
 */
const PRESSURE_LEVELS: readonly PressureLevel[] = ["L0", "L1", "L2", "L3", "L4"] as const;

/**
 * Determine the pressure level based on consecutive failures and stall detection.
 *
 * Mapping rules:
 * - 0-1 failures → L0 (Trust)
 * - 2 failures   → L1 (温和失望)
 * - 3 failures   → L2 (灵魂拷问)
 * - 4 failures   → L3 (绩效审视)
 * - 5+ failures  → L4 (毕业警告)
 *
 * Note: The L4 threshold (5 consecutive failures for max pressure) is
 * intentionally higher than the Circuit Breaker threshold (3 consecutive
 * failures for termination). PUA L1–L3 escalate warnings and switch
 * methodologies before the Circuit Breaker trips at 3 failures. L4 is
 * reached only if the Circuit Breaker is configured with a higher threshold.
 *
 * @see src/failure-handler.ts DEFAULT_CIRCUIT_BREAKER_THRESHOLD — Circuit Breaker termination threshold
 *
 * When `stallDetected` is true, the level is promoted by at least one step
 * (capped at L4).
 *
 * Negative input is treated as 0 (defensive handling).
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 *
 * @param consecutiveFailures - Non-negative integer of consecutive failures
 * @param stallDetected - Whether a stall (spinning) pattern was detected
 * @returns The corresponding pressure level
 */
export function determinePressureLevel(
  consecutiveFailures: number,
  stallDetected: boolean,
): PressureLevel {
  // Defensive: treat negative numbers as 0
  const failures = Math.max(0, consecutiveFailures);

  let index: number;
  if (failures <= 1) {
    index = 0; // L0
  } else if (failures === 2) {
    index = 1; // L1
  } else if (failures === 3) {
    index = 2; // L2
  } else if (failures === 4) {
    index = 3; // L3
  } else {
    index = 4; // L4
  }

  // Stall detection promotes by at least one level, capped at L4
  if (stallDetected) {
    index = Math.min(index + 1, PRESSURE_LEVELS.length - 1);
  }

  return PRESSURE_LEVELS[index];
}

// ---------------------------------------------------------------------------
// Methodology routing
// ---------------------------------------------------------------------------

/**
 * Task-type → methodology mapping table.
 * @internal
 */
const TASK_TYPE_METHODOLOGY: Record<TaskType, Methodology> = {
  debug: "huawei-rca",
  build: "musk-algorithm",
  research: "baidu-search",
  architecture: "amazon-backwards",
  performance: "bytedance-ab",
  review: "jobs-a-player",
  deploy: "alibaba-closure",
  general: "alibaba-closure",
};

/**
 * Failure-pattern → methodology switch chain mapping table.
 * @internal
 */
const FAILURE_PATTERN_CHAINS: Record<FailurePattern, Methodology[]> = {
  spinning: ["musk-algorithm", "alibaba-closure", "huawei-rca"],
  "giving-up": ["netflix-keeper", "huawei-rca", "musk-algorithm"],
  "low-quality": ["jobs-a-player", "alibaba-closure", "netflix-keeper"],
  guessing: ["baidu-search", "amazon-backwards", "bytedance-ab"],
  "passive-waiting": ["alibaba-closure", "huawei-rca", "musk-algorithm"],
  "empty-claim": ["bytedance-ab", "alibaba-closure", "huawei-rca"],
};

/**
 * Select the recommended methodology for a given task type.
 *
 * Known task types are mapped to their optimal methodology. Any unknown
 * string falls back to `alibaba-closure` (the general-purpose closure
 * methodology).
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
 *
 * @param taskType - A known `TaskType` or arbitrary string
 * @returns The recommended methodology
 */
export function selectMethodology(taskType: TaskType | string): Methodology {
  if (Object.hasOwn(TASK_TYPE_METHODOLOGY, taskType)) {
    return TASK_TYPE_METHODOLOGY[taskType as TaskType];
  }
  return "alibaba-closure";
}

/**
 * Get the ordered methodology switch chain for a failure pattern.
 *
 * Each failure pattern has a pre-defined sequence of methodologies to try
 * in order. The chain is designed so the most targeted methodology comes
 * first, broadening with each step.
 *
 * **Validates: Requirements 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15**
 *
 * @param failurePattern - The detected failure pattern
 * @returns An ordered array of methodologies to try
 */
export function getMethodologyChain(failurePattern: FailurePattern): Methodology[] {
  return FAILURE_PATTERN_CHAINS[failurePattern];
}

/**
 * Advance to the next methodology in a switch chain.
 *
 * Returns the methodology at `currentIndex + 1` if the chain has more
 * entries, or `null` when the chain is exhausted.
 *
 * **Validates: Requirements 2.16**
 *
 * @param chain - The methodology switch chain
 * @param currentIndex - The current position in the chain
 * @returns The next methodology, or `null` if the chain is exhausted
 */
export function advanceMethodology(chain: Methodology[], currentIndex: number): Methodology | null {
  if (currentIndex >= chain.length - 1) {
    return null;
  }
  return chain[currentIndex + 1];
}
