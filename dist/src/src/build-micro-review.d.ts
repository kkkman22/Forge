/**
 * Micro-Review Engine — lightweight spec alignment check run after each atomic
 * task in `/forge build`.
 *
 * Two modes:
 *   - **legacy** (planVersion="legacy", no expected_output):
 *       Only checks that gitDiff is non-empty AND verifyOutput contains a PASS
 *       indicator.
 *   - **v1**: For each acceptance_criterion, searches for evidence in the
 *       gitDiff. Scans for files changed beyond task.files (overBuilt).
 *       pass iff missing.length===0 && overBuilt.length===0.
 */
/** Simplified PlanTask for micro-review purposes. */
export interface PlanTask {
    title: string;
    files?: string[];
    acceptance_criteria?: string[];
    expected_output?: string;
}
export interface MicroReviewInput {
    task: PlanTask;
    gitDiff: string;
    verifyOutput: string;
    planVersion: "v1" | "legacy";
}
export interface MicroReviewResult {
    covered: Array<{
        criterion: string;
        evidence: string;
    }>;
    overBuilt: string[];
    missing: string[];
    verdict: "pass" | "needs_iteration";
}
export declare function runMicroReview(input: MicroReviewInput): MicroReviewResult;
