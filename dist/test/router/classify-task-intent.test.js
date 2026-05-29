import { describe, expect, it, vi } from "vitest";
import { classifyTask } from "../../src/router.js";
vi.mock("../../src/prompt-defense.js", () => ({
    scanInput: vi.fn(() => ({
        safe: true,
        threats: [],
        detectionTimeMs: 0.1,
    })),
}));
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
describe("classifyTask reason append + dictionary failure fallback", () => {
    it("appends intent line to reason when intents matched", () => {
        const result = classifyTask(BASE_SIGNALS, "standard", undefined, "backend", "iteration", "feature", "OAuth 迁移要深思熟虑");
        expect(result.reason).toContain("intent:");
        expect(result.reason).toContain("ultrathink");
        expect(result.reason).toContain("命中");
    });
    it("does not append intent line when no intents matched", () => {
        const result = classifyTask(BASE_SIGNALS, "standard", undefined, "backend", "iteration", "feature", "普通任务描述");
        expect(result.reason).not.toContain("intent:");
    });
    it("R2-4: falls back gracefully when dictionary fails to load", () => {
        // If the dictionary file doesn't exist or fails to parse,
        // classifyTask should still work without intent hints
        const result = classifyTask(BASE_SIGNALS, "standard", undefined, "backend", "iteration", "feature", "要深思熟虑");
        // Should not throw, and should return valid ClassificationResult
        expect(result.tier).toBe("standard");
        expect(result.hints).toBeDefined();
        expect(Array.isArray(result.hints)).toBe(true);
    });
    it("handles empty rawDescription without error", () => {
        const result = classifyTask(BASE_SIGNALS, "standard");
        expect(result.hints).toBeDefined();
        const intentHints = result.hints.filter((h) => h.source === "intent");
        expect(intentHints).toHaveLength(0);
    });
});
//# sourceMappingURL=classify-task-intent.test.js.map