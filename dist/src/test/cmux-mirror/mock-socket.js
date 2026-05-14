import { mkdtempSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
const SUPPORTED_METHODS = new Set([
    "system.ping",
    "system.capabilities",
    "surface.send_text",
    "notification.create",
    "set_status",
    "set_progress",
    "log",
    "sidebar_state",
    "browser.identify",
]);
const METHOD_RESPONSES = {
    "system.ping": () => ({ pong: true }),
    "system.capabilities": () => ({
        methods: Array.from(SUPPORTED_METHODS),
    }),
    sidebar_state: () => ({ items: [] }),
    "browser.identify": () => ({
        workspace_ref: "workspace:1",
        surface_id: "surface:1",
    }),
};
function jsonResponse(id, result) {
    return `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`;
}
function errorResponse(id, code, message) {
    return `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`;
}
/**
 * Creates a mock cmux Unix socket server that records JSON-RPC requests.
 * Responds to supported methods with canned responses.
 */
export async function createMockSocket(opts = {}) {
    const socketPath = opts.socketPath ?? join(mkdtempSync(join(tmpdir(), "cmux-mock-")), "cmux.sock");
    const requests = [];
    const clients = new Set();
    const server = createServer((client) => {
        clients.add(client);
        client.on("close", () => clients.delete(client));
        let buffer = "";
        client.on("data", (data) => {
            buffer += data.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const req = JSON.parse(line);
                    requests.push(req);
                    if (SUPPORTED_METHODS.has(req.method)) {
                        const factory = METHOD_RESPONSES[req.method];
                        const result = factory ? factory() : {};
                        client.write(jsonResponse(req.id, result));
                    }
                    else {
                        client.write(errorResponse(req.id, -32601, `Method not found: ${req.method}`));
                    }
                }
                catch {
                    client.write(errorResponse(undefined, -32700, "Parse error"));
                }
            }
        });
    });
    await new Promise((resolve, reject) => {
        server.listen(socketPath, () => resolve());
        server.on("error", reject);
    });
    return {
        socketPath,
        requests,
        close: () => new Promise((resolve, reject) => {
            for (const c of clients)
                c.destroy();
            server.close((err) => {
                try {
                    unlinkSync(socketPath);
                }
                catch {
                    /* ignore */
                }
                if (err)
                    reject(err);
                else
                    resolve();
            });
        }),
    };
}
//# sourceMappingURL=mock-socket.js.map