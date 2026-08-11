/**
 * ToolHealthWriter — append-only writer for `.tinkerman/knowledge/tool-health.md`
 * with file-lock-based concurrency safety (R12.7).
 *
 * Why a lock?
 *   Multiple `/tinkerman` subprocesses can hit `tool-health.md` at the same
 *   time (concurrent reviews, parallel teammate dispatches, etc). POSIX
 *   `O_APPEND` is atomic only up to PIPE_BUF; mixing in a user-supplied
 *   timestamp + free-form details easily exceeds that bound. We use an
 *   advisory `.lock` companion file with `O_EXCL` to serialise writers.
 *
 * Implementation:
 *   `<path>.lock` is created with `O_CREAT|O_EXCL|O_WRONLY`; competing
 *   writers spin with brief sleeps (Math.random for jitter, capped at
 *   ~5s) until they win the lock or hit the deadline. Lock file is
 *   removed in `finally`. Stale-lock detection compares mtime against a
 *   configurable timeout (default 30s) and force-removes.
 *
 * Format (R12.6): `<ISO timestamp> · <subcommand> · <event> · <details>`
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 12.7
 *   - .tinkerman/reviews/workflows-integration.md F8
 */

import {
  appendFileSync,
  closeSync,
  constants as FS,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export interface ToolHealthRecord {
  /** ISO-8601 timestamp; defaults to new Date() at write time. */
  timestamp?: string;
  /** Originating subcommand (review/decide/learn/loop/...). */
  subcommand: string;
  /** Event tag, e.g. `429-degrade`, `incompatible`, `restored`. */
  event: string;
  /** Free-form details, e.g. `old=6 new=3 probe=a`. */
  details: string;
}

export interface AppendOptions {
  /** Total deadline in ms before giving up (default 5_000). */
  timeoutMs?: number;
  /** Spin sleep base in ms (default 5; jittered up to 2x). */
  sleepBaseMs?: number;
  /** Stale-lock threshold: lock file older than this is force-removed (default 30_000). */
  staleLockMs?: number;
  /**
   * Predicate reporting whether a given PID is still alive. Used during
   * stale-lock recovery to avoid stealing a lock whose holder is merely slow
   * (debugger pause, NFS stall) rather than crashed. Defaults to a
   * non-destructive signal-0 probe (process.kill(pid, 0)). Injected in tests
   * so the live/dead branch can be exercised deterministically.
   */
  pidAliveCheck?: (pid: number) => boolean;
}

export class ToolHealthLockTimeoutError extends Error {
  readonly path: string;
  readonly waitedMs: number;
  constructor(path: string, waitedMs: number) {
    super(`tool-health lock timeout after ${waitedMs}ms on ${path}.lock`);
    this.name = "ToolHealthLockTimeoutError";
    this.path = path;
    this.waitedMs = waitedMs;
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SLEEP_BASE_MS = 5;
const DEFAULT_STALE_LOCK_MS = 30_000;

/**
 * Append a single record line to `tool-health.md` under a `.lock`-protected
 * write. Caller passes the full path so tests can target a tmp file.
 *
 * Returns the formatted line that was written.
 */
export function appendToolHealthRecord(
  path: string,
  record: ToolHealthRecord,
  opts: AppendOptions = {},
): string {
  const ts = record.timestamp ?? new Date().toISOString();
  const line = `${ts} · ${record.subcommand} · ${record.event} · ${record.details}\n`;

  const parent = dirname(path);
  if (parent) mkdirSync(parent, { recursive: true });

  acquireLockSync(`${path}.lock`, opts);
  try {
    appendFileSync(path, line);
  } finally {
    releaseLockSync(`${path}.lock`);
  }

  return line;
}

/**
 * Helper used by integration tests: format a record line without writing.
 */
export function formatToolHealthLine(record: ToolHealthRecord): string {
  const ts = record.timestamp ?? new Date().toISOString();
  return `${ts} · ${record.subcommand} · ${record.event} · ${record.details}\n`;
}

/**
 * Acquire an exclusive `.lock` file using `O_CREAT|O_EXCL`, spinning with
 * jittered sleeps until won or the deadline expires. Exported so other
 * low-frequency append paths (e.g. audit-log) can share one concurrency
 * primitive instead of introducing a second.
 */
export function acquireLockSync(lockPath: string, opts: AppendOptions): void {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleepBaseMs = opts.sleepBaseMs ?? DEFAULT_SLEEP_BASE_MS;
  const staleLockMs = opts.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
  const pidAliveCheck = opts.pidAliveCheck ?? isPidAliveDefault;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      const fd = openSync(lockPath, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL, 0o644);
      // Write our PID so a later contender can tell whether we are still alive
      // before force-removing a stale lock (avoids stealing a live-but-slow
      // holder's lock — TOCTOU hardening, F-06).
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // Check stale lock — lockfile from a crashed peer.
      try {
        const stat = statSync(lockPath);
        const age = Date.now() - stat.mtimeMs;
        if (age > staleLockMs) {
          // Only steal if the recorded holder PID is actually dead. A live
          // PID means the holder is slow (debugger/NFS), not crashed — wait.
          if (!isLockHolderAlive(lockPath, pidAliveCheck)) {
            // P2-3e: narrow the TOCTOU window. Between isLockHolderAlive and
            // unlink, a peer could win O_EXCL (having written a fresh PID). Re-
            // stat the mtime; if it changed, the lock was recycled — don't
            // unlink (would steal the peer's fresh lock). Loop+retry instead.
            const statAfter = statSync(lockPath);
            if (statAfter.mtimeMs !== stat.mtimeMs) {
              // Lock was recycled by a peer mid-check — don't steal, retry.
              continue;
            }
            try {
              unlinkSync(lockPath);
            } catch (_err: unknown) {
              // Race: peer removed it; loop and retry.
            }
            continue;
          }
        }
      } catch (_err: unknown) {
        // Race: peer removed it; loop and retry.
      }
      if (Date.now() >= deadline) {
        throw new ToolHealthLockTimeoutError(lockPath.replace(/\.lock$/, ""), timeoutMs);
      }
      // Brief jittered sleep — synchronous spin via Atomics.wait on a
      // shared SAB, available in Node since 12.
      sleepSync(sleepBaseMs + Math.floor(Math.random() * sleepBaseMs));
    }
  }
}

/**
 * Read the holder PID from a lock file and ask `pidAliveCheck` whether it is
 * still alive. A lock with no/unparseable PID is treated as dead (removable),
 * preserving backward compatibility with lock files written before PID was
 * recorded.
 */
function isLockHolderAlive(lockPath: string, pidAliveCheck: (pid: number) => boolean): boolean {
  try {
    const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    return pidAliveCheck(pid);
  } catch {
    return false;
  }
}

/**
 * Default PID liveness probe: a non-destructive signal-0 check via
 * `process.kill`. Returns false for a dead/non-existent PID (throws ESRCH).
 * Note: PID reuse across machines/containers can produce false "alive", but
 * this is strictly safer than the prior mtime-only heuristic.
 */
function isPidAliveDefault(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Release the `.lock` file. Exported to pair with {@link acquireLockSync}. */
export function releaseLockSync(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch (_err: unknown) {
    // Already gone (process killed mid-write?) — nothing to do.
  }
}

function sleepSync(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}
