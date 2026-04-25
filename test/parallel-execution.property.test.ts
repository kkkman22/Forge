/**
 * Property 26: XL 并行执行引擎
 *
 * Uses fast-check to verify that:
 *   - getDispatchBatch respects maxConcurrency limit
 *   - dispatchTasks transitions pending → in_progress
 *   - failTask propagates failure to transitive dependents
 *   - getExecutionSummary counts are consistent
 *   - simulateParallelExecution completes valid DAGs
 *   - Parallelism reduces wave count compared to serial execution
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  completeTask,
  dispatchTasks,
  failTask,
  getDispatchBatch,
  getExecutionSummary,
  getReadyTasks,
  simulateParallelExecution,
  type TaskGraph,
  type TaskNode,
  type TaskStatus,
  validateGraph,
} from "../src/task-graph.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(id: string, dependsOn: string[] = [], status: TaskStatus = "pending"): TaskNode {
  return { id, title: `Task ${id}`, dependsOn, status };
}

/** Build a linear chain: 1 → 2 → 3 → ... → n */
function linearChain(n: number): TaskGraph {
  const tasks: TaskNode[] = [];
  for (let i = 1; i <= n; i++) {
    tasks.push(makeTask(String(i), i > 1 ? [String(i - 1)] : []));
  }
  return { tasks };
}

/** Build a wide fan: all tasks depend on a single root */
function wideFan(n: number): TaskGraph {
  const tasks: TaskNode[] = [makeTask("root")];
  for (let i = 1; i <= n; i++) {
    tasks.push(makeTask(`leaf-${i}`, ["root"]));
  }
  return { tasks };
}

/** Build fully independent tasks (no dependencies) */
function independent(n: number): TaskGraph {
  const tasks: TaskNode[] = [];
  for (let i = 1; i <= n; i++) {
    tasks.push(makeTask(String(i)));
  }
  return { tasks };
}

// ---------------------------------------------------------------------------
// Generators for random valid DAGs
// ---------------------------------------------------------------------------

const dagArb: fc.Arbitrary<TaskGraph> = fc
  .integer({ min: 1, max: 10 })
  .chain((n) => {
    // Generate n tasks where each task can only depend on tasks with lower IDs
    return fc
      .array(
        fc.tuple(
          fc.integer({ min: 0, max: n - 1 }),
          fc.array(fc.integer({ min: 0, max: n - 1 }), { minLength: 0, maxLength: 3 }),
        ),
        { minLength: n, maxLength: n },
      )
      .map((specs) => {
        const tasks: TaskNode[] = [];
        for (let i = 0; i < n; i++) {
          const deps = specs[i][1]
            .filter((d) => d < i) // Only depend on earlier tasks
            .map((d) => String(d + 1));
          const uniqueDeps = [...new Set(deps)];
          tasks.push(makeTask(String(i + 1), uniqueDeps));
        }
        return { tasks };
      });
  })
  .filter((g) => validateGraph(g).valid);

const concurrencyArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 5 });

// ---------------------------------------------------------------------------
// Property 26: Dispatch batch
// ---------------------------------------------------------------------------

describe("Property 26: Dispatch batch", () => {
  it("batch size never exceeds maxConcurrency", () => {
    fc.assert(
      fc.property(dagArb, concurrencyArb, (graph, maxC) => {
        const batch = getDispatchBatch(graph, maxC);
        expect(batch.tasks.length).toBeLessThanOrEqual(maxC);
      }),
      { numRuns: 200 },
    );
  });

  it("batch tasks are all pending with completed dependencies", () => {
    fc.assert(
      fc.property(dagArb, (graph) => {
        const batch = getDispatchBatch(graph);
        const ready = getReadyTasks(graph);
        const readyIds = new Set(ready.map((t) => t.id));
        for (const task of batch.tasks) {
          expect(readyIds.has(task.id)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("in_progress tasks count against concurrency limit", () => {
    const graph: TaskGraph = {
      tasks: [
        makeTask("1", [], "in_progress"),
        makeTask("2", [], "in_progress"),
        makeTask("3"),
        makeTask("4"),
      ],
    };
    const batch = getDispatchBatch(graph, 3);
    // 2 in_progress + batch should not exceed 3
    expect(batch.tasks.length).toBeLessThanOrEqual(1);
  });

  it("when at max concurrency, batch is empty", () => {
    const graph: TaskGraph = {
      tasks: [
        makeTask("1", [], "in_progress"),
        makeTask("2", [], "in_progress"),
        makeTask("3", [], "in_progress"),
        makeTask("4"),
      ],
    };
    const batch = getDispatchBatch(graph, 3);
    expect(batch.tasks.length).toBe(0);
  });

  it("waitingCount = ready tasks - dispatched tasks", () => {
    fc.assert(
      fc.property(dagArb, concurrencyArb, (graph, maxC) => {
        const ready = getReadyTasks(graph);
        const batch = getDispatchBatch(graph, maxC);
        expect(batch.tasks.length + batch.waitingCount).toBe(ready.length);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 26: Dispatch tasks
// ---------------------------------------------------------------------------

describe("Property 26: Dispatch tasks", () => {
  it("dispatched tasks transition to in_progress", () => {
    const graph = independent(5);
    const batch = getDispatchBatch(graph, 3);
    dispatchTasks(
      graph,
      batch.tasks.map((t) => t.id),
    );
    for (const task of batch.tasks) {
      const node = graph.tasks.find((t) => t.id === task.id);
      expect(node?.status).toBe("in_progress");
    }
  });

  it("non-dispatched tasks remain pending", () => {
    const graph = independent(5);
    dispatchTasks(graph, ["1", "2"]);
    expect(graph.tasks.find((t) => t.id === "3")?.status).toBe("pending");
    expect(graph.tasks.find((t) => t.id === "4")?.status).toBe("pending");
    expect(graph.tasks.find((t) => t.id === "5")?.status).toBe("pending");
  });

  it("dispatching non-existent task IDs is a no-op", () => {
    const graph = independent(3);
    dispatchTasks(graph, ["nonexistent"]);
    for (const task of graph.tasks) {
      expect(task.status).toBe("pending");
    }
  });
});

// ---------------------------------------------------------------------------
// Property 26: Fail task propagation
// ---------------------------------------------------------------------------

describe("Property 26: 失败传播", () => {
  it("failed task is marked as failed", () => {
    const graph = linearChain(3);
    failTask(graph, "1");
    expect(graph.tasks.find((t) => t.id === "1")?.status).toBe("failed");
  });

  it("direct dependents of failed task are blocked", () => {
    const graph = linearChain(3);
    failTask(graph, "1");
    expect(graph.tasks.find((t) => t.id === "2")?.status).toBe("blocked");
  });

  it("transitive dependents of failed task are blocked", () => {
    const graph = linearChain(5);
    const blocked = failTask(graph, "2");
    // Tasks 3, 4, 5 should all be blocked
    expect(blocked).toContain("3");
    expect(blocked).toContain("4");
    expect(blocked).toContain("5");
    // Task 1 should be unaffected
    expect(graph.tasks.find((t) => t.id === "1")?.status).toBe("pending");
  });

  it("fan-out: failing root blocks all leaves", () => {
    const graph = wideFan(4);
    completeTask(graph, "root"); // Complete root first
    // Reset root to pending and fail it
    const root = graph.tasks.find((t) => t.id === "root");
    if (root) root.status = "pending";
    failTask(graph, "root");
    for (const task of graph.tasks) {
      if (task.id !== "root") {
        expect(task.status).toBe("blocked");
      }
    }
  });

  it("failing a non-existent task returns empty blocked list", () => {
    const graph = linearChain(3);
    const blocked = failTask(graph, "nonexistent");
    expect(blocked).toHaveLength(0);
  });

  it("completed tasks are not blocked by later failures", () => {
    const graph = linearChain(3);
    completeTask(graph, "1");
    completeTask(graph, "2");
    failTask(graph, "2"); // Already completed, but we force fail
    // Task 1 was completed, should stay completed
    expect(graph.tasks.find((t) => t.id === "1")?.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// Property 26: Execution summary
// ---------------------------------------------------------------------------

describe("Property 26: 执行状态摘要", () => {
  it("status counts sum to total", () => {
    fc.assert(
      fc.property(dagArb, (graph) => {
        const summary = getExecutionSummary(graph);
        const sum =
          summary.pending +
          summary.inProgress +
          summary.completed +
          summary.failed +
          summary.blocked;
        expect(sum).toBe(summary.total);
      }),
      { numRuns: 200 },
    );
  });

  it("isComplete is true only when all tasks are completed", () => {
    fc.assert(
      fc.property(dagArb, (graph) => {
        const summary = getExecutionSummary(graph);
        expect(summary.isComplete).toBe(summary.completed === summary.total);
      }),
      { numRuns: 200 },
    );
  });

  it("currentParallelism equals in_progress count", () => {
    const graph: TaskGraph = {
      tasks: [
        makeTask("1", [], "in_progress"),
        makeTask("2", [], "in_progress"),
        makeTask("3", [], "completed"),
        makeTask("4"),
      ],
    };
    const summary = getExecutionSummary(graph);
    expect(summary.currentParallelism).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Property 26: Simulate parallel execution
// ---------------------------------------------------------------------------

describe("Property 26: 并行执行模拟", () => {
  it("valid DAGs always complete (waves > 0)", () => {
    fc.assert(
      fc.property(dagArb, concurrencyArb, (graph, maxC) => {
        const waves = simulateParallelExecution(graph, maxC);
        expect(waves).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("linear chain of N tasks takes N waves with concurrency 1", () => {
    for (let n = 1; n <= 5; n++) {
      const graph = linearChain(n);
      expect(simulateParallelExecution(graph, 1)).toBe(n);
    }
  });

  it("N independent tasks take ceil(N/maxC) waves", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 5 }), (n, maxC) => {
        const graph = independent(n);
        const waves = simulateParallelExecution(graph, maxC);
        expect(waves).toBe(Math.ceil(n / maxC));
      }),
      { numRuns: 100 },
    );
  });

  it("higher concurrency produces fewer or equal waves", () => {
    fc.assert(
      fc.property(dagArb, (graph) => {
        const waves1 = simulateParallelExecution(graph, 1);
        const waves3 = simulateParallelExecution(graph, 3);
        expect(waves3).toBeLessThanOrEqual(waves1);
      }),
      { numRuns: 200 },
    );
  });

  it("wide fan: root + N leaves takes 2 waves regardless of concurrency (if maxC >= N)", () => {
    const graph = wideFan(3);
    // Wave 1: root, Wave 2: all 3 leaves (if concurrency >= 3)
    expect(simulateParallelExecution(graph, 3)).toBe(2);
    expect(simulateParallelExecution(graph, 10)).toBe(2);
  });

  it("simulation does not mutate the original graph", () => {
    const graph = linearChain(3);
    const originalStatuses = graph.tasks.map((t) => t.status);
    simulateParallelExecution(graph, 2);
    const afterStatuses = graph.tasks.map((t) => t.status);
    expect(afterStatuses).toEqual(originalStatuses);
  });
});
