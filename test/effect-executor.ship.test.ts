/**
 * Tests for Ship delivery effect types and EffectExecutor integration.
 *
 * Covers:
 *   - ship_merge: success path, merge failure abort, checkout failure
 *   - ship_push_pr: success path, push failure, PR creation failure
 *   - ship_discard: success path
 *
 * **Validates: Requirements 2.1–2.6, 5.1–5.6**
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrchestratorEffect } from "../src/loop-types.js";

// Mock node:child_process before importing the module under test
const mockExecFileSync = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

// Import after mocking
import { EffectExecutor, type EffectExecutorDeps } from "../src/effect-executor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDeps(overrides?: Partial<EffectExecutorDeps>): EffectExecutorDeps {
  return {
    cwd: "/test/repo",
    onNotesUpdate: vi.fn(),
    onLog: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ship_merge tests
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, EffectExecutor: ship_merge", () => {
  afterEach(() => {
    mockExecFileSync.mockReset();
  });

  it("executes checkout → merge --no-ff → branch -d on success", async () => {
    mockExecFileSync.mockReturnValue("");

    const deps = createDeps();
    const executor = new EffectExecutor(deps);
    const effect: OrchestratorEffect = {
      type: "ship_merge",
      targetBranch: "main",
      featureBranch: "feature-test",
    };

    await executor.executeEffect(effect);

    expect(mockExecFileSync).toHaveBeenCalledTimes(3);
    const calls = mockExecFileSync.mock.calls.map((c: unknown[]) => [c[0], c[1]]);
    expect(calls[0]).toEqual(["git", ["checkout", "main"]]);
    expect(calls[1]).toEqual(["git", ["merge", "--no-ff", "feature-test"]]);
    expect(calls[2]).toEqual(["git", ["branch", "-d", "feature-test"]]);
  });

  it("executes merge --abort and throws when merge fails", async () => {
    mockExecFileSync.mockImplementation((_exe: string, args: string[]) => {
      if (args[0] === "merge" && args[1] === "--no-ff") {
        throw new Error("CONFLICT");
      }
    });

    const deps = createDeps();
    const executor = new EffectExecutor(deps);
    const effect: OrchestratorEffect = {
      type: "ship_merge",
      targetBranch: "main",
      featureBranch: "feature-test",
    };

    await expect(executor.executeEffect(effect)).rejects.toThrow("Ship merge failed");

    const calls = mockExecFileSync.mock.calls.map((c: unknown[]) => [
      c[0],
      (c as unknown[])[1] as string[],
    ]);

    // checkout + merge attempt + merge --abort
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[0]).toEqual(["git", ["checkout", "main"]]);
    expect(calls[1]).toEqual(["git", ["merge", "--no-ff", "feature-test"]]);

    // Verify merge --abort was called
    const abortCall = calls.find(
      (c) => (c[1] as string[])[0] === "merge" && (c[1] as string[])[1] === "--abort",
    );
    expect(abortCall).toBeDefined();

    // Verify branch -d was NOT called
    const deleteCall = calls.find(
      (c) => (c[1] as string[])[0] === "branch" && (c[1] as string[]).includes("feature-test"),
    );
    expect(deleteCall).toBeUndefined();
  });

  it("does not execute merge or delete when checkout fails", async () => {
    mockExecFileSync.mockImplementation((_exe: string, args: string[]) => {
      if (args[0] === "checkout") {
        throw new Error("checkout failed");
      }
    });

    const deps = createDeps();
    const executor = new EffectExecutor(deps);
    const effect: OrchestratorEffect = {
      type: "ship_merge",
      targetBranch: "main",
      featureBranch: "feature-test",
    };

    await expect(executor.executeEffect(effect)).rejects.toThrow();

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    const call = mockExecFileSync.mock.calls[0] as unknown[];
    expect(call[1]).toEqual(["checkout", "main"]);
  });
});

// ---------------------------------------------------------------------------
// ship_push_pr tests
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, EffectExecutor: ship_push_pr", () => {
  afterEach(() => {
    mockExecFileSync.mockReset();
  });

  it("executes push -u and gh pr create on success", async () => {
    mockExecFileSync.mockReturnValue("");

    const deps = createDeps();
    const executor = new EffectExecutor(deps);
    const effect: OrchestratorEffect = {
      type: "ship_push_pr",
      remote: "origin",
      branch: "feature-test",
      title: "feat: add feature",
      body: "## Summary\nDetails",
    };

    await executor.executeEffect(effect);

    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    const calls = mockExecFileSync.mock.calls.map((c: unknown[]) => [c[0], c[1]]);
    expect(calls[0]).toEqual(["git", ["push", "-u", "origin", "feature-test"]]);
    expect(calls[1]).toEqual([
      "gh",
      ["pr", "create", "--title", "feat: add feature", "--body", "## Summary\nDetails"],
    ]);
  });

  it("throws when push fails and does not create PR", async () => {
    mockExecFileSync.mockImplementation((_exe: string, args: string[]) => {
      if (args[0] === "push") {
        throw new Error("push failed");
      }
    });

    const deps = createDeps();
    const executor = new EffectExecutor(deps);
    const effect: OrchestratorEffect = {
      type: "ship_push_pr",
      remote: "origin",
      branch: "feature-test",
      title: "feat: add feature",
      body: "body",
    };

    await expect(executor.executeEffect(effect)).rejects.toThrow();

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    const call = mockExecFileSync.mock.calls[0] as unknown[];
    expect((call[1] as string[])[0]).toBe("push");
  });

  it("preserves push result and logs warning when PR creation fails", async () => {
    const logs: string[] = [];
    mockExecFileSync.mockImplementation((exe: string, _args: string[]) => {
      if (exe === "gh") {
        throw new Error("gh not installed");
      }
    });

    const deps = createDeps({
      onLog: (msg: string) => logs.push(msg),
    });
    const executor = new EffectExecutor(deps);
    const effect: OrchestratorEffect = {
      type: "ship_push_pr",
      remote: "origin",
      branch: "feature-test",
      title: "feat: add feature",
      body: "body",
    };

    // Should NOT throw — push succeeded
    await executor.executeEffect(effect);

    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    const calls = mockExecFileSync.mock.calls.map((c: unknown[]) => [c[0], c[1]]);
    expect(calls[0][1]).toEqual(["push", "-u", "origin", "feature-test"]);
    expect(logs.some((l) => l.includes("PR creation failed"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ship_discard tests
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, EffectExecutor: ship_discard", () => {
  afterEach(() => {
    mockExecFileSync.mockReset();
  });

  it("executes checkout main → branch -D", async () => {
    mockExecFileSync.mockReturnValue("");

    const deps = createDeps();
    const executor = new EffectExecutor(deps);
    const effect: OrchestratorEffect = {
      type: "ship_discard",
      branch: "feature-test",
    };

    await executor.executeEffect(effect);

    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    const calls = mockExecFileSync.mock.calls.map((c: unknown[]) => [c[0], c[1]]);
    expect(calls[0]).toEqual(["git", ["checkout", "main"]]);
    expect(calls[1]).toEqual(["git", ["branch", "-D", "feature-test"]]);
  });
});
