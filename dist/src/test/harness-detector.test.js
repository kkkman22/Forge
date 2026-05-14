/**
 * Tests for harness-detector.ts — tier detection functions.
 *
 * Covers shared detection logic for CLI and UI harnesses:
 *   - detectCmuxAvailable(): env var + socket check, 1s timeout
 *   - detectTmuxAvailable(): which tmux
 *   - detectProjectHarness(kind): glob for project test files
 *
 * **Validates: Requirements R5.2, R6.2, R14.3, R14.4**
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectCmuxAvailable, detectProjectHarness, detectTmuxAvailable, } from "../src/harness-detector.js";
let testDir;
describe("harness-detector [R5.2, R6.2, R14.3, R14.4]", () => {
    afterEach(() => {
        if (testDir) {
            try {
                rmSync(testDir, { recursive: true, force: true });
            }
            catch {
                /* */
            }
        }
    });
    // ---------------------------------------------------------------------------
    // detectCmuxAvailable
    // ---------------------------------------------------------------------------
    describe("detectCmuxAvailable", () => {
        it("returns false when CMUX_WORKSPACE_ID is not set", async () => {
            const orig = process.env.CMUX_WORKSPACE_ID;
            delete process.env.CMUX_WORKSPACE_ID;
            const result = await detectCmuxAvailable();
            expect(result).toBe(false);
            if (orig)
                process.env.CMUX_WORKSPACE_ID = orig;
        });
        it("returns false when socket does not exist", async () => {
            const orig = process.env.CMUX_WORKSPACE_ID;
            const origSocket = process.env.CMUX_SOCKET_PATH;
            process.env.CMUX_WORKSPACE_ID = "test-workspace";
            process.env.CMUX_SOCKET_PATH = "/tmp/nonexistent-cmux-test-socket";
            const result = await detectCmuxAvailable();
            expect(result).toBe(false);
            if (orig)
                process.env.CMUX_WORKSPACE_ID = orig;
            else
                delete process.env.CMUX_WORKSPACE_ID;
            if (origSocket)
                process.env.CMUX_SOCKET_PATH = origSocket;
            else
                delete process.env.CMUX_SOCKET_PATH;
        });
        it("resolves within 1 second even when socket is missing", async () => {
            const orig = process.env.CMUX_WORKSPACE_ID;
            delete process.env.CMUX_WORKSPACE_ID;
            const start = Date.now();
            await detectCmuxAvailable();
            const elapsed = Date.now() - start;
            expect(elapsed).toBeLessThan(1500);
            if (orig)
                process.env.CMUX_WORKSPACE_ID = orig;
        });
        it("never throws", async () => {
            const orig = process.env.CMUX_WORKSPACE_ID;
            const origSocket = process.env.CMUX_SOCKET_PATH;
            process.env.CMUX_WORKSPACE_ID = "test-never-throws";
            process.env.CMUX_SOCKET_PATH = "/tmp/nonexistent-socket-for-test";
            await expect(detectCmuxAvailable()).resolves.toBe(false);
            if (orig)
                process.env.CMUX_WORKSPACE_ID = orig;
            else
                delete process.env.CMUX_WORKSPACE_ID;
            if (origSocket)
                process.env.CMUX_SOCKET_PATH = origSocket;
            else
                delete process.env.CMUX_SOCKET_PATH;
        });
    });
    // ---------------------------------------------------------------------------
    // detectTmuxAvailable
    // ---------------------------------------------------------------------------
    describe("detectTmuxAvailable", () => {
        it("returns a boolean", () => {
            const result = detectTmuxAvailable();
            expect(typeof result).toBe("boolean");
        });
        it("never throws", () => {
            expect(() => detectTmuxAvailable()).not.toThrow();
        });
    });
    // ---------------------------------------------------------------------------
    // detectProjectHarness
    // ---------------------------------------------------------------------------
    describe("detectProjectHarness", () => {
        it("returns null when no test files exist", async () => {
            testDir = join(tmpdir(), `forge-harness-detect-${Date.now()}`);
            mkdirSync(testDir, { recursive: true });
            const result = await detectProjectHarness("cli", testDir);
            expect(result).toBeNull();
        });
        it("detects e2e spec files for CLI kind", async () => {
            testDir = join(tmpdir(), `forge-harness-cli-${Date.now()}`);
            const e2eDir = join(testDir, "test", "e2e");
            mkdirSync(e2eDir, { recursive: true });
            writeFileSync(join(e2eDir, "app.spec.ts"), "test");
            const result = await detectProjectHarness("cli", testDir);
            expect(result).not.toBeNull();
            expect(result).toContain("app.spec.ts");
        });
        it("detects playwright config for UI kind", async () => {
            testDir = join(tmpdir(), `forge-harness-ui-${Date.now()}`);
            mkdirSync(testDir, { recursive: true });
            writeFileSync(join(testDir, "playwright.config.ts"), "export default {}");
            const result = await detectProjectHarness("ui", testDir);
            expect(result).not.toBeNull();
            expect(result).toContain("playwright.config");
        });
        it("detects cypress config for UI kind", async () => {
            testDir = join(tmpdir(), `forge-harness-cy-${Date.now()}`);
            mkdirSync(testDir, { recursive: true });
            writeFileSync(join(testDir, "cypress.config.ts"), "export default {}");
            const result = await detectProjectHarness("ui", testDir);
            expect(result).not.toBeNull();
            expect(result).toContain("cypress.config");
        });
        it("never throws on invalid directory", async () => {
            await expect(detectProjectHarness("cli", "/nonexistent/path")).resolves.toBeNull();
        });
    });
});
//# sourceMappingURL=harness-detector.test.js.map