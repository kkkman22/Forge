import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ALLOWED_INTEGRATION_VALUES = new Set(["off", "on", ""]);

let stickyUnavailable = false;

/**
 * Resolve the cmux daemon socket path (R1.1).
 * Priority: CMUX_SOCKET_PATH env → cmux state file → legacy /tmp fallback.
 * cmux 0.64.x records its socket at ~/.local/state/cmux/last-socket-path.
 */
function resolveSocketPath() {
  const envPath = process.env.CMUX_SOCKET_PATH;
  if (envPath) return envPath;

  const stateDir = process.env.CMUX_STATE_DIR ?? join(homedir(), ".local", "state", "cmux");
  if (stateDir.includes("..")) return "/tmp/cmux.sock";
  try {
    const resolved = readFileSync(join(stateDir, "last-socket-path"), "utf-8").trim();
    if (resolved) return resolved;
  } catch {
    // State file missing — fall through to legacy default.
  }
  return "/tmp/cmux.sock";
}

/**
 * Structural socket-path validation (R1.1).
 * Replaces the old /tmp + /var/tmp prefix whitelist, which rejected cmux 0.64.x's
 * XDG location (~/.local/state/cmux/). Absolute + no traversal + no NUL is safer
 * (prefix lists can be bypassed via symlinks; statSync().isSocket() cannot) and
 * accepts any legitimate socket location.
 */
function isSafeSocketPath(p) {
  if (!p || typeof p !== "string") return false;
  if (!p.startsWith("/")) return false;
  if (p.includes("..")) return false;
  if (p.includes("\0")) return false;
  return true;
}

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

  const socketPath = resolveSocketPath();
  if (!isSafeSocketPath(socketPath)) return false;
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
