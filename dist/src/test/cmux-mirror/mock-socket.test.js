import { createConnection } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createMockSocket } from "./mock-socket";
let mock = null;
afterEach(async () => {
    if (mock) {
        await mock.close();
        mock = null;
    }
});
function sendJsonRpc(sock, msg) {
    sock.write(`${JSON.stringify(msg)}\n`);
}
describe("mock-socket", () => {
    it("creates a Unix socket server and accepts connections", async () => {
        mock = await createMockSocket();
        expect(mock.socketPath).toBeTruthy();
        const sock = createConnection(mock.socketPath);
        await new Promise((resolve) => sock.on("connect", resolve));
        sock.destroy();
    });
    it("records JSON-RPC requests and responds to supported methods", async () => {
        mock = await createMockSocket();
        const sock = createConnection(mock.socketPath);
        await new Promise((resolve) => sock.on("connect", resolve));
        const received = [];
        sock.on("data", (d) => received.push(d.toString()));
        sendJsonRpc(sock, { jsonrpc: "2.0", id: 1, method: "system.ping" });
        sendJsonRpc(sock, {
            jsonrpc: "2.0",
            id: 2,
            method: "set_status",
            params: { key: "forge.phase", value: "build" },
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mock.requests).toHaveLength(2);
        expect(mock.requests[0].method).toBe("system.ping");
        expect(mock.requests[1].method).toBe("set_status");
        const combined = received.join("");
        expect(combined).toContain('"pong":true');
        expect(combined).toContain('"id":2');
        sock.destroy();
    });
    it("returns method-not-found for unsupported methods", async () => {
        mock = await createMockSocket();
        const sock = createConnection(mock.socketPath);
        await new Promise((resolve) => sock.on("connect", resolve));
        const received = [];
        sock.on("data", (d) => received.push(d.toString()));
        sendJsonRpc(sock, { jsonrpc: "2.0", id: 99, method: "unknown.method" });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const combined = received.join("");
        expect(combined).toContain("-32601");
        sock.destroy();
    });
    it("handles malformed JSON gracefully", async () => {
        mock = await createMockSocket();
        const sock = createConnection(mock.socketPath);
        await new Promise((resolve) => sock.on("connect", resolve));
        const received = [];
        sock.on("data", (d) => received.push(d.toString()));
        sock.write("not json\n");
        await new Promise((resolve) => setTimeout(resolve, 100));
        const combined = received.join("");
        expect(combined).toContain("-32700");
        sock.destroy();
    });
    it("close cleans up socket file", async () => {
        mock = await createMockSocket();
        const { socketPath, close } = mock;
        await close();
        mock = null;
        const { existsSync } = await import("node:fs");
        expect(existsSync(socketPath)).toBe(false);
    });
});
//# sourceMappingURL=mock-socket.test.js.map