/**
 * Status atomic write — the single funnel for status.md / status/*.md writes.
 *
 * P1-1: prior to this module, `writeTaskStatus` did an unlocked
 * read-modify-write (`io.read → transform → io.write`) on `.forge/status.md`.
 * With `max_parallel_agents` defaulting to 6, two parallel subagents both
 * reading the same file then writing lost updates (last-write-wins overwrote
 * the prior write). The Iron Law in `.claude/rules/state-file-locking.md`
 * requires the lock to span the entire RMW cycle.
 *
 * This module reuses the real filesystem lock primitive already proven in
 * `tool-health-writer.ts` (`acquireLockSync` — O_CREAT|O_EXCL, PID-aware
 * stale-break, jittered spin, 5s timeout / 30s stale). The docstring there
 * explicitly invites reuse ("Exported so other low-frequency append paths
 * can share one concurrency primitive").
 *
 * Atomicity on the write side: content is written to `<target>.tmp` then
 * renamed onto the target (rename is atomic on POSIX), so a reader never
 * observes a half-written file.
 *
 * Exit cleanup: held locks are tracked in a module-level Set and released via
 * the `process.on('exit')` handler. As library code (reachable from the public
 * `writeTaskStatus` export) this module MUST NOT call `process.exit` — doing so
 * would kill a host process that imported Forge as a library (audit P1 #3). It
 * therefore does not register SIGINT/SIGTERM handlers that force-exit; on
 * signal-driven termination Node runs the 'exit' handler before stopping, which
 * releases the locks. Any lock file left behind by a hard kill is recovered by
 * the `acquireLockSync` PID-aware stale-break on the next write.
 *
 * @public
 */

import type { StatusManagerIO } from "./status-types.js";
import { type AppendOptions, acquireLockSync, releaseLockSync } from "./tool-health-writer.js";

/** Held-lock registry for exit cleanup. */
const heldLocks = new Set<string>();

let exitHandlerInstalled = false;

function installExitHandler(): void {
  if (exitHandlerInstalled) return;
  exitHandlerInstalled = true;
  process.on("exit", () => {
    for (const lockPath of heldLocks) {
      try {
        releaseLockSync(lockPath);
      } catch {
        // Already gone — nothing to do.
      }
    }
    heldLocks.clear();
  });
}

/**
 * Lock-protected, atomic read-modify-write of a status file.
 *
 * Contract:
 *   acquireLock(target.lock) → read(target) → transform(prev) →
 *   write(target.tmp, next) → move(target.tmp, target) → releaseLock
 *
 * The lock path is derived from the target path (`<target>.lock`) and uses
 * the real filesystem (not the injected `io` seam), because `acquireLockSync`
 * needs true O_CREAT|O_EXCL atomicity that a mock `io` cannot provide. This
 * is correct for production (real fs) and for the concurrent test (real tmp
 * fs across child processes). The injected `io` governs only the data
 * read/write/move of the target file itself.
 *
 * @param forgeRoot - `.forge/` directory path (kept for API symmetry; lock is
 *   keyed on `targetPath`, not `forgeRoot`).
 * @param targetPath - Absolute path to the status file being written.
 * @param transform - Pure function: prior content (or "" if absent) → next
 *   content. Throwing aborts the write but still releases the lock.
 * @param io - I/O seam for read/write/move of the target.
 * @param lockOpts - Optional lock tuning (timeout / stale threshold). Defaults
 *   to the tool-health primitives (5s timeout, 30s stale).
 * @public
 */
export function writeStatusAtomic(
  forgeRoot: string,
  targetPath: string,
  transform: (prev: string) => string,
  io: StatusManagerIO,
  lockOpts: AppendOptions = {},
): void {
  void forgeRoot; // API symmetry; lock keyed on targetPath.
  installExitHandler();

  const lockPath = `${targetPath}.lock`;
  // Production callers pass an `io` whose lock/unlock drive the real fs via
  // acquireLockSync/releaseLockSync. Tests may inject a no-op lock so the
  // in-memory IO doesn't touch the real filesystem. The real lock primitive
  // is the source of truth; this indirection only swaps the *binding*.
  const acquire = io.acquireLock ?? ((p: string, opts: AppendOptions) => acquireLockSync(p, opts));
  const release = io.releaseLock ?? ((p: string) => releaseLockSync(p));
  acquire(lockPath, lockOpts);
  heldLocks.add(lockPath);
  try {
    // Audit P2-1 (2026-07-16): distinguish "file absent" (legitimate empty
    // prior, e.g. first write) from "file exists but read failed" (a real IO
    // error — permission flip / EMFILE / disk fault). Previously both were
    // swallowed into prev="" and the write proceeded, so a read failure on an
    // existing status.md clobbered its contents. Fail-closed per the
    // state-file-locking Knuth Invariant: an unreadable-but-present file must
    // abort the write and propagate the error, not silently overwrite.
    let prev = "";
    if (io.exists(targetPath)) {
      prev = io.read(targetPath); // throws on real IO error → aborts, lock released in finally
    }
    const next = transform(prev);
    const tmpPath = `${targetPath}.tmp`;
    io.write(tmpPath, next);
    io.move(tmpPath, targetPath);
  } finally {
    release(lockPath);
    heldLocks.delete(lockPath);
  }
}

/**
 * Release all locks currently held by this process. Exported for tests and
 * for explicit shutdown paths. Safe to call when nothing is held.
 * @public
 */
export function releaseAllStatusLocks(): void {
  for (const lockPath of heldLocks) {
    try {
      releaseLockSync(lockPath);
    } catch {
      // Already gone.
    }
  }
  heldLocks.clear();
}
