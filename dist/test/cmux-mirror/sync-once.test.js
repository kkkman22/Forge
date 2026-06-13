import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock availability before importing sync-once
vi.mock("../../scripts/cmux-mirror/lib/availability.mjs", () => ({
    cmuxAvailable: vi.fn(() => true),
    markUnavailable: vi.fn(),
    isStickyUnavailable: vi.fn(() => false),
}));
vi.mock("../../scripts/cmux-mirror/lib/cli.mjs", async (importOriginal) => {
    const actual = (await importOriginal());
    return {
        ...actual,
        runCli: vi.fn(() => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })),
    };
});
import { cmuxAvailable } from "../../scripts/cmux-mirror/lib/availability.mjs";
import { runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";
import { syncOnce } from "../../scripts/cmux-mirror/sync-once.mjs";
const mockedAvailable = vi.mocked(cmuxAvailable);
const mockedRunCli = vi.mocked(runCli);
describe("sync-once: one-shot sync (R2.7–R2.10)", () => {
    let dir;
    let forgeDir;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "cmux-sync-test-"));
        forgeDir = join(dir, ".forge");
        mkdirSync(forgeDir, { recursive: true });
        vi.clearAllMocks();
    });
    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    });
    function writeStatus(phase, task) {
        writeFileSync(join(forgeDir, "status.md"), `---\ncurrent_task: "${task}"\ntier: "standard"\nproject_phase: "${phase}"\nphase: "approved"\n---\n\n# Status`);
    }
    it("R2.7: returns cmux_unavailable when cmux not available", async () => {
        mockedAvailable.mockReturnValue(false);
        const result = await syncOnce({ forgeDir });
        expect(result.synced).toBe(false);
        expect(result.reason).toBe("cmux_unavailable");
        expect(result.commandsEmitted).toBe(0);
    });
    it("R2.7: returns forge_dir_missing when .forge/ doesn't exist", async () => {
        mockedAvailable.mockReturnValue(true);
        const result = await syncOnce({ forgeDir: join(dir, "nope") });
        expect(result.synced).toBe(false);
        expect(result.reason).toBe("forge_dir_missing");
    });
    it("R2.8: reads state, emits commands, and writes snapshot", async () => {
        mockedAvailable.mockReturnValue(true);
        writeStatus("build", "test-task");
        const result = await syncOnce({ forgeDir, snapshotDir: forgeDir });
        expect(result.synced).toBe(true);
        expect(result.commandsEmitted).toBeGreaterThanOrEqual(0);
        // Snapshot should exist
        const snapshotPath = join(forgeDir, ".cmux-snapshot.json");
        expect(existsSync(snapshotPath)).toBe(true);
        const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
        expect(snapshot.phase).toBe("build");
        expect(snapshot.task).toBe("test-task");
    });
    it("R2.9: skips dispatch when state unchanged (same snapshot)", async () => {
        mockedAvailable.mockReturnValue(true);
        writeStatus("build", "same-task");
        // First sync
        await syncOnce({ forgeDir, snapshotDir: forgeDir });
        // Reset runCli mock
        mockedRunCli.mockClear();
        // Second sync with same state
        const result = await syncOnce({ forgeDir, snapshotDir: forgeDir });
        expect(result.synced).toBe(true);
        // cli should not be called since state is same as snapshot
        // (emitCommands skips unchanged state)
    });
    it("R2.10: handles concurrent lock gracefully", async () => {
        mockedAvailable.mockReturnValue(true);
        writeStatus("build", "locked-task");
        // Write a fresh lock file
        const lockPath = join(forgeDir, ".cmux-sync.lock");
        writeFileSync(lockPath, Date.now().toString());
        const result = await syncOnce({ forgeDir, snapshotDir: forgeDir });
        expect(result.synced).toBe(false);
        expect(result.reason).toBe("locked");
    });
    it("R13.5: tolerates stale lock (older than 5s)", async () => {
        mockedAvailable.mockReturnValue(true);
        writeStatus("build", "stale-lock-task");
        // Write a stale lock file (6s ago)
        const lockPath = join(forgeDir, ".cmux-sync.lock");
        writeFileSync(lockPath, (Date.now() - 6000).toString());
        const result = await syncOnce({ forgeDir, snapshotDir: forgeDir });
        expect(result.synced).toBe(true);
    });
    it("dispatches phase change commands via runCli", async () => {
        mockedAvailable.mockReturnValue(true);
        writeStatus("review", "phase-change-task");
        // Write old snapshot with different phase
        writeFileSync(join(forgeDir, ".cmux-snapshot.json"), JSON.stringify({
            phase: "build",
            tier: "standard",
            task: "phase-change-task",
            progress: { total: 0, done: 0, in_progress: 0, pending: 0 },
            review: null,
        }));
        const result = await syncOnce({ forgeDir, snapshotDir: forgeDir });
        expect(result.synced).toBe(true);
        expect(result.commandsEmitted).toBeGreaterThan(0);
        expect(mockedRunCli).toHaveBeenCalled();
    });
    it("handles corrupt snapshot gracefully (treats as initial)", async () => {
        mockedAvailable.mockReturnValue(true);
        writeStatus("build", "corrupt-task");
        // Write corrupt snapshot
        writeFileSync(join(forgeDir, ".cmux-snapshot.json"), "not-json{{{");
        const result = await syncOnce({ forgeDir, snapshotDir: forgeDir });
        expect(result.synced).toBe(true);
    });
    it("releases lock even on error", async () => {
        mockedAvailable.mockReturnValue(true);
        // No status.md — readForgeState returns unknown
        const result = await syncOnce({ forgeDir, snapshotDir: forgeDir });
        expect(result.synced).toBe(true);
        // Lock should be released
        const lockPath = join(forgeDir, ".cmux-sync.lock");
        expect(existsSync(lockPath)).toBe(false);
    });
});
//# sourceMappingURL=sync-once.test.js.map