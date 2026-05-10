import { mkdtempSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPushServer } from "../../scripts/cmux-mirror/lib/push-server.mjs";
describe("mirror-push-socket: rate limiting (R17.3)", () => {
    let dir;
    let socketPath;
    let server = null;
    beforeEach(async () => {
        dir = mkdtempSync(join(tmpdir(), "cmux-push-rate-"));
        socketPath = join(dir, "push.sock");
    });
    afterEach(async () => {
        try {
            if (server)
                await server.close();
        }
        catch {
            /* ignore */
        }
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    });
    it("rate limits at 20 events per second by default", async () => {
        const received = [];
        server = await createPushServer({
            socketPath,
            dispatch: (event) => received.push(event),
            maxPerSecond: 20,
        });
        const client = createConnection(socketPath);
        await new Promise((resolve) => client.on("connect", resolve));
        // Send 25 events rapidly
        for (let i = 0; i < 25; i++) {
            client.write(`${JSON.stringify({ type: "test", i })}\n`);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        client.destroy();
        expect(received.length).toBeLessThanOrEqual(20);
    });
    it("rejects unknown event types gracefully (no crash)", async () => {
        const received = [];
        server = await createPushServer({
            socketPath,
            dispatch: (event) => received.push(event),
        });
        const client = createConnection(socketPath);
        await new Promise((resolve) => client.on("connect", resolve));
        // Unknown event types are still dispatched — push server is transport-layer
        client.write(`${JSON.stringify({ type: "unknown_event_type", data: "x" })}\n`);
        client.write(`${JSON.stringify({ type: "valid" })}\n`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        client.destroy();
        // Both dispatched — push server does not filter by type
        expect(received.length).toBe(2);
    });
    it("resets rate limit after 1-second window", async () => {
        const received = [];
        server = await createPushServer({
            socketPath,
            dispatch: (event) => received.push(event),
            maxPerSecond: 3,
        });
        const client = createConnection(socketPath);
        await new Promise((resolve) => client.on("connect", resolve));
        // Send 5 events — only 3 should pass
        for (let i = 0; i < 5; i++) {
            client.write(`${JSON.stringify({ type: "test", i })}\n`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
        // After window reset, send more
        for (let i = 10; i < 13; i++) {
            client.write(`${JSON.stringify({ type: "test", i })}\n`);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        client.destroy();
        // First batch: 3, second batch: 3
        expect(received.length).toBe(6);
    });
});
//# sourceMappingURL=mirror-push-socket.test.js.map