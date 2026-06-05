/**
 * Wave scheduling — parseWaves, computeDependencyClosure.
 *
 * Pure functions for task dependency graph operations.
 *
 * Validates: Requirements 4
 */

import type { TaskSeed, Wave } from "./spec-bundle.js";

// ---------------------------------------------------------------------------
// parseWaves
// ---------------------------------------------------------------------------

export function parseWaves(jsonBlock: string, tasks: TaskSeed[]): Wave[] {
  let parsed: { waves: Wave[] };
  try {
    parsed = JSON.parse(jsonBlock);
  } catch (_err: unknown) {
    throw new Error("Invalid JSON in wave block");
  }

  if (!parsed.waves || !Array.isArray(parsed.waves)) {
    throw new Error("Missing 'waves' array in wave block");
  }

  // Cycle detection via topological sort
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): void {
    if (inStack.has(id)) throw new Error(`Dependency cycle detected at task ${id}`);
    if (visited.has(id)) return;
    inStack.add(id);
    const task = taskMap.get(id);
    if (task?.depends_on) {
      for (const dep of task.depends_on) {
        dfs(dep);
      }
    }
    inStack.delete(id);
    visited.add(id);
  }

  for (const wave of parsed.waves) {
    for (const taskId of wave.tasks) {
      dfs(taskId);
    }
  }

  return parsed.waves;
}

// ---------------------------------------------------------------------------
// computeDependencyClosure (T-19: single-task mode)
// ---------------------------------------------------------------------------

export function computeDependencyClosure(taskId: string, tasks: TaskSeed[]): string[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  if (!taskMap.has(taskId)) {
    const available = tasks.map((t) => t.id).join(", ");
    throw new Error(`Unknown task ID: ${taskId}. Available: ${available}`);
  }

  const closure = new Set<string>();

  function collect(id: string): void {
    if (closure.has(id)) return;
    closure.add(id);
    const task = taskMap.get(id);
    if (task?.depends_on) {
      for (const dep of task.depends_on) {
        collect(dep);
      }
    }
  }

  collect(taskId);
  return [...closure];
}
