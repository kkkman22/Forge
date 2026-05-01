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
import { allEntriesVerified } from "./fix-checklist.js";
// ---------------------------------------------------------------------------
// Ship gate check (Property 11)
// ---------------------------------------------------------------------------
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
export function checkShipGate(review, test, progress) {
    const reasons = [];
    // Gate 1: Review passed (no P0/P1)
    if (!review.passed || review.p0Count > 0 || review.p1Count > 0) {
        const issues = [];
        if (review.p0Count > 0) {
            issues.push(`${review.p0Count} 个 P0`);
        }
        if (review.p1Count > 0) {
            issues.push(`${review.p1Count} 个 P1`);
        }
        const issueDetail = issues.length > 0 ? `（${issues.join("、")}）` : "（passed=false 但无 P0/P1，数据不一致）";
        reasons.push(`Review 未通过：发现${issueDetail}问题，需要修复后重新评审`);
    }
    // Gate 2: Test passed
    if (!test.passed) {
        reasons.push("Test 未通过：测试未通过或完成前验证清单有未通过项");
    }
    // Gate 3: Progress complete
    if (progress.completedTasks < progress.totalTasks) {
        const remaining = progress.totalTasks - progress.completedTasks;
        reasons.push(`Progress 未完成：${progress.completedTasks}/${progress.totalTasks} 任务完成，还有 ${remaining} 个未完成`);
    }
    return {
        allowed: reasons.length === 0,
        reasons,
    };
}
/**
 * Extended ship gate with P1 Fix Checklist verification.
 *
 * Adds a fourth gate: all checklist entries must have status "verified".
 * When checklist is not provided or empty, behaves like checkShipGate.
 */
export function checkShipGateWithChecklist(review, test, progress, checklist) {
    const result = checkShipGate(review, test, progress);
    if (checklist && checklist.length > 0 && !allEntriesVerified(checklist)) {
        const unverified = checklist.filter((e) => e.status !== "verified");
        result.reasons.push(`Checklist 未完成：${unverified.length} 个 P0/P1 条目未验证（${unverified.map((e) => e.findingId).join(", ")}）`);
        result.allowed = false;
    }
    return result;
}
//# sourceMappingURL=ship.js.map