import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CleanupContext } from "../src/cleanup-chain.js";
import { runCleanupChain } from "../src/cleanup-chain.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    unlinkSync: vi.fn(actual.unlinkSync),
    appendFileSync: vi.fn(actual.appendFileSync),
  };
});

import { execFileSync } from "node:child_process";
import {
  appendFileSync as mockAppendFileSync,
  existsSync as mockExistsSync,
  unlinkSync as mockUnlinkSync,
} from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeChild(killed = false, killFn?: () => void) {
  return {
    kill: vi.fn(() => killFn?.()),
    killed,
    pid: 12345,
    stdout: null,
    stderr: null,
    stdin: null,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: "",
    connected: false,
    // satisfy EventEmitter-ish type usage in tests
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
    addListener: vi.fn(),
    prependListener: vi.fn(),
    prependOnceListener: vi.fn(),
    removeListener: vi.fn(),
    setEncoding: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
  } as unknown as import("node:child_process").ChildProcess;
}

describe("runCleanupChain", () => {
  let tmpDir: string;
  let runDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cleanup-chain-test-${Date.now()}`);
    runDir = join(tmpDir, "runs", "run-001");
    mkdirSync(runDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // AC 5.1: All 5 resources cleaned successfully
  // -------------------------------------------------------------------------
  it("AC 5.1: kills child, deletes pid file, removes worktree, kills sleep process, deletes lock file", async () => {
    const pidFile = join(tmpDir, "child.pid");
    const lockFile = join(tmpDir, "run.lock");
    writeFileSync(pidFile, "12345");
    writeFileSync(lockFile, "locked");

    const child = makeChild();
    const sleepProcess = makeChild();

    const ctx: CleanupContext = {
      runId: "run-001",
      runDir,
      child,
      pidFile,
      worktreePath: "/tmp/fake-worktree",
      worktreeCleanupAction: "remove",
      sleepProcess,
      lockFile,
    };

    // Make existsSync return true for our pid and lock files
    vi.mocked(mockExistsSync).mockImplementation((p) => {
      if (p === pidFile || p === lockFile) return true;
      return false;
    });

    await runCleanupChain(ctx);

    // Step 1: child killed
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    // Step 2: pid file deleted
    expect(mockUnlinkSync).toHaveBeenCalledWith(pidFile);

    // Step 3: worktree removed
    expect(execFileSync).toHaveBeenCalledWith("git", ["worktree", "remove", "/tmp/fake-worktree"], {
      stdio: "pipe",
    });

    // Step 4: sleep process killed
    expect(sleepProcess.kill).toHaveBeenCalled();

    // Step 5: lock file deleted
    expect(mockUnlinkSync).toHaveBeenCalledWith(lockFile);

    // No errors written
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC 5.1 edge: worktreeCleanupAction='keep' skips worktree removal
  // -------------------------------------------------------------------------
  it("AC 5.1 edge: skips worktree removal when worktreeCleanupAction is 'keep'", async () => {
    const ctx: CleanupContext = {
      runId: "run-001",
      runDir,
      worktreePath: "/tmp/fake-worktree",
      worktreeCleanupAction: "keep",
    };

    await runCleanupChain(ctx);

    expect(execFileSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC 5.2: Worktree deletion failure — error logged to cleanup-errors.jsonl
  // -------------------------------------------------------------------------
  it("AC 5.2: logs worktree step error when execFileSync throws", async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("worktree removal failed");
    });

    const ctx: CleanupContext = {
      runId: "run-001",
      runDir,
      worktreePath: "/tmp/fake-worktree",
      worktreeCleanupAction: "remove",
    };

    // Should NOT throw
    await expect(runCleanupChain(ctx)).resolves.toBeUndefined();

    // Error was logged via appendFileSync
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(mockAppendFileSync).mock.calls[0];
    expect(callArgs[0]).toBe(join(runDir, "cleanup-errors.jsonl"));

    const record = JSON.parse(String(callArgs[1]).trim());
    expect(record.step).toBe("worktree");
    expect(record.error).toContain("worktree removal failed");
    expect(record.timestamp).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // AC 5.3: All 5 steps fail — 5 error records written
  // -------------------------------------------------------------------------
  it("AC 5.3: logs all 5 errors when every step fails", async () => {
    // Make child.kill throw
    const child = makeChild();
    child.kill = vi.fn(() => {
      throw new Error("child kill failed");
    });

    // existsSync returns true so unlinkSync is called, but unlinkSync throws
    vi.mocked(mockExistsSync).mockReturnValue(true);
    vi.mocked(mockUnlinkSync).mockImplementation(() => {
      throw new Error("unlink failed");
    });

    // execFileSync throws for worktree
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("worktree failed");
    });

    // sleep process kill throws
    const sleepProcess = makeChild();
    sleepProcess.kill = vi.fn(() => {
      throw new Error("sleep kill failed");
    });

    const pidFile = join(tmpDir, "child.pid");
    const lockFile = join(tmpDir, "run.lock");

    const ctx: CleanupContext = {
      runId: "run-001",
      runDir,
      child,
      pidFile,
      worktreePath: "/tmp/fake-worktree",
      worktreeCleanupAction: "remove",
      sleepProcess,
      lockFile,
    };

    await expect(runCleanupChain(ctx)).resolves.toBeUndefined();

    // Verify 5 error records were appended
    expect(mockAppendFileSync).toHaveBeenCalledTimes(5);

    const records = (
      mockAppendFileSync as unknown as { mock: { calls: string[][] } }
    ).mock.calls.map((call) => {
      const line = String(call[1]).trim();
      return JSON.parse(line);
    });

    const steps = records.map((r: { step: string }) => r.step);

    expect(steps).toContain("subprocess");
    expect(steps).toContain("pid_file");
    expect(steps).toContain("worktree");
    expect(steps).toContain("sleep_prevent");
    expect(steps).toContain("lock");

    // Each record has timestamp
    for (const r of records) {
      expect((r as { timestamp: string }).timestamp).toBeTruthy();
      expect((r as { error: string }).error).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // AC 5.3 edge: never throws, even with catastrophic failure
  // -------------------------------------------------------------------------
  it("never rejects even when appendFileSync itself throws", async () => {
    vi.mocked(mockExistsSync).mockReturnValue(true);
    vi.mocked(mockUnlinkSync).mockImplementation(() => {
      throw new Error("unlink failed");
    });
    vi.mocked(mockAppendFileSync).mockImplementation(() => {
      throw new Error("disk full");
    });

    const ctx: CleanupContext = {
      runId: "run-001",
      runDir,
      pidFile: join(tmpDir, "child.pid"),
      lockFile: join(tmpDir, "run.lock"),
    };

    // Should NOT throw — errors in error-logging are silently swallowed
    await expect(runCleanupChain(ctx)).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // AC 5.5: Static check — no forbidden references
  // -------------------------------------------------------------------------
  it("AC 5.5: cleanup-chain.ts does NOT reference bp(, WorkflowDispatcher, or auditWriter", async () => {
    const { readFileSync: readSrc } = await import("node:fs");
    const { resolve } = await import("node:path");
    const srcPath = resolve(__dirname, "../src/cleanup-chain.ts");
    const src = readSrc(srcPath, "utf-8");

    expect(src).not.toContain("bp(");
    expect(src).not.toContain("WorkflowDispatcher");
    expect(src).not.toContain("auditWriter");
  });
});
