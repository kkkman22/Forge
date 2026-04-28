/**
 * Ship engine — core logic extracted from forge-ship/SKILL.md.
 *
 * Implements:
 *   - checkShipGate: Verifies all three gates pass before ship is allowed
 *
 * Ship gate (Property 11):
 *   Ship is allowed ONLY when:
 *     1. Review passed (no P0/P1 issues)
 *     2. Test passed (all tests and checklist items pass)
 *     3. Progress complete (all tasks marked done)
 *   ANY gate failing → blocked with a specific reason.
 *
 * Per design document:
 *   - Requirements 6.6, 6.7: P0/P1 → block ship; only P2/P3 → allow ship
 *   - Requirements 7.5: Test not passed → block ship
 *   - Requirements 8.1, 8.2: All three gates must pass; any failure → block with reason
 *   - Requirements 16.3, 16.4: Hard constraints on review and test gates
 */
export interface ReviewResult {
    /** Whether the review passed (no P0/P1 issues). */
    passed: boolean;
    /** Number of P0 (release-blocking) issues. */
    p0Count: number;
    /** Number of P1 (high-impact) issues. */
    p1Count: number;
}
export interface TestResult {
    /** Whether all tests passed and the pre-completion checklist is satisfied. */
    passed: boolean;
}
export interface ProgressResult {
    /** Total number of tasks in the plan. */
    totalTasks: number;
    /** Number of tasks marked as completed. */
    completedTasks: number;
}
export interface ShipGateResult {
    allowed: boolean;
    reasons: string[];
}
/**
 * Check whether `/forge ship` is allowed to proceed.
 *
 * Per SKILL.md §2 and design Property 11:
 *   - Review must have passed (no P0/P1)
 *   - Test must have passed
 *   - All tasks in progress must be complete
 *   - All three conditions must be true simultaneously
 *
 * Returns { allowed, reasons } where reasons lists all unmet conditions.
 */
export declare function checkShipGate(review: ReviewResult, test: TestResult, progress: ProgressResult): ShipGateResult;
