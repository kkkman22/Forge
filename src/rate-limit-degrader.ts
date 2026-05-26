import { appendFileSync, closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// RateLimitDegrader — 429 rate-limit degradation state machine
// ---------------------------------------------------------------------------
// Cross-reference: CLAUDE.md §6 (Session Boundaries — concurrency control)
//
// Degradation ladder:
//   1st 429 → concurrency halved (e.g. 6→3)
//   2nd 429 → concurrency capped at 2
//   3rd+    → concurrency capped at 1 (serial)
//   reset() → restores initial limit, clears FORGE_MAX_PARALLEL_AGENTS_RUNTIME
// ---------------------------------------------------------------------------

const ENV_KEY = "FORGE_MAX_PARALLEL_AGENTS_RUNTIME";

export class RateLimitDegrader {
  private degradationCount = 0;
  private currentLimit: number;

  constructor(
    private readonly initialLimit: number,
    private readonly toolHealthPath: string,
    private readonly subcommand: string,
  ) {
    this.currentLimit = initialLimit;
  }

  /** Called when a 429 is observed. Returns the new concurrency limit. */
  on429(): number {
    this.degradationCount++;
    const oldLimit = this.currentLimit;

    if (this.degradationCount === 1) {
      this.currentLimit = Math.floor(oldLimit / 2);
    } else if (this.degradationCount === 2) {
      this.currentLimit = 2;
    } else {
      this.currentLimit = 1;
    }

    // Update runtime env so next spawn uses the degraded limit
    process.env[ENV_KEY] = String(this.currentLimit);

    this.appendToolHealth(oldLimit, this.currentLimit);
    return this.currentLimit;
  }

  /** Reset at end of subcommand — restores initial state and clears env. */
  reset(): void {
    this.degradationCount = 0;
    this.currentLimit = this.initialLimit;
    delete process.env[ENV_KEY];
  }

  getCurrentLimit(): number {
    return this.currentLimit;
  }

  // -------------------------------------------------------------------------
  // Private: append to tool-health.md with advisory lock for concurrency safety
  //
  // Implementation note (R12.7): macOS lacks the `flock` CLI; npm `proper-lockfile`
  // would add a runtime dep. We use the O_EXCL atomic create primitive which is
  // POSIX-portable and zero-dependency: only one process can `openSync(path, 'wx')`
  // at a time. Lock is held for ≤5ms (single line append) so contention is rare;
  // best-effort retry up to 50ms covers the race window. On failure we still
  // append (best-effort), preserving the spec contract that tool-health writes
  // never block the main flow.
  // -------------------------------------------------------------------------

  private appendToolHealth(oldLimit: number, newLimit: number): void {
    const line = `${new Date().toISOString()} · ${this.subcommand} · 429-degrade · old=${oldLimit} new=${newLimit} probe=none\n`;
    try {
      mkdirSync(dirname(this.toolHealthPath), { recursive: true });
    } catch {
      return; // mkdir failure → silently skip
    }

    const lockPath = `${this.toolHealthPath}.lock`;
    const deadline = Date.now() + 50; // 50ms total wait
    let lockFd: number | null = null;

    while (Date.now() < deadline) {
      try {
        // O_EXCL: atomic-create, fails if file already exists (lock held by peer)
        lockFd = openSync(lockPath, "wx");
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") break;
        // Sleep ~1ms via Atomics.wait on a SharedArrayBuffer (no setTimeout)
        const sab = new SharedArrayBuffer(4);
        Atomics.wait(new Int32Array(sab), 0, 0, 1);
      }
    }

    try {
      appendFileSync(this.toolHealthPath, line, "utf-8");
    } catch {
      // Silently skip — don't block main flow on tool-health write failure
    } finally {
      if (lockFd !== null) {
        try {
          closeSync(lockFd);
          unlinkSync(lockPath);
        } catch {
          // Stale lock will be cleaned by next O_EXCL attempt timing out + falling through
        }
      }
    }
  }
}
