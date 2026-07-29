/**
 * Shared core types for the ship-gates subsystem.
 *
 * Extracted to a leaf module so the `ship-gates/` submodules (review-gate,
 * test-progress-gates, policy-artifact-gate, fallback-ladder, persist) can
 * import these types without depending back on the `ship-gates.ts` barrel
 * (which would create a cycle, since the barrel re-exports from the
 * submodules). The barrel re-exports these for public-API stability.
 *
 * Precedent: `pua-engine/types.ts`, `context-budget/` leaf pattern.
 */

/** Name of a specific gate. */
export type GateName = "review" | "test" | "progress" | "policy";

/** Structured result of a single gate check. */
export interface GateResult {
  gate: GateName;
  passed: boolean;
  reason: string;
  details?: {
    p0Count?: number;
    p1Count?: number;
    untestedFiles?: string[];
    incompleteTasks?: string[];
  };
}

/** Options for the skip-gate mechanism. */
export interface SkipGateOptions {
  skipGates: GateName[];
  skipAll: boolean;
  force: boolean;
  isInteractive: boolean;
}

/** Persisted gate results written to .forge/ship/<run-id>-gates.json. */
export interface ShipGateReport {
  runId: string;
  feature: string;
  timestamp: string;
  gates: GateResult[];
  allPassed: boolean;
  skipGate: string | null;
}
