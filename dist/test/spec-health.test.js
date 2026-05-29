import { describe, expect, it } from "vitest";
import { checkSpecHealth, classifyVerdict, computeAmbiguityScore, renderSpecHealthAdvisory, } from "../src/spec-health.js";
function makeDim(dimension, errorCount) {
    return { dimension, passed: errorCount === 0, errorCount, details: [] };
}
describe("computeAmbiguityScore", () => {
    it("returns 1.0 when all dimensions have zero errors", () => {
        const dims = {
            leak: makeDim("leak", 0),
            scenario: makeDim("scenario", 0),
            glossary: makeDim("glossary", 0),
        };
        expect(computeAmbiguityScore(dims)).toBe(1.0);
    });
    it("returns 0 when leak_count=5, scenario_errors=3, glossary_miss=5", () => {
        const dims = {
            leak: makeDim("leak", 5),
            scenario: makeDim("scenario", 3),
            glossary: makeDim("glossary", 5),
        };
        expect(computeAmbiguityScore(dims)).toBe(0);
    });
    it("leak saturation (5 errors) drops score by at least 0.4", () => {
        const allClean = {
            leak: makeDim("leak", 0),
            scenario: makeDim("scenario", 0),
            glossary: makeDim("glossary", 0),
        };
        const leakOnly = {
            leak: makeDim("leak", 5),
            scenario: makeDim("scenario", 0),
            glossary: makeDim("glossary", 0),
        };
        const diff = computeAmbiguityScore(allClean) - computeAmbiguityScore(leakOnly);
        expect(diff).toBeGreaterThanOrEqual(0.4);
    });
    it("score never goes below 0", () => {
        const dims = {
            leak: makeDim("leak", 100),
            scenario: makeDim("scenario", 100),
            glossary: makeDim("glossary", 100),
        };
        expect(computeAmbiguityScore(dims)).toBeGreaterThanOrEqual(0);
    });
    it("score never exceeds 1", () => {
        const dims = {
            leak: makeDim("leak", 0),
            scenario: makeDim("scenario", 0),
            glossary: makeDim("glossary", 0),
        };
        expect(computeAmbiguityScore(dims)).toBeLessThanOrEqual(1);
    });
});
describe("classifyVerdict", () => {
    const thresholds = { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 };
    it("returns healthy for score >= 0.85", () => {
        expect(classifyVerdict(0.85, thresholds)).toBe("healthy");
        expect(classifyVerdict(1.0, thresholds)).toBe("healthy");
    });
    it("returns marginal for 0.7 <= score < 0.85", () => {
        expect(classifyVerdict(0.7, thresholds)).toBe("marginal");
        expect(classifyVerdict(0.84, thresholds)).toBe("marginal");
    });
    it("returns degraded for score < 0.7", () => {
        expect(classifyVerdict(0.69, thresholds)).toBe("degraded");
        expect(classifyVerdict(0, thresholds)).toBe("degraded");
    });
});
// ---------------------------------------------------------------------------
// Helpers for checkSpecHealth tests
// ---------------------------------------------------------------------------
function makeBannedRegistry(patterns) {
    const categories = new Map();
    categories.set("code", patterns.map((p, i) => ({ pattern: p, description: `banned-${i}` })));
    return { categories };
}
function makeGlossaryRegistry(terms) {
    const entries = new Map();
    const byTerm = new Map();
    for (const t of terms) {
        const entry = {
            term: t,
            context: "default",
            definition: `def-${t}`,
            aliases: [],
            updated: "",
            source: null,
            sourcePath: "",
            sourceLayer: "core",
        };
        entries.set(t, entry);
        byTerm.set(t, [entry]);
    }
    return { entries, byTerm };
}
const DEFAULT_THRESHOLDS = {
    leak_max: 0,
    scenario_max: 0,
    glossary_miss_max: 2,
    ambiguity_min: 0.7,
};
describe("checkSpecHealth", () => {
    it("returns healthy report for clean spec", () => {
        const input = {
            specContent: "Given clean spec\nWhen user acts\nThen result",
            specFilePath: "test.md",
            bannedRegistry: makeBannedRegistry([]),
            glossaryRegistry: makeGlossaryRegistry([]),
            thresholds: DEFAULT_THRESHOLDS,
        };
        const report = checkSpecHealth(input);
        expect(report.overallVerdict).toBe("healthy");
        expect(report.ambiguityScore).toBe(1.0);
    });
    it("returns degraded when spec has multiple leaks", () => {
        const input = {
            specContent: "Use UserService.callApi() to fetch DataRepository.query() and HttpClient.get()",
            specFilePath: "test.md",
            bannedRegistry: makeBannedRegistry([
                "UserService",
                "DataRepository",
                "HttpClient",
                "callApi",
                "query",
            ]),
            glossaryRegistry: makeGlossaryRegistry([]),
            thresholds: DEFAULT_THRESHOLDS,
        };
        const report = checkSpecHealth(input);
        expect(report.overallVerdict).toBe("degraded");
        expect(report.dimensions.leak.errorCount).toBeGreaterThanOrEqual(3);
    });
    it("generates trigger_grill recommendation when score is low", () => {
        const input = {
            specContent: "Use ServiceA and ServiceB and ServiceC and ServiceD and ServiceE",
            specFilePath: "test.md",
            bannedRegistry: makeBannedRegistry([
                "ServiceA",
                "ServiceB",
                "ServiceC",
                "ServiceD",
                "ServiceE",
            ]),
            glossaryRegistry: makeGlossaryRegistry([]),
            thresholds: DEFAULT_THRESHOLDS,
        };
        const report = checkSpecHealth(input);
        expect(report.recommendations.some((r) => r.kind === "trigger_grill")).toBe(true);
    });
    it("generates no_action when healthy", () => {
        const input = {
            specContent: "Given good spec\nWhen user acts\nThen result",
            specFilePath: "test.md",
            bannedRegistry: makeBannedRegistry([]),
            glossaryRegistry: makeGlossaryRegistry([]),
            thresholds: DEFAULT_THRESHOLDS,
        };
        const report = checkSpecHealth(input);
        expect(report.recommendations).toEqual([
            { kind: "no_action", reason: "All dimensions healthy" },
        ]);
    });
});
describe("renderSpecHealthAdvisory", () => {
    it("renders marginal advisory with score", () => {
        const report = {
            ambiguityScore: 0.78,
            dimensions: {
                leak: { dimension: "leak", passed: true, errorCount: 0, details: [] },
                scenario: { dimension: "scenario", passed: false, errorCount: 1, details: ["SCN001"] },
                glossary: { dimension: "glossary", passed: true, errorCount: 0, details: [] },
            },
            overallVerdict: "marginal",
            recommendations: [{ kind: "trigger_grill", reason: "low score" }],
        };
        const text = renderSpecHealthAdvisory(report);
        expect(text).toContain("0.78");
        expect(text).toContain("marginal");
    });
    it("renders degraded advisory with issues", () => {
        const report = {
            ambiguityScore: 0.42,
            dimensions: {
                leak: { dimension: "leak", passed: false, errorCount: 3, details: ["a", "b", "c"] },
                scenario: { dimension: "scenario", passed: false, errorCount: 2, details: ["x", "y"] },
                glossary: { dimension: "glossary", passed: true, errorCount: 0, details: [] },
            },
            overallVerdict: "degraded",
            recommendations: [{ kind: "rerun_spec_review", reason: "3 leaks" }],
        };
        const text = renderSpecHealthAdvisory(report);
        expect(text).toContain("degraded");
        expect(text).toContain("leak: ❌ (3 issues)");
        expect(text).toContain("scenario: ❌ (2 issues)");
    });
});
//# sourceMappingURL=spec-health.test.js.map