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
import type { SubagentResult } from "./types.js";
/** Closing marker every review subagent must emit at the very end of its output. @public */
export declare const FINAL_REPORT_SENTINEL = "<!-- review-final -->";
/** Reasons a final-report block can be invalid. @public */
export type FinalBlockReason = "empty-output" | "missing-final-block" | "missing-severity-table" | "missing-sentinel" | "wrong-layer" | "sentinel-not-at-end";
/** Result of validating a subagent's output against the final-report contract. @public */
export interface FinalBlockValidation {
    valid: boolean;
    reason?: FinalBlockReason;
}
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
export declare function validateFinalReportBlock(output: string | undefined, agentType: string): FinalBlockValidation;
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
export declare function enforceFinalReportContract(result: SubagentResult): SubagentResult;
