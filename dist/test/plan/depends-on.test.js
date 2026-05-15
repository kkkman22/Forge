import { describe, expect, it } from "vitest";
import { toTaskGraph } from "../../src/plan.js";
import { topologicalOrder, validateGraph } from "../../src/task-graph.js";
function makeAtomicTask(n, dependsOn = []) {
    return {
        taskNumber: n,
        title: `Task ${n}`,
        filePath: `src/file${n}.ts`,
        estimatedMinutes: 3,
        tddSteps: {
            red: { testFile: `test/file${n}.test.ts`, testCode: "test", runCommand: "npx vitest run" },
            green: { sourceFile: `src/file${n}.ts`, sourceCode: "code", runCommand: "npx vitest run" },
            refactor: "refactor",
        },
        verifyCommand: "npx vitest run",
        commitMessage: `feat: task ${n}`,
        dependsOn,
    };
}
describe("toTaskGraph", () => {
    it("converts AtomicTask[] to TaskGraph", () => {
        const tasks = [makeAtomicTask(1, []), makeAtomicTask(2, [1]), makeAtomicTask(3, [1, 2])];
        const graph = toTaskGraph(tasks);
        expect(graph.tasks).toHaveLength(3);
        expect(graph.tasks[0].id).toBe("task-1");
        expect(graph.tasks[0].dependsOn).toEqual([]);
        expect(graph.tasks[1].dependsOn).toEqual(["task-1"]);
        expect(graph.tasks[2].dependsOn).toEqual(["task-1", "task-2"]);
    });
    it("produces valid graph from well-formed tasks", () => {
        const tasks = [makeAtomicTask(1), makeAtomicTask(2, [1]), makeAtomicTask(3, [1])];
        const graph = toTaskGraph(tasks);
        expect(validateGraph(graph).valid).toBe(true);
    });
    it("preserves topological order", () => {
        const tasks = [makeAtomicTask(1), makeAtomicTask(2, [1]), makeAtomicTask(3, [1, 2])];
        const graph = toTaskGraph(tasks);
        const order = topologicalOrder(graph);
        expect(order).not.toBeNull();
        const pos1 = order.indexOf("task-1");
        const pos2 = order.indexOf("task-2");
        const pos3 = order.indexOf("task-3");
        expect(pos1).toBeLessThan(pos2);
        expect(pos1).toBeLessThan(pos3);
        expect(pos2).toBeLessThan(pos3);
    });
    it("converts LightweightTask[] to TaskGraph", () => {
        const tasks = [
            {
                taskNumber: 1,
                title: "T1",
                filePath: "a.ts",
                goal: "g",
                designReference: "design.md#s1",
                verifyCommand: "npm t",
                commitMessage: "m1",
                dependsOn: [],
            },
            {
                taskNumber: 2,
                title: "T2",
                filePath: "b.ts",
                goal: "g",
                designReference: "design.md#s2",
                verifyCommand: "npm t",
                commitMessage: "m2",
                dependsOn: [1],
            },
        ];
        const graph = toTaskGraph(tasks);
        expect(graph.tasks).toHaveLength(2);
        expect(graph.tasks[1].dependsOn).toEqual(["task-1"]);
    });
    it("handles empty dependsOn as empty array", () => {
        const tasks = [makeAtomicTask(1)];
        const graph = toTaskGraph(tasks);
        expect(graph.tasks[0].dependsOn).toEqual([]);
    });
    it("handles undefined dependsOn as empty array", () => {
        const task = {
            ...makeAtomicTask(1),
            dependsOn: undefined,
        };
        const graph = toTaskGraph([task]);
        expect(graph.tasks[0].dependsOn).toEqual([]);
    });
});
//# sourceMappingURL=depends-on.test.js.map