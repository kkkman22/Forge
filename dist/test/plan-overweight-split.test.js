import { describe, expect, it } from "vitest";
import { validateOverweightTaskSplits } from "../src/plan.js";
describe("validateOverweightTaskSplits", () => {
    it("rejects an overweight task without split metadata", () => {
        const result = validateOverweightTaskSplits([
            {
                id: "T-01",
                title: "Implement everything",
                task_weight: {
                    files_touched: 6,
                    estimated_loc: 120,
                    layers: ["service"],
                    new_dependencies: 0,
                    test_scope: "unit",
                    risk: "medium",
                    estimated_minutes: 20,
                },
            },
        ]);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("T-01");
        expect(result.errors[0]).toContain("requires split");
    });
    it("does not allow monolith_acknowledged to bypass overweight splitting", () => {
        const result = validateOverweightTaskSplits([
            {
                id: "T-01",
                title: "Large task",
                task_weight: {
                    files_touched: 2,
                    estimated_loc: 150,
                    layers: ["service"],
                    new_dependencies: 0,
                    test_scope: "unit",
                    risk: "medium",
                    estimated_minutes: 20,
                },
            },
        ], { monolith_acknowledged: true });
        expect(result.valid).toBe(false);
    });
    it("accepts overweight tasks with child split metadata", () => {
        const result = validateOverweightTaskSplits([
            {
                id: "T-01",
                title: "Large task",
                task_weight: {
                    files_touched: 6,
                    estimated_loc: 240,
                    layers: ["service", "test"],
                    new_dependencies: 0,
                    test_scope: "unit",
                    risk: "medium",
                    estimated_minutes: 20,
                },
                split_into: ["T-01a", "T-01b"],
            },
        ]);
        expect(result.valid).toBe(true);
    });
});
//# sourceMappingURL=plan-overweight-split.test.js.map