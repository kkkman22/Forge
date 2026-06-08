import { describe, expect, it } from "vitest";
import { classifyTaskWeight } from "../src/plan.js";
describe("classifyTaskWeight", () => {
    it("classifies a narrow task as atomic", () => {
        const result = classifyTaskWeight({
            files_touched: 2,
            estimated_loc: 80,
            layers: ["service", "test"],
            new_dependencies: 0,
            test_scope: "unit",
            risk: "low",
            estimated_minutes: 5,
        });
        expect(result.overweight).toBe(false);
        expect(result.highRisk).toBe(false);
        expect(result.reasons).toEqual([]);
    });
    it("classifies task as overweight when touching at least five files", () => {
        const result = classifyTaskWeight({
            files_touched: 5,
            estimated_loc: 80,
            layers: ["service"],
            new_dependencies: 0,
            test_scope: "unit",
            risk: "medium",
            estimated_minutes: 8,
        });
        expect(result.overweight).toBe(true);
        expect(result.reasons).toContain("files_touched >= 5");
    });
    it("classifies task as overweight when estimated LOC reaches 150", () => {
        const result = classifyTaskWeight({
            files_touched: 2,
            estimated_loc: 150,
            layers: ["service"],
            new_dependencies: 0,
            test_scope: "unit",
            risk: "medium",
            estimated_minutes: 8,
        });
        expect(result.overweight).toBe(true);
        expect(result.reasons).toContain("estimated_loc >= 150");
    });
    it("classifies three-layer non-vertical-slice work as overweight", () => {
        const result = classifyTaskWeight({
            files_touched: 3,
            estimated_loc: 90,
            layers: ["ui", "api", "db"],
            new_dependencies: 0,
            test_scope: "unit",
            risk: "medium",
            estimated_minutes: 8,
        });
        expect(result.overweight).toBe(true);
        expect(result.reasons).toContain("layers >= 3");
    });
    it("allows declared narrow vertical slices across three layers", () => {
        const result = classifyTaskWeight({
            files_touched: 3,
            estimated_loc: 90,
            layers: ["ui", "api", "db"],
            new_dependencies: 0,
            test_scope: "unit",
            risk: "medium",
            estimated_minutes: 8,
            narrow_vertical_slice: true,
        });
        expect(result.overweight).toBe(false);
    });
    it("marks integration/e2e/migration scopes as high-risk and overweight", () => {
        for (const test_scope of ["integration", "e2e", "migration"]) {
            const result = classifyTaskWeight({
                files_touched: 1,
                estimated_loc: 40,
                layers: ["service"],
                new_dependencies: 0,
                test_scope,
                risk: "medium",
                estimated_minutes: 5,
            });
            expect(result.highRisk).toBe(true);
            expect(result.overweight).toBe(true);
            expect(result.reasons).toContain(`test_scope ${test_scope}`);
        }
    });
});
//# sourceMappingURL=plan-package-weight.test.js.map