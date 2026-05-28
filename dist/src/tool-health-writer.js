/**
 * ToolHealthWriter — append-only writer for `.forge/knowledge/tool-health.md`
 * with file-lock-based concurrency safety (R12.7).
 *
 * Why a lock?
 *   Multiple `/forge` subprocesses can hit `tool-health.md` at the same
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
 *   - .forge/reviews/workflows-integration.md F8
 */
import { appendFileSync, closeSync, constants as FS, mkdirSync, openSync, statSync, unlinkSync, } from "node:fs";
import { dirname } from "node:path";
export class ToolHealthLockTimeoutError extends Error {
    path;
    waitedMs;
    constructor(path, waitedMs) {
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
export function appendToolHealthRecord(path, record, opts = {}) {
    const ts = record.timestamp ?? new Date().toISOString();
    const line = `${ts} · ${record.subcommand} · ${record.event} · ${record.details}\n`;
    const parent = dirname(path);
    if (parent)
        mkdirSync(parent, { recursive: true });
    acquireLockSync(`${path}.lock`, opts);
    try {
        appendFileSync(path, line);
    }
    finally {
        releaseLockSync(`${path}.lock`);
    }
    return line;
}
/**
 * Helper used by integration tests: format a record line without writing.
 */
export function formatToolHealthLine(record) {
    const ts = record.timestamp ?? new Date().toISOString();
    return `${ts} · ${record.subcommand} · ${record.event} · ${record.details}\n`;
}
function acquireLockSync(lockPath, opts) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const sleepBaseMs = opts.sleepBaseMs ?? DEFAULT_SLEEP_BASE_MS;
    const staleLockMs = opts.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
    const deadline = Date.now() + timeoutMs;
    while (true) {
        try {
            const fd = openSync(lockPath, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL, 0o644);
            closeSync(fd);
            return;
        }
        catch (err) {
            if (err.code !== "EEXIST")
                throw err;
            // Check stale lock — lockfile from a crashed peer.
            try {
                const stat = statSync(lockPath);
                const age = Date.now() - stat.mtimeMs;
                if (age > staleLockMs) {
                    try {
                        unlinkSync(lockPath);
                    }
                    catch {
                        // Race: peer removed it; loop and retry.
                    }
                    continue;
                }
            }
            catch {
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
function releaseLockSync(lockPath) {
    try {
        unlinkSync(lockPath);
    }
    catch {
        // Already gone (process killed mid-write?) — nothing to do.
    }
}
function sleepSync(ms) {
    const sab = new SharedArrayBuffer(4);
    const view = new Int32Array(sab);
    Atomics.wait(view, 0, 0, ms);
}
//# sourceMappingURL=tool-health-writer.js.map