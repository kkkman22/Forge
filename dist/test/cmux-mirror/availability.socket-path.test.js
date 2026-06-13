import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, cmuxAvailable } from "../../scripts/cmux-mirror/lib/availability.mjs";
import { createMockSocket } from "./mock-socket";
describe("availability: cmux 0.64.x socket resolution", () => {
    let origEnv;
    let mocks;
    let dirs;
    beforeEach(() => {
        origEnv = { ...process.env };
        mocks = [];
        dirs = [];
        __resetForTest();
    });
    afterEach(async () => {
        for (const m of mocks) {
            try {
                await m.close();
            }
            catch {
                /* ignore */
            }
        }
        for (const d of dirs) {
            try {
                rmSync(d, { recursive: true, force: true });
            }
            catch {
                /* ignore */
            }
        }
        process.env = origEnv;
        __resetForTest();
    });
    it("resolves the socket from <CMUX_STATE_DIR>/last-socket-path", async () => {
        const stateDir = mkdtempSync(join(tmpdir(), "cmux-state-"));
        dirs.push(stateDir);
        const sockPath = join(stateDir, "cmux.sock");
        const mock = await createMockSocket({ socketPath: sockPath });
        mocks.push(mock);
        writeFileSync(join(stateDir, "last-socket-path"), sockPath);
        process.env.CMUX_STATE_DIR = stateDir;
        delete process.env.CMUX_SOCKET_PATH;
        delete process.env.CMUX_WORKSPACE_ID;
        expect(cmuxAvailable()).toBe(true);
    });
    it("accepts an explicit CMUX_SOCKET_PATH outside /tmp (e.g. macOS $TMPDIR)", async () => {
        const mock = await createMockSocket(); // socket lives under /var/folders/... on macOS
        mocks.push(mock);
        process.env.CMUX_SOCKET_PATH = mock.socketPath;
        delete process.env.CMUX_WORKSPACE_ID;
        expect(cmuxAvailable()).toBe(true);
    });
    it("rejects a traversal path override", () => {
        delete process.env.CMUX_WORKSPACE_ID;
        process.env.CMUX_SOCKET_PATH = "../../../etc/passwd";
        expect(cmuxAvailable()).toBe(false);
    });
    it("rejects a relative path override", () => {
        delete process.env.CMUX_WORKSPACE_ID;
        process.env.CMUX_SOCKET_PATH = "cmux.sock";
        expect(cmuxAvailable()).toBe(false);
    });
    it("returns false for an absolute path that is not a socket", () => {
        delete process.env.CMUX_WORKSPACE_ID;
        process.env.CMUX_SOCKET_PATH = "/tmp/definitely-not-a-cmux-socket-12345";
        expect(cmuxAvailable()).toBe(false);
    });
});
//# sourceMappingURL=availability.socket-path.test.js.map