import { describe, expect, it } from "vitest";
describe("skill-loader types", () => {
    it("exports SkillManifest interface", async () => {
        const mod = await import("../src/skill-loader.js");
        expect(mod).toBeDefined();
    });
    it("exports mergeSkillLists function", async () => {
        const mod = await import("../src/skill-loader.js");
        expect(typeof mod.mergeSkillLists).toBe("function");
    });
    it("exports loadSkillsFromDir function", async () => {
        const mod = await import("../src/skill-loader.js");
        expect(typeof mod.loadSkillsFromDir).toBe("function");
    });
});
//# sourceMappingURL=skill-loader.test.js.map