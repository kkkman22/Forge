#!/usr/bin/env node
/**
 * Hook stdin router — classifies whether a hook invocation is from the main agent
 * or a subagent by parsing stdin JSON per Claude Code's hook protocol.
 *
 * @see https://code.claude.com/docs/en/hooks#common-input-fields
 *
 * category: internal-only
 */
/** @typedef {"main"|"subagent"|"unknown"} CallerKind */
/** @typedef {{ shouldInject: boolean, callerKind: CallerKind, agentType?: string }} RouterDecision */
const STDIN_TIMEOUT_MS = 500;
const STDIN_MAX_BYTES = 65536;
/**
 * Read all available chunks from stdin with a timeout.
 * @param {number} timeoutMs
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
function readStdin(timeoutMs = STDIN_TIMEOUT_MS, maxBytes = STDIN_MAX_BYTES) {
    return new Promise((resolve) => {
        const chunks = [];
        let totalLen = 0;
        const stdin = process.stdin;
        const timer = setTimeout(() => {
            cleanup();
            resolve(Buffer.concat(chunks, totalLen));
        }, timeoutMs);
        function cleanup() {
            clearTimeout(timer);
            try {
                stdin.removeAllListeners("data");
                stdin.removeAllListeners("end");
                stdin.removeAllListeners("error");
                stdin.pause();
            }
            catch {
                // Best effort
            }
        }
        function finish() {
            cleanup();
            resolve(Buffer.concat(chunks, totalLen));
        }
        stdin.on("data", (chunk) => {
            totalLen += chunk.length;
            if (totalLen > maxBytes) {
                // Exceeded max — stop reading, will fail-safe
                cleanup();
                resolve(Buffer.alloc(0));
                return;
            }
            chunks.push(chunk);
        });
        stdin.on("end", () => {
            finish();
        });
        stdin.on("error", () => {
            finish();
        });
        // If stdin is not a pipe (TTY or closed), resolve immediately
        if (stdin.isTTY) {
            cleanup();
            resolve(Buffer.alloc(0));
        }
        else {
            stdin.resume();
        }
    });
}
/**
 * Classify hook caller based on stdin JSON.
 * Never throws — all errors go to fail-safe (callerKind "unknown").
 *
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=500]
 * @param {number} [opts.maxBytes=65536]
 * @param {string} [opts._testStdin] - Test override: raw JSON string to parse instead of reading stdin
 * @returns {Promise<RouterDecision>}
 */
export async function classifyHookCaller(opts = {}) {
    const { timeoutMs = STDIN_TIMEOUT_MS, maxBytes = STDIN_MAX_BYTES, _testStdin, } = opts;
    const unknown = { shouldInject: false, callerKind: "unknown" };
    try {
        let buf;
        if (_testStdin !== undefined && _testStdin !== "") {
            // Test path: use provided string directly
            buf = Buffer.from(_testStdin, "utf-8");
            if (buf.length > maxBytes) {
                return unknown;
            }
        }
        else {
            buf = await readStdin(timeoutMs, maxBytes);
        }
        if (buf.length === 0) {
            return unknown;
        }
        let obj;
        try {
            obj = JSON.parse(buf.toString("utf-8"));
        }
        catch {
            return unknown;
        }
        if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
            return unknown;
        }
        // Detect subagent: agent_id present and non-empty
        if (obj.agent_id != null && obj.agent_id !== "") {
            return {
                shouldInject: false,
                callerKind: "subagent",
                ...(obj.agent_type ? { agentType: String(obj.agent_type) } : {}),
            };
        }
        // Detect main agent: has hook_event_name field
        if ("hook_event_name" in obj) {
            return { shouldInject: true, callerKind: "main" };
        }
        // Has JSON but missing both identifying fields
        return unknown;
    }
    catch {
        return unknown;
    }
}
/**
 * Convenience: returns true when caller is NOT main agent (subagent or unknown).
 * Use at hook script entry for early short-circuit:
 *   if (await shouldSkipForSubagent()) process.exit(0);
 *
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export async function shouldSkipForSubagent(opts = {}) {
    const decision = await classifyHookCaller(opts);
    return !decision.shouldInject;
}
//# sourceMappingURL=hook-stdin-router.mjs.map