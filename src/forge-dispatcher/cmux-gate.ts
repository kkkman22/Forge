import type { statSync as StatSyncFn } from "node:fs";
import { statSync as fsStatSync } from "node:fs";

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
  /** Monotonic clock for TTL expiry (defaults to Date.now). Injectable for tests. */
  now?: () => number;
}

const ALLOWED_SOCKET_PREFIXES = ["/tmp/", "/var/tmp/"];

/** How long a sticky-unavailable latch holds before re-probing. A transient
 * outage (socket briefly down) should not permanently disable cmux-gated subs
 * for the whole process lifetime. */
const STICKY_TTL_MS = 60_000;

let stickyUnavailable = false;
let stickySinceMs = 0;

function blocked(reason: GateBlockReason): GateResult {
  return {
    ok: false,
    code: "SKILL_UNAVAILABLE",
    reason,
    gate_result: "blocked",
    cmux_available: false,
  };
}

function cmuxAvailableShim(
  env: NodeJS.ProcessEnv,
  statSync: typeof StatSyncFn,
  now: () => number,
): GateResult {
  if (stickyUnavailable) {
    // Expire the latch after TTL so a transient outage can self-heal once the
    // socket recovers, instead of permanently blocking for the process lifetime.
    if (now() - stickySinceMs >= STICKY_TTL_MS) {
      stickyUnavailable = false;
      stickySinceMs = 0;
    } else {
      return blocked("sticky_unavailable");
    }
  }

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
  } catch (_err: unknown) {
    return blocked("socket_missing");
  }
}

export function checkCmuxGate(sub: string, opts?: CmuxGateOpts): GateResult {
  if (!CMUX_GATED_SUBS.has(sub)) {
    return { ok: true, gate_result: "n_a", cmux_available: null };
  }

  const env = opts?.env ?? process.env;
  const statSync = opts?.statSync ?? fsStatSync;
  const now = opts?.now ?? (() => Date.now());
  const result = cmuxAvailableShim(env, statSync, now);

  if (!result.ok) {
    if (!stickyUnavailable) {
      stickySinceMs = now();
    }
    stickyUnavailable = true;
  }
  return result;
}

export function __resetGateForTest(): void {
  stickyUnavailable = false;
  stickySinceMs = 0;
}
