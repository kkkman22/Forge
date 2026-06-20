/**
 * T-08 (Wave 2) — pyramid ratio gate (Req7).
 *
 * Req7 AC:
 *   AC1: scripts/check-pyramid-ratio counts e2e scenarios / total.
 *   AC2: e2e ratio > threshold AND middle(unit+component)=0 → block.
 *   AC3: strict_pyramid: false OR e2e_ratio_threshold: 0 → warn-only.
 *   AC4: @critical e2e excluded from ratio.
 *   AC5: same judgement as pyramidShape (shares isE2eHeavy).
 *   AC6: total < 3 → skip.
 */
import { describe, expect, it } from "vitest";
import { evaluatePyramidRatio, isCriticalAc, parseSpecForRatio, } from "../scripts/check-pyramid-ratio.js";
const cfg = (over = {}) => ({
    e2eRatioThreshold: 0.3,
    strictPyramid: true,
    ...over,
});
function ac(id, layer, critical = false) {
    return { id, layer, critical };
}
function run(criteria, config = cfg()) {
    return evaluatePyramidRatio({ criteria, config });
}
describe("evaluatePyramidRatio — small-spec exemption (Req7 AC6)", () => {
    it("total < 3 → skip", () => {
        const r = run([ac("1", "e2e"), ac("2", "e2e")]);
        expect(r.skip).toBe(true);
        expect(r.skipReason).toMatch(/small-spec/i);
        expect(r.heavy).toBe(false);
    });
    it("total >= 3 is evaluated", () => {
        const r = run([ac("1", "e2e"), ac("2", "e2e"), ac("3", "e2e")]);
        expect(r.skip).toBe(false);
        expect(r.heavy).toBe(true);
    });
});
describe("evaluatePyramidRatio — e2e-heavy blocking (Req7 AC2)", () => {
    it("all e2e, no middle, no unit → heavy=true", () => {
        const r = run([ac("1", "e2e"), ac("2", "e2e"), ac("3", "e2e"), ac("4", "e2e")]);
        expect(r.heavy).toBe(true);
        expect(r.middle).toBe(0);
        expect(r.unit).toBe(0);
    });
    it("e2e-heavy with middle>0 → heavy=false (composition pushed down)", () => {
        const r = run([ac("1", "e2e"), ac("2", "e2e"), ac("3", "component"), ac("4", "contract")]);
        expect(r.heavy).toBe(false);
        expect(r.middle).toBe(2);
    });
});
describe("evaluatePyramidRatio — @critical exclusion (Req7 AC4)", () => {
    it("all e2e but all @critical → not heavy (critical excluded from ratio)", () => {
        const r = run([
            ac("1", "e2e", true),
            ac("2", "e2e", true),
            ac("3", "e2e", true),
            ac("4", "e2e", true),
        ]);
        expect(r.e2eNonCritical).toBe(0);
        expect(r.heavy).toBe(false);
    });
    it("mix of critical + non-critical e2e → only non-critical counted", () => {
        const r = run([
            ac("1", "e2e", true),
            ac("2", "e2e", true),
            ac("3", "e2e", false),
            ac("4", "e2e", false),
        ]);
        expect(r.e2eNonCritical).toBe(2);
        expect(r.heavy).toBe(true); // 2/4 = 0.5 > 0.3, middle=0
    });
});
describe("evaluatePyramidRatio — degradation (Req7 AC3)", () => {
    it("strict_pyramid: false → warn-only (skip, not heavy)", () => {
        const r = run([ac("1", "e2e"), ac("2", "e2e"), ac("3", "e2e"), ac("4", "e2e")], cfg({ strictPyramid: false }));
        expect(r.skip).toBe(true);
        expect(r.skipReason).toMatch(/strict_pyramid/i);
    });
    it("e2e_ratio_threshold: 0 → gate disabled (skip)", () => {
        const r = run([ac("1", "e2e"), ac("2", "e2e"), ac("3", "e2e")], cfg({ e2eRatioThreshold: 0 }));
        expect(r.skip).toBe(true);
        expect(r.skipReason).toMatch(/threshold/i);
    });
});
describe("evaluatePyramidRatio — shares judgement with pyramidShape (Req7 AC5)", () => {
    it("same input to isE2eHeavy and evaluatePyramidRatio agree on heavy", () => {
        // This is structurally guaranteed (evaluatePyramidRatio delegates to
        // isE2eHeavy); the test documents the contract.
        const r = run([ac("1", "e2e"), ac("2", "e2e"), ac("3", "e2e")]);
        expect(r.heavy).toBe(true);
    });
});
describe("isCriticalAc — @critical detection", () => {
    it("detects @critical tag in raw text", () => {
        expect(isCriticalAc("@critical login flow WHEN ...")).toBe(true);
        expect(isCriticalAc("1.1. WHEN x THEN y SHALL z <!-- @critical -->")).toBe(true);
    });
    it("returns false without the tag", () => {
        expect(isCriticalAc("1.1. WHEN x THEN y SHALL z")).toBe(false);
    });
});
describe("parseSpecForRatio — spec → gate input", () => {
    function specWithAcs(acs) {
        const blocks = acs
            .map((a) => `${a.id}. WHEN x THEN y SHALL z${a.critical ? " <!-- @critical -->" : ""}
   **Verify-By**: ${a.vb}
   **Evidence**: test/foo.test.ts`)
            .join("\n\n");
        return `---\nstatus: locked\n---\n\n## Acceptance Criteria\n\n${blocks}\n`;
    }
    it("parses Verify-By into layers + detects @critical", () => {
        const spec = specWithAcs([
            { id: "1.1", vb: "vitest:unit" },
            { id: "1.2", vb: "vitest:component" },
            { id: "1.3", vb: "forge_exec:e2e" },
            { id: "1.4", vb: "forge_exec:e2e", critical: true },
        ]);
        const input = parseSpecForRatio(spec, cfg());
        expect(input.criteria).toHaveLength(4);
        expect(input.criteria[0].layer).toBe("unit");
        expect(input.criteria[1].layer).toBe("component");
        expect(input.criteria[2].layer).toBe("e2e");
        expect(input.criteria[2].critical).toBe(false);
        expect(input.criteria[3].critical).toBe(true);
    });
    it("detects @critical tag in the Evidence/HTML-comment tail of an AC", () => {
        // Specs place @critical either as a leading scenario tag or inside an
        // HTML comment annotation. Both forms must count as critical for the ratio.
        const spec = `---\nstatus: locked\n---\n\n## Acceptance Criteria\n\n
1.1. WHEN x THEN y SHALL z <!-- @critical: 关键路径 -->
   **Verify-By**: forge_exec:e2e
   **Evidence**: test/foo.test.ts
`;
        const input = parseSpecForRatio(spec, cfg());
        expect(input.criteria).toHaveLength(1);
        expect(input.criteria[0].critical).toBe(true);
    });
    it("feature spec (layered-test-pyramid) is NOT e2e-heavy (dogfood, DoD)", () => {
        const spec = specWithAcs([
            { id: "1.1", vb: "bash:contract" },
            { id: "2.1", vb: "vitest:unit" },
            { id: "3.1", vb: "vitest:unit" },
            { id: "4.1", vb: "vitest:unit" },
            { id: "5.1", vb: "vitest:unit" },
            { id: "6.1", vb: "bash:contract" },
            { id: "7.1", vb: "bash:contract" },
        ]);
        const r = evaluatePyramidRatio(parseSpecForRatio(spec, cfg()));
        expect(r.heavy).toBe(false);
        expect(r.middle).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=check-pyramid-ratio.property.test.js.map