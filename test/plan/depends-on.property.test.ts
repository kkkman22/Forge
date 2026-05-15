import { describe, expect, it } from "vitest";
import type { AtomicTask } from "../../src/plan.js";
import { toTaskGraph } from "../../src/plan.js";
import { topologicalOrder, validateGraph } from "../../src/task-graph.js";

function makeAtomicTask(n: number, dependsOn: number[] = []): AtomicTask {
  return {
    taskNumber: n,
    title: `Task ${n}`,
    filePath: `src/f${n}.ts`,
    estimatedMinutes: 3,
    tddSteps: {
      red: { testFile: `test/f${n}.test.ts`, testCode: "t", runCommand: "npx vitest run" },
      green: { sourceFile: `src/f${n}.ts`, sourceCode: "c", runCommand: "npx vitest run" },
      refactor: "r",
    },
    verifyCommand: "npx vitest run",
    commitMessage: `m${n}`,
    dependsOn,
  };
}

function buildDagTasks(seed: number): AtomicTask[] {
  const n = (Math.abs(seed) % 8) + 1;
  const tasks: AtomicTask[] = [];
  for (let i = 1; i <= n; i++) {
    const deps: number[] = [];
    for (let j = 1; j < i; j++) {
      if (Math.abs(seed + i * 7 + j * 13) % 3 === 0) {
        deps.push(j);
      }
    }
    tasks.push(makeAtomicTask(i, deps));
  }
  return tasks;
}

describe("toTaskGraph PBT", () => {
  it("tasks without cycles produce valid graph (seeded)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const tasks = buildDagTasks(seed);
      const graph = toTaskGraph(tasks);
      expect(validateGraph(graph).valid).toBe(true);
    }
  });

  it("topological order preserves dependency order for DAG tasks", () => {
    const tasks = [
      makeAtomicTask(1, []),
      makeAtomicTask(2, [1]),
      makeAtomicTask(3, [1]),
      makeAtomicTask(4, [2, 3]),
    ];
    const graph = toTaskGraph(tasks);
    const order = topologicalOrder(graph);
    expect(order).not.toBeNull();

    const pos = new Map(order!.map((id, i) => [id, i] as const));
    for (const task of tasks) {
      for (const dep of task.dependsOn ?? []) {
        const depPos = pos.get(`task-${dep}`)!;
        const taskPos = pos.get(`task-${task.taskNumber}`)!;
        expect(depPos).toBeLessThan(taskPos);
      }
    }
  });

  it("empty tasks array produces empty graph", () => {
    const graph = toTaskGraph([]);
    expect(graph.tasks).toHaveLength(0);
  });

  it("all task IDs are unique in output", () => {
    const tasks = [makeAtomicTask(1), makeAtomicTask(2), makeAtomicTask(3)];
    const graph = toTaskGraph(tasks);
    const ids = graph.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("round-trip: toTaskGraph → topologicalOrder covers all task IDs", () => {
    for (let seed = 0; seed < 20; seed++) {
      const tasks = buildDagTasks(seed);
      const graph = toTaskGraph(tasks);
      const order = topologicalOrder(graph);
      expect(order).not.toBeNull();
      expect(order!.length).toBe(tasks.length);
      const ids = new Set(order!);
      for (const t of tasks) {
        expect(ids.has(`task-${t.taskNumber}`)).toBe(true);
      }
    }
  });
});
