import { describe, expect, it } from "vitest";
describe("barrel exports", () => {
    it("exports spec-health functions from index", async () => {
        const mod = await import("../src/index.js");
        expect(mod.checkSpecHealth).toBeDefined();
        expect(mod.computeAmbiguityScore).toBeDefined();
        expect(mod.classifyVerdict).toBeDefined();
        expect(mod.renderSpecHealthAdvisory).toBeDefined();
        expect(mod.computeSpecHash).toBeDefined();
        expect(mod.shouldRecompute).toBeDefined();
    });
});
//# sourceMappingURL=spec-health-export.test.js.map