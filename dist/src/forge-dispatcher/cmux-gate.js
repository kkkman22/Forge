import { statSync as fsStatSync } from "node:fs";
export const CMUX_GATED_SUBS = new Set([
    "forge-cmux-sidebar-sync",
    "forge-cmux-browser-qa",
    "forge-cmux-loop-signals",
]);
const ALLOWED_SOCKET_PREFIXES = ["/tmp/", "/var/tmp/"];
let stickyUnavailable = false;
function blocked(reason) {
    return {
        ok: false,
        code: "SKILL_UNAVAILABLE",
        reason,
        gate_result: "blocked",
        cmux_available: false,
    };
}
function cmuxAvailableShim(env, statSync) {
    if (stickyUnavailable)
        return blocked("sticky_unavailable");
    const integration = env.CMUX_INTEGRATION ?? "";
    if (integration === "off")
        return blocked("integration_off");
    if (env.CMUX_WORKSPACE_ID) {
        return { ok: true, gate_result: "go", cmux_available: true };
    }
    const socketPath = env.CMUX_SOCKET_PATH ?? "/tmp/cmux.sock";
    if (socketPath.includes(".."))
        return blocked("socket_path_invalid");
    if (env.CMUX_SOCKET_PATH && !ALLOWED_SOCKET_PREFIXES.some((p) => socketPath.startsWith(p))) {
        return blocked("socket_path_invalid");
    }
    try {
        const st = statSync(socketPath);
        if (!st.isSocket())
            return blocked("socket_not_socket");
        return { ok: true, gate_result: "go", cmux_available: true };
    }
    catch {
        return blocked("socket_missing");
    }
}
export function checkCmuxGate(sub, opts) {
    if (!CMUX_GATED_SUBS.has(sub)) {
        return { ok: true, gate_result: "n_a", cmux_available: null };
    }
    const env = opts?.env ?? process.env;
    const statSync = opts?.statSync ?? fsStatSync;
    const result = cmuxAvailableShim(env, statSync);
    if (!result.ok) {
        stickyUnavailable = true;
    }
    return result;
}
export function __resetGateForTest() {
    stickyUnavailable = false;
}
//# sourceMappingURL=cmux-gate.js.map