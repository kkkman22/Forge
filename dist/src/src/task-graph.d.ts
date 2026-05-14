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
export declare function validateGraph(graph: TaskGraph): GraphValidation;
/**
 * Get tasks that are ready to execute (all dependencies completed).
 *
 * A task is "ready" when:
 *   - Its status is "pending"
 *   - All tasks in its dependsOn list have status "completed"
 *
 * These tasks can be dispatched to parallel Subagents.
 */
export declare function getReadyTasks(graph: TaskGraph): TaskNode[];
/**
 * Get the maximum parallelism level — the largest number of tasks
 * that could theoretically execute simultaneously.
 *
 * This is the width of the widest "level" in the DAG.
 */
export declare function maxParallelism(graph: TaskGraph): number;
/**
 * Compute the topological order of tasks.
 * Returns task IDs in an order where dependencies come before dependents.
 * Returns null if the graph has cycles.
 */
export declare function topologicalOrder(graph: TaskGraph): string[] | null;
/**
 * Mark a task as completed and return newly unblocked tasks.
 */
export declare function completeTask(graph: TaskGraph, taskId: string): TaskNode[];
/**
 * Check if all tasks in the graph are completed.
 */
export declare function isGraphComplete(graph: TaskGraph): boolean;
/**
 * Check if the graph is stuck (no ready tasks but not all completed).
 */
export declare function isGraphStuck(graph: TaskGraph): boolean;
/**
 * Default maximum number of concurrent Subagents.
 */
export declare const DEFAULT_MAX_CONCURRENCY = 3;
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
export declare function getDispatchBatch(graph: TaskGraph, maxConcurrency?: number): DispatchBatch;
/**
 * Mark tasks as in_progress when they are dispatched to Subagents.
 *
 * Returns the updated graph (mutates in place for consistency with completeTask).
 */
export declare function dispatchTasks(graph: TaskGraph, taskIds: string[]): TaskGraph;
/**
 * Mark a task as failed and propagate the failure to dependent tasks.
 *
 * When a task fails:
 *   1. The task itself is marked as "failed"
 *   2. All tasks that transitively depend on it are marked as "blocked"
 *
 * Returns the list of newly blocked task IDs.
 */
export declare function failTask(graph: TaskGraph, taskId: string): string[];
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
export declare function getExecutionSummary(graph: TaskGraph): ExecutionSummary;
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
export declare function simulateParallelExecution(graph: TaskGraph, maxConcurrency?: number): number;
