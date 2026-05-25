import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyExitCode,
  type IpcEmitterLike,
  type IterationOutcome,
  type LoopErrorControllerDeps,
  runIterationWithErrorControl,
} from "../../src/loop-error-controller.js";

let runDir: string;

beforeEach(() => {
  runDir = mkdtempSync(join(tmpdir(), "loop-err-"));
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

function captureEmitter(): { emitter: IpcEmitterLike; frames: Array<Record<string, unknown>> } {
  const frames: Array<Record<string, unknown>> = [];
  const emitter: IpcEmitterLike = {
    warning: (frame) => {
      frames.push({ ...frame, type: "warning" });
    },
  };
  return { emitter, frames };
}

describe("classifyExitCode (AC 10.2 / 10.3)", () => {
  it("returns 'retry' for {1, 2, 137, 143}", () => {
    expect(classifyExitCode(1)).toBe("retry");
    expect(classifyExitCode(2)).toBe("retry");
    expect(classifyExitCode(137)).toBe("retry");
    expect(classifyExitCode(143)).toBe("retry");
  });

  it("returns 'abort' for everything else (SIGSEGV / unknown)", () => {
    expect(classifyExitCode(139)).toBe("abort");
    expect(classifyExitCode(255)).toBe("abort");
    expect(classifyExitCode(99)).toBe("abort");
  });

  it("returns 'success' for 0", () => {
    expect(classifyExitCode(0)).toBe("success");
  });
});

describe("LoopErrorController: AC 10.1 — stuck timeout SIGTERM/SIGKILL", () => {
  it("SIGTERMs after 600s of stdout silence, SIGKILLs 30s later", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    const { emitter } = captureEmitter();
    const spawn = vi.fn(() => child as unknown as ReturnType<LoopErrorControllerDeps["spawn"]>);

    const promise = runIterationWithErrorControl({
      runId: "run_t1",
      runDir,
      spawn,
      emitter,
      stuckTimeoutMs: 600_000,
      sigkillDelayMs: 30_000,
      maxRetries: 3,
      backoffBaseMs: 60_000,
    });
    const settled = promise.then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );

    // Advance through 600s with NO stdout emission.
    await vi.advanceTimersByTimeAsync(600_500);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    // 30s more, no exit yet → SIGKILL
    await vi.advanceTimersByTimeAsync(30_500);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");

    child.emit("exit", 137); // simulate forced exit (137 SIGKILL)
    // 137 is in retry set, but stuck-timeout aborts the iteration; controller
    // should classify it as a retry-able cause and start backoff.
    // For this minimal test we abandon retries by setting maxRetries: 0 — no:
    // we configured maxRetries=3, so it would attempt retry. Cancel by emitting
    // events that fail the next retry too.
    // Skip rest by using a separate test for retry behaviour.
    settled.catch(() => {
      /* swallow - this test only validates the kill chain */
    });
  });
});

describe("LoopErrorController: AC 10.2 — exit code in retry set → exponential backoff ≤3", () => {
  it("retries 137 with 60s/120s/240s backoff, then aborts with abort.json", async () => {
    vi.useFakeTimers();
    const { emitter, frames } = captureEmitter();
    let spawnCount = 0;
    const spawn = vi.fn(() => {
      spawnCount++;
      const child = makeFakeChild();
      // Each spawn → exit with 137 immediately.
      queueMicrotask(() => child.emit("exit", 137));
      return child as unknown as ReturnType<LoopErrorControllerDeps["spawn"]>;
    });

    const promise = runIterationWithErrorControl({
      runId: "run_t2",
      runDir,
      spawn,
      emitter,
      stuckTimeoutMs: 600_000,
      sigkillDelayMs: 30_000,
      maxRetries: 3,
      backoffBaseMs: 60_000,
    });
    const settled = promise.then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );

    // Advance through retry chain: initial spawn → backoff 60s → spawn → 120s → spawn → 240s → spawn → abort
    await vi.advanceTimersByTimeAsync(0); // initial exit
    await vi.advanceTimersByTimeAsync(60_500); // first backoff
    await vi.advanceTimersByTimeAsync(120_500); // second backoff
    await vi.advanceTimersByTimeAsync(240_500); // third backoff
    await vi.advanceTimersByTimeAsync(10);

    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.e.message).toMatch(/abort/i);

    // 4 spawns total: initial + 3 retries
    expect(spawnCount).toBe(4);

    // abort.json written
    const abortPath = join(runDir, "abort.json");
    expect(existsSync(abortPath)).toBe(true);
    const record = JSON.parse(readFileSync(abortPath, "utf-8"));
    expect(record.run_id).toBe("run_t2");
    expect(record.last_exit_code).toBe(137);
    expect(record.attempts).toBe(4);

    // 3 IPC warning frames with attempt 1..3
    const retryFrames = frames.filter((f) => f.code === "subprocess-retry");
    expect(retryFrames.length).toBe(3);
    expect(retryFrames.map((f) => f.attempt)).toEqual([1, 2, 3]);
  });
});

describe("LoopErrorController: AC 10.3 — non-retry exit code → immediate abort", () => {
  it("aborts on SIGSEGV (139) without retry", async () => {
    const { emitter, frames } = captureEmitter();
    let spawnCount = 0;
    const spawn = vi.fn(() => {
      spawnCount++;
      const child = makeFakeChild();
      queueMicrotask(() => child.emit("exit", 139));
      return child as unknown as ReturnType<LoopErrorControllerDeps["spawn"]>;
    });

    await expect(
      runIterationWithErrorControl({
        runId: "run_t3",
        runDir,
        spawn,
        emitter,
        stuckTimeoutMs: 600_000,
        sigkillDelayMs: 30_000,
        maxRetries: 3,
        backoffBaseMs: 60_000,
      }),
    ).rejects.toThrow(/abort/i);

    expect(spawnCount).toBe(1); // no retry
    expect(frames.filter((f) => f.code === "subprocess-retry")).toHaveLength(0);
    expect(existsSync(join(runDir, "abort.json"))).toBe(true);
  });
});

describe("LoopErrorController: AC 10.4 — IPC warnings during retry", () => {
  it("emits warning frames with code=subprocess-retry and attempt counter", async () => {
    vi.useFakeTimers();
    const { emitter, frames } = captureEmitter();
    let spawnCount = 0;
    const spawn = vi.fn(() => {
      spawnCount++;
      const child = makeFakeChild();
      // First attempt fails 137, second attempt succeeds 0.
      const code = spawnCount === 1 ? 137 : 0;
      queueMicrotask(() => child.emit("exit", code));
      return child as unknown as ReturnType<LoopErrorControllerDeps["spawn"]>;
    });

    const promise = runIterationWithErrorControl({
      runId: "run_t4",
      runDir,
      spawn,
      emitter,
      stuckTimeoutMs: 600_000,
      sigkillDelayMs: 30_000,
      maxRetries: 3,
      backoffBaseMs: 60_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_500);
    await vi.advanceTimersByTimeAsync(10);

    const result: IterationOutcome = await promise;
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);

    const retryFrames = frames.filter((f) => f.code === "subprocess-retry");
    expect(retryFrames.length).toBe(1);
    expect(retryFrames[0].attempt).toBe(1);
    expect(retryFrames[0].type).toBe("warning");
  });
});

describe("LoopErrorController: AC 10.6 — workflow subprocess crash signature", () => {
  it("classifies as 'subprocess_crash' for L0 → L1 dispatcher signature", async () => {
    const { emitter } = captureEmitter();
    const spawn = vi.fn(() => {
      const child = makeFakeChild();
      queueMicrotask(() => child.emit("exit", 139));
      return child as unknown as ReturnType<LoopErrorControllerDeps["spawn"]>;
    });

    let caught: Error | null = null;
    try {
      await runIterationWithErrorControl({
        runId: "run_t5",
        runDir,
        spawn,
        emitter,
        stuckTimeoutMs: 600_000,
        sigkillDelayMs: 30_000,
        maxRetries: 0,
        backoffBaseMs: 60_000,
        l0FailureSignatureCapture: true,
      });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).not.toBeNull();
    const abortPath = join(runDir, "abort.json");
    const record = JSON.parse(readFileSync(abortPath, "utf-8"));
    expect(record.l0_failure_signature).toBe("subprocess_crash");
  });
});
