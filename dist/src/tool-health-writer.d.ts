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
}
export declare class ToolHealthLockTimeoutError extends Error {
    readonly path: string;
    readonly waitedMs: number;
    constructor(path: string, waitedMs: number);
}
/**
 * Append a single record line to `tool-health.md` under a `.lock`-protected
 * write. Caller passes the full path so tests can target a tmp file.
 *
 * Returns the formatted line that was written.
 */
export declare function appendToolHealthRecord(path: string, record: ToolHealthRecord, opts?: AppendOptions): string;
/**
 * Helper used by integration tests: format a record line without writing.
 */
export declare function formatToolHealthLine(record: ToolHealthRecord): string;
