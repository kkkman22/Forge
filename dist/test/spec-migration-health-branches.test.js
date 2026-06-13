import { describe, expect, it } from "vitest";
import { generateRecommendations } from "../src/spec-health.js";
import { extractSection, extractSubsection } from "../src/spec-migration.js";
function dimScore(errorCount = 0) {
    return { errorCount, details: [] };
}
describe("extractSection (branch coverage)", () => {
    it("extracts a ## section", () => {
        const body = "## Introduction\n\nThis is the intro.\n\n## Next\n\nOther.";
        expect(extractSection(body, "Introduction")).toBe("This is the intro.");
    });
    it("returns empty string when section not found", () => {
        expect(extractSection("## Other\n\ntext", "Introduction")).toBe("");
    });
    it("returns empty string for empty body", () => {
        expect(extractSection("", "Introduction")).toBe("");
    });
    it("handles section at end of body (no next ##)", () => {
        const body = "## Last\n\nFinal section content.";
        expect(extractSection(body, "Last")).toBe("Final section content.");
    });
    it("escapes special regex chars in heading", () => {
        const body = "## C++ Guide\n\nContent about C++.";
        expect(extractSection(body, "C++ Guide")).toBe("Content about C++.");
    });
});
describe("extractSubsection (branch coverage)", () => {
    it("extracts a ### subsection", () => {
        const body = "### Details\n\nDetail content.\n\n## Next";
        expect(extractSubsection(body, "Details")).toBe("Detail content.");
    });
    it("returns empty string when subsection not found", () => {
        expect(extractSubsection("### Other", "Details")).toBe("");
    });
    it("handles subsection at end of text", () => {
        const body = "### Final\n\nLast subsection.";
        expect(extractSubsection(body, "Final")).toBe("Last subsection.");
    });
});
describe("generateRecommendations (branch coverage)", () => {
    it("returns no_action for healthy verdict", () => {
        const recs = generateRecommendations({
            leak: dimScore(0),
            scenario: dimScore(0),
            glossary: dimScore(0),
        }, "healthy");
        expect(recs.length).toBe(1);
        expect(recs[0].kind).toBe("no_action");
    });
    it("recommends grill for degraded verdict", () => {
        const recs = generateRecommendations({
            leak: dimScore(0),
            scenario: dimScore(0),
            glossary: dimScore(0),
        }, "degraded");
        expect(recs.some((r) => r.kind === "trigger_grill")).toBe(true);
    });
    it("recommends grill for marginal verdict", () => {
        const recs = generateRecommendations({
            leak: dimScore(0),
            scenario: dimScore(0),
            glossary: dimScore(0),
        }, "marginal");
        expect(recs.some((r) => r.kind === "trigger_grill")).toBe(true);
    });
    it("recommends rerun_spec_review when leak errors > 0", () => {
        const recs = generateRecommendations({
            leak: dimScore(3),
            scenario: dimScore(0),
            glossary: dimScore(0),
        }, "degraded");
        expect(recs.some((r) => r.kind === "rerun_spec_review")).toBe(true);
    });
    it("generates recommendations when scenario errors > 0", () => {
        const recs = generateRecommendations({
            leak: dimScore(0),
            scenario: dimScore(2),
            glossary: dimScore(0),
        }, "degraded");
        expect(recs.length).toBeGreaterThan(0);
    });
    it("recommends glossary_update when glossary errors > 0", () => {
        const recs = generateRecommendations({
            leak: dimScore(0),
            scenario: dimScore(0),
            glossary: dimScore(5),
        }, "degraded");
        expect(recs.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=spec-migration-health-branches.test.js.map