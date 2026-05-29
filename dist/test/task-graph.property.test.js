/**
 * Property tests for the Task Dependency Graph (DAG) system.
 *
 * Tests:
 *   - Graph validation (duplicates, missing refs, cycles, self-deps)
 *   - Ready task scheduling (only pending tasks with completed deps)
 *   - Topological ordering
 *   - Parallel execution simulation
 *   - Completion and stuck detection
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { completeTask, getReadyTasks, isGraphComplete, isGraphStuck, maxParallelism, topologicalOrder, validateGraph, } from "../src/task-graph.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTask(id, dependsOn = [], status = "pending") {
    return { id, title: `Task ${id}`, dependsOn, status };
}
// ---------------------------------------------------------------------------
// Property 37: Graph validation
// ---------------------------------------------------------------------------
describe("Property 37: Graph validation", () => {
    it("empty graph is invalid", () => {
        const result = validateGraph({ tasks: [] });
        expect(result.valid).toBe(false);
    });
    it("single task with no deps is valid", () => {
        const graph = { tasks: [makeTask("1")] };
        expect(validateGraph(graph).valid).toBe(true);
    });
    it("linear chain is valid", () => {
        const graph = {
            tasks: [makeTask("1"), makeTask("2", ["1"]), makeTask("3", ["2"])],
        };
        expect(validateGraph(graph).valid).toBe(true);
    });
    it("diamond DAG is valid", () => {
        const graph = {
            tasks: [makeTask("1"), makeTask("2", ["1"]), makeTask("3", ["1"]), makeTask("4", ["2", "3"])],
        };
        expect(validateGraph(graph).valid).toBe(true);
    });
    it("duplicate IDs are invalid", () => {
        const graph = {
            tasks: [makeTask("1"), makeTask("1")],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });
    it("reference to non-existent task is invalid", () => {
        const graph = {
            tasks: [makeTask("1", ["999"])],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("non-existent"))).toBe(true);
    });
    it("self-dependency is invalid", () => {
        const graph = {
            tasks: [makeTask("1", ["1"])],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("depends on itself"))).toBe(true);
    });
    it("simple cycle (A→B→A) is invalid", () => {
        const graph = {
            tasks: [makeTask("A", ["B"]), makeTask("B", ["A"])],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Cycle"))).toBe(true);
    });
    it("three-node cycle is invalid", () => {
        const graph = {
            tasks: [makeTask("A", ["C"]), makeTask("B", ["A"]), makeTask("C", ["B"])],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Cycle"))).toBe(true);
    });
    it("N independent tasks are always valid", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
            const tasks = Array.from({ length: n }, (_, i) => makeTask(`t-${i}`));
            expect(validateGraph({ tasks }).valid).toBe(true);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 38: Ready task scheduling
// ---------------------------------------------------------------------------
describe("Property 38: Ready task scheduling", () => {
    it("all independent tasks are ready", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
            const tasks = Array.from({ length: n }, (_, i) => makeTask(`t-${i}`));
            const ready = getReadyTasks({ tasks });
            expect(ready).toHaveLength(n);
        }), { numRuns: 50 });
    });
    it("task with pending dependency is not ready", () => {
        const graph = {
            tasks: [makeTask("1"), makeTask("2", ["1"])],
        };
        const ready = getReadyTasks(graph);
        expect(ready.map((t) => t.id)).toEqual(["1"]);
    });
    it("task becomes ready when dependency completes", () => {
        const graph = {
            tasks: [makeTask("1", [], "completed"), makeTask("2", ["1"])],
        };
        const ready = getReadyTasks(graph);
        expect(ready.map((t) => t.id)).toEqual(["2"]);
    });
    it("completed tasks are never ready", () => {
        const graph = {
            tasks: [makeTask("1", [], "completed")],
        };
        expect(getReadyTasks(graph)).toHaveLength(0);
    });
    it("diamond: after root completes, both middle tasks are ready", () => {
        const graph = {
            tasks: [
                makeTask("root", [], "completed"),
                makeTask("left", ["root"]),
                makeTask("right", ["root"]),
                makeTask("join", ["left", "right"]),
            ],
        };
        const ready = getReadyTasks(graph);
        const readyIds = ready.map((t) => t.id).sort();
        expect(readyIds).toEqual(["left", "right"]);
    });
});
// ---------------------------------------------------------------------------
// Property 39: Topological ordering
// ---------------------------------------------------------------------------
describe("Property 39: Topological ordering", () => {
    it("linear chain produces correct order", () => {
        const graph = {
            tasks: [makeTask("3", ["2"]), makeTask("1"), makeTask("2", ["1"])],
        };
        const order = topologicalOrder(graph);
        expect(order).not.toBeNull();
        const o = order;
        expect(o.indexOf("1")).toBeLessThan(o.indexOf("2"));
        expect(o.indexOf("2")).toBeLessThan(o.indexOf("3"));
    });
    it("cyclic graph returns null", () => {
        const graph = {
            tasks: [makeTask("A", ["B"]), makeTask("B", ["A"])],
        };
        expect(topologicalOrder(graph)).toBeNull();
    });
    it("dependencies always come before dependents in order", () => {
        const graph = {
            tasks: [makeTask("1"), makeTask("2", ["1"]), makeTask("3", ["1"]), makeTask("4", ["2", "3"])],
        };
        const order = topologicalOrder(graph);
        expect(order).not.toBeNull();
        const o2 = order;
        for (const task of graph.tasks) {
            for (const dep of task.dependsOn) {
                expect(o2.indexOf(dep)).toBeLessThan(o2.indexOf(task.id));
            }
        }
    });
});
// ---------------------------------------------------------------------------
// Property 40: Parallel execution
// ---------------------------------------------------------------------------
describe("Property 40: Parallel execution", () => {
    it("N independent tasks have maxParallelism = N", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
            const tasks = Array.from({ length: n }, (_, i) => makeTask(`t-${i}`));
            expect(maxParallelism({ tasks })).toBe(n);
        }), { numRuns: 50 });
    });
    it("linear chain has maxParallelism = 1", () => {
        const graph = {
            tasks: [makeTask("1"), makeTask("2", ["1"]), makeTask("3", ["2"])],
        };
        expect(maxParallelism(graph)).toBe(1);
    });
    it("diamond has maxParallelism = 2", () => {
        const graph = {
            tasks: [
                makeTask("root"),
                makeTask("left", ["root"]),
                makeTask("right", ["root"]),
                makeTask("join", ["left", "right"]),
            ],
        };
        expect(maxParallelism(graph)).toBe(2);
    });
    it("empty graph has maxParallelism = 0", () => {
        expect(maxParallelism({ tasks: [] })).toBe(0);
    });
});
// ---------------------------------------------------------------------------
// Property 41: Completion and stuck detection
// ---------------------------------------------------------------------------
describe("Property 41: Completion and stuck detection", () => {
    it("all completed = graph complete", () => {
        const graph = {
            tasks: [makeTask("1", [], "completed"), makeTask("2", ["1"], "completed")],
        };
        expect(isGraphComplete(graph)).toBe(true);
        expect(isGraphStuck(graph)).toBe(false);
    });
    it("pending with no blockers = not stuck", () => {
        const graph = {
            tasks: [makeTask("1")],
        };
        expect(isGraphComplete(graph)).toBe(false);
        expect(isGraphStuck(graph)).toBe(false);
    });
    it("all failed deps = stuck", () => {
        const graph = {
            tasks: [{ id: "1", title: "T1", dependsOn: [], status: "failed" }, makeTask("2", ["1"])],
        };
        expect(isGraphStuck(graph)).toBe(true);
    });
    it("completeTask returns newly unblocked tasks", () => {
        const graph = {
            tasks: [makeTask("1"), makeTask("2", ["1"]), makeTask("3", ["1"])],
        };
        const newlyReady = completeTask(graph, "1");
        const readyIds = newlyReady.map((t) => t.id).sort();
        expect(readyIds).toEqual(["2", "3"]);
    });
});
//# sourceMappingURL=task-graph.property.test.js.map