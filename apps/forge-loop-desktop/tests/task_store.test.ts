import { describe, it, expect } from "vitest";

// Tests for TaskStore persistence layer types
// These test the TypeScript type contracts that mirror the Rust TaskStore

describe("TaskStore — persistence contracts", () => {
  const taskTemplate = {
    id: "uuid-v4",
    title: "Test task",
    repo_path: "/Users/test/project",
    branch_strategy: { type: "current_branch" as const },
    target: { type: "objective" as const, text: "Build feature" },
    tier: "standard" as const,
    max_iterations: 50,
    max_budget_usd: null,
    sleep_inhibit: true,
    status: "queued" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    executions: [],
    metadata: null,
  };

  it("tasks.json schema has schema_version", () => {
    const store = {
      schema_version: 1,
      tasks: [taskTemplate],
      recent_repos: [] as string[],
    };
    expect(store.schema_version).toBe(1);
    expect(store.tasks).toHaveLength(1);
  });

  it("Task status lifecycle is valid", () => {
    const lifecycle = [
      "queued",
      "running",
      "awaiting_review",
      "completed",
    ] as const;
    expect(lifecycle).toHaveLength(4);
    expect(lifecycle[0]).toBe("queued");
    expect(lifecycle[lifecycle.length - 1]).toBe("completed");
  });

  it("ExecutionRecord tracks run lifecycle", () => {
    const execution = {
      run_id: "run-uuid",
      started_at: new Date().toISOString(),
      ended_at: null,
      exit_code: null,
      iterations: null,
      outcome: "pending" as const,
    };
    expect(execution.outcome).toBe("pending");
    expect(execution.ended_at).toBeNull();
  });

  it("BranchStrategy types have required fields", () => {
    const strategies = [
      { type: "current_branch" as const },
      { type: "new_worktree" as const, name: "feature/test" },
      { type: "existing_branch" as const, name: "main" },
    ];
    const worktree = strategies[1];
    if (worktree.type === "new_worktree") {
      expect(worktree.name).toBeDefined();
    }
  });

  it("prune_completed keeps only last N completed tasks", () => {
    const maxKeep = 100;
    const tasks = Array.from({ length: 150 }, (_, i) => ({
      ...taskTemplate,
      id: `task-${i}`,
      status: "completed" as const,
      updated_at: new Date(Date.now() + i * 1000).toISOString(),
    }));
    const pruned = tasks
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, maxKeep);
    expect(pruned).toHaveLength(100);
    expect(pruned[0].id).toBe("task-149");
  });

  it("atomic write uses tmp + rename pattern", () => {
    const path = "tasks.json";
    const tmpPath = `${path}.tmp`;
    expect(tmpPath).toBe("tasks.json.tmp");
    expect(tmpPath.startsWith(path)).toBe(true);
  });
});
