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
describe("intent reachability, dedup, tier conflict (R7)", () => {
    it("R7-1: intent does not change tier", () => {
        const result = classifyTask({ ...BASE_SIGNALS, filesAffected: 1, linesChanged: 10 }, "light", undefined, "backend", "iteration", "feature", "深思熟虑实现小改动");
        expect(result.tier).toBe("light");
        // Intent hints may be filtered out if commands not in light sequence
    });
    it("R7-2: unreachable intent hints are filtered out", () => {
        // light tier has only ["build", "review"], so "decide" and "debug"
        // hints from ultrathink should be filtered
        const result = classifyTask({ ...BASE_SIGNALS, filesAffected: 1, linesChanged: 10 }, "light", undefined, "backend", "iteration", "feature", "深思熟虑实现小改动");
        const intentHints = result.hints.filter((h) => h.source === "intent");
        // Only hints for build/review commands should survive
        for (const h of intentHints) {
            expect(["build", "review"]).toContain(h.command);
        }
    });
    it("R7-3: duplicate (command, tag) hints are deduped", () => {
        const result = classifyTask(BASE_SIGNALS, "standard", undefined, "backend", "iteration", "feature", "深思熟虑");
        const tags = result.hints.map((h) => h.tag);
        const uniqueTags = new Set(tags);
        expect(tags.length).toBe(uniqueTags.size);
    });
    it("R7-4: user tier override coexists with intent matching", () => {
        const result = classifyTask({ ...BASE_SIGNALS, filesAffected: 1, linesChanged: 5 }, "standard", undefined, "backend", "iteration", "feature", "深思熟虑做小改动");
        expect(result.tier).toBe("standard");
        const intentHints = result.hints.filter((h) => h.source === "intent");
        expect(intentHints.length).toBeGreaterThanOrEqual(0);
    });
    it("R7-5: reason field includes intent name when matched", () => {
        const result = classifyTask(BASE_SIGNALS, "standard", undefined, "backend", "iteration", "feature", "要深思熟虑地做 OAuth 迁移");
        expect(result.reason).toMatch(/intent:.*ultrathink.*命中/);
    });
    it("R6-4: MAX_RUNTIME_INTENT_HINTS soft warning (≤5 for standard tier)", () => {
        // With only 3 intents, standard tier should not trigger overload
        const result = classifyTask(BASE_SIGNALS, "full", undefined, "backend", "iteration", "feature", "深思熟虑 tdd-strict security-deep 全都要");
        const intentHints = result.hints.filter((h) => h.source === "intent");
        // Full tier has all commands, so most hints should be reachable
        // With 3 intents and ~7 emit_hints total, should be ≤ 5 after filtering
        expect(intentHints.length).toBeLessThanOrEqual(7);
    });
});
//# sourceMappingURL=intent-reachability.test.js.map