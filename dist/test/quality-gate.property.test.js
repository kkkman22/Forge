/**
 * Property-based tests for the quality-gate module.
 *
 * Covers:
 *   - Property 7: evaluateReviewGate P0/P1 阻断
 *   - Property 8: evaluateShipGate 组合门禁单调性
 *
 * **Validates: Requirements 5.1, 5.3, 5.4, 5.6**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "../src/quality-gate.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Generate a non-negative integer for p0/p1 counts. */
const countArb = fc.nat({ max: 50 });
/**
 * Generate review content with YAML frontmatter containing p0_count and p1_count.
 * Returns both the content string and the counts for assertion.
 */
function reviewContentArb(p0, p1) {
    return fc.record({ p0: p0, p1: p1 }).map(({ p0, p1 }) => ({
        content: `---\np0_count: ${p0}\np1_count: ${p1}\n---\n`,
        p0Count: p0,
        p1Count: p1,
    }));
}
/** Generate review content where at least one of p0/p1 is > 0 (blocked). */
const blockedReviewArb = fc
    .record({
    p0: fc.nat({ max: 50 }),
    p1: fc.nat({ max: 50 }),
})
    .filter(({ p0, p1 }) => p0 > 0 || p1 > 0)
    .map(({ p0, p1 }) => ({
    content: `---\np0_count: ${p0}\np1_count: ${p1}\n---\n`,
    p0Count: p0,
    p1Count: p1,
}));
/** Generate review content where both p0 and p1 are 0 (passed). */
const passedReviewArb = fc.constant({
    content: "---\np0_count: 0\np1_count: 0\n---\n",
    p0Count: 0,
    p1Count: 0,
});
/**
 * Generate test result content with YAML frontmatter.
 * Returns both the content string and whether it should block.
 */
const testResultArb = fc
    .record({
    failed: fc.nat({ max: 20 }),
    result: fc.constantFrom("pass", "fail"),
})
    .map(({ failed, result }) => ({
    content: `---\nresult: "${result}"\nfailed: ${failed}\n---\n`,
    shouldBlock: failed > 0 || result !== "pass",
}));
/** Generate test result content that passes. */
const passingTestArb = fc.constant({
    content: '---\nresult: "pass"\nfailed: 0\n---\n',
    shouldBlock: false,
});
/** Generate test result content that blocks. */
const blockedTestArb = fc.oneof(fc.integer({ min: 1, max: 20 }).map((failed) => ({
    content: `---\nresult: "fail"\nfailed: ${failed}\n---\n`,
    shouldBlock: true,
})), fc.constant({
    content: '---\nresult: "fail"\nfailed: 0\n---\n',
    shouldBlock: true,
}));
/**
 * Generate progress content with YAML frontmatter.
 * Returns both the content string and whether it should block.
 */
const progressArb = fc
    .record({
    total: fc.integer({ min: 1, max: 50 }),
    completed: fc.nat({ max: 50 }),
})
    .map(({ total, completed }) => ({
    content: `---\ntotal_tasks: ${total}\ncompleted_tasks: ${Math.min(completed, total)}\n---\n`,
    shouldBlock: Math.min(completed, total) < total,
}));
/** Generate progress content that passes (all tasks completed). */
const passingProgressArb = fc.integer({ min: 1, max: 50 }).map((total) => ({
    content: `---\ntotal_tasks: ${total}\ncompleted_tasks: ${total}\n---\n`,
    shouldBlock: false,
}));
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 7: evaluateReviewGate P0/P1 阻断
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 7: evaluateReviewGate P0/P1 阻断", () => {
    /**
     * **Validates: Requirements 5.1, 5.4**
     *
     * For any review report content, if p0_count > 0 or p1_count > 0,
     * then evaluateReviewGate() returns status: "blocked".
     */
    it("returns blocked when p0_count > 0 or p1_count > 0", () => {
        fc.assert(fc.property(blockedReviewArb, ({ content }) => {
            const result = evaluateReviewGate(content);
            expect(result.status).toBe("blocked");
            // Should also have issues listed
            expect(result.issues).toBeDefined();
            expect(result.issues?.length).toBeGreaterThan(0);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 5.1, 5.4**
     *
     * For any review report content, if p0_count === 0 and p1_count === 0,
     * then evaluateReviewGate() returns status: "passed".
     */
    it("returns passed when p0_count === 0 and p1_count === 0", () => {
        fc.assert(fc.property(passedReviewArb, ({ content }) => {
            const result = evaluateReviewGate(content);
            expect(result.status).toBe("passed");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 5.1, 5.4**
     *
     * For any non-negative p0_count and p1_count, the gate result is deterministic:
     * blocked iff p0 > 0 || p1 > 0, passed iff p0 === 0 && p1 === 0.
     */
    it("gate result is deterministic based on p0/p1 counts", () => {
        fc.assert(fc.property(reviewContentArb(countArb, countArb), ({ content, p0Count, p1Count }) => {
            const result = evaluateReviewGate(content);
            if (p0Count > 0 || p1Count > 0) {
                expect(result.status).toBe("blocked");
            }
            else {
                expect(result.status).toBe("passed");
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 8: evaluateShipGate 组合门禁单调性
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 8: evaluateShipGate 组合门禁单调性", () => {
    /**
     * **Validates: Requirements 5.3, 5.6**
     *
     * For any review content, test result, and progress content combination,
     * if evaluateReviewGate() returns blocked, then evaluateShipGate() must
     * also return blocked. Sub-gate blocking propagates upward.
     */
    it("ship is blocked whenever review gate is blocked", () => {
        fc.assert(fc.property(blockedReviewArb, testResultArb, progressArb, (review, test, progress) => {
            const reviewResult = evaluateReviewGate(review.content);
            expect(reviewResult.status).toBe("blocked");
            const shipResult = evaluateShipGate(review.content, test.content, progress.content);
            expect(shipResult.status).toBe("blocked");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 5.3, 5.6**
     *
     * For any review content, test result, and progress content combination,
     * if evaluateTestGate() returns blocked, then evaluateShipGate() must
     * also return blocked. Sub-gate blocking propagates upward.
     */
    it("ship is blocked whenever test gate is blocked", () => {
        fc.assert(fc.property(reviewContentArb(countArb, countArb), blockedTestArb, progressArb, (review, test, progress) => {
            const testResult = evaluateTestGate(test.content);
            expect(testResult.status).toBe("blocked");
            const shipResult = evaluateShipGate(review.content, test.content, progress.content);
            expect(shipResult.status).toBe("blocked");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 5.3, 5.6**
     *
     * When both review and test gates are blocked, ship must also be blocked.
     */
    it("ship is blocked when both review and test gates are blocked", () => {
        fc.assert(fc.property(blockedReviewArb, blockedTestArb, progressArb, (review, test, progress) => {
            const shipResult = evaluateShipGate(review.content, test.content, progress.content);
            expect(shipResult.status).toBe("blocked");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 5.3, 5.6**
     *
     * When all sub-gates pass, ship gate should also pass.
     * This is the converse of monotonicity — no false blocks.
     */
    it("ship passes when all sub-gates pass", () => {
        fc.assert(fc.property(passedReviewArb, passingTestArb, passingProgressArb, (review, test, progress) => {
            const shipResult = evaluateShipGate(review.content, test.content, progress.content);
            expect(shipResult.status).toBe("passed");
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=quality-gate.property.test.js.map