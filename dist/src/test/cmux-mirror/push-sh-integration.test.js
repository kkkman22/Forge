import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockSocket } from "./mock-socket";
const execAsync = promisify(execFile);
const pushShPath = join(process.cwd(), "scripts", "cmux-mirror", "push.sh");
describe("push.sh: integration via mock socket", () => {
    let dir;
    let mock = null;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "cmux-push-sh-int-"));
    });
    afterEach(async () => {
        if (mock) {
            await mock.close();
            mock = null;
        }
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    });
    it("exits 0 when socket missing", async () => {
        const ghostSocket = join(dir, "no-such.sock");
        const { stdout, stderr } = await execAsync("bash", [
            pushShPath,
            ghostSocket,
            '{"type":"resync_now"}',
        ]);
        expect(stdout).toBe("");
        expect(stderr).toContain("socket not found");
    });
    it("sends JSON when socket exists", async () => {
        mock = await createMockSocket({ socketPath: join(dir, "cmux.sock") });
        const payload = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "notification.create",
            params: { message: "resync triggered" },
        });
        await execAsync("bash", [pushShPath, mock.socketPath, payload], {
            timeout: 5000,
        });
        // Give the server a moment to record the request
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(mock.requests.length).toBeGreaterThanOrEqual(1);
        expect(mock.requests[0].method).toBe("notification.create");
        expect(mock.requests[0].params).toEqual({ message: "resync triggered" });
    });
});
//# sourceMappingURL=push-sh-integration.test.js.map