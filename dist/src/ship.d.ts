/**
 * Ship engine — core logic extracted from forge-ship/SKILL.md.
 *
 * Implements:
 *   - checkShipGate: Verifies all three gates pass before ship is allowed
 *   - checkShipGateWithChecklist: Extended gate with P1 Fix Checklist
 *
 * Per design document:
 *   - Requirements 6.6, 6.7: P0/P1 → block ship; only P2/P3 → allow ship
 *   - Requirements 7.5: Test not passed → block ship
 *   - Requirements 8.1, 8.2: All three gates must pass; any failure → block with reason
 *   - Requirements 10.3: Checklist gate — all P0/P1 entries must be verified
 *   - Requirements 16.3, 16.4: Hard constraints on review and test gates
 */
import type { ChecklistEntry } from "./fix-checklist.js";
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
/**
 * Extended ship gate with P1 Fix Checklist verification.
 *
 * Adds a fourth gate: all checklist entries must have status "verified".
 * When checklist is not provided or empty, behaves like checkShipGate.
 */
export declare function checkShipGateWithChecklist(review: ReviewResult, test: TestResult, progress: ProgressResult, checklist?: ChecklistEntry[]): ShipGateResult;
