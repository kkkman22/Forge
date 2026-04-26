/**
 * Unit tests for the EffectExecutor class.
 *
 * Verifies that each `OrchestratorEffect` type is executed correctly:
 * commit → git add + git commit, rollback → git reset + git clean,
 * backoff → interruptible sleep, abort/stop → flag setting,
 * schedule_iteration → no-op, and sequential effect processing.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  buildAddAllCommand,
  buildCleanCommand,
  buildCommitCommand,
  buildResetCommand,
  buildStashCommand,
} from "../src/git-transaction.js";
import type { OrchestratorEffect } from "../src/loop-types.js";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

// Import after mocking
import { execFileSync } from "node:child_process";
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

function createExecutor(overrides?: Partial<EffectExecutorDeps>): EffectExecutor {
  return new EffectExecutor(createDeps(overrides));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Commit effect (Requirement 3.1)
// ---------------------------------------------------------------------------

describe("commit effect", () => {
  it("calls execFileSync with buildAddAllCommand then buildCommitCommand args", async () => {
    const executor = createExecutor();
    const message = "forge(1): Added login form";

    await executor.executeEffect({ type: "commit", message });

    const expectedAdd = buildAddAllCommand();
    const expectedCommit = buildCommitCommand(message);
    const mock = execFileSync as Mock;

    expect(mock).toHaveBeenCalledTimes(2);

    // First call: git add -A
    expect(mock.mock.calls[0][0]).toBe(expectedAdd.executable);
    expect(mock.mock.calls[0][1]).toEqual(expectedAdd.args);

    // Second call: git commit -m <message>
    expect(mock.mock.calls[1][0]).toBe(expectedCommit.executable);
    expect(mock.mock.calls[1][1]).toEqual(expectedCommit.args);
  });

  it("passes cwd from deps to execFileSync", async () => {
    const cwd = "/my/project";
    const executor = createExecutor({ cwd });

    await executor.executeEffect({ type: "commit", message: "test commit" });

    const mock = execFileSync as Mock;
    expect(mock.mock.calls[0][2]).toEqual({ cwd });
    expect(mock.mock.calls[1][2]).toEqual({ cwd });
  });

  it("does not pass shell: true to execFileSync", async () => {
    const executor = createExecutor();

    await executor.executeEffect({ type: "commit", message: "test" });

    const mock = execFileSync as Mock;
    for (const call of mock.mock.calls) {
      const options = call[2];
      expect(options).not.toHaveProperty("shell");
    }
  });
});

// ---------------------------------------------------------------------------
// Rollback effect (Requirement 3.2)
// ---------------------------------------------------------------------------

describe("rollback effect", () => {
  it("calls execFileSync with stash, then buildResetCommand, then buildCleanCommand args", async () => {
    const executor = createExecutor();

    await executor.executeEffect({ type: "rollback" });

    const expectedStash = buildStashCommand("forge-rollback-safety-net");
    const expectedReset = buildResetCommand();
    const expectedClean = buildCleanCommand();
    const mock = execFileSync as Mock;

    expect(mock).toHaveBeenCalledTimes(3);

    // First call: git stash --include-untracked -m "forge-rollback-safety-net"
    expect(mock.mock.calls[0][0]).toBe(expectedStash.executable);
    expect(mock.mock.calls[0][1]).toEqual(expectedStash.args);

    // Second call: git reset --hard HEAD
    expect(mock.mock.calls[1][0]).toBe(expectedReset.executable);
    expect(mock.mock.calls[1][1]).toEqual(expectedReset.args);

    // Third call: git clean -fd
    expect(mock.mock.calls[2][0]).toBe(expectedClean.executable);
    expect(mock.mock.calls[2][1]).toEqual(expectedClean.args);
  });

  it("passes cwd from deps to execFileSync", async () => {
    const cwd = "/another/repo";
    const executor = createExecutor({ cwd });

    await executor.executeEffect({ type: "rollback" });

    const mock = execFileSync as Mock;
    // All three calls (stash, reset, clean) should use the same cwd
    expect(mock.mock.calls[0][2]).toEqual({ cwd });
    expect(mock.mock.calls[1][2]).toEqual({ cwd });
    expect(mock.mock.calls[2][2]).toEqual({ cwd });
  });

  it("does not pass shell: true to execFileSync", async () => {
    const executor = createExecutor();

    await executor.executeEffect({ type: "rollback" });

    const mock = execFileSync as Mock;
    for (const call of mock.mock.calls) {
      const options = call[2];
      expect(options).not.toHaveProperty("shell");
    }
  });
});

// ---------------------------------------------------------------------------
// Rollback stash safety net (Requirement 2 — REQ-2)
// ---------------------------------------------------------------------------

describe("rollback stash safety net", () => {
  it("executes stash command BEFORE reset command", async () => {
    const executor = createExecutor();
    const callOrder: string[] = [];

    const mock = execFileSync as Mock;
    mock.mockImplementation((_exec: string, args: string[]) => {
      callOrder.push(args[0]);
    });

    await executor.executeEffect({ type: "rollback" });

    // stash must come before reset and clean
    expect(callOrder).toEqual(["stash", "reset", "clean"]);
  });

  it("still executes reset and clean when stash throws", async () => {
    const executor = createExecutor();
    const mock = execFileSync as Mock;

    // First call (stash) throws, subsequent calls succeed
    mock.mockImplementationOnce(() => {
      throw new Error("nothing to stash");
    });

    await executor.executeEffect({ type: "rollback" });

    const expectedReset = buildResetCommand();
    const expectedClean = buildCleanCommand();

    // stash failed, so only reset + clean calls remain
    expect(mock).toHaveBeenCalledTimes(3);

    // Second call: git reset --hard HEAD
    expect(mock.mock.calls[1][0]).toBe(expectedReset.executable);
    expect(mock.mock.calls[1][1]).toEqual(expectedReset.args);

    // Third call: git clean -fd
    expect(mock.mock.calls[2][0]).toBe(expectedClean.executable);
    expect(mock.mock.calls[2][1]).toEqual(expectedClean.args);
  });

  it("logs success message when stash succeeds", async () => {
    const onLog = vi.fn();
    const executor = createExecutor({ onLog });

    await executor.executeEffect({ type: "rollback" });

    expect(onLog).toHaveBeenCalledWith(
      "Safety stash created before rollback (use 'git stash pop' to recover)",
    );
  });

  it("logs failure message when stash fails", async () => {
    const onLog = vi.fn();
    const executor = createExecutor({ onLog });
    const mock = execFileSync as Mock;

    mock.mockImplementationOnce(() => {
      throw new Error("nothing to stash");
    });

    await executor.executeEffect({ type: "rollback" });

    expect(onLog).toHaveBeenCalledWith("No changes to stash before rollback (clean working tree)");
  });
});

// ---------------------------------------------------------------------------
// Backoff effect (Requirement 3.3)
// ---------------------------------------------------------------------------

describe("backoff effect", () => {
  it("resolves after specified duration", async () => {
    vi.useFakeTimers();
    const executor = createExecutor();
    const durationMs = 5000;

    let resolved = false;
    const promise = executor.executeEffect({ type: "start_backoff", durationMs }).then(() => {
      resolved = true;
    });

    // Not resolved yet
    expect(resolved).toBe(false);

    // Advance time by the duration
    await vi.advanceTimersByTimeAsync(durationMs);

    await promise;
    expect(resolved).toBe(true);
  });

  it("is interruptible via AbortSignal", async () => {
    vi.useFakeTimers();
    const executor = createExecutor();
    const controller = new AbortController();
    const durationMs = 60_000;

    let resolved = false;
    const promise = executor
      .executeEffect({ type: "start_backoff", durationMs }, controller.signal)
      .then(() => {
        resolved = true;
      });

    // Not resolved yet
    expect(resolved).toBe(false);

    // Abort early (before the full duration)
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    await promise;
    expect(resolved).toBe(true);
  });

  it("resolves immediately if signal is already aborted", async () => {
    const executor = createExecutor();
    const controller = new AbortController();
    controller.abort();

    // Should resolve immediately without needing fake timers
    await executor.executeEffect({ type: "start_backoff", durationMs: 60_000 }, controller.signal);
  });
});

// ---------------------------------------------------------------------------
// Abort effect (Requirement 3.4)
// ---------------------------------------------------------------------------

describe("abort effect", () => {
  it("sets the aborted flag to true", async () => {
    const executor = createExecutor();

    expect(executor.aborted).toBe(false);

    await executor.executeEffect({ type: "abort", reason: "max iterations reached" });

    expect(executor.aborted).toBe(true);
  });

  it("logs the abort reason via onLog", async () => {
    const onLog = vi.fn();
    const executor = createExecutor({ onLog });

    await executor.executeEffect({ type: "abort", reason: "max iterations reached" });

    expect(onLog).toHaveBeenCalledWith("Aborted: max iterations reached");
  });
});

// ---------------------------------------------------------------------------
// Stop effect (Requirement 3.5)
// ---------------------------------------------------------------------------

describe("stop effect", () => {
  it("sets the stopped flag to true", async () => {
    const executor = createExecutor();

    expect(executor.stopped).toBe(false);

    await executor.executeEffect({ type: "stop" });

    expect(executor.stopped).toBe(true);
  });

  it("logs via onLog", async () => {
    const onLog = vi.fn();
    const executor = createExecutor({ onLog });

    await executor.executeEffect({ type: "stop" });

    expect(onLog).toHaveBeenCalledWith("Stopped");
  });
});

// ---------------------------------------------------------------------------
// schedule_iteration effect (Requirement 3.6 — no-op at executor level)
// ---------------------------------------------------------------------------

describe("schedule_iteration effect", () => {
  it("is a no-op — does not call execFileSync or set any flags", async () => {
    const onLog = vi.fn();
    const executor = createExecutor({ onLog });

    await executor.executeEffect({ type: "schedule_iteration", iterationNumber: 1 });

    expect(execFileSync).not.toHaveBeenCalled();
    expect(executor.aborted).toBe(false);
    expect(executor.stopped).toBe(false);
    expect(onLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// executeEffects — sequential processing (Requirement 3.6)
// ---------------------------------------------------------------------------

describe("executeEffects", () => {
  it("processes effects in order", async () => {
    const onLog = vi.fn();
    const executor = createExecutor({ onLog });
    const callOrder: string[] = [];

    const mock = execFileSync as Mock;
    mock.mockImplementation((_exec: string, args: string[]) => {
      // Track which git command was called
      callOrder.push(args[0]);
    });

    const effects: OrchestratorEffect[] = [
      { type: "rollback" },
      { type: "commit", message: "test" },
    ];

    await executor.executeEffects(effects);

    // Rollback: stash then reset then clean, followed by Commit: add then commit
    expect(callOrder).toEqual(["stash", "reset", "clean", "add", "commit"]);
  });

  it("executes all effects in the array", async () => {
    const onLog = vi.fn();
    const executor = createExecutor({ onLog });

    const effects: OrchestratorEffect[] = [{ type: "commit", message: "first" }, { type: "stop" }];

    await executor.executeEffects(effects);

    // commit calls execFileSync twice (add + commit)
    expect(execFileSync).toHaveBeenCalledTimes(2);
    // stop sets the flag
    expect(executor.stopped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Git commands without shell: true (Requirement 3.7)
// ---------------------------------------------------------------------------

describe("git commands executed without shell", () => {
  it("commit effect never passes shell option", async () => {
    const executor = createExecutor();

    await executor.executeEffect({ type: "commit", message: "$(malicious)" });

    const mock = execFileSync as Mock;
    for (const call of mock.mock.calls) {
      const options = call[2];
      // Options should only contain cwd, never shell
      expect(options).toEqual({ cwd: "/test/repo" });
    }
  });

  it("rollback effect never passes shell option", async () => {
    const executor = createExecutor();

    await executor.executeEffect({ type: "rollback" });

    const mock = execFileSync as Mock;
    for (const call of mock.mock.calls) {
      const options = call[2];
      expect(options).toEqual({ cwd: "/test/repo" });
    }
  });
});
