/**
 * Property tests for status-manager module.
 *
 * Feature: parallel-status-tracking
 *
 * Properties tested:
 *   Property 4:  Read fallback resolution
 *   Property 5:  Frontmatter round-trip preservation
 *   Property 6:  Active task listing completeness
 *   Property 9:  Most recent task selection
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type StatusManagerIO,
  type TaskStatusEntry,
  getMostRecentActiveTask,
  listActiveTasks,
  readTaskStatus,
  writeTaskStatus,
} from "../src/status-manager.js";

// ---------------------------------------------------------------------------
// In-memory IO implementation for testing
// ---------------------------------------------------------------------------

function createInMemoryIO(files: Record<string, string> = {}): StatusManagerIO {
  const store = { ...files };
  return {
    exists: (p) => p in store,
    dirExists: (p) => Object.keys(store).some((k) => k.startsWith(p + "/")),
    read: (p) => store[p] ?? "",
    write: (p, content) => {
      store[p] = content;
    },
    listDir: (p) =>
      Object.keys(store)
        .filter((k) => k.startsWith(p + "/"))
        .map((k) => k.slice(p.length + 1)),
    move: (src, dest) => {
      store[dest] = store[src] ?? "";
      delete store[src];
    },
    mkdirp: () => {},
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_FILE = "/project/.forge/status.md";
const STATUS_DIR = "/project/.forge/status";
const FORGE_ROOT = "/project/.forge";

function makeStatusContent(
  task: string,
  phase: string,
  tier = "standard",
  updated = "2026-04-30",
): string {
  return `---\ncurrent_task: "${task}"\ntier: "${tier}"\nphase: "${phase}"\nupdated: "${updated}"\n---\n`;
}

function makeTaskFile(taskName: string, phase: string): string {
  const taskId = taskName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    path: `${STATUS_DIR}/${taskId}.md`,
    content: makeStatusContent(taskName, phase),
  };
}

// ---------------------------------------------------------------------------
// Property 4: Read fallback resolution
// ---------------------------------------------------------------------------

describe("Property 4: Read fallback resolution", () => {
  it("returns task-specific file content when it exists", () => {
    const taskContent = makeStatusContent("my-task", "build");
    const legacyContent = makeStatusContent("other-task", "review");
    const io = createInMemoryIO({
      [STATUS_FILE]: legacyContent,
      [`${STATUS_DIR}/my-task.md`]: taskContent,
    });

    const result = readTaskStatus(io, FORGE_ROOT, "my-task");
    expect(result).toContain("my-task");
    expect(result).toContain("build");
  });

  it("falls back to legacy file when task-specific file does not exist", () => {
    const legacyContent = makeStatusContent("my-task", "build");
    const io = createInMemoryIO({ [STATUS_FILE]: legacyContent });

    const result = readTaskStatus(io, FORGE_ROOT, "my-task");
    expect(result).toContain("my-task");
  });

  it("returns empty string when neither file exists", () => {
    const io = createInMemoryIO({});
    const result = readTaskStatus(io, FORGE_ROOT, "nonexistent");
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Property 5: Frontmatter round-trip preservation
// ---------------------------------------------------------------------------

describe("Property 5: Frontmatter round-trip preservation", () => {
  it("preserves all standard fields through write-then-read cycle", () => {
    const original = `---\ncurrent_task: "api-pagination"\ntier: "standard"\nphase: "build"\nhints: "api-contract-check"\nmode: "autonomous"\nloop_run_id: "abc-123"\nloop_iteration: 5\nskill_sequence: "plan,build,review"\nupdated: "2026-04-30"\n---\n\n# Status\nBuilding...`;

    const io = createInMemoryIO();
    writeTaskStatus(io, FORGE_ROOT, "api-pagination", original);
    const read = readTaskStatus(io, FORGE_ROOT, "api-pagination");

    expect(read).toContain('current_task: "api-pagination"');
    expect(read).toContain('tier: "standard"');
    expect(read).toContain('phase: "build"');
    expect(read).toContain('hints: "api-contract-check"');
    expect(read).toContain('mode: "autonomous"');
    expect(read).toContain('loop_run_id: "abc-123"');
    expect(read).toContain("loop_iteration: 5");
    expect(read).toContain('skill_sequence: "plan,build,review"');
    expect(read).toContain("Building...");
  });
});

// ---------------------------------------------------------------------------
// Property 6: Active task listing completeness
// ---------------------------------------------------------------------------

describe("Property 6: Active task listing completeness", () => {
  it("lists exactly the tasks with non-completed/non-aborted phases", () => {
    const files: Record<string, string> = {
      [`${STATUS_DIR}/task-a.md`]: makeStatusContent("task-a", "build"),
      [`${STATUS_DIR}/task-b.md`]: makeStatusContent("task-b", "completed"),
      [`${STATUS_DIR}/task-c.md`]: makeStatusContent("task-c", "review"),
      [`${STATUS_DIR}/task-d.md`]: makeStatusContent("task-d", "aborted"),
      [`${STATUS_DIR}/task-e.md`]: makeStatusContent("task-e", "ship"),
    };
    const io = createInMemoryIO(files);
    const active = listActiveTasks(io, FORGE_ROOT);

    const names = active.map((t) => t.taskName);
    expect(names).toContain("task-a");
    expect(names).toContain("task-c");
    expect(names).toContain("task-e");
    expect(names).not.toContain("task-b");
    expect(names).not.toContain("task-d");
  });

  it("includes legacy file tasks when active", () => {
    const files: Record<string, string> = {
      [STATUS_FILE]: makeStatusContent("legacy-task", "build"),
    };
    const io = createInMemoryIO(files);
    const active = listActiveTasks(io, FORGE_ROOT);

    expect(active).toHaveLength(1);
    expect(active[0].taskName).toBe("legacy-task");
  });

  it("returns empty list when no active tasks", () => {
    const io = createInMemoryIO({});
    expect(listActiveTasks(io, FORGE_ROOT)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Property 9: Most recent task selection
// ---------------------------------------------------------------------------

describe("Property 9: Most recent task selection", () => {
  it("returns the task with the latest updated timestamp", () => {
    const files: Record<string, string> = {
      [`${STATUS_DIR}/task-a.md`]: makeStatusContent("task-a", "build", "standard", "2026-04-28"),
      [`${STATUS_DIR}/task-b.md`]: makeStatusContent("task-b", "review", "standard", "2026-04-30"),
      [`${STATUS_DIR}/task-c.md`]: makeStatusContent("task-c", "ship", "standard", "2026-04-29"),
    };
    const io = createInMemoryIO(files);
    const result = getMostRecentActiveTask(io, FORGE_ROOT);

    expect(result).not.toBeNull();
    expect(result!.taskName).toBe("task-b");
  });

  it("returns null when no active tasks", () => {
    const io = createInMemoryIO({});
    expect(getMostRecentActiveTask(io, FORGE_ROOT)).toBeNull();
  });

  it("excludes completed and aborted tasks", () => {
    const files: Record<string, string> = {
      [`${STATUS_DIR}/task-a.md`]: makeStatusContent("task-a", "completed", "standard", "2026-04-30"),
    };
    const io = createInMemoryIO(files);
    expect(getMostRecentActiveTask(io, FORGE_ROOT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Example tests
// ---------------------------------------------------------------------------

describe("Example: writeTaskStatus single-task mode", () => {
  it("writes to status.md when no status/ dir exists", () => {
    const io = createInMemoryIO();
    const content = makeStatusContent("my-task", "build");
    writeTaskStatus(io, FORGE_ROOT, "my-task", content);

    expect(io.exists(STATUS_FILE)).toBe(true);
    expect(io.read(STATUS_FILE)).toContain("my-task");
  });
});

describe("Example: writeTaskStatus graceful degradation", () => {
  it("does not crash when write fails", () => {
    const io: StatusManagerIO = {
      exists: () => false,
      dirExists: () => false,
      read: () => "",
      write: () => {
        throw new Error("disk full");
      },
      listDir: () => [],
      move: () => {},
      mkdirp: () => {},
    };
    // Should not throw
    expect(() => writeTaskStatus(io, FORGE_ROOT, "my-task", "content")).not.toThrow();
  });
});
