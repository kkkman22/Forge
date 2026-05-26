import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BACKOFF_BASE_MS } from "../src/error-handler.js";
import { type AbortJson, type RetryLoopOpts, runMainLoopWithRetry } from "../src/retry-loop.js";

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
}));

const mockWriteFileSync = vi.mocked(writeFileSync);

function makeOpts(overrides: Partial<RetryLoopOpts> = {}): RetryLoopOpts {
  return {
    driver: {
      run: vi.fn().mockResolvedValue({ exitCode: 0 }),
    },
    prompt: "test-prompt",
    cwd: "/tmp/test",
    runDir: "/tmp/test/runs/2026-01-01",
    maxRetries: 3,
    ipcEmitter: {
      emitWarning: vi.fn(),
    },
    ...overrides,
  };
}

describe("runMainLoopWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWriteFileSync.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC 2.1: exponential backoff with max retries
  it("retries with exponential backoff delays and stops after max retries", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 137 });
    const opts = makeOpts({ driver: { run: mockRun } });

    const promise = runMainLoopWithRetry(opts);

    // Attempt 1 fails → backoff 60s
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRun).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS);
    expect(mockRun).toHaveBeenCalledTimes(2);

    // Attempt 2 fails → backoff 120s
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 2);
    expect(mockRun).toHaveBeenCalledTimes(3);

    // Attempt 3 fails → backoff 240s
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 4);
    expect(mockRun).toHaveBeenCalledTimes(4);

    // No 5th attempt — max retries (3) exhausted
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 8);
    expect(mockRun).toHaveBeenCalledTimes(4);

    await promise;
  });

  // AC 2.2: non-retryable exit code stops immediately
  it("stops immediately on non-retryable exit code (e.g. 139)", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 139 });
    const opts = makeOpts({ driver: { run: mockRun } });

    await runMainLoopWithRetry(opts);

    expect(mockRun).toHaveBeenCalledTimes(1);
    // No setTimeout should have been scheduled — advance timer to be sure
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 10);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  // AC 2.3: abort.json has all 4 required fields
  it("writes abort.json with all required fields after exhausting retries", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 137 });
    const opts = makeOpts({ driver: { run: mockRun } });

    const promise = runMainLoopWithRetry(opts);

    // Exhaust all retries: 4 attempts total (1 initial + 3 retries)
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS);
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 2);
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 4);

    await promise;

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const call = mockWriteFileSync.mock.calls[0];
    expect(call[0]).toBe(join(opts.runDir, "abort.json"));

    const abort: AbortJson = JSON.parse(call[1] as string);
    expect(abort).toHaveProperty("final_exit_code");
    expect(abort).toHaveProperty("attempts_made");
    expect(abort).toHaveProperty("failures");
    expect(abort).toHaveProperty("abort_reason");
    expect(abort.attempts_made).toBe(4);
    expect(abort.failures).toHaveLength(4);
    expect(abort.abort_reason).toBe("max_retries_exhausted");
    expect(abort.final_exit_code).toBe(137);
  });

  // AC 2.4: ipcEmitter.emitWarning called on each retry
  it("emits subprocess-retry warning before each retry backoff", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 137 });
    const mockEmitWarning = vi.fn();
    const opts = makeOpts({
      driver: { run: mockRun },
      ipcEmitter: { emitWarning: mockEmitWarning },
    });

    const promise = runMainLoopWithRetry(opts);

    // Advance through all retries
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS);
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 2);
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 4);

    await promise;

    expect(mockEmitWarning).toHaveBeenCalledTimes(3);
    expect(mockEmitWarning).toHaveBeenNthCalledWith(1, { code: "subprocess-retry", attempt: 1 });
    expect(mockEmitWarning).toHaveBeenNthCalledWith(2, { code: "subprocess-retry", attempt: 2 });
    expect(mockEmitWarning).toHaveBeenNthCalledWith(3, { code: "subprocess-retry", attempt: 3 });
  });

  // AC 2.6: SIGINT during retry clears timeout and writes user_interrupt abort
  it("handles SIGINT during backoff wait: clears timeout and writes user_interrupt abort.json", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 137 });
    const opts = makeOpts({ driver: { run: mockRun } });

    // We'll trigger SIGINT after the first attempt starts backoff
    const promise = runMainLoopWithRetry(opts);

    // Flush microtasks so the driver.run() resolves and we enter the backoff
    // promise (where process.once("SIGINT", ...) is registered).
    await vi.advanceTimersByTimeAsync(0);

    // Now sleeping in backoff. Emit SIGINT.
    process.emit("SIGINT", "SIGINT");

    await expect(promise).rejects.toThrow();

    // No more driver calls after SIGINT
    expect(mockRun).toHaveBeenCalledTimes(1);

    // abort.json written with user_interrupt
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const call = mockWriteFileSync.mock.calls[0];
    const abort: AbortJson = JSON.parse(call[1] as string);
    expect(abort.abort_reason).toBe("user_interrupt");
    expect(abort.attempts_made).toBe(1);
    expect(abort.failures).toHaveLength(1);
  });

  // Successful run: no abort.json, no retries
  it("returns immediately on success (exit 0) without writing abort.json", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 0 });
    const opts = makeOpts({ driver: { run: mockRun } });

    await runMainLoopWithRetry(opts);

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  // Non-retryable fatal exit writes abort.json with fatal_exit_code
  it("writes abort.json with fatal_exit_code for non-retryable exit", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 139 });
    const opts = makeOpts({ driver: { run: mockRun } });

    await runMainLoopWithRetry(opts);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const call = mockWriteFileSync.mock.calls[0];
    const abort: AbortJson = JSON.parse(call[1] as string);
    expect(abort.abort_reason).toBe("fatal_exit_code");
    expect(abort.final_exit_code).toBe(139);
    expect(abort.attempts_made).toBe(1);
  });

  // Works without ipcEmitter (optional)
  it("works without ipcEmitter (no warnings emitted)", async () => {
    const mockRun = vi.fn().mockResolvedValue({ exitCode: 137 });
    const opts = makeOpts({ driver: { run: mockRun }, ipcEmitter: undefined });

    const promise = runMainLoopWithRetry(opts);

    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS);
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 2);
    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF_BASE_MS * 4);

    await promise;

    expect(mockRun).toHaveBeenCalledTimes(4);
  });
});
