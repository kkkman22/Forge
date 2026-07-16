/**
 * Status Manager — multi-file status tracking for parallel task execution.
 *
 * Provides high-level operations for reading, writing, listing, and
 * managing task status files in both single-task and multi-task modes.
 *
 * Mode detection is based on the existence of the .forge/status/ directory.
 * In single-task mode, all operations target .forge/status.md.
 * In multi-task mode, each task gets its own file under .forge/status/.
 */

import { basename, dirname } from "node:path";

import { extractStringField, parseFrontmatter } from "./frontmatter.js";
import { writeStatusAtomic } from "./status-atomic.js";
import { isMultiTaskMode, slugify } from "./status-resolver.js";
import type { AppendOptions } from "./tool-health-writer.js";
import { acquireLockSync, releaseLockSync, ToolHealthLockTimeoutError } from "./tool-health-writer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @public */
export interface ManagedTaskEntry {
  taskId: string;
  taskName: string;
  phase: string;
  tier?: string;
  updated?: string;
  filePath: string;
}

/** @public */
export interface StatusManagerIO {
  exists: (path: string) => boolean;
  dirExists: (path: string) => boolean;
  read: (path: string) => string;
  write: (path: string, content: string) => void;
  listDir: (path: string) => string[];
  move: (src: string, dest: string) => void;
  mkdirp: (path: string) => void;
  /**
   * Optional lock acquisition seam. Production IO binds this to the real
   * `acquireLockSync` (O_CREAT|O_EXCL). Tests with an in-memory IO may omit it
   * (writeStatusAtomic falls back to the real primitive) or inject a no-op to
   * keep the test off the real filesystem.
   */
  acquireLock?: (lockPath: string, opts: AppendOptions) => void;
  /** Optional lock release seam, paired with {@link acquireLock}. */
  releaseLock?: (lockPath: string) => void;
}

const TERMINAL_PHASES = new Set(["completed", "aborted"]);

// ---------------------------------------------------------------------------
// readTaskStatus
// ---------------------------------------------------------------------------

/**
 * Read status for a specific task.
 *
 * Priority: .forge/status/<task-id>.md → .forge/status.md → empty string
 * @public
 */
export function readTaskStatus(io: StatusManagerIO, forgeRoot: string, taskName: string): string {
  const taskId = slugify(taskName);
  const taskPath = `${forgeRoot}/status/${taskId}.md`;

  try {
    if (io.exists(taskPath)) {
      return io.read(taskPath);
    }

    const legacyPath = `${forgeRoot}/status.md`;
    if (io.exists(legacyPath)) {
      return io.read(legacyPath);
    }

    return "";
  } catch (_err: unknown) {
    return "";
  }
}

// ---------------------------------------------------------------------------
// writeTaskStatus
// ---------------------------------------------------------------------------

/**
 * Write status for a specific task.
 *
 * In multi-task mode, writes to .forge/status/<task-id>.md.
 * In single-task mode, writes to .forge/status.md.
 * Write failures are logged and do not crash.
 * @public
 */
export function writeTaskStatus(
  io: StatusManagerIO,
  forgeRoot: string,
  taskName: string,
  content: string,
): void {
  try {
    const multi = isMultiTaskMode(forgeRoot, (p) => io.dirExists(p));

    if (multi) {
      const taskId = slugify(taskName);
      const statusDir = `${forgeRoot}/status`;
      io.mkdirp(statusDir);
      writeStatusAtomic(forgeRoot, `${statusDir}/${taskId}.md`, () => content, io);
    } else {
      // Check if this write would create a second active task — auto-migrate
      const legacyPath = `${forgeRoot}/status.md`;
      if (io.exists(legacyPath)) {
        const legacyContent = io.read(legacyPath);
        const existingTask = extractStringField(
          parseFrontmatter(legacyContent)?.raw ?? "",
          "current_task",
        );
        if (existingTask && existingTask !== taskName) {
          // Migrate existing task to multi-file mode
          migrateToMultiTask(io, forgeRoot);
          // Now write the new task
          const taskId = slugify(taskName);
          const statusDir = `${forgeRoot}/status`;
          io.mkdirp(statusDir);
          writeStatusAtomic(forgeRoot, `${statusDir}/${taskId}.md`, () => content, io);
          return;
        }
      }
      writeStatusAtomic(forgeRoot, `${forgeRoot}/status.md`, () => content, io);
    }
  } catch (err: unknown) {
    // Audit P2-6 (2026-07-16): distinguish unrecoverable state-consistency
    // failures from ordinary IO hiccups. A lock timeout
    // (ToolHealthLockTimeoutError) means the status write did NOT land — the
    // caller would otherwise advance the phase on stale state, a P1-level
    // consistency violation. Propagate it so callers can decide. Other errors
    // (e.g. a missing dir, transient write fault) keep the spec R2.5 graceful-
    // degradation contract: log to stderr and continue without crashing.
    if (err instanceof ToolHealthLockTimeoutError) {
      throw err;
    }
    // Graceful degradation — spec R2.5: log warning and continue without crashing.
    // Audit P2: was a silent swallow (TODO: integrate with logging). Now emits
    // a structured stderr warning so status-write failures are diagnosable.
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[writeTaskStatus] failed to write status for "${taskName}": ${msg}\n`);
  }
}

// ---------------------------------------------------------------------------
// listActiveTasks
// ---------------------------------------------------------------------------

/**
 * List all active tasks (phase is not "completed" or "aborted").
 *
 * Scans both .forge/status.md and .forge/status/*.md.
 * @public
 */
export function listActiveTasks(io: StatusManagerIO, forgeRoot: string): ManagedTaskEntry[] {
  const entries: ManagedTaskEntry[] = [];

  // Scan legacy status.md
  const legacyPath = `${forgeRoot}/status.md`;
  if (io.exists(legacyPath)) {
    const content = io.read(legacyPath);
    const entry = parseTaskEntry(content, legacyPath);
    if (entry && !TERMINAL_PHASES.has(entry.phase)) {
      entries.push(entry);
    }
  }

  // Scan status/*.md
  const statusDir = `${forgeRoot}/status`;
  if (io.dirExists(statusDir)) {
    for (const fileName of io.listDir(statusDir)) {
      if (!fileName.endsWith(".md")) continue;
      const filePath = `${statusDir}/${fileName}`;
      const content = io.read(filePath);
      const entry = parseTaskEntry(content, filePath);
      if (entry && !TERMINAL_PHASES.has(entry.phase)) {
        entries.push(entry);
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// getMostRecentActiveTask
// ---------------------------------------------------------------------------

/**
 * Get the most recently updated active task.
 *
 * Used by Context_Hook to select which task's context to inject.
 * @public
 */
export function getMostRecentActiveTask(
  io: StatusManagerIO,
  forgeRoot: string,
): ManagedTaskEntry | null {
  const active = listActiveTasks(io, forgeRoot);
  if (active.length === 0) return null;

  return active.reduce((latest, entry) => {
    const latestTime = latest.updated ?? "";
    const entryTime = entry.updated ?? "";
    return entryTime > latestTime ? entry : latest;
  });
}

// ---------------------------------------------------------------------------
// migrateToMultiTask
// ---------------------------------------------------------------------------

/**
 * Run `fn` while holding a directory-level lock under `forgeRoot`. Serializes
 * cross-file state transitions (e.g. migration) that a single-file atomic write
 * cannot cover. Reuses the same O_CREAT|O_EXCL PID-aware primitive as
 * {@link writeStatusAtomic}. The lock file lives next to forgeRoot so it
 * survives even if forgeRoot's contents are being reorganized.
 *
 * Audit P1: migration was two independent atomic writes with a dirty-state
 * window between them — two concurrent `/forge` migrations could both read the
 * legacy status.md and produce duplicate/phantom task files.
 */
function withForgeLock<T>(
  io: StatusManagerIO,
  forgeRoot: string,
  lockName: string,
  fn: () => T,
): T {
  const lockPath = `${dirname(forgeRoot)}/.${lockName}.lock`;
  const acquire = io.acquireLock ?? ((p: string, opts: AppendOptions) => acquireLockSync(p, opts));
  const release = io.releaseLock ?? ((p: string) => releaseLockSync(p));
  acquire(lockPath, {});
  try {
    return fn();
  } finally {
    release(lockPath);
  }
}

/**
 * Migrate from single-task (status.md) to multi-task (status/*.md) mode.
 *
 * Steps (all under a directory-level migration lock):
 *   1. Read current_task from legacy status.md
 *   2. Slugify to get task-id
 *   3. Create .forge/status/ directory
 *   4. Copy legacy content to .forge/status/<task-id>.md (idempotent: skip if
 *      the target already exists — a prior partial migration's file survives)
 *   5. Clear legacy status.md (preserve empty frontmatter)
 *
 * Audit P1: the whole sequence is now transactional — the migration lock is
 * held across both writes, and the legacy file is re-read inside the lock to
 * close the read-then-write race between concurrent migrations.
 * @public
 */
export function migrateToMultiTask(io: StatusManagerIO, forgeRoot: string): void {
  withForgeLock(io, forgeRoot, "forge-status-migrate", () => {
    const legacyPath = `${forgeRoot}/status.md`;
    if (!io.exists(legacyPath)) return;

    // Re-read inside the lock — another process may have completed the
    // migration and cleared legacyPath between our first check and lock grant.
    const legacyContent = io.read(legacyPath);
    const parsed = parseFrontmatter(legacyContent);
    if (!parsed) return;

    const existingTask = extractStringField(parsed.raw, "current_task");
    if (!existingTask) return;

    const taskId = slugify(existingTask);
    const statusDir = `${forgeRoot}/status`;
    const targetPath = `${statusDir}/${taskId}.md`;
    io.mkdirp(statusDir);

    // Idempotent: do not clobber a task file that already exists (e.g. from a
    // prior partial migration that wrote the target but crashed before clearing
    // the legacy file).
    if (!io.exists(targetPath)) {
      writeStatusAtomic(forgeRoot, targetPath, () => legacyContent, io);
    }

    // Clear legacy file with empty frontmatter
    writeStatusAtomic(forgeRoot, legacyPath, () => "---\n---\n", io);
  });
}

// ---------------------------------------------------------------------------
// archiveTaskStatus
// ---------------------------------------------------------------------------

/** @public */
export type ArchiveResult =
  | { ok: true; path: string }
  | { ok: false; code: "invalid-date" | "io-error" | "not-found"; error?: unknown };

/**
 * Archive a task's status file to .forge/archive/<date>-<task-id>/status.md.
 *
 * Audit P2: was `void` with a catch-all that silently swallowed every error
 * (invalid date, missing file, disk failure, permission error alike) — callers
 * could not distinguish success from failure. Now returns a discriminated
 * {@link ArchiveResult} and emits a structured warning on failure instead of a
 * silent TODO. Callers that ignore the return value are unaffected (the single
 * existing caller discards it).
 * @public
 */
export function archiveTaskStatus(
  io: StatusManagerIO,
  forgeRoot: string,
  taskName: string,
  date: string,
): ArchiveResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      ok: false,
      code: "invalid-date",
      error: new Error(`Invalid archive date format: "${date}" — expected YYYY-MM-DD`),
    };
  }
  const taskId = slugify(taskName);
  const srcPath = `${forgeRoot}/status/${taskId}.md`;
  if (!io.exists(srcPath)) {
    return { ok: false, code: "not-found", error: new Error(`status file not found: ${srcPath}`) };
  }

  const archiveDir = `${forgeRoot}/archive/${date}-${taskId}`;
  const destPath = `${archiveDir}/status.md`;
  try {
    io.mkdirp(archiveDir);
    io.move(srcPath, destPath);
    return { ok: true, path: destPath };
  } catch (err: unknown) {
    // Structured warning instead of silent swallow (spec R2.5: log + continue).
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[archiveTaskStatus] io-error archiving "${taskName}" to ${destPath}: ${msg}\n`,
    );
    return { ok: false, code: "io-error", error: err };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseTaskEntry(content: string, filePath: string): ManagedTaskEntry | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const taskName = extractStringField(parsed.raw, "current_task");
  if (!taskName) return null;

  const taskId = basename(filePath, ".md");
  return {
    taskId,
    taskName,
    phase: extractStringField(parsed.raw, "phase") ?? "",
    tier: extractStringField(parsed.raw, "tier") ?? undefined,
    updated: extractStringField(parsed.raw, "updated") ?? undefined,
    filePath,
  };
}
