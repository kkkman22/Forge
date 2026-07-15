/**
 * Capability probes for environment-portable tests.
 *
 * Audit P1 (codex report): tests depending on Unix sockets, TCP listeners, or
 * external CLIs failed with EPERM / "command not found" in restricted CI /
 * sandbox environments that forbid `listen()` or lack the `claude` binary.
 * These probes let such tests `describe.skip` gracefully instead of failing.
 */

import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

let _canListen: boolean | null = null;

/**
 * Probe whether the environment allows binding a local listener (Unix socket
 * or TCP). Restricted sandboxes return EPERM on `listen()`.
 *
 * Memoized — the capability does not change within a single process.
 */
export async function canListen(): Promise<boolean> {
  if (_canListen !== null) return _canListen;
  return new Promise((resolve) => {
    const server = createServer();
    const socketPath = join(tmpdir(), `forge-probe-${process.pid}-${Date.now()}.sock`);
    server.once("error", () => {
      _canListen = false;
      _canListen = false;
      resolve(false);
    });
    server.listen(socketPath, () => {
      server.close(() => {
        _canListen = true;
        resolve(true);
      });
    });
  });
}

/**
 * Probe whether an external CLI binary is on PATH.
 */
export function hasCommand(command: string): boolean {
  try {
    execFileSync("which", [command], { encoding: "utf-8", timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Whether the `claude` CLI is available (needed by accept-login smoke tests). */
export const hasClaude = (): boolean => hasCommand("claude");
