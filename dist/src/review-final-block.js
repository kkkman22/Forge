/**
 * Final-report block contract for review subagents.
 *
 * Background — the "spec-check is waiting for input" incident
 * --------------------------------------------------------------
 * In the real-world failure that motivated this module, three review
 * subagents (spec-check / quality-check / security-check) returned with
 * `status: "success"` but the natural-language `output` was just an
 * intermediate sentence such as `"Now let me check one of the test files
 * to understand test coverage:"`. The orchestrator (main agent) read the
 * preamble and concluded "they're still running", then went idle.
 *
 * The fix is structural rather than prompt-only:
 *
 *   1. Every subagent must end its output with `<!-- review-final -->`,
 *      preceded by the layer heading and a severity table.
 *   2. The fallback ladder validates each "success" output against the
 *      contract; failure to comply reclassifies the result as
 *      `failure: incomplete-report:<reason>`, which makes L0 "all-fail"
 *      and triggers the L1 serial retry naturally.
 *   3. The main agent never has to interpret the natural-language `result`
 *      field — completion is purely a function of `status` after this
 *      validation.
 *
 * Sentinel choice: `<!-- review-final -->` is an HTML comment so it
 * renders invisibly in Markdown but is trivially grep-able from
 * orchestration code.
 */
/** Closing marker every review subagent must emit at the very end of its output. @public */
export const FINAL_REPORT_SENTINEL = "<!-- review-final -->";
/** Maps a review agentType to the layer-heading prefix it must emit. @public */
const AGENT_LAYER_HEADING = {
    "spec-check": /^##\s*Layer\s*1\b/m,
    "quality-check": /^##\s*Layer\s*2\b/m,
    "security-check": /^##\s*Layer\s*3\b/m,
    "frontend-check": /^##\s*Layer\s*4\b/m,
};
const SEVERITY_TABLE_HEADER_RE = /^\|.*\bSeverity\b.*\|/im;
/**
 * Validate that a subagent output contains a well-formed final-report block.
 *
 * Required structure (in this order, near the end of the output):
 *   1. Layer heading matching the agentType (`## Layer N — ...`).
 *   2. A Markdown table whose header row contains the column `Severity`.
 *   3. The closing sentinel `<!-- review-final -->` at (or very near) the end.
 *
 * Tail tolerance: trailing whitespace after the sentinel is allowed; any
 * non-whitespace content after the sentinel produces `sentinel-not-at-end`.
 *
 * @public
 */
export function validateFinalReportBlock(output, agentType) {
    // The contract only governs the four review subagent roles. Unknown
    // agent types (e.g. test fixtures or future agent kinds) are treated
    // as opt-out and pass through validation untouched.
    const layerRe = AGENT_LAYER_HEADING[agentType];
    if (!layerRe) {
        return { valid: true };
    }
    if (!output || output.trim().length === 0) {
        return { valid: false, reason: "empty-output" };
    }
    // No layer heading at all → preamble-only output (the original incident).
    if (!layerRe.test(output)) {
        // If a *different* layer heading is present, distinguish "wrong layer"
        // from "no final block at all".
        const anyLayer = /^##\s*Layer\s*\d+\b/m.test(output);
        return {
            valid: false,
            reason: anyLayer ? "wrong-layer" : "missing-final-block",
        };
    }
    // No severity table.
    if (!SEVERITY_TABLE_HEADER_RE.test(output)) {
        return { valid: false, reason: "missing-severity-table" };
    }
    // Sentinel missing.
    const sentinelIdx = output.lastIndexOf(FINAL_REPORT_SENTINEL);
    if (sentinelIdx === -1) {
        return { valid: false, reason: "missing-sentinel" };
    }
    // Anything other than whitespace after the sentinel → sentinel must be the end.
    const tail = output.slice(sentinelIdx + FINAL_REPORT_SENTINEL.length);
    if (tail.trim().length > 0) {
        return { valid: false, reason: "sentinel-not-at-end" };
    }
    return { valid: true };
}
/**
 * Enforce the final-report contract on a `SubagentResult`.
 *
 * - If `status !== "success"`, the result is returned unchanged.
 * - If the output is well-formed, the result is returned unchanged.
 * - If the output is malformed, the result is reclassified to
 *   `status: "failure"` with `error: "incomplete-report:<reason>"`.
 *   The original `output` is preserved on the returned object so the
 *   orchestrator can surface it for diagnostics.
 *
 * The `incomplete-report` prefix is recognised by the fallback ladder's
 * failure-signature summarizer so the L1 retry log is human-readable.
 *
 * @public
 */
export function enforceFinalReportContract(result) {
    if (result.status !== "success") {
        return result;
    }
    const validation = validateFinalReportBlock(result.output, result.agentType);
    if (validation.valid) {
        return result;
    }
    return {
        agentType: result.agentType,
        status: "failure",
        error: `incomplete-report:${validation.reason}`,
        output: result.output,
    };
}
//# sourceMappingURL=review-final-block.js.map