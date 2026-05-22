/**
 * Unit tests for the RunManager class.
 *
 * Verifies run lifecycle management: directory setup, branch creation,
 * notes persistence, resume behavior, and worktree orchestration.
 *
 * **Validates: Requirements 1.3, 7.1, 7.2, 7.3, 7.4**
 */
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

// Mock node:crypto before importing the module under test
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(),
}));

// Mock node:fs before importing the module under test
vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
  openSync: vi.fn(),
  closeSync: vi.fn(),
  unlinkSync: vi.fn(),
  constants: {
    O_CREAT: 64,
    O_EXCL: 128,
    O_WRONLY: 1,
  },
}));

// Import after mocking
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { acquireFileLock, RunManager, releaseFileLock } from "../src/run-manager.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const FAKE_SHA = "abc123def456789012345678901234567890abcd";
const CWD = "/test/repo";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  (randomUUID as Mock).mockReturnValue(FAKE_UUID);
  // Default: branchExists returns false (branch not found), rev-parse HEAD returns SHA
  (execFileSync as Mock).mockImplementation(
    (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        throw new Error("branch not found");
      }
      return Buffer.from(`${FAKE_SHA}\n`);
    },
  );
  // Default: openSync succeeds (returns a fake file descriptor)
  (openSync as Mock).mockReturnValue(42);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// setupNewRun (Requirements 1.3, 7.1, 7.2, 7.4)
// ---------------------------------------------------------------------------

describe("setupNewRun", () => {
  it("creates branch with sanitized name and records base commit", () => {
    // Mock execFileSync: branchExists check should fail (branch doesn't exist)
    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        return Buffer.from(`${FAKE_SHA}\n`);
      },
    );

    const result = RunManager.setupNewRun("Add login form", CWD);

    const mock = execFileSync as Mock;

    // First call: branchExists check (git rev-parse --verify refs/heads/forge/Addloginform)
    expect(mock.mock.calls[0][0]).toBe("git");
    expect(mock.mock.calls[0][1]).toEqual([
      "rev-parse",
      "--verify",
      "refs/heads/forge/Addloginform",
    ]);

    // Second call: git rev-parse HEAD to record base commit
    expect(mock.mock.calls[1][0]).toBe("git");
    expect(mock.mock.calls[1][1]).toEqual(["rev-parse", "HEAD"]);
    expect(mock.mock.calls[1][2]).toEqual(expect.objectContaining({ cwd: CWD }));

    // Third call: git checkout -b forge/<sanitized>
    expect(mock.mock.calls[2][0]).toBe("git");
    expect(mock.mock.calls[2][1]).toEqual(["checkout", "-b", "forge/Addloginform"]);
    expect(mock.mock.calls[2][2]).toEqual(expect.objectContaining({ cwd: CWD }));

    // Verify returned setup
    expect(result.runId).toBe(FAKE_UUID);
    expect(result.baseCommit).toBe(FAKE_SHA);
    expect(result.branchName).toBe("forge/Addloginform");
    expect(result.runDir).toBe(`${CWD}/.forge/runs/${FAKE_UUID}`);
    expect(result.notesPath).toBe(`${CWD}/.forge/runs/${FAKE_UUID}/notes.md`);
  });

  it("falls back to run ID prefix when sanitized name is empty", () => {
    // Mock execFileSync: branchExists check should fail (branch doesn't exist)
    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        return Buffer.from(`${FAKE_SHA}\n`);
      },
    );

    // Objective with only special characters that sanitize to empty
    const result = RunManager.setupNewRun("$();&|<>", CWD);

    const mock = execFileSync as Mock;

    // Branch name should use run ID prefix fallback
    const expectedBranch = `forge/run-${FAKE_UUID.slice(0, 8)}`;
    // Call 0: branchExists, Call 1: rev-parse HEAD, Call 2: checkout -b
    expect(mock.mock.calls[2][1]).toEqual(["checkout", "-b", expectedBranch]);
    expect(result.branchName).toBe(expectedBranch);
  });

  it("creates run directory and initializes notes file", () => {
    RunManager.setupNewRun("test objective", CWD);

    const expectedRunDir = `${CWD}/.forge/runs/${FAKE_UUID}`;

    // mkdirSync called with recursive: true
    expect(mkdirSync).toHaveBeenCalledWith(expectedRunDir, { recursive: true });

    // writeFileSync called with notes path and initial content
    const expectedNotesPath = `${expectedRunDir}/notes.md`;
    expect(writeFileSync).toHaveBeenCalledWith(
      expectedNotesPath,
      expect.stringContaining(`# Run: ${FAKE_UUID}`),
      "utf-8",
    );
  });
});

// ---------------------------------------------------------------------------
// resumeRun (Requirements 7.3)
// ---------------------------------------------------------------------------

describe("resumeRun", () => {
  it("reads existing notes and returns correct lastIteration", () => {
    const branchName = "forge/my-feature";

    // Mock existsSync to find the runs directory and notes file
    (existsSync as Mock).mockImplementation((p: string) => {
      if (p === `${CWD}/.forge/runs/`) return true;
      if (p === `${CWD}/.forge/runs/existing-run/notes.md`) return true;
      return false;
    });

    // Mock readdirSync to return a directory entry
    (readdirSync as Mock).mockReturnValue([{ name: "existing-run", isDirectory: () => true }]);

    // Mock readFileSync to return notes content with 3 iterations
    const notesContent = [
      "# Run: existing-run-id",
      "Branch: forge/my-feature",
      "",
      "## Iteration Log",
      "",
      "### Iteration 1",
      "",
      "**Summary:** First iteration done",
      "",
      "### Iteration 2",
      "",
      "**Summary:** Second iteration done",
      "",
      "### Iteration 3",
      "",
      "**Summary:** Third iteration done",
      "",
    ].join("\n");

    (readFileSync as Mock).mockReturnValue(notesContent);

    const result = RunManager.resumeRun(branchName, CWD);

    expect(result.lastIteration).toBe(3);
    expect(result.branchName).toBe(branchName);
    expect(result.baseCommit).toBe(FAKE_SHA);
    expect(result.runId).toBe("existing-run-id");
  });

  it("creates new run directory when no existing run found", () => {
    const branchName = "forge/new-feature";

    // Mock existsSync to indicate no runs directory exists
    (existsSync as Mock).mockReturnValue(false);

    const result = RunManager.resumeRun(branchName, CWD);

    // Should create a new run directory
    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
    expect(result.lastIteration).toBe(0);
    expect(result.branchName).toBe(branchName);
    expect(result.runId).toBe(FAKE_UUID);
  });
});

// ---------------------------------------------------------------------------
// persistNotes (Requirement 5.4)
// ---------------------------------------------------------------------------

describe("persistNotes", () => {
  it("calls writeFileSync with correct path and content", () => {
    const notesPath = "/test/repo/.forge/runs/abc/notes.md";
    const content = "# Run: abc\n\n## Iteration Log\n";

    RunManager.persistNotes(notesPath, content);

    expect(writeFileSync).toHaveBeenCalledWith(notesPath, content, "utf-8");
  });
});

// ---------------------------------------------------------------------------
// setupWorktree (Requirements 7.1, 7.2, 7.4)
// ---------------------------------------------------------------------------

describe("setupWorktree", () => {
  it("removes stale worktree directory before creating new one", () => {
    // Simulate a stale directory left by a previous interrupted run
    const worktreeOutput = ["worktree /main/repo", "HEAD abc123", "branch refs/heads/main"].join(
      "\n",
    );

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        return Buffer.from("");
      },
    );

    // Simulate stale directory existing at the worktree path
    // The worktree path for "/main/repo" + "mytask" is "/main/repo-forge-worktrees/mytask/"
    const stalePath = "/main/repo-forge-worktrees/mytask/";
    (existsSync as Mock).mockImplementation((p: string) => p === stalePath);

    const result = RunManager.setupWorktree("my task", "/main/repo");

    // rmSync should have been called to clean up the stale directory
    expect(rmSync).toHaveBeenCalledWith(stalePath, { recursive: true, force: true });

    // Worktree creation should still succeed
    expect(result.runId).toBe(FAKE_UUID);
    expect(result.branchName).toBe("forge/mytask");
  });

  it("creates worktree when under limit", () => {
    // Mock git worktree list to return only the main worktree
    const worktreeOutput = ["worktree /main/repo", "HEAD abc123", "branch refs/heads/main"].join(
      "\n",
    );

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          // Branch doesn't exist yet
          throw new Error("branch not found");
        }
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        // git worktree add — no-op
        return Buffer.from("");
      },
    );

    const result = RunManager.setupWorktree("my task", "/main/repo");

    const mock = execFileSync as Mock;

    // Verify git worktree add was called
    const worktreeAddCall = mock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) && call[1][0] === "worktree" && call[1][1] === "add",
    );
    expect(worktreeAddCall).toBeDefined();

    // Verify result
    expect(result.runId).toBe(FAKE_UUID);
    // sanitizeBranchName strips spaces, so "my task" → "mytask"
    expect(result.branchName).toBe("forge/mytask");
    expect(result.worktreePath).toBeDefined();
    expect(result.baseCommit).toBe(FAKE_SHA);

    // Verify run directory and notes were created
    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setupWorktree orphan branch cleanup (Requirements 11.1, 11.2, 11.3)
// ---------------------------------------------------------------------------

describe("setupWorktree orphan branch cleanup", () => {
  it("deletes orphan branch when run directory initialization fails", () => {
    const worktreeOutput = ["worktree /main/repo", "HEAD abc123", "branch refs/heads/main"].join(
      "\n",
    );

    // Track calls to identify the branch -D call
    const gitCalls: string[][] = [];

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        gitCalls.push(args);
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        return Buffer.from("");
      },
    );

    (openSync as Mock).mockReturnValue(42);

    // Make mkdirSync succeed for the lock dir but fail for the run dir inside worktree
    let mkdirCallCount = 0;
    (mkdirSync as Mock).mockImplementation((_p: string, _opts?: Record<string, unknown>) => {
      mkdirCallCount++;
      // First call: lock directory (succeed)
      // Second call: run directory inside worktree (fail to trigger orphan cleanup)
      if (mkdirCallCount === 2) {
        throw new Error("EACCES: permission denied");
      }
    });

    expect(() => RunManager.setupWorktree("my task", "/main/repo")).toThrow(
      /Run directory initialization failed/,
    );

    // Verify git branch -D was called to clean up the orphan branch
    const branchDeleteCall = gitCalls.find((call) => call[0] === "branch" && call[1] === "-D");
    expect(branchDeleteCall).toBeDefined();
    expect(branchDeleteCall?.[2]).toBe("forge/mytask");
  });

  it("includes branch name in error message when branch deletion fails", () => {
    const worktreeOutput = ["worktree /main/repo", "HEAD abc123", "branch refs/heads/main"].join(
      "\n",
    );

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        // Make branch -D fail
        if (args[0] === "branch" && args[1] === "-D") {
          throw new Error("error: branch not found");
        }
        return Buffer.from("");
      },
    );

    (openSync as Mock).mockReturnValue(42);

    // Make mkdirSync fail on the second call (run dir inside worktree)
    let mkdirCallCount = 0;
    (mkdirSync as Mock).mockImplementation((_p: string, _opts?: Record<string, unknown>) => {
      mkdirCallCount++;
      if (mkdirCallCount === 2) {
        throw new Error("EACCES: permission denied");
      }
    });

    try {
      RunManager.setupWorktree("my task", "/main/repo");
      // Should not reach here
      expect.unreachable("Expected setupWorktree to throw");
    } catch (err) {
      const message = (err as Error).message;
      // Error message should mention the orphan branch for manual cleanup
      expect(message).toContain("forge/mytask");
      expect(message).toContain("manual cleanup");
    }
  });

  it("cleans up worktree before attempting branch deletion", () => {
    const worktreeOutput = ["worktree /main/repo", "HEAD abc123", "branch refs/heads/main"].join(
      "\n",
    );

    const gitCallOrder: string[] = [];

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        if (args[0] === "worktree" && args[1] === "remove") {
          gitCallOrder.push("worktree-remove");
          return Buffer.from("");
        }
        if (args[0] === "branch" && args[1] === "-D") {
          gitCallOrder.push("branch-delete");
          return Buffer.from("");
        }
        return Buffer.from("");
      },
    );

    (openSync as Mock).mockReturnValue(42);

    // Make mkdirSync fail on the second call (run dir inside worktree)
    let mkdirCallCount = 0;
    (mkdirSync as Mock).mockImplementation((_p: string, _opts?: Record<string, unknown>) => {
      mkdirCallCount++;
      if (mkdirCallCount === 2) {
        throw new Error("EACCES: permission denied");
      }
    });

    expect(() => RunManager.setupWorktree("my task", "/main/repo")).toThrow();

    // Worktree removal should happen before branch deletion
    expect(gitCallOrder).toEqual(["worktree-remove", "branch-delete"]);
  });
});

// ---------------------------------------------------------------------------
// acquireFileLock / releaseFileLock (Requirements 2.1, 2.3)
// ---------------------------------------------------------------------------

describe("acquireFileLock", () => {
  it("returns file descriptor on successful lock acquisition", () => {
    (openSync as Mock).mockReturnValue(7);

    const fd = acquireFileLock("/tmp/test.lock", 1000);

    expect(fd).toBe(7);
    expect(openSync).toHaveBeenCalledTimes(1);
  });

  it("returns null when lock cannot be acquired within timeout", () => {
    // Always throw EEXIST to simulate another process holding the lock
    const eexistErr = Object.assign(new Error("file exists"), { code: "EEXIST" });
    (openSync as Mock).mockImplementation(() => {
      throw eexistErr;
    });

    // Mock Date.now to simulate instant timeout
    let callCount = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      callCount++;
      // First call sets the deadline, subsequent calls exceed it
      return callCount === 1 ? 0 : 10_000;
    });

    try {
      const fd = acquireFileLock("/tmp/test.lock", 100);
      expect(fd).toBeNull();
    } finally {
      vi.spyOn(Date, "now").mockRestore();
    }
  });

  it("propagates non-EEXIST errors", () => {
    const enoentErr = Object.assign(new Error("no such file or directory"), { code: "ENOENT" });
    (openSync as Mock).mockImplementation(() => {
      throw enoentErr;
    });

    expect(() => acquireFileLock("/tmp/test.lock", 1000)).toThrow("no such file or directory");
  });
});

describe("releaseFileLock", () => {
  it("calls unlinkSync to remove the lock file", () => {
    releaseFileLock("/tmp/test.lock", 7);

    expect(unlinkSync).toHaveBeenCalledWith("/tmp/test.lock");
  });

  it("does not throw if unlinkSync fails", () => {
    (unlinkSync as Mock).mockImplementation(() => {
      throw new Error("permission denied");
    });

    // Should not throw
    expect(() => releaseFileLock("/tmp/test.lock", 7)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setupWorktree file-lock integration (Requirements 2.1, 2.2, 2.3, 2.4)
// ---------------------------------------------------------------------------

describe("setupWorktree file-lock integration", () => {
  it("acquires and releases file lock during worktree creation", () => {
    const worktreeOutput = ["worktree /main/repo", "HEAD abc123", "branch refs/heads/main"].join(
      "\n",
    );

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        return Buffer.from("");
      },
    );

    (openSync as Mock).mockReturnValue(42);

    RunManager.setupWorktree("my task", "/main/repo");

    // Lock was acquired (openSync called with O_CREAT | O_EXCL flags)
    expect(openSync).toHaveBeenCalled();
    // Lock was released (unlinkSync called on the lock file)
    expect(unlinkSync).toHaveBeenCalled();
  });

  it("throws on lock timeout with descriptive message", () => {
    const eexistErr = Object.assign(new Error("file exists"), { code: "EEXIST" });
    (openSync as Mock).mockImplementation(() => {
      throw eexistErr;
    });

    // Mock Date.now to simulate instant timeout
    let callCount = 0;
    const _originalDateNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => {
      callCount++;
      // First call sets the deadline, subsequent calls exceed it
      return callCount === 1 ? 0 : 10_000;
    });

    try {
      expect(() => RunManager.setupWorktree("my task", "/main/repo")).toThrow(/lock timeout/i);
    } finally {
      vi.spyOn(Date, "now").mockRestore();
    }
  });

  it("falls back to lockless mode when lock mechanism fails", () => {
    // Simulate mkdirSync succeeding but openSync throwing a non-EEXIST error
    // (e.g., permission denied on the lock file itself)
    const epermErr = Object.assign(new Error("permission denied"), { code: "EPERM" });
    (openSync as Mock).mockImplementation(() => {
      throw epermErr;
    });

    const worktreeOutput = ["worktree /main/repo", "HEAD abc123", "branch refs/heads/main"].join(
      "\n",
    );

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("branch not found");
        }
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        return Buffer.from("");
      },
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Should NOT throw — falls back to lockless mode
    const result = RunManager.setupWorktree("my task", "/main/repo");

    expect(result.runId).toBe(FAKE_UUID);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("file-lock mechanism failed"));

    warnSpy.mockRestore();
  });

  it("releases lock even when worktree creation throws", () => {
    (openSync as Mock).mockReturnValue(42);

    // Make git worktree add throw to trigger the error path
    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "add") {
          throw new Error("worktree add failed");
        }
        return Buffer.from(`${FAKE_SHA}\n`);
      },
    );

    expect(() => RunManager.setupWorktree("my task", "/main/repo")).toThrow(/worktree add failed/);

    // Lock should still be released in the finally block
    expect(unlinkSync).toHaveBeenCalled();
  });
});
