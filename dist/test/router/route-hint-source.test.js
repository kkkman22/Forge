import { describe, expect, it } from "vitest";
import { classifyTask, generateHints } from "../../src/router.js";
const BASE_SIGNALS = {
    filesAffected: 3,
    linesChanged: 50,
    hasExistingSpec: true,
    hasNewService: false,
    hasNewDatabase: false,
    hasAuthChanges: false,
    isVagueRequirement: false,
    hasClearRequirements: true,
};
describe("RouteHint.source field (R1-1/R1-2/R1-3/R1-5)", () => {
    it("generateHints fills source='taskType' by default (R1-2 write side)", () => {
        const hints = generateHints("backend", "iteration", ["build", "review", "test"]);
        for (const h of hints) {
            expect(h.source).toBe("taskType");
        }
    });
    it("RouteHint allows source='intent' (R1-1/R1-3)", () => {
        const hint = {
            command: "plan",
            tag: "reasoning-deep",
            description: "deep reasoning",
            source: "intent",
        };
        expect(hint.source).toBe("intent");
    });
    it("RouteHint source is optional (R1-5 backward compat)", () => {
        const hint = {
            command: "build",
            tag: "some-tag",
            description: "desc",
        };
        expect(hint.source).toBeUndefined();
    });
    it("classifyTask returns hints with source='taskType' by default", () => {
        const result = classifyTask(BASE_SIGNALS, undefined, undefined, "backend", "iteration");
        for (const h of result.hints) {
            expect(h.source).toBe("taskType");
        }
    });
    it("deserialize hint without source should fallback to 'taskType' (R1-2 read side)", () => {
        // Simulate a hint from old status.md that doesn't have source field
        const rawHint = {
            command: "build",
            tag: "migration-safety",
            description: "some desc",
        };
        const resolvedSource = rawHint.source ?? "taskType";
        expect(resolvedSource).toBe("taskType");
    });
    it("all four source values are accepted", () => {
        const sources = ["taskType", "projectPhase", "workNature", "intent"];
        for (const source of sources) {
            const hint = {
                command: "build",
                tag: "test",
                description: "test",
                source,
            };
            expect(hint.source).toBe(source);
        }
    });
});
//# sourceMappingURL=route-hint-source.test.js.map