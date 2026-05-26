import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CliDriverConfig, CliSubprocessDriver } from "../src/cli-subprocess-driver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<CliDriverConfig> = {}): CliDriverConfig {
  return {
    cwd: "/tmp/project",
    runId: "run-shutdown-001",
    runDir: "",
    permissionMode: "bypassPermissions",
    dangerouslySkipPermissions: true,
    maxTurns: 10,
    ...overrides,
  };
}

describe("CliSubprocessDriver shutdown signal chain (Task 2)", () => {
  let runDir: string;

  beforeEach(() => {
    runDir = join(tmpdir(), `cli-driver-shutdown-test-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // AC 1.4 — full shutdown: SIGINT → 10s → SIGTERM → 5s → SIGKILL
  // Child stays alive through all signals → 3 records in signal_chain.jsonl
  // -------------------------------------------------------------------------
  it("AC 1.4: records 3 signal_chain entries (SIGINT, SIGTERM, SIGKILL) with reason user_interrupt", async () => {
    const driver = new CliSubprocessDriver(makeConfig({ runDir }));

    const mockChild = {
      killed: false,
      kill: vi.fn((sig: string) => {
        // Only SIGKILL actually kills the child in this mock
        if (sig === "SIGKILL") mockChild.killed = true;
      }),
    };
    (driver as unknown as { child: unknown }).child = mockChild;
    // Set runStartTime so elapsed_ms is calculated correctly
    (driver as unknown as { runStartTime: number }).runStartTime = Date.now();

    vi.useFakeTimers();
    const shutdownPromise = driver.shutdown("SIGINT");

    // After SIGINT, wait 10s → SIGTERM
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");

    // After SIGTERM, wait 5s → SIGKILL
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

    vi.useRealTimers();
    await shutdownPromise;

    // Verify signal_chain.jsonl
    const signalChainPath = join(runDir, "signal_chain.jsonl");
    const content = readFileSync(signalChainPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);

    const entries = lines.map((l) => JSON.parse(l));

    // Signals in order
    expect(entries[0].signal).toBe("SIGINT");
    expect(entries[1].signal).toBe("SIGTERM");
    expect(entries[2].signal).toBe("SIGKILL");

    // All have reason user_interrupt
    for (const entry of entries) {
      expect(entry.reason).toBe("user_interrupt");
    }

    // All have required fields
    for (const entry of entries) {
      expect(entry).toHaveProperty("signal");
      expect(entry).toHaveProperty("reason");
      expect(entry).toHaveProperty("elapsed_ms");
      expect(entry).toHaveProperty("timestamp");
      // Valid ISO-8601
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    }
  });

  // -------------------------------------------------------------------------
  // AC 1.4 additional — elapsed_ms increases monotonically
  // -------------------------------------------------------------------------
  it("AC 1.4: elapsed_ms increases monotonically across signal chain entries", async () => {
    const driver = new CliSubprocessDriver(makeConfig({ runDir }));

    const mockChild = {
      killed: false,
      kill: vi.fn((sig: string) => {
        if (sig === "SIGKILL") mockChild.killed = true;
      }),
    };
    (driver as unknown as { child: unknown }).child = mockChild;
    (driver as unknown as { runStartTime: number }).runStartTime = Date.now();

    vi.useFakeTimers();
    const shutdownPromise = driver.shutdown("SIGINT");

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(5_000);

    vi.useRealTimers();
    await shutdownPromise;

    const signalChainPath = join(runDir, "signal_chain.jsonl");
    const content = readFileSync(signalChainPath, "utf-8");
    const entries = content.trim().split("\n").map((l) => JSON.parse(l));

    expect(entries.length).toBe(3);
    expect(entries[0].elapsed_ms).toBeLessThan(entries[1].elapsed_ms);
    expect(entries[1].elapsed_ms).toBeLessThan(entries[2].elapsed_ms);
  });

  // -------------------------------------------------------------------------
  // Negative — child exits after SIGINT, only 1 record written
  // -------------------------------------------------------------------------
  it("negative: if child exits after SIGINT, only 1 record is written (no further signals)", async () => {
    const driver = new CliSubprocessDriver(makeConfig({ runDir }));

    const mockChild = {
      killed: false,
      kill: vi.fn((sig: string) => {
        // SIGINT actually kills the child in this scenario
        if (sig === "SIGINT") mockChild.killed = true;
      }),
    };
    (driver as unknown as { child: unknown }).child = mockChild;
    (driver as unknown as { runStartTime: number }).runStartTime = Date.now();

    vi.useFakeTimers();
    const shutdownPromise = driver.shutdown("SIGINT");

    // Advance through both timeouts — child is already killed
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(5_000);

    vi.useRealTimers();
    await shutdownPromise;

    // kill should have been called only once (SIGINT)
    expect(mockChild.kill).toHaveBeenCalledTimes(1);
    expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");

    // signal_chain.jsonl should have exactly 1 entry
    const signalChainPath = join(runDir, "signal_chain.jsonl");
    const content = readFileSync(signalChainPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.signal).toBe("SIGINT");
    expect(entry.reason).toBe("user_interrupt");
  });
});
