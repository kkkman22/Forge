import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Module-level variable for dynamic mock injection
let _mockChild = null;
vi.mock("node:child_process", () => ({
    spawn: vi.fn(() => _mockChild),
}));
// Mock StreamJsonAdapter to avoid needing real readline on mock EventEmitter
vi.mock("../src/stream-json-adapter.js", () => ({
    StreamJsonAdapter: vi.fn().mockImplementation(() => ({
        consume: vi.fn().mockResolvedValue({
            delivered: [],
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
            costUsd: 0,
            lastEventType: null,
        }),
    })),
}));
// Import AFTER vi.mock so the module gets the mocks
import { CliSubprocessDriver } from "../src/cli-subprocess-driver.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMockChild() {
    const child = new EventEmitter();
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn((sig) => {
        if (sig === "SIGKILL")
            child.killed = true;
    });
    child.on = vi.fn((event, cb) => {
        child.addListener(event, cb);
        return child;
    });
    return {
        child,
        emitExit: (code) => child.emit("exit", code),
    };
}
describe("CliSubprocessDriver stuck timer + signal_chain.jsonl", () => {
    let runDir;
    let mockSpawnResult;
    beforeEach(() => {
        runDir = join(tmpdir(), `cli-driver-stuck-test-${Date.now()}`);
        mkdirSync(runDir, { recursive: true });
        mockSpawnResult = makeMockChild();
        _mockChild = mockSpawnResult.child;
    });
    afterEach(() => {
        rmSync(runDir, { recursive: true, force: true });
        _mockChild = null;
    });
    function makeConfig(overrides = {}) {
        return {
            cwd: "/tmp/project",
            runId: "run-stuck-001",
            runDir,
            permissionMode: "bypassPermissions",
            dangerouslySkipPermissions: true,
            maxTurns: 10,
            ...overrides,
        };
    }
    // -------------------------------------------------------------------------
    // AC 1.1 — stuck subprocess triggers SIGTERM after stuckTimeoutMs
    // -------------------------------------------------------------------------
    it("AC 1.1: sends SIGTERM when no stdout for stuckTimeoutMs", async () => {
        vi.useFakeTimers();
        const stuckTimeout = 60_000;
        const mockChild = mockSpawnResult.child;
        const driver = new CliSubprocessDriver(makeConfig({ stuckTimeoutMs: stuckTimeout }));
        const runPromise = driver.run("test prompt", "/tmp/project");
        // Fast-forward past the stuck timeout
        await vi.advanceTimersByTimeAsync(stuckTimeout + 1_000);
        expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
        // Clean up: emit exit so the run() promise resolves
        mockSpawnResult.emitExit(143);
        await runPromise;
        vi.useRealTimers();
    });
    // -------------------------------------------------------------------------
    // AC 1.2 — SIGKILL after 30s if process still alive after SIGTERM
    // -------------------------------------------------------------------------
    it("AC 1.2: sends SIGKILL 30s after SIGTERM if still alive", async () => {
        vi.useFakeTimers();
        const stuckTimeout = 60_000;
        const mockChild = mockSpawnResult.child;
        const driver = new CliSubprocessDriver(makeConfig({ stuckTimeoutMs: stuckTimeout }));
        const runPromise = driver.run("test prompt", "/tmp/project");
        // Fast-forward past stuck timeout → SIGTERM sent
        await vi.advanceTimersByTimeAsync(stuckTimeout + 1_000);
        expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
        // Process is still alive (killed = false). Advance 30s more → SIGKILL
        await vi.advanceTimersByTimeAsync(30_000);
        expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");
        // Clean up
        mockSpawnResult.emitExit(137);
        await runPromise;
        vi.useRealTimers();
    });
    // -------------------------------------------------------------------------
    // AC 1.3 — signal_chain.jsonl has correct entries after stuck timeout
    // -------------------------------------------------------------------------
    it("AC 1.3: signal_chain.jsonl records stuck_timeout entries with all 4 fields", async () => {
        vi.useFakeTimers();
        const stuckTimeout = 60_000;
        const _mockChild = mockSpawnResult.child;
        const driver = new CliSubprocessDriver(makeConfig({ stuckTimeoutMs: stuckTimeout }));
        const runPromise = driver.run("test prompt", "/tmp/project");
        // Trigger stuck timeout
        await vi.advanceTimersByTimeAsync(stuckTimeout + 1_000);
        // Wait 30s more for SIGKILL
        await vi.advanceTimersByTimeAsync(30_000);
        // Resolve the process
        mockSpawnResult.emitExit(137);
        await runPromise;
        // Read signal_chain.jsonl
        const signalChainPath = join(runDir, "signal_chain.jsonl");
        const content = readFileSync(signalChainPath, "utf-8");
        const lines = content.trim().split("\n");
        expect(lines.length).toBeGreaterThanOrEqual(1);
        for (const line of lines) {
            const entry = JSON.parse(line);
            expect(entry).toHaveProperty("signal");
            expect(entry).toHaveProperty("reason");
            expect(entry).toHaveProperty("elapsed_ms");
            expect(entry).toHaveProperty("timestamp");
            // Verify timestamp is valid ISO-8601
            expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
            // Verify reason is stuck_timeout
            expect(entry.reason).toBe("stuck_timeout");
            // Verify signal is one of the valid values
            expect(["SIGTERM", "SIGKILL", "SIGINT"]).toContain(entry.signal);
        }
        vi.useRealTimers();
    });
    // -------------------------------------------------------------------------
    // AC 1.6 — CliDriverConfig has stuckTimeoutMs optional field
    // -------------------------------------------------------------------------
    it("AC 1.6: CliDriverConfig accepts stuckTimeoutMs optional field", () => {
        // Type-level check: if this compiles, the interface has the field
        const configWithField = {
            cwd: "/tmp",
            runId: "r1",
            runDir: "/tmp/r1",
            permissionMode: "bypassPermissions",
            dangerouslySkipPermissions: false,
            maxTurns: 5,
            stuckTimeoutMs: 120_000,
        };
        expect(configWithField.stuckTimeoutMs).toBe(120_000);
        // Also valid without it (optional)
        const configWithoutField = {
            cwd: "/tmp",
            runId: "r2",
            runDir: "/tmp/r2",
            permissionMode: "bypassPermissions",
            dangerouslySkipPermissions: false,
            maxTurns: 5,
        };
        expect(configWithoutField.stuckTimeoutMs).toBeUndefined();
    });
    // -------------------------------------------------------------------------
    // Additional: stuck timer does NOT fire when stdout is flowing
    // -------------------------------------------------------------------------
    it("does not kill process when stdout is flowing within timeout", async () => {
        vi.useFakeTimers();
        const stuckTimeout = 60_000;
        const mockChild = mockSpawnResult.child;
        const driver = new CliSubprocessDriver(makeConfig({ stuckTimeoutMs: stuckTimeout }));
        const runPromise = driver.run("test prompt", "/tmp/project");
        // Simulate periodic stdout activity — every 30s for 3 minutes
        for (let i = 0; i < 6; i++) {
            await vi.advanceTimersByTimeAsync(30_000);
            mockChild.stdout.emit("data", Buffer.from('{"type":"heartbeat"}\n'));
        }
        // No kill should have been called
        expect(mockChild.kill).not.toHaveBeenCalled();
        // Clean up
        mockSpawnResult.emitExit(0);
        await runPromise;
        vi.useRealTimers();
    });
});
//# sourceMappingURL=cli-subprocess-driver-stuck.test.js.map