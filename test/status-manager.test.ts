import { describe, expect, it } from "vitest";
import { clearLoopFields } from "../src/status-file-ext.js";
import {
  archiveTaskStatus,
  getMostRecentActiveTask,
  listActiveTasks,
  migrateToMultiTask,
  readTaskStatus,
  type StatusManagerIO,
  writeTaskStatus,
} from "../src/status-manager.js";

// ---------------------------------------------------------------------------
// In-memory IO implementation for testing
// ---------------------------------------------------------------------------

function createInMemoryIO(files: Record<string, string> = {}): StatusManagerIO {
  const store = { ...files };
  return {
    exists: (p) => p in store,
    dirExists: (p) => Object.keys(store).some((k) => k.startsWith(`${p}/`)),
    read: (p) => store[p] ?? "",
    write: (p, content) => {
      store[p] = content;
    },
    listDir: (p) =>
      Object.keys(store)
        .filter((k) => k.startsWith(`${p}/`))
        .map((k) => k.slice(p.length + 1)),
    move: (src, dest) => {
      store[dest] = store[src] ?? "";
      delete store[src];
    },
    mkdirp: () => {},
    // No-op locks: the in-memory store is single-threaded within one test, so
    // RMW is already serial. Real-fs O_EXCL locking is exercised separately
    // by test/status-atomic.test.ts (5-process concurrent worker).
    acquireLock: () => {},
    releaseLock: () => {},
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

function _makeTaskFile(taskName: string, phase: string): { path: string; content: string } {
  const taskId = taskName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    expect(result?.taskName).toBe("task-b");
  });

  it("returns null when no active tasks", () => {
    const io = createInMemoryIO({});
    expect(getMostRecentActiveTask(io, FORGE_ROOT)).toBeNull();
  });

  it("excludes completed and aborted tasks", () => {
    const files: Record<string, string> = {
      [`${STATUS_DIR}/task-a.md`]: makeStatusContent(
        "task-a",
        "completed",
        "standard",
        "2026-04-30",
      ),
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

// ---------------------------------------------------------------------------
// Property 7: Router multi-task routing
// ---------------------------------------------------------------------------

describe("Property 7: Router multi-task routing", () => {
  it("writes to task-specific file when other active tasks exist", () => {
    const files: Record<string, string> = {
      [`${STATUS_DIR}/existing-task.md`]: makeStatusContent("existing-task", "build"),
    };
    const io = createInMemoryIO(files);

    writeTaskStatus(io, FORGE_ROOT, "new-task", makeStatusContent("new-task", "review"));

    // new-task should be written to status/ dir (not status.md)
    expect(io.exists(`${STATUS_DIR}/new-task.md`)).toBe(true);
    expect(io.read(`${STATUS_DIR}/new-task.md`)).toContain("new-task");
    // existing task should be untouched
    expect(io.read(`${STATUS_DIR}/existing-task.md`)).toContain("existing-task");
  });
});

// ---------------------------------------------------------------------------
// Property 10: Migration data preservation
// ---------------------------------------------------------------------------

describe("Property 10: Migration data preservation", () => {
  it("preserves legacy content in task-specific file after migration", () => {
    const legacyContent = `---\ncurrent_task: "legacy-task"\ntier: "standard"\nphase: "build"\nupdated: "2026-04-28"\n---\n\n# Status\nIn progress...`;
    const io = createInMemoryIO({ [STATUS_FILE]: legacyContent });

    migrateToMultiTask(io, FORGE_ROOT);

    // Legacy content should be in task-specific file
    expect(io.exists(`${STATUS_DIR}/legacy-task.md`)).toBe(true);
    expect(io.read(`${STATUS_DIR}/legacy-task.md`)).toBe(legacyContent);
  });
});

// ---------------------------------------------------------------------------
// Audit P1: migration must hold a directory-level lock and be idempotent
// ---------------------------------------------------------------------------

describe("Audit P1: migration transactionality", () => {
  it("acquires a migration lock to serialize concurrent migrations", () => {
    const legacyContent = makeStatusContent("legacy-task", "build");
    const lockCalls: string[] = [];
    const io = createInMemoryIO({ [STATUS_FILE]: legacyContent });
    io.acquireLock = (lockPath: string) => { lockCalls.push(lockPath); };
    io.releaseLock = (lockPath: string) => { lockCalls.push(`release:${lockPath}`); };

    migrateToMultiTask(io, FORGE_ROOT);

    // A directory-level migration lock must have been acquired + released.
    expect(lockCalls.some((p) => p.includes("migrate"))).toBe(true);
    expect(lockCalls.some((p) => p.startsWith("release:"))).toBe(true);
  });

  it("is idempotent: target task file not overwritten if it already exists", () => {
    const legacyContent = makeStatusContent("task-x", "build");
    // Pre-existing target file (e.g. a prior partial migration) with different content.
    const existingTarget = `${STATUS_DIR}/task-x.md`;
    const io = createInMemoryIO({
      [STATUS_FILE]: legacyContent,
      [existingTarget]: "# pre-existing, must not be clobbered",
    });

    migrateToMultiTask(io, FORGE_ROOT);

    // The pre-existing file must survive — migration must not blindly overwrite.
    expect(io.read(existingTarget)).toBe("# pre-existing, must not be clobbered");
    // Legacy status.md still cleared (migration completes).
    expect(io.read(STATUS_FILE)).toBe("---\n---\n");
  });
});

// ---------------------------------------------------------------------------
// Property 11: Abort isolation
// ---------------------------------------------------------------------------

describe("Property 11: Abort isolation", () => {
  it("archiving one task leaves other tasks unchanged", () => {
    const files: Record<string, string> = {
      [`${STATUS_DIR}/task-a.md`]: makeStatusContent("task-a", "build"),
      [`${STATUS_DIR}/task-b.md`]: makeStatusContent("task-b", "review"),
    };
    const io = createInMemoryIO(files);

    archiveTaskStatus(io, FORGE_ROOT, "task-a", "2026-04-30");

    // task-a should be moved to archive
    expect(io.exists(`${STATUS_DIR}/task-a.md`)).toBe(false);
    expect(io.exists(`${FORGE_ROOT}/archive/2026-04-30-task-a/status.md`)).toBe(true);
    // task-b should be untouched
    expect(io.read(`${STATUS_DIR}/task-b.md`)).toContain("task-b");
  });
});

// ---------------------------------------------------------------------------
// Example: migration and directory behavior
// ---------------------------------------------------------------------------

describe("Example: migration triggers on second task write", () => {
  it("auto-migrates when writing a second task to single-task mode", () => {
    const legacyContent = makeStatusContent("first-task", "build");
    const io = createInMemoryIO({ [STATUS_FILE]: legacyContent });

    // Simulate adding a second task — should trigger migration
    // First, manually set up what writeTaskStatus would see:
    // status.md exists, status/ dir doesn't
    writeTaskStatus(io, FORGE_ROOT, "second-task", makeStatusContent("second-task", "review"));

    // After migration, both tasks should be in status/ dir
    expect(io.exists(`${STATUS_DIR}/first-task.md`)).toBe(true);
    expect(io.exists(`${STATUS_DIR}/second-task.md`)).toBe(true);
  });
});

describe("Example: directory not auto-deleted", () => {
  it("keeps status/ dir when all tasks complete", () => {
    const files: Record<string, string> = {
      [`${STATUS_DIR}/task-a.md`]: makeStatusContent("task-a", "completed"),
    };
    const io = createInMemoryIO(files);

    const active = listActiveTasks(io, FORGE_ROOT);
    expect(active).toHaveLength(0);
    // Directory still exists
    expect(io.dirExists(STATUS_DIR)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 8: Loop cleanup isolation
// ---------------------------------------------------------------------------

describe("Property 8: Loop cleanup isolation", () => {
  it("clearing loop fields for one task leaves other tasks unchanged", () => {
    const taskAContent = `---\ncurrent_task: "task-a"\ntier: "standard"\nphase: "build"\nmode: "autonomous"\nloop_run_id: "run-aaa"\nloop_iteration: 3\nskill_sequence: "plan,build"\nupdated: "2026-04-30"\n---\n`;
    const taskBContent = `---\ncurrent_task: "task-b"\ntier: "full"\nphase: "review"\nmode: "autonomous"\nloop_run_id: "run-bbb"\nloop_iteration: 5\nskill_sequence: "decide,spec,plan,build"\nupdated: "2026-04-30"\n---\n`;

    const io = createInMemoryIO({
      [`${STATUS_DIR}/task-a.md`]: taskAContent,
      [`${STATUS_DIR}/task-b.md`]: taskBContent,
    });

    // Clear loop fields for task-a
    const aContent = io.read(`${STATUS_DIR}/task-a.md`);
    const cleaned = clearLoopFields(aContent);
    io.write(`${STATUS_DIR}/task-a.md`, cleaned);

    // task-a should have loop fields cleared
    const aAfter = io.read(`${STATUS_DIR}/task-a.md`);
    expect(aAfter).not.toContain("loop_run_id");
    expect(aAfter).not.toContain("loop_iteration");
    expect(aAfter).toContain("task-a");

    // task-b should be byte-identical to original
    expect(io.read(`${STATUS_DIR}/task-b.md`)).toBe(taskBContent);
  });
});
