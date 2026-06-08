import { describe, expect, it } from "vitest";
import { generateExecutionPackages } from "../src/plan.js";
function graph(ids, dependsOn = {}) {
    return {
        tasks: ids.map((id) => ({
            id,
            title: id,
            dependsOn: dependsOn[id] ?? [],
            status: "pending",
        })),
    };
}
describe("generateExecutionPackages", () => {
    it("generates bounded packages for ten or more atomic tasks", () => {
        const result = generateExecutionPackages(graph(Array.from({ length: 10 }, (_, i) => `T-${i + 1}`)));
        expect(result.packages.length).toBeGreaterThan(1);
        expect(result.packages.every((pkg) => pkg.tasks.length <= 5)).toBe(true);
        expect(result.packages.flatMap((pkg) => pkg.tasks)).toHaveLength(10);
    });
    it("generates packages for six to nine tasks", () => {
        const result = generateExecutionPackages(graph(Array.from({ length: 6 }, (_, i) => `T-${i + 1}`)));
        expect(result.packages.length).toBe(2);
    });
    it("keeps five small tasks in one package", () => {
        const result = generateExecutionPackages(graph(Array.from({ length: 5 }, (_, i) => `T-${i + 1}`)));
        expect(result.packages).toHaveLength(1);
        expect(result.packages[0].tasks).toHaveLength(5);
    });
    it("isolates high-risk tasks from unrelated work", () => {
        const result = generateExecutionPackages(graph(["T-1", "T-2", "T-3"]), {
            taskWeights: {
                "T-2": {
                    files_touched: 1,
                    estimated_loc: 40,
                    layers: ["service"],
                    new_dependencies: 0,
                    test_scope: "integration",
                    risk: "high",
                    estimated_minutes: 5,
                },
            },
        });
        expect(result.packages.map((pkg) => pkg.tasks)).toEqual([["T-1"], ["T-2"], ["T-3"]]);
    });
    it("declares package dependencies without forward dependencies", () => {
        const result = generateExecutionPackages(graph(["T-1", "T-2", "T-3", "T-4", "T-5", "T-6"], {
            "T-4": ["T-1"],
            "T-6": ["T-4"],
        }));
        const index = new Map(result.packages.map((pkg, i) => [pkg.id, i]));
        for (const pkg of result.packages) {
            for (const dep of pkg.depends_on_packages) {
                expect(index.get(dep) ?? -1).toBeLessThan(index.get(pkg.id) ?? Number.POSITIVE_INFINITY);
            }
        }
    });
});
//# sourceMappingURL=execution-package-generator.test.js.map