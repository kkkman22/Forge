/**
 * Plan engine — task-graph bridge (T-02 拆分自 src/plan.ts).
 *
 * 把 plan 的 AtomicTask[]/LightweightTask[] 转换并校验为 number-keyed 依赖图。
 * 这是 src/task-graph.ts（string-keyed TaskGraph）的**消费者**，不是它的一部分——
 * 两者签名不同（number vs string key），不可合并，合并会引入反向依赖（环）。
 *
 * 依赖：types（AtomicTask/LightweightTask）+ 外部 ../task-graph.js（TaskGraph/TaskStatus）。
 *
 * @module plan/task-graph-bridge
 */

import type { TaskGraph, TaskStatus } from "../task-graph.js";
import type { AtomicTask, LightweightTask } from "./types.js";

/**
 * Convert AtomicTask[] or LightweightTask[] to a TaskGraph for use with
 * task-graph.ts validation and scheduling functions.
 *
 * Each task's `taskNumber` is mapped to `task-{n}` string ID format.
 * Undefined or missing `dependsOn` is normalized to empty array.
 * @public
 */
export function toTaskGraph(tasks: AtomicTask[] | LightweightTask[]): TaskGraph {
  return {
    tasks: tasks.map((t) => ({
      id: `task-${t.taskNumber}`,
      title: t.title,
      dependsOn: (t.dependsOn ?? []).map((d) => `task-${d}`),
      status: "pending" as TaskStatus,
    })),
  };
}

/**
 * Detect cycles in task dependencies using Kahn's algorithm.
 * Returns an error message if a cycle is found, null otherwise.
 */
export function detectCycleInTasks(
  tasks: Array<{ taskNumber: number; dependsOn?: number[] }>,
): string | null {
  const inDegree = new Map<number, number>();
  const adjacency = new Map<number, number[]>();

  for (const task of tasks) {
    inDegree.set(task.taskNumber, 0);
    adjacency.set(task.taskNumber, []);
  }

  for (const task of tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (adjacency.has(dep)) {
          adjacency.get(dep)?.push(task.taskNumber);
          inDegree.set(task.taskNumber, (inDegree.get(task.taskNumber) ?? 0) + 1);
        }
      }
    }
  }

  const queue: number[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: shift() is safe — loop guard ensures length > 0
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (processed < tasks.length) {
    const cycleNodes = tasks
      .filter((t) => (inDegree.get(t.taskNumber) ?? 0) > 0)
      .map((t) => t.taskNumber);
    return `Cycle detected involving tasks: ${cycleNodes.join(", ")}`;
  }

  return null;
}

/**
 * Validate that tasks are in topological order: dependencies appear before dependents.
 * Returns an error message if ordering is violated, null otherwise.
 */
export function validateTopologicalOrder(
  tasks: Array<{ taskNumber: number; dependsOn?: number[] }>,
): string | null {
  const position = new Map<number, number>();
  for (let i = 0; i < tasks.length; i++) {
    position.set(tasks[i].taskNumber, i);
  }

  for (const task of tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        const depPos = position.get(dep);
        if (depPos !== undefined && depPos > (position.get(task.taskNumber) ?? -1)) {
          return `Task ${task.taskNumber} depends on task ${dep}, but task ${dep} appears after task ${task.taskNumber}`;
        }
      }
    }
  }

  return null;
}
