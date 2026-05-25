import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CliSpawnRequest, runWarmUp, type WarmUpDeps } from "../../src/warm-up-runner.js";

let runDir: string;

beforeEach(() => {
  runDir = mkdtempSync(join(tmpdir(), "warmup-"));
});

afterEach(() => {
  vi.useRealTimers();
});

interface FakeChild extends EventEmitter {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.killed = false;
  return child;
}

function captureSpawn(child: FakeChild) {
  const calls: CliSpawnRequest[] = [];
  const spawn = vi.fn((req: CliSpawnRequest) => {
    calls.push(req);
    return child as unknown as ReturnType<WarmUpDeps["spawn"]>;
  });
  return { spawn, calls };
}

describe("WarmUpRunner: AC 9.1/9.2 — args contract", () => {
  it("spawns claude with --print --output-format=stream-json --max-turns 1", async () => {
    const child = makeFakeChild();
    const { spawn, calls } = captureSpawn(child);

    const promise = runWarmUp({ runId: "run_w1", runDir, spawn });
    queueMicrotask(() => child.emit("exit", 0));
    await promise;

    expect(calls.length).toBe(1);
    const args = calls[0].args;
    expect(args).toContain("--print");
    expect(args.some((a) => a === "--output-format=stream-json" || a === "stream-json")).toBe(true);
    expect(args).toContain("--max-turns");
    const idx = args.indexOf("--max-turns");
    expect(args[idx + 1]).toBe("1");
    expect(calls[0].cmd).toBe("claude");
  });

  it("writes tiny prompt frame to stdin and ends stdin", async () => {
    const child = makeFakeChild();
    const { spawn } = captureSpawn(child);

    const promise = runWarmUp({ runId: "run_w2", runDir, spawn });
    queueMicrotask(() => child.emit("exit", 0));
    await promise;

    expect(child.stdin.write).toHaveBeenCalledTimes(1);
    const written = child.stdin.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe("user");
    expect(typeof parsed.message?.content).toBe("string");
    expect(parsed.message.content.length).toBeLessThanOrEqual(8);
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });
});

describe("WarmUpRunner: AC 9.3 — warm-up.json record outside --max-tokens budget", () => {
  it("writes warm-up.json with usage and duration fields", async () => {
    const child = makeFakeChild();
    const { spawn } = captureSpawn(child);

    const promise = runWarmUp({ runId: "run_w3", runDir, spawn });
    queueMicrotask(() => child.emit("exit", 0));
    const result = await promise;

    const recordPath = join(runDir, "warm-up.json");
    expect(existsSync(recordPath)).toBe(true);
    const record = JSON.parse(readFileSync(recordPath, "utf-8"));
    expect(record.run_id).toBe("run_w3");
    expect(typeof record.duration_ms).toBe("number");
    expect(record.exit_code).toBe(0);
    // Token usage is not deducted from --max-tokens budget; presence of zero
    // baseline tokensSpent suffices for AC 9.3 contract.
    expect(record.tokens).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    });
    expect(result.exitCode).toBe(0);
    expect(result.deductFromBudget).toBe(false);
  });
});

describe("WarmUpRunner: AC 9.4 — failure aborts startup", () => {
  it("rejects with stderr passthrough on non-zero exit", async () => {
    const child = makeFakeChild();
    const { spawn } = captureSpawn(child);

    const promise = runWarmUp({ runId: "run_w4", runDir, spawn });
    queueMicrotask(() => {
      child.stderr.emit("data", "credentials invalid\n");
      child.emit("exit", 1);
    });

    await expect(promise).rejects.toThrow(/warm-up failed/i);
    const recordPath = join(runDir, "warm-up.json");
    expect(existsSync(recordPath)).toBe(true);
    const record = JSON.parse(readFileSync(recordPath, "utf-8"));
    expect(record.exit_code).toBe(1);
    expect(record.stderr).toContain("credentials invalid");
  });

  it("rejects on 30s timeout and SIGTERMs the child", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    const { spawn } = captureSpawn(child);

    const promise = runWarmUp({ runId: "run_w5", runDir, spawn, timeoutMs: 30_000 });
    // Attach rejection handler immediately to avoid unhandled rejection warning.
    const settled = promise.then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );

    // Don't emit anything; advance past the timeout.
    await vi.advanceTimersByTimeAsync(30_500);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("exit", 143);

    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.e.message).toMatch(/timeout/i);
  });
});

describe("WarmUpRunner: AC 9.5 — --no-warmup skip", () => {
  it("returns skipped result without spawning when skip=true", async () => {
    const child = makeFakeChild();
    const { spawn } = captureSpawn(child);

    const result = await runWarmUp({ runId: "run_w6", runDir, spawn, skip: true });

    expect(spawn).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(existsSync(join(runDir, "warm-up.json"))).toBe(false);
  });
});
