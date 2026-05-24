import type { statSync as StatSyncFn } from "node:fs";

export const CMUX_GATED_SUBS: ReadonlySet<string> = new Set([
  "forge-cmux-sidebar-sync",
  "forge-cmux-browser-qa",
  "forge-cmux-loop-signals",
] as const);

export type GateBlockReason =
  | "integration_off"
  | "socket_path_invalid"
  | "socket_missing"
  | "socket_not_socket"
  | "sticky_unavailable";

export type GateResult =
  | { ok: true; gate_result: "go" | "n_a"; cmux_available: boolean | null }
  | {
      ok: false;
      code: "SKILL_UNAVAILABLE";
      reason: GateBlockReason;
      gate_result: "blocked";
      cmux_available: false;
    };

export interface CmuxGateOpts {
  env?: NodeJS.ProcessEnv;
  statSync?: typeof StatSyncFn;
}

const ALLOWED_SOCKET_PREFIXES = ["/tmp/", "/var/tmp/"];

let stickyUnavailable = false;

function blocked(reason: GateBlockReason): GateResult {
  return {
    ok: false,
    code: "SKILL_UNAVAILABLE",
    reason,
    gate_result: "blocked",
    cmux_available: false,
  };
}

function cmuxAvailableShim(env: NodeJS.ProcessEnv, statSync: typeof StatSyncFn): GateResult {
  if (stickyUnavailable) return blocked("sticky_unavailable");

  const integration = env.CMUX_INTEGRATION ?? "";
  if (integration === "off") return blocked("integration_off");

  if (env.CMUX_WORKSPACE_ID) {
    return { ok: true, gate_result: "go", cmux_available: true };
  }

  const socketPath = env.CMUX_SOCKET_PATH ?? "/tmp/cmux.sock";
  if (socketPath.includes("..")) return blocked("socket_path_invalid");
  if (env.CMUX_SOCKET_PATH && !ALLOWED_SOCKET_PREFIXES.some((p) => socketPath.startsWith(p))) {
    return blocked("socket_path_invalid");
  }

  try {
    const st = statSync(socketPath);
    if (!st.isSocket()) return blocked("socket_not_socket");
    return { ok: true, gate_result: "go", cmux_available: true };
  } catch {
    return blocked("socket_missing");
  }
}

export function checkCmuxGate(sub: string, opts?: CmuxGateOpts): GateResult {
  if (!CMUX_GATED_SUBS.has(sub)) {
    return { ok: true, gate_result: "n_a", cmux_available: null };
  }

  const env = opts?.env ?? process.env;
  const statSync = opts?.statSync ?? require("node:fs").statSync;
  const result = cmuxAvailableShim(env, statSync);

  if (!result.ok) {
    stickyUnavailable = true;
  }
  return result;
}

export function __resetGateForTest(): void {
  stickyUnavailable = false;
}
