import { describe, expect, it } from "vitest";
import { checkShipGateWithAcceptance } from "../../src/ship.js";
const passReview = { passed: true, p0Count: 0, p1Count: 0 };
const passTest = { passed: true };
const doneProgress = { totalTasks: 3, completedTasks: 3 };
const noBlock = { block: false };
const blocked = { block: true, reason: "acceptance not run" };
describe("checkShipGateWithAcceptance", () => {
    it("passes when all 3 base gates pass and accept-gate does not block", () => {
        const result = checkShipGateWithAcceptance(passReview, passTest, doneProgress, noBlock);
        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });
    it("blocks when accept-gate blocks even if base gates pass", () => {
        const result = checkShipGateWithAcceptance(passReview, passTest, doneProgress, blocked);
        expect(result.allowed).toBe(false);
        expect(result.reasons.some((r) => r.includes("Acceptance"))).toBe(true);
    });
    it("includes accept-gate warning as advisory reason", () => {
        const warning = { block: false, warning: "no scenarios" };
        const result = checkShipGateWithAcceptance(passReview, passTest, doneProgress, warning);
        expect(result.allowed).toBe(true);
        expect(result.reasons.some((r) => r.includes("no scenarios"))).toBe(true);
    });
    it("reports base gate failures alongside accept-gate block", () => {
        const failTest = { passed: false };
        const result = checkShipGateWithAcceptance(passReview, failTest, doneProgress, blocked);
        expect(result.allowed).toBe(false);
        expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });
});
//# sourceMappingURL=forced-acceptance.test.js.map