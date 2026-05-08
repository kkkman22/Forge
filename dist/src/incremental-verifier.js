/**
 * Incremental verifier — determine verification strategy for P1 fixes.
 *
 * **Validates: Requirements 9.1, 9.2, 9.4**
 */
/** @public */
export const INCREMENTAL_THRESHOLD = 50;
/** @public */
export function determineVerificationStrategy(linesChanged, threshold = INCREMENTAL_THRESHOLD) {
    if (linesChanged < 0) {
        throw new Error(`linesChanged must be non-negative, got ${linesChanged}`);
    }
    return {
        strategy: linesChanged < threshold ? "incremental" : "targeted-review",
        linesChanged,
        threshold,
    };
}
/** @public */
export function buildVerificationCriteria(finding) {
    return {
        filePath: finding.filePath,
        lineRange: [finding.lineNumber, finding.lineNumber],
        description: finding.description,
    };
}
//# sourceMappingURL=incremental-verifier.js.map