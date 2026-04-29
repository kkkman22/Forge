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

import { extractStringField, parseFrontmatter } from "./frontmatter.js";
import { isMultiTaskMode, slugify } from "./status-resolver.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskStatusEntry {
  taskId: string;
  taskName: string;
  phase: string;
  tier?: string;
  updated?: string;
  filePath: string;
}

export interface StatusManagerIO {
  exists: (path: string) => boolean;
  dirExists: (path: string) => boolean;
  read: (path: string) => string;
  write: (path: string, content: string) => void;
  listDir: (path: string) => string[];
  move: (src: string, dest: string) => void;
  mkdirp: (path: string) => void;
}

const ACTIVE_PHASES = new Set(["completed", "aborted"]);

// ---------------------------------------------------------------------------
// readTaskStatus
// ---------------------------------------------------------------------------

/**
 * Read status for a specific task.
 *
 * Priority: .forge/status/<task-id>.md → .forge/status.md → empty string
 */
export function readTaskStatus(
  io: StatusManagerIO,
  forgeRoot: string,
  taskName: string,
): string {
  try {
    const taskId = slugify(taskName);
    const taskPath = `${forgeRoot}/status/${taskId}.md`;

    if (io.exists(taskPath)) {
      return io.read(taskPath);
    }

    const legacyPath = `${forgeRoot}/status.md`;
    if (io.exists(legacyPath)) {
      return io.read(legacyPath);
    }

    return "";
  } catch {
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
      io.write(`${statusDir}/${taskId}.md`, content);
    } else {
      io.write(`${forgeRoot}/status.md`, content);
    }
  } catch {
    // Graceful degradation — do not crash
  }
}

// ---------------------------------------------------------------------------
// listActiveTasks
// ---------------------------------------------------------------------------

/**
 * List all active tasks (phase is not "completed" or "aborted").
 *
 * Scans both .forge/status.md and .forge/status/*.md.
 */
export function listActiveTasks(
  io: StatusManagerIO,
  forgeRoot: string,
): TaskStatusEntry[] {
  const entries: TaskStatusEntry[] = [];

  // Scan legacy status.md
  const legacyPath = `${forgeRoot}/status.md`;
  if (io.exists(legacyPath)) {
    const content = io.read(legacyPath);
    const entry = parseTaskEntry(content, legacyPath);
    if (entry && !ACTIVE_PHASES.has(entry.phase)) {
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
      if (entry && !ACTIVE_PHASES.has(entry.phase)) {
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
 */
export function getMostRecentActiveTask(
  io: StatusManagerIO,
  forgeRoot: string,
): TaskStatusEntry | null {
  const active = listActiveTasks(io, forgeRoot);
  if (active.length === 0) return null;

  return active.reduce((latest, entry) => {
    const latestTime = latest.updated ?? "";
    const entryTime = entry.updated ?? "";
    return entryTime > latestTime ? entry : latest;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseTaskEntry(content: string, filePath: string): TaskStatusEntry | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const taskName = extractStringField(parsed.raw, "current_task");
  if (!taskName) return null;

  const taskId = filePath.split("/").pop()?.replace(".md", "") ?? "";
  return {
    taskId,
    taskName,
    phase: extractStringField(parsed.raw, "phase") ?? "",
    tier: extractStringField(parsed.raw, "tier") ?? undefined,
    updated: extractStringField(parsed.raw, "updated") ?? undefined,
    filePath,
  };
}
