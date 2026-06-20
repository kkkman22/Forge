/* eslint-disable */
// biome-ignore-all lint/suspicious/noThenProperty: `then` is a Gherkin field
/**
 * T-03 (Wave 3) — classifyScenarioType reads Verify-By (Req2 + Req1 AC6).
 *
 * Req2 AC:
 *   AC1: ScenarioType includes unit/component/contract.
 *   AC2: classifyScenarioType prefers Verify-By; falls back to keywords.
 *   AC3: vitest:component → "component".
 *   AC4: mixed retained in union but no runner; Verify-By scenarios never mixed.
 *   AC5: forge_exec:e2e → "api" (reuses existing api/ui runner, no new enum).
 *
 * Req1 AC6: when Verify-By annotation contradicts scenario text keywords,
 * the annotation wins AND an annotation_conflict warning is recorded (non-blocking).
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyScenarioTypeWithMeta } from "../src/accept.js";
function scenario(over) {
    return {
        id: "s",
        given: "",
        when: "",
        then: "",
        source: "explicit",
        type: "unknown",
        tags: [],
        confidence: 1,
        rawText: "",
        ...over,
    };
}
describe("classifyScenarioType — Verify-By authoritative (Req2 AC2)", () => {
    it.each([
        ["vitest:unit", "unit"],
        ["vitest:component", "component"],
        ["bash:contract", "contract"],
        ["forge_exec:e2e", "api"], // AC5: e2e maps to api
        ["manual", "unknown"], // manual has no automated layer → unknown (no runner)
    ])("Verify-By '%s' → type '%s' regardless of text", (verifyBy, expected) => {
        const s = scenario({
            verifyBy,
            given: "no keywords here",
            when: "plain text only",
            then: "no api ui cli keyword",
        });
        expect(classifyScenarioTypeWithMeta(s).type).toBe(expected);
    });
    it("falls back to keyword heuristic when Verify-By absent (Req2 AC2)", () => {
        const s = scenario({
            given: "",
            when: "send a GET request",
            then: "response is 200",
        });
        expect(classifyScenarioTypeWithMeta(s).type).toBe("api");
    });
    it("falls back to keyword heuristic when Verify-By is illegal", () => {
        const s = scenario({
            verifyBy: "nonsense:foo",
            when: "click the button",
            then: "page is visible",
        });
        expect(classifyScenarioTypeWithMeta(s).type).toBe("ui");
    });
    it("derived scenarios keep keyword fallback (no Verify-By on derived)", () => {
        const s = scenario({
            source: "derived",
            when: "run the cli command",
            then: "exit code 0",
        });
        expect(classifyScenarioTypeWithMeta(s).type).toBe("cli");
    });
});
describe("classifyScenarioType — annotation conflict warning (Req1 AC6)", () => {
    it("Verify-By wins over contradicting text keywords + records conflict", () => {
        // Annotation says component, but text is all API keywords.
        const s = scenario({
            verifyBy: "vitest:component",
            given: "the api endpoint",
            when: "send a GET request to the endpoint",
            then: "the response status code is 200",
        });
        const result = classifyScenarioTypeWithMeta(s);
        expect(result.type).toBe("component"); // annotation wins
        expect(result.annotationConflict).toBe(true); // warning recorded
    });
    it("no conflict flag when annotation agrees with text", () => {
        const s = scenario({
            verifyBy: "forge_exec:e2e",
            when: "send a GET api request",
            then: "response 200",
        });
        const result = classifyScenarioTypeWithMeta(s);
        expect(result.type).toBe("api");
        expect(result.annotationConflict).toBe(false);
    });
    it("no conflict flag when no Verify-By (keyword fallback)", () => {
        const s = scenario({ when: "click button", then: "page visible" });
        expect(classifyScenarioTypeWithMeta(s).annotationConflict).toBe(false);
    });
});
describe("classifyScenarioType — mixed no longer produced for Verify-By scenarios (Req2 AC4)", () => {
    it("Verify-By scenarios never classify as mixed", () => {
        const cases = ["vitest:unit", "vitest:component", "bash:contract", "forge_exec:e2e"];
        for (const vb of cases) {
            const s = scenario({
                verifyBy: vb,
                when: "click the button and send GET api request", // would be mixed by keywords
                then: "status code 200 and page visible",
            });
            expect(classifyScenarioTypeWithMeta(s).type).not.toBe("mixed");
        }
    });
    it("derived scenarios without Verify-By can still be mixed (back-compat)", () => {
        const s = scenario({
            source: "derived",
            when: "click the button and send GET api request",
            then: "status code 200 and page visible",
        });
        expect(classifyScenarioTypeWithMeta(s).type).toBe("mixed");
    });
});
describe("classifyScenarioType — property (always returns valid type)", () => {
    const ALL_TYPES = [
        "unit",
        "component",
        "contract",
        "api",
        "ui",
        "cli",
        "mixed",
        "unknown",
    ];
    function scenarioArb() {
        return fc.record({
            id: fc.string({ minLength: 1 }),
            given: fc.string(),
            when: fc.string(),
            then: fc.string(),
            source: fc.constantFrom("explicit", "derived"),
            type: fc.constantFrom(...ALL_TYPES),
            tags: fc.array(fc.string()),
            confidence: fc.double({ min: 0, max: 1 }),
            rawText: fc.string(),
            verifyBy: fc.oneof(fc.constantFrom("vitest:unit", "vitest:component", "bash:contract", "forge_exec:e2e", "manual", ""), fc.string()),
        });
    }
    it("returns a valid ScenarioType for any input", () => {
        fc.assert(fc.property(scenarioArb(), (s) => {
            const result = classifyScenarioTypeWithMeta(s);
            expect(ALL_TYPES).toContain(result.type);
            expect(typeof result.annotationConflict).toBe("boolean");
        }));
    });
    it("Verify-By scenarios never produce 'mixed'", () => {
        fc.assert(fc.property(scenarioArb(), (s) => {
            if (s.verifyBy &&
                ["vitest:unit", "vitest:component", "bash:contract", "forge_exec:e2e"].includes(s.verifyBy)) {
                expect(classifyScenarioTypeWithMeta(s).type).not.toBe("mixed");
            }
        }));
    });
});
//# sourceMappingURL=accept.classify.property.test.js.map