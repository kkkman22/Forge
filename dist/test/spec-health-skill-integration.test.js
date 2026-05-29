import { describe, expect, it } from "vitest";
import { checkSpecHealth, computeSpecHash, shouldRecompute, } from "../src/spec-health.js";
function makeBannedRegistry(patterns) {
    const categories = new Map();
    categories.set("code", patterns.map((p, i) => ({ pattern: p, description: `banned-${i}` })));
    return { categories };
}
const EMPTY_BANNED = { categories: new Map() };
const EMPTY_GLOSSARY = { entries: new Map(), byTerm: new Map() };
const DEFAULT_THRESHOLDS = {
    leak_max: 0,
    scenario_max: 0,
    glossary_miss_max: 2,
    ambiguity_min: 0.7,
};
describe("Skill integration contracts", () => {
    describe("forge-spec: Step 2 health frontmatter", () => {
        it("report can be serialized to frontmatter health field", () => {
            const input = {
                specContent: "Given spec\nWhen action\nThen result",
                specFilePath: "spec.md",
                bannedRegistry: EMPTY_BANNED,
                glossaryRegistry: EMPTY_GLOSSARY,
                thresholds: DEFAULT_THRESHOLDS,
            };
            const report = checkSpecHealth(input);
            const healthField = {
                score: report.ambiguityScore,
                verdict: report.overallVerdict,
                spec_hash: computeSpecHash(input.specContent),
                generated_at: new Date().toISOString(),
            };
            expect(healthField.score).toBeTypeOf("number");
            expect(healthField.verdict).toMatch(/^(healthy|marginal|degraded)$/);
            expect(healthField.spec_hash).toMatch(/^[0-9a-f]{64}$/);
        });
    });
    describe("forge-plan: pre-flight cache check", () => {
        it("skips recomputation when spec_hash matches", () => {
            const content = "Given spec\nWhen action\nThen result";
            const hash = computeSpecHash(content);
            const cache = { specHash: hash, score: 1.0, verdict: "healthy", generatedAt: "" };
            expect(shouldRecompute(hash, cache)).toBe(false);
        });
        it("forces recomputation when spec_hash differs", () => {
            const hash = computeSpecHash("new content");
            const cache = {
                specHash: "old_hash",
                score: 0.5,
                verdict: "degraded",
                generatedAt: "",
            };
            expect(shouldRecompute(hash, cache)).toBe(true);
        });
    });
    describe("forge-debug: marginal/degraded verdict provides grill recommendation", () => {
        it("degraded score triggers grill recommendation", () => {
            const input = {
                specContent: "Use ServiceX and ServiceY and ServiceZ and ServiceW and ServiceV",
                specFilePath: "spec.md",
                bannedRegistry: makeBannedRegistry([
                    "ServiceX",
                    "ServiceY",
                    "ServiceZ",
                    "ServiceW",
                    "ServiceV",
                ]),
                glossaryRegistry: EMPTY_GLOSSARY,
                thresholds: DEFAULT_THRESHOLDS,
            };
            const report = checkSpecHealth(input);
            expect(report.overallVerdict).toBe("degraded");
            expect(report.recommendations.some((r) => r.kind === "trigger_grill")).toBe(true);
        });
    });
    describe("forge-review: degraded verdict detection", () => {
        it("degraded verdict is detectable from report", () => {
            const input = {
                specContent: "Call MyService.doSomething() with Repo.find() and Client.post()",
                specFilePath: "spec.md",
                bannedRegistry: makeBannedRegistry(["MyService", "doSomething", "Repo", "Client", "post"]),
                glossaryRegistry: EMPTY_GLOSSARY,
                thresholds: DEFAULT_THRESHOLDS,
            };
            const report = checkSpecHealth(input);
            expect(report.overallVerdict).toBe("degraded");
            const needsRevalidation = report.overallVerdict === "degraded";
            expect(needsRevalidation).toBe(true);
        });
    });
});
//# sourceMappingURL=spec-health-skill-integration.test.js.map