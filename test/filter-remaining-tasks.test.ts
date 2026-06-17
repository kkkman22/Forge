/**
 * Tests for filterRemainingTasks — incremental replan helper (dynamic-replan-loop R3).
 *
 * Pins: remaining tasks = those whose status !== "completed"
 * (covers pending / in-progress / blocked / failed). Already-completed tasks
 * are never returned — incremental replan revises only remaining tasks.
 *
 * **Pins: dynamic-replan-loop R3-AC2.**
 */

import { describe, expect, it } from "vitest";
import { filterRemainingTasks, type TaskSeed } from "../src/spec-bundle.js";

function makeTask(id: string, status: TaskSeed["status"]): TaskSeed {
  return { id, title: id, goal: "g", related_requirements: [], status };
}

describe("filterRemainingTasks — incremental replan [R3-AC2]", () => {
  it("excludes completed tasks, keeps all others", () => {
    const tasks = [
      makeTask("T1", "completed"),
      makeTask("T2", "pending"),
      makeTask("T3", "in-progress"),
      makeTask("T4", "blocked"),
      makeTask("T5", "failed"),
    ];
    const remaining = filterRemainingTasks(tasks);
    expect(remaining.map((t) => t.id)).toEqual(["T2", "T3", "T4", "T5"]);
  });

  it("returns empty when all completed", () => {
    const tasks = [makeTask("T1", "completed"), makeTask("T2", "completed")];
    expect(filterRemainingTasks(tasks)).toEqual([]);
  });

  it("returns all when none completed", () => {
    const tasks = [makeTask("T1", "pending"), makeTask("T2", "failed")];
    expect(filterRemainingTasks(tasks).length).toBe(2);
  });

  it("returns empty for empty input", () => {
    expect(filterRemainingTasks([])).toEqual([]);
  });

  it("preserves order of remaining tasks", () => {
    const tasks = [
      makeTask("T1", "completed"),
      makeTask("T2", "pending"),
      makeTask("T3", "completed"),
      makeTask("T4", "in-progress"),
    ];
    expect(filterRemainingTasks(tasks).map((t) => t.id)).toEqual(["T2", "T4"]);
  });
});
