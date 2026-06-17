/**
 * Tests for filterRemainingTasks — incremental replan helper (dynamic-replan-loop R3).
 *
 * Pins: remaining tasks = those whose status !== "completed"
 * (covers pending / in-progress / blocked / failed). Already-completed tasks
 * are never returned — incremental replan revises only remaining tasks.
 *
 * **Pins: dynamic-replan-loop R3-AC2.**
 */
export {};
