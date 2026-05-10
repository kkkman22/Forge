/**
 * cmux harness adapter — Tier 2 CLI verification via cmux.
 *
 * Sends commands through cmux socket/CLI. Returns graceful failure
 * when cmux is not available.
 *
 * **Validates: Requirement R5.2, R5.4**
 */
export async function runCmuxHarness(_opts) {
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
        // cmux is available but actual command execution requires cmux CLI API
        // which may not be present in test environments
        return {
            ok: false,
            reason: "cmux CLI execution not implemented (requires cmux runtime)",
        };
    }
    catch (error) {
        return {
            ok: false,
            reason: `cmux harness error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
//# sourceMappingURL=harness-cmux.js.map