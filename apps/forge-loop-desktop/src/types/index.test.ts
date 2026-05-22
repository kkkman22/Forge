import { describe, it, expect } from "vitest";
import type {
  Task,
  TaskStatus,
  BranchStrategy,
  TaskTarget,
} from "../types/index";

describe("Task type definitions", () => {
  it("validates a complete Task object shape", () => {
    const task: Task = {
      id: "test-uuid",
      title: "Test task",
      repo_path: "/Users/test/project",
      branch_strategy: { type: "current_branch" },
      target: { type: "objective", text: "Do something" },
      tier: "standard",
      max_iterations: 50,
      max_budget_usd: null,
      sleep_inhibit: true,
      status: "queued",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      executions: [],
      metadata: null,
    };
    expect(task.id).toBe("test-uuid");
    expect(task.status).toBe("queued");
  });

  it("BranchStrategy discriminates correctly", () => {
    const strategies: BranchStrategy[] = [
      { type: "current_branch" },
      { type: "new_worktree", name: "feature/test" },
      { type: "existing_branch", name: "main" },
    ];
    expect(strategies[0].type).toBe("current_branch");
    expect(strategies[1].type).toBe("new_worktree");
    expect(strategies[2].type).toBe("existing_branch");
  });

  it("TaskTarget discriminates correctly", () => {
    const targets: TaskTarget[] = [
      { type: "objective", text: "Build feature" },
      { type: "spec_file", path: ".kiro/specs/test/spec.md" },
    ];
    expect(targets[0].type).toBe("objective");
    expect(targets[1].type).toBe("spec_file");
  });

  it("all TaskStatus values are valid strings", () => {
    const statuses: TaskStatus[] = [
      "queued",
      "running",
      "paused",
      "awaiting_review",
      "completed",
      "failed",
    ];
    expect(statuses).toHaveLength(6);
    statuses.forEach((s) => expect(typeof s).toBe("string"));
  });
});
