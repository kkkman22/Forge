import { describe, expect, it } from "vitest";
import { checkShipGate, } from "../../src/ship.js";
describe("checkShipGate — methodology field checks", () => {
    const passTest = { passed: true };
    const doneProgress = { totalTasks: 5, completedTasks: 5 };
    it("ship blocks when review.methodology is unavailable", () => {
        const review = {
            passed: false,
            p0Count: 0,
            p1Count: 0,
            methodology: "unavailable",
        };
        const result = checkShipGate(review, passTest, doneProgress);
        expect(result.allowed).toBe(false);
        expect(result.reasons.some((r) => r.includes("unavailable"))).toBe(true);
    });
    it("ship reason includes 'methodology=unavailable; subagent paths exhausted'", () => {
        const review = {
            passed: false,
            p0Count: 0,
            p1Count: 0,
            methodology: "unavailable",
        };
        const result = checkShipGate(review, passTest, doneProgress);
        expect(result.reasons.some((r) => r.includes("methodology=unavailable") && r.includes("subagent paths exhausted"))).toBe(true);
    });
    it("ship passes when review.methodology is subagent-parallel and other gates pass", () => {
        const review = {
            passed: true,
            p0Count: 0,
            p1Count: 0,
            methodology: "subagent-parallel",
        };
        const result = checkShipGate(review, passTest, doneProgress);
        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });
    it("ship passes when review.methodology is subagent-serial and other gates pass", () => {
        const review = {
            passed: true,
            p0Count: 0,
            p1Count: 0,
            methodology: "subagent-serial",
        };
        const result = checkShipGate(review, passTest, doneProgress);
        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });
    it("ship passes when review.methodology is ci-evidence and other gates pass", () => {
        const review = {
            passed: true,
            p0Count: 0,
            p1Count: 0,
            methodology: "ci-evidence",
        };
        const result = checkShipGate(review, passTest, doneProgress);
        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });
});
//# sourceMappingURL=checkShipGate.test.js.map