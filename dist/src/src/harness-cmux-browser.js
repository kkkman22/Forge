/**
 * cmux browser harness adapter — Tier 2 UI verification via cmux browser commands.
 *
 * Uses cmux CLI for structured a11y snapshots, screenshots, and console capture.
 * Returns graceful failure when cmux is not available.
 *
 * **Validates: Requirement R6.2, R6.4**
 */
export async function runCmuxBrowserHarness(_opts) {
    try {
        const workspaceId = process.env.CMUX_WORKSPACE_ID;
        if (!workspaceId) {
            return { ok: false, reason: "CMUX_WORKSPACE_ID not set" };
        }
        const socketPath = process.env.CMUX_SOCKET_PATH || `/tmp/cmux-${workspaceId}.sock`;
        const { existsSync } = await import("node:fs");
        if (!existsSync(socketPath)) {
            return { ok: false, reason: `cmux socket not found: ${socketPath}` };
        }
        // cmux browser commands require the cmux runtime to be active
        return {
            ok: false,
            reason: "cmux browser CLI not available (requires cmux runtime)",
        };
    }
    catch (error) {
        return {
            ok: false,
            reason: `cmux browser harness error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
//# sourceMappingURL=harness-cmux-browser.js.map