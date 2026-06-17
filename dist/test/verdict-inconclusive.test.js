import { describe, expect, it } from "vitest";
import { aggregateVerdicts } from "../src/accept-driver.js";
// Verifies spec R2: INCONCLUSIVE verdict — environment unavailable, not a failure, does not block ship.
// T1.1 RED → GREEN
function artifact(verdict) {
    return {
        scenarioId: `s-${verdict}`,
        source: "explicit",
        givenWhenThen: "Given x / When y / Then z",
        executedAt: "2026-06-17T00:00:00Z",
        verdict,
        evidence: [],
    };
}
describe("Verdict type includes INCONCLUSIVE", () => {
    it("accepts INCONCLUSIVE as a valid Verdict value", () => {
        const v = "INCONCLUSIVE";
        expect(v).toBe("INCONCLUSIVE");
    });
});
describe("aggregateVerdicts — INCONCLUSIVE semantics", () => {
    it("INCONCLUSIVE does NOT block ship and does NOT count as fail", () => {
        const result = aggregateVerdicts([artifact("INCONCLUSIVE"), artifact("PASS")]);
        expect(result.fail).toBe(0);
        expect(result.inconclusive).toBe(1);
        expect(result.blocksShip).toBe(false);
    });
    it("FAIL blocks ship even when INCONCLUSIVE present; INCONCLUSIVE counted separately", () => {
        const result = aggregateVerdicts([artifact("FAIL"), artifact("INCONCLUSIVE")]);
        expect(result.fail).toBe(1);
        expect(result.inconclusive).toBe(1);
        expect(result.blocksShip).toBe(true);
    });
    it("all-INCONCLUSIVE does not block ship", () => {
        const result = aggregateVerdicts([artifact("INCONCLUSIVE"), artifact("INCONCLUSIVE")]);
        expect(result.inconclusive).toBe(2);
        expect(result.fail).toBe(0);
        expect(result.blocksShip).toBe(false);
    });
    it("counts PASS/FAIL/SKIP/WARN/INCONCLUSIVE independently", () => {
        const result = aggregateVerdicts([
            artifact("PASS"),
            artifact("FAIL"),
            artifact("SKIP"),
            artifact("WARN"),
            artifact("INCONCLUSIVE"),
        ]);
        expect(result).toMatchObject({
            pass: 1,
            fail: 1,
            skip: 1,
            warn: 1,
            inconclusive: 1,
            blocksShip: true,
        });
    });
});
//# sourceMappingURL=verdict-inconclusive.test.js.map