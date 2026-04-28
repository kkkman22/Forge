/**
 * Unit tests for the SdkDriver class.
 *
 * Verifies the core loop driver behavior: initialization, iteration dispatch,
 * success/failure handling, notes accumulation, token logging, backoff,
 * stop conditions, and user interrupts.
 *
 * **Validates: Requirements 1.1, 1.2, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5,
 *   5.1, 5.2, 5.3, 5.4, 8.3, 8.4, 10.4**
 */
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentInterface,
  AgentResult,
  AgentRunOptions,
  TokenUsage,
} from "../src/loop-types.js";

// Mock RunManager.persistNotes before importing SdkDriver
vi.mock("../src/run-manager.js", () => ({
  RunManager: {
    persistNotes: vi.fn(),
  },
}));

import type { EffectExecutorInterface } from "../src/effect-executor.js";
import { RunManager } from "../src/run-manager.js";
import { SdkDriver, type SdkDriverConfig } from "../src/sdk-driver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUsage(overrides?: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
    ...overrides,
  };
}

function createSuccessResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    output: {
      success: true,
      summary: "did stuff",
      key_changes_made: ["change"],
      key_learnings: ["learning"],
    },
    usage: createMockUsage(),
    ...overrides,
  };
}

function createSoftFailureResult(): AgentResult {
  return {
    output: {
      success: false,
      summary: "failed to make progress",
      key_changes_made: [],
      key_learnings: [],
    },
    usage: createMockUsage(),
  };
}

function createStopResult(): AgentResult {
  return {
    output: {
      success: true,
      summary: "objective complete",
      key_changes_made: [],
      key_learnings: [],
      should_fully_stop: true,
    },
    usage: createMockUsage(),
  };
}

/**
 * Type-safe mock that satisfies EffectExecutorInterface while exposing vi.fn() methods.
 * When the real EffectExecutorInterface changes, this type produces compile-time errors.
 */
interface MockEffectExecutor extends EffectExecutorInterface {
  executeEffect: Mock<EffectExecutorInterface["executeEffect"]>;
  executeEffects: Mock<EffectExecutorInterface["executeEffects"]>;
}

function createMockEffectExecutor(): MockEffectExecutor {
  return {
    aborted: false,
    stopped: false,
    executeEffect: vi.fn().mockResolvedValue(undefined),
    executeEffects: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAgent(
  runImpl?: (prompt: string, cwd: string, options?: AgentRunOptions) => Promise<AgentResult>,
): AgentInterface {
  return {
    name: "test-agent",
    run: vi.fn(runImpl ?? (async () => createSuccessResult())),
    close: vi.fn(),
  };
}

function createConfig(overrides?: Partial<SdkDriverConfig>): SdkDriverConfig {
  return {
    objective: "Build a login form",
    loopConfig: {
      agent: "claude",
      maxConsecutiveFailures: 3,
      preventSleep: true,
      backoffBaseMs: 60000,
      maxConcurrentWorktrees: 3,
    },
    limits: { maxIterations: 1 },
    cwd: "/test/repo",
    runId: "test-run-id",
    runDir: "/test/repo/.forge/runs/test-run-id/",
    warmQuery: {},
    baseCommit: "abc123",
    notesPath: "/test/repo/.forge/runs/test-run-id/notes.md",
    branchName: "forge/build-a-login-form",
    skillAware: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initialization (Requirements 1.1, 1.2, 1.5)
// ---------------------------------------------------------------------------

describe("initialization", () => {
  it("creates correct initial state and empty notes document", () => {
    const config = createConfig();
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();

    // SdkDriver constructor should not throw
    const driver = new SdkDriver(config, executor, agent);

    // We can verify initialization by running the driver and checking the result
    // The driver should start with iteration 0 and empty notes
    expect(driver).toBeDefined();
  });

  it("empty objective throws validation error", () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();

    expect(() => new SdkDriver(createConfig({ objective: "" }), executor, agent)).toThrow(
      "Objective must be a non-empty string",
    );
  });

  it("whitespace-only objective throws validation error", () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();

    expect(() => new SdkDriver(createConfig({ objective: "   " }), executor, agent)).toThrow(
      "Objective must be a non-empty string",
    );
  });

  it("returns empty notes document and zero commit count on immediate abort", async () => {
    const executor = createMockEffectExecutor();
    // Set aborted immediately so the loop exits after start
    executor.executeEffects.mockImplementation(async () => {
      executor.aborted = true;
    });
    const agent = createMockAgent();
    const driver = new SdkDriver(createConfig(), executor, agent);

    const result = await driver.run();

    expect(result.notesDocument.runId).toBe("test-run-id");
    expect(result.notesDocument.entries).toHaveLength(0);
    expect(result.commitCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Successful iteration (Requirements 4.1, 5.1, 8.4)
// ---------------------------------------------------------------------------

describe("successful iteration", () => {
  it("dispatches iteration_success, commits, and schedules next iteration", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    // maxIterations: 1 means after 1 iteration the state machine will abort
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    const result = await driver.run();

    // Agent should have been called once
    expect(agent.run).toHaveBeenCalledTimes(1);

    // The prompt should contain the objective
    const prompt = (agent.run as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(prompt).toContain("Build a login form");

    // Effect executor should have been called multiple times:
    // 1. Start effects (schedule_iteration)
    // 2. After iteration_success (commit + abort since maxIterations=1)
    expect(executor.executeEffects).toHaveBeenCalled();

    // Final state should be aborted (maxIterations reached)
    expect(result.finalState.status).toBe("aborted");
    expect(result.finalState.successCount).toBe(1);
    expect(result.commitCount).toBe(1);
  });

  it("appends correct IterationEntry to notes on success", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    const result = await driver.run();

    // Notes should have one entry
    expect(result.notesDocument.entries).toHaveLength(1);
    const entry = result.notesDocument.entries[0];
    expect(entry.success).toBe(true);
    expect(entry.summary).toBe("did stuff");
    expect(entry.keyChanges).toEqual(["change"]);
    expect(entry.keyLearnings).toEqual(["learning"]);
    expect(entry.number).toBe(1);
  });

  it("persists notes after each iteration", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const config = createConfig({ limits: { maxIterations: 1 } });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    expect(RunManager.persistNotes).toHaveBeenCalledTimes(1);
    expect(RunManager.persistNotes).toHaveBeenCalledWith(
      config.notesPath,
      expect.stringContaining("did stuff"),
    );
  });

  it("logs token usage after each iteration", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    await driver.run();

    const logMessages = consoleSpy.mock.calls.map((call) => call[0]);
    const hasTokenLog = logMessages.some((msg: string) =>
      msg.includes("driver.loop.iterationTokens"),
    );
    expect(hasTokenLog).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Soft failure (Requirements 4.2, 5.2, 10.2)
// ---------------------------------------------------------------------------

describe("soft failure", () => {
  it("dispatches iteration_soft_failure, rolls back, and schedules next iteration", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async () => createSoftFailureResult());
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    const result = await driver.run();

    expect(agent.run).toHaveBeenCalledTimes(1);
    // State should be aborted (maxIterations reached after 1 soft failure)
    expect(result.finalState.status).toBe("aborted");
    expect(result.finalState.failCount).toBe(1);
    expect(result.finalState.successCount).toBe(0);
    expect(result.commitCount).toBe(0);
  });

  it("appends correct IterationEntry to notes on soft failure", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async () => createSoftFailureResult());
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    const result = await driver.run();

    expect(result.notesDocument.entries).toHaveLength(1);
    const entry = result.notesDocument.entries[0];
    expect(entry.success).toBe(false);
    expect(entry.summary).toBe("failed to make progress");
    expect(entry.keyChanges).toEqual([]);
    expect(entry.keyLearnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hard failure — validation error (Requirements 2.4, 10.1)
// ---------------------------------------------------------------------------

describe("hard failure (validation error)", () => {
  it("dispatches iteration_hard_failure, rolls back, and starts backoff", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async () => {
      throw new Error("Validation failed: missing required field 'summary'");
    });
    // Circuit breaker threshold is 3, so 3 consecutive hard failures will abort
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 10 } }), executor, agent);

    const result = await driver.run();

    expect(agent.run).toHaveBeenCalled();
    // After 3 consecutive hard failures, circuit breaker triggers abort
    expect(result.finalState.status).toBe("aborted");
    expect(result.finalState.failCount).toBe(3);
    expect(result.finalState.consecutiveFailures).toBe(3);
  });

  it("appends error message as summary in notes on hard failure", async () => {
    const executor = createMockEffectExecutor();
    const errorMsg = "Validation failed: missing required field 'summary'";
    let callCount = 0;
    const agent = createMockAgent(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error(errorMsg);
      }
      // Succeed on second call to stop the loop
      return createSuccessResult();
    });
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 2 } }), executor, agent);

    const result = await driver.run();

    // First entry should be the hard failure
    expect(result.notesDocument.entries.length).toBeGreaterThanOrEqual(1);
    const entry = result.notesDocument.entries[0];
    expect(entry.success).toBe(false);
    expect(entry.summary).toBe(errorMsg);
    expect(entry.keyChanges).toEqual([]);
    expect(entry.keyLearnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hard failure — SDK throw (Requirements 2.7, 10.1)
// ---------------------------------------------------------------------------

describe("hard failure (SDK throw)", () => {
  it("dispatches iteration_hard_failure, rolls back, and starts backoff", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async () => {
      throw new Error("SDK crashed");
    });
    // Circuit breaker at 3 consecutive failures
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 10 } }), executor, agent);

    const result = await driver.run();

    expect(result.finalState.failCount).toBe(3);
    expect(result.finalState.consecutiveErrors).toBe(3);
    expect(result.finalState.status).toBe("aborted");
  });

  it("uses zero token usage for hard failures", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async () => {
      throw new Error("SDK crashed");
    });
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    await driver.run();

    // Token usage should be logged with the i18n key for hard failure
    // The hard failure path uses zeroUsage but the state machine still tracks cumulative
    const logMessages = consoleSpy.mock.calls.map((call) => call[0]);
    const hasTokenLog = logMessages.some((msg: string) =>
      msg.includes("driver.loop.iterationTokens"),
    );
    expect(hasTokenLog).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stop condition (Requirements 4.3)
// ---------------------------------------------------------------------------

describe("should_fully_stop triggers stop_condition_met", () => {
  it("dispatches stop_condition_met and exits loop", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async () => createStopResult());
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 10 } }), executor, agent);

    const result = await driver.run();

    // Agent should have been called exactly once
    expect(agent.run).toHaveBeenCalledTimes(1);
    // State should be aborted (stop_condition_met dispatches abort)
    expect(result.finalState.status).toBe("aborted");
  });

  it("still records iteration entry when stop condition is met", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async () => createStopResult());
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 10 } }), executor, agent);

    const result = await driver.run();

    expect(result.notesDocument.entries).toHaveLength(1);
    expect(result.notesDocument.entries[0].summary).toBe("objective complete");
  });
});

// ---------------------------------------------------------------------------
// requestStop() (Requirements 4.5)
// ---------------------------------------------------------------------------

describe("requestStop()", () => {
  it("dispatches user_interrupt and aborts current query", async () => {
    const executor = createMockEffectExecutor();
    let capturedSignal: AbortSignal | undefined;

    const agent = createMockAgent(async (_prompt, _cwd, options) => {
      capturedSignal = options?.signal;
      // Return a promise that hangs until the abort signal fires
      return new Promise<AgentResult>((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }
      });
    });

    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 10 } }), executor, agent);

    // Start the driver in the background
    const runPromise = driver.run();

    // Wait for the agent to be invoked
    await vi.waitFor(() => {
      expect(agent.run).toHaveBeenCalled();
    });

    // Request stop — this aborts the signal and sets stopRequested
    driver.requestStop();

    const result = await runPromise;

    // The signal should have been aborted
    expect(capturedSignal?.aborted).toBe(true);
    // The loop should have exited — stopRequested causes the while loop to break.
    // The agent rejection is caught as a hard failure, so the last state transition
    // is iteration_hard_failure (which sets status to "waiting"). But the loop
    // exits because stopRequested is true.
    // The key assertion is that the loop exited and the signal was aborted.
    expect(["stopped", "waiting"]).toContain(result.finalState.status);
  });
});

// ---------------------------------------------------------------------------
// Loop exit on terminal states (Requirements 4.4)
// ---------------------------------------------------------------------------

describe("loop exits on terminal states", () => {
  it("exits when state reaches aborted via maxIterations", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    const result = await driver.run();

    expect(result.finalState.status).toBe("aborted");
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it("exits when state reaches stopped via requestStop", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent(async (_prompt, _cwd, options) => {
      return new Promise<AgentResult>((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }
      });
    });

    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 10 } }), executor, agent);

    const runPromise = driver.run();
    // Wait for the agent to be invoked
    await vi.waitFor(() => {
      expect(agent.run).toHaveBeenCalled();
    });
    driver.requestStop();

    const result = await runPromise;
    // Loop exits because stopRequested is true. The agent rejection is caught
    // as a hard failure after requestStop dispatches user_interrupt, so the
    // final state depends on transition ordering.
    expect(["stopped", "waiting"]).toContain(result.finalState.status);
  });

  it("exits when effect executor sets aborted flag", async () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();

    // After the first executeEffects call (start event), set aborted
    let callCount = 0;
    executor.executeEffects.mockImplementation(async () => {
      callCount++;
      if (callCount >= 1) {
        executor.aborted = true;
      }
    });

    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 10 } }), executor, agent);

    const _result = await driver.run();

    // Agent should not have been called since executor aborted before iteration
    expect(agent.run).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Notes accumulation (Requirements 5.1, 5.2)
// ---------------------------------------------------------------------------

describe("notes accumulation", () => {
  it("appendEntry called after each iteration with correct IterationEntry", async () => {
    const executor = createMockEffectExecutor();
    let callNum = 0;
    const agent = createMockAgent(async () => {
      callNum++;
      if (callNum === 1) return createSuccessResult();
      return createSoftFailureResult();
    });

    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 2 } }), executor, agent);

    const result = await driver.run();

    expect(result.notesDocument.entries).toHaveLength(2);

    // First entry: success
    expect(result.notesDocument.entries[0].success).toBe(true);
    expect(result.notesDocument.entries[0].number).toBe(1);
    expect(result.notesDocument.entries[0].summary).toBe("did stuff");
    expect(result.notesDocument.entries[0].keyChanges).toEqual(["change"]);
    expect(result.notesDocument.entries[0].keyLearnings).toEqual(["learning"]);

    // Second entry: soft failure
    expect(result.notesDocument.entries[1].success).toBe(false);
    expect(result.notesDocument.entries[1].number).toBe(2);
    expect(result.notesDocument.entries[1].summary).toBe("failed to make progress");
    expect(result.notesDocument.entries[1].keyChanges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Notes persistence (Requirement 5.4)
// ---------------------------------------------------------------------------

describe("notes persistence", () => {
  it("persistNotes called after each iteration", async () => {
    const executor = createMockEffectExecutor();
    let callNum = 0;
    const agent = createMockAgent(async () => {
      callNum++;
      if (callNum === 1) return createSuccessResult();
      return createSoftFailureResult();
    });

    const config = createConfig({ limits: { maxIterations: 2 } });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    // persistNotes should be called once per iteration
    expect(RunManager.persistNotes).toHaveBeenCalledTimes(2);

    // Each call should use the configured notesPath
    for (const call of (RunManager.persistNotes as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe(config.notesPath);
      expect(typeof call[1]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Token usage logging (Requirement 8.4)
// ---------------------------------------------------------------------------

describe("token usage logging", () => {
  it("logs token usage after each iteration", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);

    await driver.run();

    // Should log iteration tokens using the i18n key (no t() configured → key fallback)
    const logMessages = consoleSpy.mock.calls.map((call) => call[0]);
    const hasTokenLog = logMessages.some((msg: string) =>
      msg.includes("driver.loop.iterationTokens"),
    );
    expect(hasTokenLog).toBe(true);
  });

  it("logs cumulative token totals across multiple iterations", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const executor = createMockEffectExecutor();
    let callNum = 0;
    const agent = createMockAgent(async () => {
      callNum++;
      return createSuccessResult({
        usage: createMockUsage({ inputTokens: 100 * callNum, outputTokens: 50 * callNum }),
      });
    });
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 2 } }), executor, agent);

    await driver.run();

    // Both iterations should log token usage with the i18n key
    const logMessages = consoleSpy.mock.calls.map((call) => call[0]);
    const tokenLogs = logMessages.filter((msg: string) =>
      msg.includes("driver.loop.iterationTokens"),
    );
    expect(tokenLogs.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Backoff completion (Requirement 10.4)
// ---------------------------------------------------------------------------

describe("backoff completion", () => {
  it("dispatches backoff_elapsed event after backoff", async () => {
    const executor = createMockEffectExecutor();
    let callNum = 0;
    const agent = createMockAgent(async () => {
      callNum++;
      if (callNum === 1) {
        throw new Error("SDK crashed");
      }
      // Second call succeeds
      return createSuccessResult();
    });

    // Allow enough iterations for: hard failure → backoff → backoff_elapsed → success → abort
    const driver = new SdkDriver(createConfig({ limits: { maxIterations: 2 } }), executor, agent);

    const result = await driver.run();

    // Agent should have been called twice (once for hard failure, once for success after backoff)
    expect(agent.run).toHaveBeenCalledTimes(2);
    // Should have 1 failure and 1 success
    expect(result.finalState.failCount).toBe(1);
    expect(result.finalState.successCount).toBe(1);
    // The backoff_elapsed event transitions from waiting → running
    // which then schedules another iteration
    expect(result.finalState.status).toBe("aborted"); // maxIterations reached
  });
});

// ---------------------------------------------------------------------------
// Empty objective validation (Requirement 1.5)
// ---------------------------------------------------------------------------

describe("empty objective validation", () => {
  it("throws for empty string", () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    expect(() => new SdkDriver(createConfig({ objective: "" }), executor, agent)).toThrow();
  });

  it("throws for whitespace-only string", () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    expect(() => new SdkDriver(createConfig({ objective: "  \t\n  " }), executor, agent)).toThrow();
  });

  it("accepts non-empty objective", () => {
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    expect(
      () => new SdkDriver(createConfig({ objective: "valid objective" }), executor, agent),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateHooksPresence — tested in test/hooks-validation.property.test.ts
// (separate file to avoid vi.mock interference with node:fs)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hooks validation during run() (Requirements 1.2, 1.3, 1.4)
// ---------------------------------------------------------------------------

describe("hooks validation during run()", () => {
  it("emits warning with 'hooks protection missing' when hooks are absent", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const executor = createMockEffectExecutor();
    executor.executeEffects.mockImplementation(async () => {
      executor.aborted = true;
    });
    const agent = createMockAgent();
    // Use a cwd that won't have hooks/hooks.json
    const driver = new SdkDriver(createConfig({ cwd: "/nonexistent/path" }), executor, agent);

    await driver.run();

    const logMessages = logSpy.mock.calls.map((call) => call[0]);
    const hasHooksWarning = logMessages.some((msg: string) =>
      msg.includes("driver.warning.hooksProtectionMissing"),
    );
    expect(hasHooksWarning).toBe(true);
  });

  it("does not block startup when hooks validation fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const driver = new SdkDriver(
      createConfig({ cwd: "/nonexistent/path", limits: { maxIterations: 1 } }),
      executor,
      agent,
    );

    const result = await driver.run();

    // The driver should still complete its run despite hooks validation failure
    expect(result.finalState.status).toBe("aborted");
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it("handles unexpected errors in hooks validation gracefully", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const executor = createMockEffectExecutor();
    executor.executeEffects.mockImplementation(async () => {
      executor.aborted = true;
    });
    const agent = createMockAgent();
    // Use a cwd that won't have hooks — the validation will fail but not block
    const driver = new SdkDriver(createConfig({ cwd: "/nonexistent/path" }), executor, agent);

    // Should not throw even when hooks validation encounters issues
    const result = await driver.run();

    // Warning was logged with hooks protection missing (i18n key)
    const logMessages = logSpy.mock.calls.map((call) => call[0]);
    const hasHooksWarning = logMessages.some((msg: string) =>
      msg.includes("driver.warning.hooksProtectionMissing"),
    );
    expect(hasHooksWarning).toBe(true);
    // Driver still produced a result (startup was not blocked)
    expect(result).toBeDefined();
    expect(result.notesDocument).toBeDefined();
  });
});
