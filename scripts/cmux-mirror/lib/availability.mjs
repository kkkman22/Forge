import { statSync } from "node:fs";

const ALLOWED_SOCKET_PREFIXES = ["/tmp/", "/var/tmp/"];
const ALLOWED_INTEGRATION_VALUES = new Set(["off", "on", ""]);

let stickyUnavailable = false;

/**
 * Detects whether cmux is available (R1.1).
 * Pure w.r.t. env + fs state: same inputs → same output (R12.1).
 */
export function cmuxAvailable() {
  if (stickyUnavailable) return false;

  const integration = process.env.CMUX_INTEGRATION ?? "";
  if (!ALLOWED_INTEGRATION_VALUES.has(integration)) return false;
  if (integration === "off") return false;
  if (process.env.CMUX_WORKSPACE_ID) return true;

  const socketPath = process.env.CMUX_SOCKET_PATH ?? "/tmp/cmux.sock";
  if (socketPath.includes("..")) return false;
  if (process.env.CMUX_SOCKET_PATH && !ALLOWED_SOCKET_PREFIXES.some((p) => socketPath.startsWith(p))) {
    return false;
  }
  try {
    const t0 = Date.now();
    const st = statSync(socketPath);
    if (Date.now() - t0 > 200) return false;
    return st.isSocket();
  } catch {
    return false;
  }
}

/**
 * Mark cmux as permanently unavailable for this process (R13.1, R13.9).
 * Called by cli.mjs on EPIPE/ECONNREFUSED.
 */
export function markUnavailable(_reason) {
  stickyUnavailable = true;
}

export function isStickyUnavailable() {
  return stickyUnavailable;
}

/** Test-only reset */
export function __resetForTest() {
  stickyUnavailable = false;
}
