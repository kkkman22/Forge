// biome-ignore lint/correctness/noUnusedVariables: used by consumers
const DEFAULT_PORT = 5173;
const TIMEOUT_MS = 5 * 60 * 1000;
export function buildStartCommand(port) {
    return `npm run dev -- --port ${port}`;
}
export function parseTerminalId(output) {
    const match = output.match(/terminal_id[=:]\s*(\S+)/);
    return match ? match[1] : null;
}
export function isTimeoutElapsed(startTime, timeoutMs = TIMEOUT_MS) {
    return Date.now() - startTime >= timeoutMs;
}
export async function withDevServer(startFn, stopFn, workFn) {
    const handle = await startFn();
    const startTime = Date.now();
    try {
        if (isTimeoutElapsed(startTime)) {
            throw new Error("Dev server startup exceeded 5-minute timeout");
        }
        return await workFn(handle);
    }
    finally {
        await stopFn(handle);
    }
}
//# sourceMappingURL=dev-server-lifecycle.js.map