/**
 * Task dependency graph (DAG) for parallel execution.
 *
 * Tasks can declare
 * dependencies on other tasks, forming a directed acyclic graph.
 * Independent tasks (no unresolved dependencies) can execute in parallel.
 *
 * Key concepts:
 *   - TaskNode: a task with an ID, dependencies, and status
 *   - TaskGraph: the full DAG with validation and scheduling
 *   - getReadyTasks(): returns tasks whose dependencies are all completed
 *   - Cycle detection prevents infinite loops
 *
 * Integration with forge-plan:
 *   Plan's Task Breakdown now supports a `dependsOn` field per task.
 *   Tasks without dependencies can be dispatched to parallel Subagents.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked";

export interface TaskNode {
  /** Unique task identifier (e.g., "task-1", "task-2"). */
  id: string;
  /** Human-readable task title. */
  title: string;
  /** IDs of tasks this task depends on. Empty = no dependencies. */
  dependsOn: string[];
  /** Current execution status. */
  status: TaskStatus;
}

export interface TaskGraph {
  /** All tasks in the graph. */
  tasks: TaskNode[];
}

export interface SplitRewriteOptions {
  /** Child task that downstream dependents should depend on. Defaults to the last child. */
  outgoingDependencyChildId?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface GraphValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a task graph:
 *   1. No duplicate task IDs
 *   2. All dependency references point to existing tasks
 *   3. No cycles (DAG property)
 *   4. At least one task exists
 */
export function validateGraph(graph: TaskGraph): GraphValidation {
  const errors: string[] = [];

  if (graph.tasks.length === 0) {
    return { valid: false, errors: ["Graph must contain at least one task"] };
  }

  // Check 1: No duplicate IDs
  const ids = new Set<string>();
  for (const task of graph.tasks) {
    if (ids.has(task.id)) {
      errors.push(`Duplicate task ID: ${task.id}`);
    }
    ids.add(task.id);
  }

  // Check 2: All dependencies reference existing tasks
  for (const task of graph.tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(`Task ${task.id} depends on non-existent task: ${dep}`);
      }
      if (dep === task.id) {
        errors.push(`Task ${task.id} depends on itself`);
      }
    }
  }

  // Check 3: No cycles (topological sort via Kahn's algorithm)
  if (errors.length === 0) {
    const cycleError = detectCycle(graph);
    if (cycleError) {
      errors.push(cycleError);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Replace one task in a graph with child tasks while preserving dependency
 * correctness.
 *
 * Incoming dependencies of the original task attach to the first child.
 * Child tasks are chained in their provided order unless they already declare
 * dependencies. Downstream dependents of the original task are redirected to
 * the artifact child, defaulting to the last child.
 */
export function rewriteGraphForSplit(
  graph: TaskGraph,
  originalTaskId: string,
  childTasks: TaskNode[],
  options: SplitRewriteOptions = {},
): TaskGraph {
  const original = graph.tasks.find((task) => task.id === originalTaskId);
  if (!original || childTasks.length === 0) {
    return { tasks: graph.tasks.map((task) => ({ ...task, dependsOn: [...task.dependsOn] })) };
  }

  const outgoingChildId =
    options.outgoingDependencyChildId &&
    childTasks.some((task) => task.id === options.outgoingDependencyChildId)
      ? options.outgoingDependencyChildId
      : childTasks[childTasks.length - 1].id;

  const rewrittenChildren = childTasks.map((task, index) => {
    const declared = task.dependsOn.filter((dep) => dep !== originalTaskId);
    const dependsOn =
      declared.length > 0
        ? declared
        : index === 0
          ? [...original.dependsOn]
          : [childTasks[index - 1].id];
    return { ...task, dependsOn };
  });

  const rewrittenTasks: TaskNode[] = [];
  for (const task of graph.tasks) {
    if (task.id === originalTaskId) {
      rewrittenTasks.push(...rewrittenChildren);
      continue;
    }
    const dependsOn = task.dependsOn.map((dep) => (dep === originalTaskId ? outgoingChildId : dep));
    rewrittenTasks.push({ ...task, dependsOn });
  }

  if (!graph.tasks.some((task) => task.id === originalTaskId)) {
    rewrittenTasks.push(...rewrittenChildren);
  }

  const seen = new Set<string>();
  return {
    tasks: rewrittenTasks.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    }),
  };
}

/**
 * Detect cycles in the task graph using Kahn's algorithm.
 * Returns an error message if a cycle is found, null otherwise.
 */
function detectCycle(graph: TaskGraph): string | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of graph.tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  for (const task of graph.tasks) {
    for (const dep of task.dependsOn) {
      // dep → task (dep must complete before task)
      adjacency.get(dep)?.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
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

  if (processed < graph.tasks.length) {
    const cycleNodes = graph.tasks.filter((t) => (inDegree.get(t.id) ?? 0) > 0).map((t) => t.id);
    return `Cycle detected involving tasks: ${cycleNodes.join(", ")}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/**
 * Get tasks that are ready to execute (all dependencies completed).
 *
 * A task is "ready" when:
 *   - Its status is "pending"
 *   - All tasks in its dependsOn list have status "completed"
 *
 * These tasks can be dispatched to parallel Subagents.
 */
export function getReadyTasks(graph: TaskGraph): TaskNode[] {
  const statusMap = new Map<string, TaskStatus>();
  for (const task of graph.tasks) {
    statusMap.set(task.id, task.status);
  }

  return graph.tasks.filter((task) => {
    if (task.status !== "pending") return false;
    return task.dependsOn.every((dep) => statusMap.get(dep) === "completed");
  });
}

/**
 * Get the maximum parallelism level — the largest number of tasks
 * that could theoretically execute simultaneously.
 *
 * This is the width of the widest "level" in the DAG.
 */
export function maxParallelism(graph: TaskGraph): number {
  if (graph.tasks.length === 0) return 0;

  // Simulate execution: repeatedly get ready tasks, mark them completed
  const simGraph: TaskGraph = {
    tasks: graph.tasks.map((t) => ({ ...t, status: "pending" as TaskStatus })),
  };

  let maxWidth = 0;
  let safety = graph.tasks.length + 1;

  while (safety-- > 0) {
    const ready = getReadyTasks(simGraph);
    if (ready.length === 0) break;
    maxWidth = Math.max(maxWidth, ready.length);
    for (const task of ready) {
      const node = simGraph.tasks.find((t) => t.id === task.id);
      if (node) node.status = "completed";
    }
  }

  return maxWidth;
}

/**
 * Compute the topological order of tasks.
 * Returns task IDs in an order where dependencies come before dependents.
 * Returns null if the graph has cycles.
 */
export function topologicalOrder(graph: TaskGraph): string[] | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of graph.tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  for (const task of graph.tasks) {
    for (const dep of task.dependsOn) {
      adjacency.get(dep)?.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: shift() is safe — loop guard ensures length > 0
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return order.length === graph.tasks.length ? order : null;
}

/**
 * Mark a task as completed and return newly unblocked tasks.
 */
export function completeTask(graph: TaskGraph, taskId: string): TaskNode[] {
  const task = graph.tasks.find((t) => t.id === taskId);
  if (!task) return [];
  task.status = "completed";
  return getReadyTasks(graph);
}

/**
 * Check if all tasks in the graph are completed.
 */
export function isGraphComplete(graph: TaskGraph): boolean {
  return graph.tasks.every((t) => t.status === "completed");
}

/**
 * Check if the graph is stuck (no ready tasks but not all completed).
 */
export function isGraphStuck(graph: TaskGraph): boolean {
  if (isGraphComplete(graph)) return false;
  const ready = getReadyTasks(graph);
  const inProgress = graph.tasks.filter((t) => t.status === "in_progress");
  return ready.length === 0 && inProgress.length === 0;
}

// ---------------------------------------------------------------------------
// Parallel execution scheduler (Property 26 — XL Parallel Engine)
// ---------------------------------------------------------------------------

/**
 * Default maximum number of concurrent Subagents.
 */
export const DEFAULT_MAX_CONCURRENCY = 3;

/**
 * A batch of tasks to dispatch in parallel.
 */
export interface DispatchBatch {
  /** Tasks to dispatch in this batch (up to maxConcurrency). */
  tasks: TaskNode[];
  /** Number of tasks that were ready but not dispatched (due to concurrency limit). */
  waitingCount: number;
}

/**
 * Select the next batch of tasks to dispatch for parallel execution.
 *
 * Rules:
 *   - Only "pending" tasks with all dependencies "completed" are eligible
 *   - The batch size is capped at maxConcurrency
 *   - Tasks already "in_progress" count against the concurrency limit
 *   - If current in-progress count >= maxConcurrency, batch is empty
 *
 * @param graph - The task graph
 * @param maxConcurrency - Maximum parallel Subagents (default 3)
 * @returns A batch of tasks to dispatch
 */
export function getDispatchBatch(
  graph: TaskGraph,
  maxConcurrency: number = DEFAULT_MAX_CONCURRENCY,
): DispatchBatch {
  const inProgressCount = graph.tasks.filter((t) => t.status === "in_progress").length;
  const availableSlots = Math.max(0, maxConcurrency - inProgressCount);

  const ready = getReadyTasks(graph);
  const tasks = ready.slice(0, availableSlots);
  const waitingCount = ready.length - tasks.length;

  return { tasks, waitingCount };
}

/**
 * Mark tasks as in_progress when they are dispatched to Subagents.
 *
 * Returns the updated graph (mutates in place for consistency with completeTask).
 */
export function dispatchTasks(graph: TaskGraph, taskIds: string[]): TaskGraph {
  const idSet = new Set(taskIds);
  for (const task of graph.tasks) {
    if (idSet.has(task.id) && task.status === "pending") {
      task.status = "in_progress";
    }
  }
  return graph;
}

/**
 * Mark a task as failed and propagate the failure to dependent tasks.
 *
 * When a task fails:
 *   1. The task itself is marked as "failed"
 *   2. All tasks that transitively depend on it are marked as "blocked"
 *
 * Returns the list of newly blocked task IDs.
 */
export function failTask(graph: TaskGraph, taskId: string): string[] {
  const task = graph.tasks.find((t) => t.id === taskId);
  if (!task) return [];

  task.status = "failed";

  // Find all transitive dependents and mark them as blocked
  const blocked: string[] = [];
  const failedIds = new Set<string>([taskId]);

  // Iteratively propagate: any pending/in_progress task depending on a failed task gets blocked
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of graph.tasks) {
      if (t.status === "pending" || t.status === "in_progress") {
        const hasFailedDep = t.dependsOn.some((dep) => failedIds.has(dep));
        if (hasFailedDep) {
          t.status = "blocked";
          failedIds.add(t.id);
          blocked.push(t.id);
          changed = true;
        }
      }
    }
  }

  return blocked;
}

/**
 * Get a summary of the current execution state.
 */
export interface ExecutionSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  blocked: number;
  isComplete: boolean;
  isStuck: boolean;
  /** Effective parallelism: number of tasks currently in_progress. */
  currentParallelism: number;
}

/**
 * Compute a summary of the current graph execution state.
 */
export function getExecutionSummary(graph: TaskGraph): ExecutionSummary {
  const counts = { pending: 0, in_progress: 0, completed: 0, failed: 0, blocked: 0 };
  for (const task of graph.tasks) {
    counts[task.status]++;
  }

  return {
    total: graph.tasks.length,
    pending: counts.pending,
    inProgress: counts.in_progress,
    completed: counts.completed,
    failed: counts.failed,
    blocked: counts.blocked,
    isComplete: counts.completed === graph.tasks.length,
    isStuck:
      counts.completed < graph.tasks.length &&
      counts.in_progress === 0 &&
      getReadyTasks(graph).length === 0,
    currentParallelism: counts.in_progress,
  };
}

/**
 * Simulate a full parallel execution of the graph.
 *
 * Executes in waves: each wave dispatches up to maxConcurrency tasks,
 * then all dispatched tasks complete (simulating parallel execution).
 *
 * Returns the number of waves needed to complete all tasks,
 * or -1 if the graph gets stuck (due to cycles or invalid state).
 *
 * This is useful for estimating total execution time with parallelism.
 */
export function simulateParallelExecution(
  graph: TaskGraph,
  maxConcurrency: number = DEFAULT_MAX_CONCURRENCY,
): number {
  // Work on a copy to avoid mutating the original
  const sim: TaskGraph = {
    tasks: graph.tasks.map((t) => ({ ...t, status: "pending" as TaskStatus })),
  };

  let waves = 0;
  const maxWaves = sim.tasks.length + 1; // Safety bound

  while (!isGraphComplete(sim) && waves < maxWaves) {
    const batch = getDispatchBatch(sim, maxConcurrency);
    if (batch.tasks.length === 0) {
      // Stuck — no tasks can be dispatched
      return -1;
    }

    // Dispatch and immediately complete (simulation)
    dispatchTasks(
      sim,
      batch.tasks.map((t) => t.id),
    );
    for (const task of batch.tasks) {
      completeTask(sim, task.id);
    }
    waves++;
  }

  return waves <= maxWaves ? waves : -1;
}
