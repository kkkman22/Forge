import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeAmbiguityScore, } from "../src/spec-health.js";
function makeDim(dimension, errorCount) {
    return { dimension, passed: errorCount === 0, errorCount, details: [] };
}
describe("PBT: computeAmbiguityScore", () => {
    it("score is always in [0, 1]", () => {
        fc.assert(fc.property(fc.nat(100), fc.nat(100), fc.nat(100), (leak, scenario, glossary) => {
            const dims = {
                leak: makeDim("leak", leak),
                scenario: makeDim("scenario", scenario),
                glossary: makeDim("glossary", glossary),
            };
            const score = computeAmbiguityScore(dims);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        }));
    });
    it("score monotonically decreases when errorCount increases in one dimension", () => {
        fc.assert(fc.property(fc.nat(20), fc.nat(20), fc.constantFrom("leak", "scenario", "glossary"), (baseLeak, baseScenario, dim) => {
            const base = {
                leak: makeDim("leak", baseLeak),
                scenario: makeDim("scenario", baseScenario),
                glossary: makeDim("glossary", 0),
            };
            const increased = { ...base, [dim]: makeDim(dim, base[dim].errorCount + 1) };
            expect(computeAmbiguityScore(increased)).toBeLessThanOrEqual(computeAmbiguityScore(base));
        }));
    });
    it("all-zero errors always gives 1.0", () => {
        const dims = {
            leak: makeDim("leak", 0),
            scenario: makeDim("scenario", 0),
            glossary: makeDim("glossary", 0),
        };
        expect(computeAmbiguityScore(dims)).toBe(1.0);
    });
});
//# sourceMappingURL=spec-health.property.test.js.map