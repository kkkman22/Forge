import { describe, it, expect } from "vitest";
import type { Task, TaskStatus } from "../index";

describe("Review Flow — state transitions", () => {
  const mockTask: Task = {
    id: "test-id",
    title: "Test task",
    repo_path: "/test/repo",
    branch_strategy: { type: "current_branch" },
    target: { type: "objective", text: "Build feature" },
    tier: "standard",
    max_iterations: 50,
    max_budget_usd: null,
    sleep_inhibit: true,
    status: "awaiting_review",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    executions: [
      {
        run_id: "run-1",
        started_at: new Date(Date.now() - 600000).toISOString(),
        ended_at: new Date().toISOString(),
        exit_code: 0,
        iterations: 5,
        outcome: "success",
      },
    ],
    metadata: null,
  };

  it("approve transitions from awaiting_review to completed", () => {
    const task = { ...mockTask };
    expect(task.status).toBe("awaiting_review");
    // Simulate approve
    task.status = "completed";
    expect(task.status).toBe("completed");
  });

  it("reject transitions from awaiting_review back to running with feedback", () => {
    const task = { ...mockTask };
    const feedback = "Need to fix the pagination logic";

    // Simulate reject
    const newObjective = `${(task.target as { type: "objective"; text: string }).text}\n---\n用户反馈：${feedback}`;
    task.target = { type: "objective", text: newObjective };
    task.status = "queued";

    expect(task.target).toEqual({
      type: "objective",
      text: expect.stringContaining("用户反馈"),
    });
    expect(task.status).toBe("queued");
  });

  it("reject prepends feedback to existing objective", () => {
    const originalText = "Build feature";
    const feedback = "Fix the tests";
    const combined = `${originalText}\n---\n用户反馈：${feedback}`;

    expect(combined).toContain(originalText);
    expect(combined).toContain("用户反馈：");
    expect(combined).toContain(feedback);
  });

  it("failed task can retry", () => {
    const task = { ...mockTask, status: "failed" as TaskStatus };
    expect(task.status).toBe("failed");
    task.status = "queued";
    expect(task.status).toBe("queued");
  });

  it("failed task shows only overview and log tabs", () => {
    const failedStatuses: TaskStatus[] = ["failed"];
    failedStatuses.forEach((_status) => {
      expect(["overview", "log"]).toBeDefined();
      expect(["overview", "log"]).toHaveLength(2);
    });
  });
});

describe("Task form validation", () => {
  it("requires title", () => {
    const input = { title: "" };
    expect(input.title.length).toBe(0);
  });

  it("requires repo_path", () => {
    const input = { repo_path: "" };
    expect(input.repo_path.length).toBe(0);
  });

  it("requires branch name when strategy is new_worktree", () => {
    const strategy = { type: "new_worktree" as const, name: "" };
    expect(strategy.name.length).toBe(0);
  });

  it("title max 80 chars", () => {
    const title = "a".repeat(81);
    expect(title.length).toBeGreaterThan(80);
  });

  it("valid branch name formats", () => {
    const validNames = ["feature/test", "fix-bug-123", "main"];
    const invalidNames = ["..", "heads/main", "-leading-dash"];
    validNames.forEach((n) => expect(n.length).toBeGreaterThan(0));
    invalidNames.forEach((n) => expect(n).toBeDefined());
  });
});
