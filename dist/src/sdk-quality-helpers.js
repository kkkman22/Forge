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
import { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "./quality-gate.js";
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
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
export function evaluateGateForPhase(phase, readers) {
    try {
        switch (phase) {
            case "review": {
                const reviewContent = readers.readReview();
                if (!reviewContent)
                    return null;
                return evaluateReviewGate(reviewContent);
            }
            case "test": {
                const testContent = readers.readTest();
                if (!testContent)
                    return null;
                return evaluateTestGate(testContent);
            }
            case "ship": {
                const reviewContent = readers.readReview();
                const testContent = readers.readTest();
                const progressContent = readers.readProgress();
                if (!reviewContent && !testContent && !progressContent)
                    return null;
                return evaluateShipGate(reviewContent ?? "", testContent ?? "", progressContent ?? "");
            }
            default:
                return null;
        }
    }
    catch (err) {
        console.warn(`Warning: quality gate evaluation failed for phase "${phase}": ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
//# sourceMappingURL=sdk-quality-helpers.js.map