/**
 * Quality gate evaluation helpers — pure helper functions extracted from
 * SdkDriver to encapsulate the gate invocation and result interpretation
 * logic for each skill phase.
 *
 * The `evaluateGateForPhase` function routes to the correct gate evaluator
 * based on the completed phase, reading file content via injected callbacks.
 * It replicates the exact behavior of the original inline
 * `SdkDriver.evaluateQualityGateForPhase` method, including the try/catch
 * with `console.warn` for graceful degradation.
 *
 * Design reference: audit-remediation § 7. Quality Gate Evaluation Helpers
 * **Validates: Requirements 7.1, 7.3**
 */
import type { GateResult } from "./quality-gate.js";
/**
 * Dependency-injected file reader callbacks for quality gate evaluation.
 *
 * Each callback returns the raw file content as a string, or null if the
 * file is not available or reading fails.
 */
export interface QualityFileReaders {
    readReview: () => string | null;
    readTest: () => string | null;
    readProgress: () => string | null;
}
/**
 * Evaluate the quality gate for a completed skill phase.
 *
 * Routes to the correct gate evaluator based on the phase:
 * - `"review"` → `evaluateReviewGate`
 * - `"test"` → `evaluateTestGate`
 * - `"ship"` → `evaluateShipGate` (combines review + test + progress)
 *
 * Returns `null` if no gate applies to the given phase (unknown phase),
 * if the required file content is not available, or if evaluation fails.
 *
 * @param phase - The skill phase that just completed.
 * @param readers - Injected file reader callbacks.
 * @returns The gate evaluation result, or null if no gate applies.
 */
export declare function evaluateGateForPhase(phase: string, readers: QualityFileReaders): GateResult | null;
