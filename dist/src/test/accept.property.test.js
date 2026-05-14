/* eslint-disable */
// biome-ignore-all lint/suspicious/noThenProperty: `then` is a Gherkin field
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyScenarioType, deriveScenariosFromCriteria, parseScenariosFromSpec, selectScenariosForRun, } from "../src/accept.js";
const VALID_TYPES = new Set(["api", "ui", "cli", "mixed", "unknown"]);
function scenarioArb() {
    return fc.record({
        id: fc.string({ minLength: 1 }),
        given: fc.string(),
        when: fc.string(),
        then: fc.string(),
        source: fc.constantFrom("explicit", "derived"),
        type: fc.constantFrom("api", "ui", "cli", "mixed", "unknown"),
        tags: fc.array(fc.string()),
        confidence: fc.double({ min: 0, max: 1 }),
        rawText: fc.string(),
    });
}
describe("classifyScenarioType — property", () => {
    it("returns valid type for any scenario", () => {
        fc.assert(fc.property(scenarioArb(), (s) => {
            const result = classifyScenarioType(s);
            expect(VALID_TYPES).toContain(result);
        }));
    });
    it("api keywords → api type", () => {
        const s = {
            id: "t",
            given: "",
            when: "send a GET request",
            then: "response is 200",
            source: "explicit",
            type: "unknown",
            tags: [],
            confidence: 1,
            rawText: "",
        };
        expect(classifyScenarioType(s)).toBe("api");
    });
    it("ui keywords → ui type", () => {
        const s = {
            id: "t",
            given: "",
            when: "click the button",
            then: "page is visible",
            source: "explicit",
            type: "unknown",
            tags: [],
            confidence: 1,
            rawText: "",
        };
        expect(classifyScenarioType(s)).toBe("ui");
    });
    it("mixed api + ui → mixed", () => {
        const s = {
            id: "t",
            given: "",
            when: "click submit and get API response",
            then: "status code 200",
            source: "explicit",
            type: "unknown",
            tags: [],
            confidence: 1,
            rawText: "",
        };
        expect(classifyScenarioType(s)).toBe("mixed");
    });
    it("no keywords → unknown", () => {
        const s = {
            id: "t",
            given: "something",
            when: "happens",
            then: "result",
            source: "explicit",
            type: "unknown",
            tags: [],
            confidence: 1,
            rawText: "",
        };
        expect(classifyScenarioType(s)).toBe("unknown");
    });
});
describe("parseScenariosFromSpec — property", () => {
    it("never throws for any markdown", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            expect(() => parseScenariosFromSpec(content)).not.toThrow();
        }));
    });
    it("returns array of scenarios", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            const result = parseScenariosFromSpec(content);
            expect(Array.isArray(result)).toBe(true);
        }));
    });
});
describe("deriveScenariosFromCriteria — property", () => {
    it("empty criteria → empty array", () => {
        expect(deriveScenariosFromCriteria([])).toEqual([]);
    });
});
describe("selectScenariosForRun — property", () => {
    it("result length <= maxCount", () => {
        fc.assert(fc.property(fc.array(scenarioArb()), fc.integer({ min: 1, max: 20 }), (scenarios, max) => {
            const result = selectScenariosForRun(scenarios, { maxCount: max });
            expect(result.length).toBeLessThanOrEqual(max);
        }));
    });
    it("empty input → empty output", () => {
        expect(selectScenariosForRun([])).toEqual([]);
    });
    it("@critical scenarios come first", () => {
        const scenarios = [
            {
                id: "1",
                given: "",
                when: "a",
                then: "b",
                source: "derived",
                type: "unknown",
                tags: [],
                confidence: 0.7,
                rawText: "",
            },
            {
                id: "2",
                given: "",
                when: "c",
                then: "d",
                source: "explicit",
                type: "unknown",
                tags: ["@critical"],
                confidence: 1,
                rawText: "",
            },
        ];
        const result = selectScenariosForRun(scenarios);
        expect(result[0].id).toBe("2");
    });
});
//# sourceMappingURL=accept.property.test.js.map