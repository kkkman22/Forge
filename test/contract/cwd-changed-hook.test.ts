import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = resolve(__dirname, "../..");

// Paths to hook scripts
const CWD_CHANGED_HOOK = resolve(ROOT, "scripts/cwd-changed-hook.mjs");
const FILE_CHANGED_HOOK = resolve(ROOT, "scripts/file-changed-hook.mjs");

/**
 * Run a hook script with JSON input via stdin.
 * Returns { stdout, stderr, exitCode }.
 */
function runHook(
  scriptPath: string,
  input: Record<string, unknown>,
  env?: Record<string, string>,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [scriptPath], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

/**
 * Parse stdout as JSON, returning null if not valid JSON.
 */
function parseJson(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CwdChanged hook tests
// ---------------------------------------------------------------------------

describe("CwdChanged hook (R16)", () => {
  it("exits 0 and outputs no JSON when on a feature branch", () => {
    // Create a temp repo on a feature branch (not main/master/release-*)
    const tmpRepo = join(tmpdir(), `forge-test-cwd-feature-${Date.now()}`);
    mkdirSync(tmpRepo, { recursive: true });

    try {
      execFileSync("git", ["init", "--initial-branch=main", tmpRepo], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.email", "test@forge.dev"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.name", "Forge Test"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "commit", "--allow-empty", "-m", "init"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "checkout", "-b", "feature/test-branch"], {
        encoding: "utf-8",
        timeout: 5000,
      });

      const result = runHook(
        CWD_CHANGED_HOOK,
        {
          session_id: "test-123",
          cwd: tmpRepo,
          hook_event_name: "CwdChanged",
          old_cwd: ROOT,
          new_cwd: tmpRepo,
        },
        { GIT_DIR: join(tmpRepo, ".git") },
      );

      expect(result.exitCode).toBe(0);
      // Should not output any systemMessage for non-dangerous branches
      const json = parseJson(result.stdout);
      expect(json).toBeNull();
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it("outputs systemMessage warning when on main branch", () => {
    // We simulate being on main by setting GIT_DIR to a temp repo
    const tmpRepo = join(tmpdir(), `forge-test-cwd-main-${Date.now()}`);
    mkdirSync(tmpRepo, { recursive: true });

    try {
      // Initialize a git repo with a main branch
      execFileSync("git", ["init", "--initial-branch=main", tmpRepo], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.email", "test@forge.dev"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.name", "Forge Test"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "commit", "--allow-empty", "-m", "init"], {
        encoding: "utf-8",
        timeout: 5000,
      });

      const result = runHook(
        CWD_CHANGED_HOOK,
        {
          session_id: "test-456",
          cwd: tmpRepo,
          hook_event_name: "CwdChanged",
          old_cwd: ROOT,
          new_cwd: tmpRepo,
        },
        { GIT_DIR: join(tmpRepo, ".git") },
      );

      expect(result.exitCode).toBe(0);
      const json = parseJson(result.stdout);
      expect(json).not.toBeNull();
      expect(json!.systemMessage).toBeTruthy();
      expect(json!.systemMessage).toContain("main");
      expect(json!.systemMessage).toContain("feature/");
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it("outputs systemMessage warning when on master branch", () => {
    const tmpRepo = join(tmpdir(), `forge-test-cwd-master-${Date.now()}`);
    mkdirSync(tmpRepo, { recursive: true });

    try {
      execFileSync("git", ["init", "--initial-branch=master", tmpRepo], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.email", "test@forge.dev"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.name", "Forge Test"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "commit", "--allow-empty", "-m", "init"], {
        encoding: "utf-8",
        timeout: 5000,
      });

      const result = runHook(
        CWD_CHANGED_HOOK,
        {
          session_id: "test-789",
          cwd: tmpRepo,
          hook_event_name: "CwdChanged",
          old_cwd: ROOT,
          new_cwd: tmpRepo,
        },
        { GIT_DIR: join(tmpRepo, ".git") },
      );

      expect(result.exitCode).toBe(0);
      const json = parseJson(result.stdout);
      expect(json).not.toBeNull();
      expect(json!.systemMessage).toBeTruthy();
      expect(json!.systemMessage).toContain("master");
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it("outputs systemMessage warning when on release-* branch", () => {
    const tmpRepo = join(tmpdir(), `forge-test-cwd-release-${Date.now()}`);
    mkdirSync(tmpRepo, { recursive: true });

    try {
      execFileSync("git", ["init", "--initial-branch=main", tmpRepo], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.email", "test@forge.dev"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "config", "user.name", "Forge Test"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "commit", "--allow-empty", "-m", "init"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      execFileSync("git", ["-C", tmpRepo, "checkout", "-b", "release-2.1"], {
        encoding: "utf-8",
        timeout: 5000,
      });

      const result = runHook(
        CWD_CHANGED_HOOK,
        {
          session_id: "test-release",
          cwd: tmpRepo,
          hook_event_name: "CwdChanged",
          old_cwd: ROOT,
          new_cwd: tmpRepo,
        },
        { GIT_DIR: join(tmpRepo, ".git") },
      );

      expect(result.exitCode).toBe(0);
      const json = parseJson(result.stdout);
      expect(json).not.toBeNull();
      expect(json!.systemMessage).toBeTruthy();
      expect(json!.systemMessage).toContain("release-2.1");
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it("handles non-git directories gracefully", () => {
    const tmpDir = join(tmpdir(), `forge-test-nongit-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const result = runHook(CWD_CHANGED_HOOK, {
        session_id: "test-nongit",
        cwd: tmpDir,
        hook_event_name: "CwdChanged",
        old_cwd: ROOT,
        new_cwd: tmpDir,
      });

      // Should exit 0 silently (no git repo = no warning)
      expect(result.exitCode).toBe(0);
      const json = parseJson(result.stdout);
      expect(json).toBeNull();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("never exits non-zero (never blocks)", () => {
    // Even with empty input, should exit 0
    const result = runHook(CWD_CHANGED_HOOK, {
      session_id: "test-empty",
      cwd: "/nonexistent/path",
      hook_event_name: "CwdChanged",
    });

    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FileChanged hook tests
// ---------------------------------------------------------------------------

describe("FileChanged hook (R16)", () => {
  it("exits 0 and outputs no JSON when irrelevant file changes", () => {
    const result = runHook(FILE_CHANGED_HOOK, {
      session_id: "test-123",
      cwd: ROOT,
      hook_event_name: "FileChanged",
      file_path: "/tmp/random-file.txt",
      event: "change",
    });

    expect(result.exitCode).toBe(0);
    const json = parseJson(result.stdout);
    expect(json).toBeNull();
  });

  it("outputs systemMessage when spec-lock file changes", () => {
    // Create a temp .forge structure with status.md and spec-lock
    const tmpProject = join(tmpdir(), `forge-test-filechanged-${Date.now()}`);
    const forgeDir = join(tmpProject, ".tinkerman");
    const stateDir = join(forgeDir, "state");
    mkdirSync(stateDir, { recursive: true });

    try {
      // Write status.md with current_task
      writeFileSync(
        join(forgeDir, "status.md"),
        [
          "---",
          'current_task: "test-feature"',
          "tier: standard",
          "---",
          "",
          "# Status",
          "",
          "Working on test-feature.",
        ].join("\n"),
      );

      // Write spec-lock
      writeFileSync(
        join(stateDir, "spec-lock"),
        JSON.stringify({ spec: "test-feature", locked: true }),
      );

      const result = runHook(
        FILE_CHANGED_HOOK,
        {
          session_id: "test-file-456",
          cwd: tmpProject,
          hook_event_name: "FileChanged",
          file_path: join(stateDir, "spec-lock"),
          event: "change",
        },
        { FORGE_ROOT: tmpProject },
      );

      expect(result.exitCode).toBe(0);
      const json = parseJson(result.stdout);
      expect(json).not.toBeNull();
      expect(json!.systemMessage).toBeTruthy();
      // Should mention the active spec
      expect(json!.systemMessage).toContain("spec");
    } finally {
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it("outputs systemMessage when active progress file changes", () => {
    const tmpProject = join(tmpdir(), `forge-test-filechanged-prog-${Date.now()}`);
    const forgeDir = join(tmpProject, ".tinkerman");
    const progressDir = join(forgeDir, "progress");
    mkdirSync(progressDir, { recursive: true });

    try {
      // Write status.md with current_task
      writeFileSync(
        join(forgeDir, "status.md"),
        ["---", 'current_task: "active-feature"', "tier: standard", "---", "", "# Status"].join(
          "\n",
        ),
      );

      // Write active progress file
      writeFileSync(
        join(progressDir, "active-feature.md"),
        "# Progress\n\n- [x] Task 1\n- [ ] Task 2\n",
      );

      const result = runHook(
        FILE_CHANGED_HOOK,
        {
          session_id: "test-file-prog",
          cwd: tmpProject,
          hook_event_name: "FileChanged",
          file_path: join(progressDir, "active-feature.md"),
          event: "change",
        },
        { FORGE_ROOT: tmpProject },
      );

      expect(result.exitCode).toBe(0);
      const json = parseJson(result.stdout);
      expect(json).not.toBeNull();
      expect(json!.systemMessage).toBeTruthy();
    } finally {
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it("handles missing .forge directory gracefully", () => {
    const tmpProject = join(tmpdir(), `forge-test-noforge-${Date.now()}`);
    mkdirSync(tmpProject, { recursive: true });

    try {
      const result = runHook(
        FILE_CHANGED_HOOK,
        {
          session_id: "test-noforge",
          cwd: tmpProject,
          hook_event_name: "FileChanged",
          file_path: join(tmpProject, ".tinkerman", "state", "spec-lock"),
          event: "change",
        },
        { FORGE_ROOT: tmpProject },
      );

      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it("never exits non-zero (never blocks)", () => {
    const result = runHook(FILE_CHANGED_HOOK, {
      session_id: "test-empty",
      cwd: "/nonexistent",
      hook_event_name: "FileChanged",
      file_path: "/nonexistent/file",
      event: "change",
    });

    expect(result.exitCode).toBe(0);
  });
});
