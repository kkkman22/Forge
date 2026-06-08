import { describe, expect, it } from "vitest";
import { rewriteGraphForSplit, validateGraph } from "../src/task-graph.js";
describe("rewriteGraphForSplit", () => {
    it("rewrites incoming and outgoing dependencies through split children", () => {
        const rewritten = rewriteGraphForSplit({
            tasks: [
                { id: "A", title: "A", dependsOn: [], status: "pending" },
                { id: "B", title: "B", dependsOn: ["A"], status: "pending" },
                { id: "C", title: "C", dependsOn: ["B"], status: "pending" },
            ],
        }, "B", [
            { id: "B1", title: "B child 1", dependsOn: [], status: "pending" },
            { id: "B2", title: "B child 2", dependsOn: [], status: "pending" },
        ]);
        expect(rewritten.tasks.find((t) => t.id === "B")).toBeUndefined();
        expect(rewritten.tasks.find((t) => t.id === "B1")?.dependsOn).toEqual(["A"]);
        expect(rewritten.tasks.find((t) => t.id === "B2")?.dependsOn).toEqual(["B1"]);
        expect(rewritten.tasks.find((t) => t.id === "C")?.dependsOn).toEqual(["B2"]);
        expect(validateGraph(rewritten).valid).toBe(true);
    });
    it("uses an explicit outgoing artifact child when provided", () => {
        const rewritten = rewriteGraphForSplit({
            tasks: [
                { id: "A", title: "A", dependsOn: [], status: "pending" },
                { id: "B", title: "B", dependsOn: ["A"], status: "pending" },
                { id: "C", title: "C", dependsOn: ["B"], status: "pending" },
            ],
        }, "B", [
            { id: "B1", title: "B child 1", dependsOn: [], status: "pending" },
            { id: "B2", title: "B child 2", dependsOn: [], status: "pending" },
            { id: "B3", title: "B child 3", dependsOn: [], status: "pending" },
        ], { outgoingDependencyChildId: "B2" });
        expect(rewritten.tasks.find((t) => t.id === "C")?.dependsOn).toEqual(["B2"]);
    });
});
//# sourceMappingURL=task-graph-split.test.js.map