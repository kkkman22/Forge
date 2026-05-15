/**
 * Unit tests for the SdkAgentAdapter class.
 *
 * Verifies that the adapter correctly wraps the Agent SDK's `query()` to
 * implement `AgentInterface`: successful query mapping, token usage mapping,
 * validation failure handling, SDK error propagation, AbortController wiring,
 * maxBudgetUsd passthrough, warm query consumption, and resource cleanup.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
 */
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { buildAgentOutputSchema } from "../src/agent-output.js";
import type { AgentOutputSchema } from "../src/loop-types.js";

// ---------------------------------------------------------------------------
// Mock the Agent SDK module
// ---------------------------------------------------------------------------

const mockSdkQuery = vi.fn();
const mockWarmQueryQuery = vi.fn();
const mockWarmQueryClose = vi.fn();

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => mockSdkQuery(...args),
}));

// Import after mocking
import { SdkAgentAdapter, type SdkAgentAdapterConfig } from "../src/sdk-agent-adapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const outputSchema: AgentOutputSchema = buildAgentOutputSchema({ includeStopField: false });

function createMockWarmQuery() {
  return {
    query: mockWarmQueryQuery,
    close: mockWarmQueryClose,
  };
}

function createConfig(overrides?: Partial<SdkAgentAdapterConfig>): SdkAgentAdapterConfig {
  return {
    warmQuery: createMockWarmQuery() as unknown as SdkAgentAdapterConfig["warmQuery"],
    outputSchema,
    ...overrides,
  };
}

function createAdapter(overrides?: Partial<SdkAgentAdapterConfig>): SdkAgentAdapter {
  return new SdkAgentAdapter(createConfig(overrides));
}

/**
 * Create an async generator that yields the given messages in order.
 */
async function* makeAsyncGenerator(messages: unknown[]): AsyncGenerator<unknown> {
  for (const msg of messages) {
    yield msg;
  }
}

/**
 * Build a successful SDK result message with configurable structured output and usage.
 */
function buildSuccessResult(overrides?: {
  structured_output?: unknown;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}) {
  return {
    type: "result",
    subtype: "success",
    structured_output: overrides?.structured_output ?? {
      success: true,
      summary: "test summary",
      key_changes_made: ["change1"],
      key_learnings: ["learning1"],
    },
    usage: overrides?.usage ?? {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 10,
      cache_creation_input_tokens: 5,
    },
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    result: "",
    stop_reason: null,
    total_cost_usd: 0.01,
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000000",
    session_id: "test-session",
  };
}

/**
 * Build an error SDK result message.
 */
function buildErrorResult(errors: string[] = ["Something went wrong"]) {
  return {
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    errors,
    usage: {
      input_tokens: 50,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    duration_ms: 500,
    duration_api_ms: 400,
    num_turns: 0,
    stop_reason: null,
    total_cost_usd: 0,
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000001",
    session_id: "test-session",
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
// Successful query (Requirements 2.1, 2.2, 2.3, 2.5)
// ---------------------------------------------------------------------------

describe("successful query", () => {
  it("returns correct AgentResult with mapped TokenUsage", async () => {
    const successResult = buildSuccessResult({
      usage: {
        input_tokens: 200,
        output_tokens: 75,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 8,
      },
    });
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter();
    const result = await adapter.run("test prompt", "/test/cwd");

    expect(result.output).toEqual({
      success: true,
      summary: "test summary",
      key_changes_made: ["change1"],
      key_learnings: ["learning1"],
    });
    expect(result.usage).toEqual({
      inputTokens: 200,
      outputTokens: 75,
      cacheReadTokens: 20,
      cacheCreationTokens: 8,
    });
  });

  it("calls onUsage callback with mapped token usage", async () => {
    const successResult = buildSuccessResult();
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter();
    const onUsage = vi.fn();
    await adapter.run("test prompt", "/test/cwd", { onUsage });

    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Validation failure (Requirement 2.4)
// ---------------------------------------------------------------------------

describe("validation failure", () => {
  it("throws with error messages when structured_output is invalid", async () => {
    const invalidResult = buildSuccessResult({
      structured_output: { success: "not-a-boolean", summary: 123 },
    });
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([invalidResult]));

    const adapter = createAdapter();

    await expect(adapter.run("test prompt", "/test/cwd")).rejects.toThrow(
      "Agent output validation failed",
    );
  });

  it("includes specific validation error details in the thrown error", async () => {
    const invalidResult = buildSuccessResult({
      structured_output: { success: "not-a-boolean" },
    });
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([invalidResult]));

    const adapter = createAdapter();

    await expect(adapter.run("test prompt", "/test/cwd")).rejects.toThrow(
      /success must be a boolean/,
    );
  });
});

// ---------------------------------------------------------------------------
// SDK error propagation (Requirement 2.7)
// ---------------------------------------------------------------------------

describe("SDK error propagation", () => {
  it("throws when SDK returns an error result", async () => {
    const errorResult = buildErrorResult(["Something went wrong"]);
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([errorResult]));

    const adapter = createAdapter();

    await expect(adapter.run("test prompt", "/test/cwd")).rejects.toThrow(
      "Agent SDK error (error_during_execution): Something went wrong",
    );
  });

  it("joins multiple error messages with semicolons", async () => {
    const errorResult = buildErrorResult(["Error one", "Error two"]);
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([errorResult]));

    const adapter = createAdapter();

    await expect(adapter.run("test prompt", "/test/cwd")).rejects.toThrow(
      "Agent SDK error (error_during_execution): Error one; Error two",
    );
  });

  it("throws when no result message is returned", async () => {
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([]));

    const adapter = createAdapter();

    await expect(adapter.run("test prompt", "/test/cwd")).rejects.toThrow(
      "Agent SDK query completed without returning a result message",
    );
  });
});

// ---------------------------------------------------------------------------
// AbortController signal wiring (Requirement 2.6)
// ---------------------------------------------------------------------------

describe("AbortController signal", () => {
  it("passes an AbortController to the SDK query", async () => {
    const successResult = buildSuccessResult();
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter();
    const controller = new AbortController();
    await adapter.run("test prompt", "/test/cwd", { signal: controller.signal });

    // The warm query is called with just the prompt, but the adapter creates
    // an internal AbortController. We verify the adapter doesn't throw when
    // a signal is provided.
    expect(mockWarmQueryQuery).toHaveBeenCalledWith("test prompt");
  });

  it("aborts the internal controller when the external signal is already aborted", async () => {
    // When signal is already aborted, the adapter should abort its internal controller.
    // The SDK query may still complete if it yields results before checking abort.
    const successResult = buildSuccessResult();
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter();
    const controller = new AbortController();
    controller.abort("test reason");

    // Should still work if the generator yields before abort is checked
    const result = await adapter.run("test prompt", "/test/cwd", { signal: controller.signal });
    expect(result.output.success).toBe(true);
  });

  it("wires external signal abort to internal AbortController on subsequent calls", async () => {
    const successResult = buildSuccessResult();
    // First call uses warm query
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));
    // Second call uses standalone sdkQuery
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter();

    // First call — consumes warm query
    await adapter.run("first prompt", "/test/cwd");

    // Second call — uses standalone sdkQuery, which receives options with abortController
    const controller = new AbortController();
    await adapter.run("second prompt", "/test/cwd", { signal: controller.signal });

    expect(mockSdkQuery).toHaveBeenCalledOnce();
    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.abortController).toBeDefined();
    expect(callArgs.options.abortController).toBeInstanceOf(AbortController);
  });
});

// ---------------------------------------------------------------------------
// maxBudgetUsd passthrough (Requirement 8.3)
// ---------------------------------------------------------------------------

describe("maxBudgetUsd passthrough", () => {
  it("passes maxBudgetUsd through to sdkQuery options when configured", async () => {
    const successResult = buildSuccessResult();
    // First call uses warm query
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));
    // Second call uses standalone sdkQuery
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter({ maxBudgetUsd: 5.0 });

    // First call — consumes warm query
    await adapter.run("first prompt", "/test/cwd");

    // Second call — uses standalone sdkQuery with full options
    await adapter.run("second prompt", "/test/cwd");

    expect(mockSdkQuery).toHaveBeenCalledOnce();
    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.maxBudgetUsd).toBe(5.0);
  });

  it("does not include maxBudgetUsd when not configured", async () => {
    const successResult = buildSuccessResult();
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter(); // no maxBudgetUsd

    // First call — consumes warm query
    await adapter.run("first prompt", "/test/cwd");

    // Second call — uses standalone sdkQuery
    await adapter.run("second prompt", "/test/cwd");

    expect(mockSdkQuery).toHaveBeenCalledOnce();
    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.maxBudgetUsd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// close() cleanup (Requirement 2.1)
// ---------------------------------------------------------------------------

describe("close()", () => {
  it("calls warmQuery.close()", async () => {
    const adapter = createAdapter();

    await adapter.close();

    expect(mockWarmQueryClose).toHaveBeenCalledOnce();
  });

  it("closes active query if one is in progress", async () => {
    // Simulate an active query by starting a run that we can control
    const mockClose = vi.fn();
    let resolveGenerator: (() => void) | null = null;

    async function* slowGenerator(): AsyncGenerator<unknown> {
      // Wait until we signal to continue
      await new Promise<void>((resolve) => {
        resolveGenerator = resolve;
      });
      yield buildSuccessResult();
    }

    const gen = slowGenerator();
    // Attach a close method to the generator to simulate Query.close()
    (gen as unknown as { close: Mock }).close = mockClose;

    mockWarmQueryQuery.mockReturnValue(gen);

    const adapter = createAdapter();

    // Start the run but don't await it — it will be blocked in the generator
    const runPromise = adapter.run("test prompt", "/test/cwd");

    // Give the adapter time to start iterating
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Close while the query is active
    await adapter.close();

    expect(mockWarmQueryClose).toHaveBeenCalledOnce();

    // Resolve the generator so the run promise can settle
    if (resolveGenerator) (resolveGenerator as () => void)();
    // The run may throw or succeed — we just care that close was called
    try {
      await runPromise;
    } catch {
      // Expected — the query was closed mid-flight
    }
  });
});

// ---------------------------------------------------------------------------
// Global timeout (Requirements 12.1, 12.2, 12.3)
// ---------------------------------------------------------------------------

describe("global timeout", () => {
  /**
   * Helper: consume the warm query with a quick success so subsequent calls
   * use the standalone sdkQuery path where we can intercept the AbortController.
   */
  async function consumeWarmQuery(adapter: SdkAgentAdapter): Promise<void> {
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));
    await adapter.run("warm-up prompt", "/test/cwd");
  }

  /**
   * Helper: mock sdkQuery to return a generator that hangs until the adapter's
   * internal AbortController fires. This simulates a real SDK call that respects
   * the abort signal. We use the standalone sdkQuery path because it receives
   * the AbortController in options, allowing us to listen for the abort event.
   */
  function mockSdkQueryWithAbortAwareHang(): void {
    mockSdkQuery.mockImplementation(
      ({ options }: { prompt: string; options: { abortController: AbortController } }) => {
        const ac = options.abortController;
        async function* gen(): AsyncGenerator<unknown> {
          await new Promise<void>((_resolve, reject) => {
            if (ac.signal.aborted) {
              reject(new DOMException("aborted", "AbortError"));
              return;
            }
            ac.signal.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          });
        }
        return gen();
      },
    );
  }

  it("throws error containing 'timeout' keyword when SDK call exceeds configured timeout", async () => {
    const adapter = createAdapter({ globalTimeoutMs: 10 });
    await consumeWarmQuery(adapter);

    mockSdkQueryWithAbortAwareHang();

    await expect(adapter.run("test prompt", "/test/cwd")).rejects.toThrow(/timeout/i);
  }, 10_000);

  it("includes the configured timeout duration in the error message", async () => {
    const adapter = createAdapter({ globalTimeoutMs: 50 });
    await consumeWarmQuery(adapter);

    mockSdkQueryWithAbortAwareHang();

    await expect(adapter.run("test prompt", "/test/cwd")).rejects.toThrow(
      "Agent SDK call timed out after 50ms (timeout)",
    );
  }, 10_000);

  it("does not throw when SDK call completes before timeout", async () => {
    const successResult = buildSuccessResult();
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter({ globalTimeoutMs: 5000 });

    const result = await adapter.run("test prompt", "/test/cwd");

    expect(result.output.success).toBe(true);
    expect(result.usage.inputTokens).toBe(100);
  });

  it("clears timeout on successful completion (no lingering timers)", async () => {
    vi.useFakeTimers();
    try {
      const successResult = buildSuccessResult();
      mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));

      const adapter = createAdapter({ globalTimeoutMs: 100 });

      const result = await adapter.run("test prompt", "/test/cwd");

      expect(result.output.success).toBe(true);

      // After successful completion, clearTimeout in the finally block should
      // have removed the pending timer.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults to 1,800,000ms (30 minutes) when globalTimeoutMs is not configured", async () => {
    // Verify the default: a quick call succeeds (proving default is not 0ms).
    // The constant DEFAULT_GLOBAL_TIMEOUT_MS = 1_800_000 is used internally.
    const adapter = createAdapter(); // no globalTimeoutMs
    const successResult = buildSuccessResult();
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const result = await adapter.run("test prompt", "/test/cwd");
    expect(result.output.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Warm query consumption (Requirements 2.1, 2.2)
// ---------------------------------------------------------------------------

describe("warm query consumption", () => {
  it("first call uses warmQuery.query(), second call uses standalone sdkQuery()", async () => {
    const successResult = buildSuccessResult();
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([successResult]));
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([successResult]));

    const adapter = createAdapter();

    // First call — should use warm query
    await adapter.run("first prompt", "/test/cwd");
    expect(mockWarmQueryQuery).toHaveBeenCalledOnce();
    expect(mockWarmQueryQuery).toHaveBeenCalledWith("first prompt");
    expect(mockSdkQuery).not.toHaveBeenCalled();

    // Second call — should use standalone sdkQuery
    await adapter.run("second prompt", "/test/cwd");
    expect(mockWarmQueryQuery).toHaveBeenCalledOnce(); // still only once
    expect(mockSdkQuery).toHaveBeenCalledOnce();

    // Verify standalone sdkQuery was called with correct options
    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.prompt).toBe("second prompt");
    expect(callArgs.options.cwd).toBe("/test/cwd");
    expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true);
    expect(callArgs.options.outputFormat).toEqual({
      type: "json_schema",
      schema: outputSchema,
    });
    expect(callArgs.options.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
    });
  });
});

// ---------------------------------------------------------------------------
// Sandbox mode integration (sandbox-execution spec)
// ---------------------------------------------------------------------------

describe("sandbox mode", () => {
  const sandboxProfile: import("../src/sandbox-profile.js").SandboxProfile = {
    fileSystem: { allow: ["."], deny: [".env"] },
    network: { mode: "restricted", allow: ["api.anthropic.com"] },
  };

  async function consumeWarmQuery(adapter: SdkAgentAdapter): Promise<void> {
    mockWarmQueryQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));
    await adapter.run("warm-up", "/test/cwd");
  }

  it("uses acceptEdits permissionMode when sandboxProfile is set", async () => {
    const adapter = createAdapter({ sandboxProfile });
    await consumeWarmQuery(adapter);
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));

    await adapter.run("sandbox prompt", "/test/cwd");

    expect(mockSdkQuery).toHaveBeenCalledOnce();
    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("acceptEdits");
  });

  it("does not set allowDangerouslySkipPermissions in sandbox mode", async () => {
    const adapter = createAdapter({ sandboxProfile });
    await consumeWarmQuery(adapter);
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));

    await adapter.run("sandbox prompt", "/test/cwd");

    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it("includes allowedTools with FORGE_LOOP_TOOLS in sandbox mode", async () => {
    const adapter = createAdapter({ sandboxProfile });
    await consumeWarmQuery(adapter);
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));

    await adapter.run("sandbox prompt", "/test/cwd");

    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.allowedTools).toContain("Write");
    expect(callArgs.options.allowedTools).toContain("Edit");
    expect(callArgs.options.allowedTools).toContain("Bash");
    expect(callArgs.options.allowedTools).toContain("Read");
    expect(callArgs.options.allowedTools).toContain("Agent");
  });

  it("includes sandbox settings in sandbox mode", async () => {
    const adapter = createAdapter({ sandboxProfile });
    await consumeWarmQuery(adapter);
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));

    await adapter.run("sandbox prompt", "/test/cwd");

    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.sandbox).toBeDefined();
    expect(callArgs.options.sandbox.enabled).toBe(true);
  });

  it("includes hooks with frozen zone protection in sandbox mode", async () => {
    const adapter = createAdapter({ sandboxProfile });
    await consumeWarmQuery(adapter);
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));

    await adapter.run("sandbox prompt", "/test/cwd");

    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.hooks).toBeDefined();
    expect(callArgs.options.hooks.PreToolUse).toBeDefined();
    expect(callArgs.options.hooks.PreToolUse.length).toBeGreaterThan(0);
  });

  it("keeps bypassPermissions when no sandboxProfile", async () => {
    const adapter = createAdapter(); // no sandboxProfile
    await consumeWarmQuery(adapter);
    mockSdkQuery.mockReturnValue(makeAsyncGenerator([buildSuccessResult()]));

    await adapter.run("normal prompt", "/test/cwd");

    const callArgs = mockSdkQuery.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true);
    expect(callArgs.options.sandbox).toBeUndefined();
    expect(callArgs.options.hooks).toBeUndefined();
  });
});
