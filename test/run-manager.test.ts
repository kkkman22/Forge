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
}));

// Import after mocking
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { RunManager } from "../src/run-manager.js";

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
  (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// setupNewRun (Requirements 1.3, 7.1, 7.2, 7.4)
// ---------------------------------------------------------------------------

describe("setupNewRun", () => {
  it("creates branch with sanitized name and records base commit", () => {
    const result = RunManager.setupNewRun("Add login form", CWD);

    const mock = execFileSync as Mock;

    // First call: git rev-parse HEAD to record base commit
    expect(mock.mock.calls[0][0]).toBe("git");
    expect(mock.mock.calls[0][1]).toEqual(["rev-parse", "HEAD"]);
    expect(mock.mock.calls[0][2]).toEqual({ cwd: CWD });

    // Second call: git checkout -b forge/<sanitized>
    // sanitizeBranchName strips spaces (not in [a-zA-Z0-9\-_./])
    expect(mock.mock.calls[1][0]).toBe("git");
    expect(mock.mock.calls[1][1]).toEqual(["checkout", "-b", "forge/Addloginform"]);
    expect(mock.mock.calls[1][2]).toEqual({ cwd: CWD });

    // Verify returned setup
    expect(result.runId).toBe(FAKE_UUID);
    expect(result.baseCommit).toBe(FAKE_SHA);
    expect(result.branchName).toBe("forge/Addloginform");
    expect(result.runDir).toBe(`${CWD}/.forge/runs/${FAKE_UUID}/`);
    expect(result.notesPath).toBe(`${CWD}/.forge/runs/${FAKE_UUID}/notes.md`);
  });

  it("falls back to run ID prefix when sanitized name is empty", () => {
    // Objective with only special characters that sanitize to empty
    const result = RunManager.setupNewRun("$();&|<>", CWD);

    const mock = execFileSync as Mock;

    // Branch name should use run ID prefix fallback
    const expectedBranch = `forge/run-${FAKE_UUID.slice(0, 8)}`;
    expect(mock.mock.calls[1][1]).toEqual(["checkout", "-b", expectedBranch]);
    expect(result.branchName).toBe(expectedBranch);
  });

  it("creates run directory and initializes notes file", () => {
    RunManager.setupNewRun("test objective", CWD);

    const expectedRunDir = `${CWD}/.forge/runs/${FAKE_UUID}/`;

    // mkdirSync called with recursive: true
    expect(mkdirSync).toHaveBeenCalledWith(expectedRunDir, { recursive: true });

    // writeFileSync called with notes path and initial content
    const expectedNotesPath = `${expectedRunDir}notes.md`;
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
  it("throws when concurrency limit is reached", () => {
    // Mock git worktree list to return 4 worktrees (1 main + 3 additional)
    const worktreeOutput = [
      "worktree /main/repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /worktrees/wt1",
      "HEAD def456",
      "branch refs/heads/forge/wt1",
      "",
      "worktree /worktrees/wt2",
      "HEAD ghi789",
      "branch refs/heads/forge/wt2",
      "",
      "worktree /worktrees/wt3",
      "HEAD jkl012",
      "branch refs/heads/forge/wt3",
    ].join("\n");

    (execFileSync as Mock).mockImplementation(
      (_exec: string, args: string[], _opts?: Record<string, unknown>) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return Buffer.from(worktreeOutput);
        }
        return Buffer.from(`${FAKE_SHA}\n`);
      },
    );

    expect(() => RunManager.setupWorktree("my task", "/main/repo", 3)).toThrow(
      /Cannot create worktree/,
    );
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
        if (args[0] === "rev-parse") {
          return Buffer.from(`${FAKE_SHA}\n`);
        }
        // git worktree add — no-op
        return Buffer.from("");
      },
    );

    const result = RunManager.setupWorktree("my task", "/main/repo", 3);

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
