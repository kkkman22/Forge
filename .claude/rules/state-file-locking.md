# State File Locking & Atomic Operations

Applies to: All agents that read and write .forge/ state files.

## Protected Files

The following .forge/ files require locking during write operations:
- .forge/status.md (high risk — multiple agents may update simultaneously)
- .forge/progress/*.md (medium risk)
- .forge/reviews/*.md (low risk — usually serial)

Frozen files do NOT need locking (build phase never modifies them):
- .forge/specs/*/spec.md (locked status)
- .forge/plans/*.md (approved status)

Append-only files do NOT need locking:
- .forge/knowledge/* (append only)
- .forge/debug/*.md (append only)

## Lock Mechanism

Protected `.forge/` state files are written exclusively through
`writeStatusAtomic(forgeRoot, targetPath, transformFn, io)` in
`src/status-atomic.ts`. It reuses the proven lock primitive from
`src/tool-health-writer.ts` (`acquireLockSync` / `releaseLockSync`). Do **not**
hand-roll a second locking scheme — there is exactly one real implementation.

The full RMW cycle is:
  `acquireLockSync(<target>.lock)` → `io.read(<target>)` → `transformFn(prev)` →
  `io.write(<target>.tmp, next)` → `io.move(<tmp>, <target>)` →
  `releaseLockSync(<target>.lock)`

Constants (real implementation — there is no separate config):
1. **Lock file**: `<target_file>.lock` containing the holder PID.
2. **Acquire**: `openSync(O_CREAT | O_EXCL | O_WRONLY)`. On `EEXIST`, probe the
   recorded holder PID via `process.kill(pid, 0)` — only steal if the PID is
   dead AND the lock is older than the stale threshold (fail-safe, not
   fail-open).
3. **Spin**: jittered sleep (base 5ms, jittered up to 2×) until won or the
   deadline expires.
4. **Timeout**: 5s total deadline. On expiry, throw
   `ToolHealthLockTimeoutError` (fail-closed — a status write that cannot get a
   lock fails loudly rather than racing).
5. **Stale threshold**: 30s. A lock older than 30s whose holder PID is dead is
   force-removed.
6. **Atomicity**: content lands in `<target>.tmp` then `rename`d onto the
   target (POSIX atomic rename) — readers never observe a half-written file.
7. **Cleanup**: `process.on('exit' | 'SIGINT' | 'SIGTERM')` releases all held
   locks via the `heldLocks` registry in `status-atomic.ts` (even
   `process.exit(1)` fires `exit`).

## Knuth Invariant — Protect Existing Content

When updating state fields:
- Only replace values that are known template defaults (e.g., "pending", "not started", "[ ]")
- Never overwrite user/agent-authored prose with template values
- Only append new information, never delete existing entries
- Example: status "pending" → can update to "in-progress"; status "3.2 — API endpoints" → preserve as-is
- Example: checkbox "[ ]" → can update to "[x]"; "[x] verified in commit abc123" → preserve as-is

## Orphan Lock Cleanup

On session resume or startup:
- Scan .forge/*.lock files
- Read each lock file's PID + timestamp
- Check PID liveness: process.kill(pid, 0)
- If PID dead + lock age > 30s → safe delete
- Purpose: clean up locks from crashed previous sessions
