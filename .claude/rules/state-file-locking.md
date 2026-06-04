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

When modifying protected state files:

1. **Lock file**: {target_file}.lock containing {PID}:{timestamp}
2. **Acquire**: Attempt exclusive creation (O_CREAT | O_EXCL | O_WRONLY). If exists (EEXIST), check staleness (mtime > 10s → safe break).
3. **Retry**: Up to 10 times, 100ms interval. Handle: EPERM, EBUSY, EAGAIN, EINTR, EIO, ENOENT, ESTALE.
4. **Timeout**: After 1s, log warning and proceed without lock (fail-open).
5. **Release**: Delete lock file on completion, remove from held-locks registry.
6. **Cleanup**: process.on('exit') cleans all held locks (even process.exit(1) fires this — handler must be synchronous).

## Read-Modify-Write Atomicity

**Iron Law**: Never use read-then-write without holding the lock across the entire cycle.

Correct:
  lock → read → transform → write → unlock

Wrong:
  read → [gap] → write  ← lost-update race condition possible

All state file updates must use the readModifyWrite pattern:
  acquireLock → readFileSync → transformFn → writeFileSync → releaseLock

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
