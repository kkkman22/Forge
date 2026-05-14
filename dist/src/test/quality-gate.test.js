/**
 * Unit tests (example-based) for the quality-gate module.
 *
 * Covers:
 *   - evaluateReviewGate: P0/P1 blocking, passing, skipping, issue extraction
 *   - evaluateTestGate: failed tests blocking, passing, skipping
 *   - evaluateShipGate: combined gate logic, monotonicity
 *   - Edge cases: empty strings, malformed content, missing fields
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
 */
import { describe, expect, it } from "vitest";
import { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "../src/quality-gate.js";
// ---------------------------------------------------------------------------
// evaluateReviewGate
// ---------------------------------------------------------------------------
describe("evaluateReviewGate", () => {
    it("returns blocked when p0_count > 0", () => {
        const content = [
            "---",
            'result: "fail"',
            "p0_count: 1",
            "p1_count: 0",
            "---",
            "## P0 Issues",
            "- Critical security vulnerability",
        ].join("\n");
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("blocked");
        expect(result.issues).toBeDefined();
        expect(result.issues?.length).toBeGreaterThan(0);
        expect(result.issues?.[0].severity).toBe("P0");
    });
    it("returns blocked when p1_count > 0", () => {
        const content = [
            "---",
            'result: "fail"',
            "p0_count: 0",
            "p1_count: 2",
            "---",
            "## P1 Issues",
            "- Missing input validation",
            "- Inconsistent error handling",
        ].join("\n");
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("blocked");
        expect(result.issues).toBeDefined();
        expect(result.issues?.length).toBe(2);
        expect(result.issues?.every((i) => i.severity === "P1")).toBe(true);
    });
    it("returns blocked when both p0_count and p1_count > 0", () => {
        const content = [
            "---",
            'result: "fail"',
            "p0_count: 1",
            "p1_count: 2",
            "---",
            "## P0 Issues",
            "- Critical security vulnerability in auth module",
            "## P1 Issues",
            "- Missing input validation",
            "- Inconsistent error handling",
        ].join("\n");
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("blocked");
        expect(result.issues).toBeDefined();
        expect(result.issues?.length).toBe(3);
        expect(result.issues?.filter((i) => i.severity === "P0").length).toBe(1);
        expect(result.issues?.filter((i) => i.severity === "P1").length).toBe(2);
    });
    it("returns passed when p0_count and p1_count are both 0", () => {
        const content = ["---", 'result: "pass"', "p0_count: 0", "p1_count: 0", "---"].join("\n");
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("passed");
    });
    it("returns skipped for empty string", () => {
        const result = evaluateReviewGate("");
        expect(result.status).toBe("skipped");
        expect(result.reason).toBeTruthy();
    });
    it("returns skipped for content without frontmatter", () => {
        const result = evaluateReviewGate("just some text");
        expect(result.status).toBe("skipped");
    });
    it("returns skipped for frontmatter without p0/p1 fields", () => {
        const content = '---\nresult: "pass"\n---\n';
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("skipped");
    });
    it("generates summary issues when body has no bullet items", () => {
        const content = [
            "---",
            "p0_count: 2",
            "p1_count: 1",
            "---",
            "No structured issue list here.",
        ].join("\n");
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("blocked");
        expect(result.issues).toBeDefined();
        expect(result.issues?.length).toBe(2); // one for P0, one for P1
    });
    it("handles only p0_count present (p1_count missing treated as 0)", () => {
        const content = "---\np0_count: 3\n---\n";
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("blocked");
    });
    it("handles only p1_count present (p0_count missing treated as 0)", () => {
        const content = "---\np1_count: 1\n---\n";
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("blocked");
    });
    it("returns passed when only p0_count is 0 and p1_count is missing", () => {
        const content = "---\np0_count: 0\n---\n";
        const result = evaluateReviewGate(content);
        expect(result.status).toBe("passed");
    });
});
// ---------------------------------------------------------------------------
// evaluateTestGate
// ---------------------------------------------------------------------------
describe("evaluateTestGate", () => {
    it("returns passed when all tests pass", () => {
        const content = ["---", 'result: "pass"', "total: 42", "passed: 42", "failed: 0", "---"].join("\n");
        const result = evaluateTestGate(content);
        expect(result.status).toBe("passed");
    });
    it("returns blocked when failed > 0", () => {
        const content = ["---", 'result: "fail"', "total: 42", "passed: 40", "failed: 2", "---"].join("\n");
        const result = evaluateTestGate(content);
        expect(result.status).toBe("blocked");
        expect(result.reason).toContain("2");
    });
    it("returns blocked when result is not pass", () => {
        const content = '---\nresult: "fail"\n---\n';
        const result = evaluateTestGate(content);
        expect(result.status).toBe("blocked");
    });
    it("returns passed when result is pass and no failed field", () => {
        const content = '---\nresult: "pass"\n---\n';
        const result = evaluateTestGate(content);
        expect(result.status).toBe("passed");
    });
    it("returns skipped for empty string", () => {
        const result = evaluateTestGate("");
        expect(result.status).toBe("skipped");
    });
    it("returns skipped for content without frontmatter", () => {
        const result = evaluateTestGate("no frontmatter here");
        expect(result.status).toBe("skipped");
    });
    it("returns skipped for frontmatter without relevant fields", () => {
        const content = '---\ntitle: "some report"\n---\n';
        const result = evaluateTestGate(content);
        expect(result.status).toBe("skipped");
    });
    it("includes total and passed in blocked reason when available", () => {
        const content = ["---", "total: 10", "passed: 8", "failed: 2", "---"].join("\n");
        const result = evaluateTestGate(content);
        expect(result.status).toBe("blocked");
        expect(result.reason).toContain("10");
        expect(result.reason).toContain("8");
    });
});
// ---------------------------------------------------------------------------
// evaluateShipGate
// ---------------------------------------------------------------------------
describe("evaluateShipGate", () => {
    const passingReview = "---\np0_count: 0\np1_count: 0\n---\n";
    const passingTest = '---\nresult: "pass"\nfailed: 0\n---\n';
    const passingProgress = "---\ntotal_tasks: 5\ncompleted_tasks: 5\n---\n";
    const blockedReview = "---\np0_count: 1\np1_count: 0\n---\n## P0 Issues\n- Bug\n";
    const blockedTest = '---\nresult: "fail"\nfailed: 3\n---\n';
    const blockedProgress = "---\ntotal_tasks: 5\ncompleted_tasks: 3\n---\n";
    it("returns passed when all three gates pass", () => {
        const result = evaluateShipGate(passingReview, passingTest, passingProgress);
        expect(result.status).toBe("passed");
    });
    it("returns blocked when review is blocked", () => {
        const result = evaluateShipGate(blockedReview, passingTest, passingProgress);
        expect(result.status).toBe("blocked");
        expect(result.reason).toContain("Review");
    });
    it("returns blocked when test is blocked", () => {
        const result = evaluateShipGate(passingReview, blockedTest, passingProgress);
        expect(result.status).toBe("blocked");
        expect(result.reason).toContain("Test");
    });
    it("returns blocked when progress is blocked", () => {
        const result = evaluateShipGate(passingReview, passingTest, blockedProgress);
        expect(result.status).toBe("blocked");
        expect(result.reason).toContain("Progress");
    });
    it("returns blocked when all three gates are blocked", () => {
        const result = evaluateShipGate(blockedReview, blockedTest, blockedProgress);
        expect(result.status).toBe("blocked");
        expect(result.reason).toContain("Review");
        expect(result.reason).toContain("Test");
        expect(result.reason).toContain("Progress");
    });
    it("propagates issues from blocked review gate", () => {
        const result = evaluateShipGate(blockedReview, passingTest, passingProgress);
        expect(result.issues).toBeDefined();
        expect(result.issues?.length).toBeGreaterThan(0);
    });
    it("returns passed when some gates are skipped but none blocked", () => {
        const result = evaluateShipGate(passingReview, passingTest, "unparseable");
        expect(result.status).toBe("passed");
    });
    it("returns skipped when all gates are skipped", () => {
        const result = evaluateShipGate("", "", "");
        expect(result.status).toBe("skipped");
    });
    it("blocked sub-gate overrides skipped sub-gates", () => {
        const result = evaluateShipGate(blockedReview, "", "");
        expect(result.status).toBe("blocked");
    });
    // Monotonicity: if review or test is blocked, ship must be blocked
    it("ship is blocked whenever review is blocked (monotonicity)", () => {
        const result = evaluateShipGate(blockedReview, passingTest, passingProgress);
        expect(result.status).toBe("blocked");
    });
    it("ship is blocked whenever test is blocked (monotonicity)", () => {
        const result = evaluateShipGate(passingReview, blockedTest, passingProgress);
        expect(result.status).toBe("blocked");
    });
});
//# sourceMappingURL=quality-gate.test.js.map