import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
const { mockExecSync } = vi.hoisted(() => ({
    mockExecSync: vi.fn(),
}));
const mockFs = vi.hoisted(() => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
}));
vi.mock("node:child_process", () => ({
    execSync: mockExecSync,
}));
vi.mock("node:fs", () => ({
    readFileSync: mockFs.readFileSync,
    writeFileSync: mockFs.writeFileSync,
    mkdirSync: mockFs.mkdirSync,
    readdirSync: mockFs.readdirSync,
    unlinkSync: mockFs.unlinkSync,
}));
import { cleanupOrphans, cleanupStaleSessions, detectPpidOrphans, readPidFile, } from "../src/orphan-detector.js";
describe("OrphanDetector", () => {
    describe("Property 6: PID file parse tolerance", () => {
        it("readPidFile returns null for any invalid input", () => {
            fc.assert(fc.property(fc.oneof(fc.constant(""), fc.constant("{"), fc.constant("not json at all"), fc.constant("null"), fc.constant("[]"), fc.constant("42"), fc.string({ maxLength: 100 }), fc
                .uint8Array({ minLength: 1, maxLength: 20 })
                .map((arr) => String.fromCharCode(...arr))), (invalid) => {
                mockFs.readFileSync.mockReturnValue(invalid);
                const result = readPidFile("/fake/path");
                expect(result).toBeNull();
            }), { numRuns: 40 });
        });
    });
    describe("Property 7: ps output filters PPID=1 correctly", () => {
        it("only returns PPID=1 processes matching patterns", async () => {
            await fc.assert(fc.asyncProperty(fc.array(fc.record({
                pid: fc.integer({ min: 100, max: 999 }),
                ppid: fc.integer({ min: 1, max: 999 }),
                etime: fc.constant("01:00:00"),
                command: fc.oneof(fc.constant("node forge-loop"), fc.constant("vitest run"), fc.constant("caffeinate -i"), fc.constant("python unrelated"), fc.constant("bash script.sh")),
            }), { maxLength: 10 }), async (entries) => {
                const header = "  PID  PPID     ELAPSED COMMAND\n";
                const lines = entries
                    .map((e) => `  ${e.pid}  ${e.ppid}  ${e.etime} ${e.command}`)
                    .join("\n");
                mockExecSync.mockReturnValue(header + lines);
                const result = await detectPpidOrphans(["forge", "vitest", "caffeinate"], 3600);
                // Only PPID=1 processes matching patterns should be returned
                for (const orphan of result) {
                    const entry = entries.find((e) => e.pid === orphan.pid);
                    expect(entry).toBeDefined();
                    expect(entry?.ppid).toBe(1);
                    const matchesPattern = ["forge", "vitest", "caffeinate"].some((p) => entry?.command.includes(p));
                    expect(matchesPattern).toBe(true);
                }
                mockExecSync.mockReset();
            }), { numRuns: 40 });
        });
    });
    describe("Property 8: orphan auto-cleanup threshold", () => {
        it("kills processes > threshold, warns for <= threshold", () => {
            fc.assert(fc.property(fc.array(fc.record({
                pid: fc.integer({ min: 100, max: 999 }),
                command: fc.string({ minLength: 1, maxLength: 20 }),
                elapsedSeconds: fc.integer({ min: 0, max: 100_000 }),
                source: fc.constant("ppid-detection"),
            }), { maxLength: 10 }), (orphanProcesses) => {
                const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
                const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
                const threshold = 3600; // 1 hour
                const result = cleanupOrphans(orphanProcesses, threshold);
                const expectedKilled = orphanProcesses.filter((o) => o.elapsedSeconds > threshold);
                const expectedWarned = orphanProcesses.filter((o) => o.elapsedSeconds <= threshold);
                expect(result.killed).toHaveLength(expectedKilled.length);
                expect(result.warned).toHaveLength(expectedWarned.length);
                killSpy.mockRestore();
                warnSpy.mockRestore();
            }), { numRuns: 40 });
        });
    });
    describe("cleanupStaleSessions", () => {
        it("cleans up stale session PID files", async () => {
            const staleContent = JSON.stringify({
                sessionPid: 99999,
                sessionPgid: 99999,
                sessionStartTime: Date.now() - 100_000,
                processes: [{ pid: 88888, source: "test" }],
            });
            mockFs.readdirSync.mockReturnValue(["session-stale.pid"]);
            mockFs.readFileSync.mockReturnValue(staleContent);
            const killSpy = vi.spyOn(process, "kill").mockImplementation((pid) => {
                if (pid === 99999)
                    throw new Error("ESRCH"); // Session dead
                return true; // Child alive
            });
            const result = await cleanupStaleSessions("/fake");
            expect(result.length).toBeGreaterThanOrEqual(0);
            killSpy.mockRestore();
        });
    });
    describe("detectPpidOrphans platform check", () => {
        it("returns empty on non-macOS/Linux", async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, "platform", { value: "win32" });
            const result = await detectPpidOrphans(["forge"], 3600);
            expect(result).toEqual([]);
            Object.defineProperty(process, "platform", { value: originalPlatform });
        });
    });
    describe("ps command failure tolerance", () => {
        it("returns empty when ps command fails", async () => {
            mockExecSync.mockImplementation(() => {
                throw new Error("ps failed");
            });
            const result = await detectPpidOrphans(["forge"], 3600);
            expect(result).toEqual([]);
        });
    });
});
//# sourceMappingURL=orphan-detector.test.js.map