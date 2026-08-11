#!/usr/bin/env node

/**
 * Tests for scripts/worktree-create-hook.mjs and worktree-remove-hook.mjs
 *
 * Validates: worktree tracking in .tinkerman/progress/worktrees.json
 * Fail-open: exits 0 on any condition.
 */

import { execSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const TMPDIR = join(process.env.TMPDIR || "/tmp", "worktree-hook-test");
const SCRIPTS_DIR = join(process.cwd(), "scripts");
const CREATE_SCRIPT = join(SCRIPTS_DIR, "worktree-create-hook.mjs");
const REMOVE_SCRIPT = join(SCRIPTS_DIR, "worktree-remove-hook.mjs");

function runCreate(env = {}) {
  try {
    const stdout = execSync(`node "${CREATE_SCRIPT}"`, {
      cwd: TMPDIR,
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (e) {
    return { stdout: (e.stdout || "").trim(), exitCode: e.status ?? 1 };
  }
}

function runRemove(env = {}, cwd = TMPDIR) {
  try {
    const stdout = execSync(`node "${REMOVE_SCRIPT}"`, {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (e) {
    return { stdout: (e.stdout || "").trim(), exitCode: e.status ?? 1 };
  }
}

function readWorktreesJson() {
  return readWorktreesJsonFrom(TMPDIR);
}

function readWorktreesJsonFrom(root) {
  const p = join(root, ".tinkerman", "progress", "worktrees.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

describe("worktree-create-hook.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(TMPDIR, { recursive: true });
  });

  test("creates worktrees.json with worktree info", () => {
    const result = runCreate({
      WORKTREE_PATH: "/tmp/test-wt",
      WORKTREE_BRANCH: "feature/test",
    });
    assert.equal(result.exitCode, 0);

    const data = readWorktreesJson();
    assert.ok(data, "worktrees.json should exist");
    assert.ok(Array.isArray(data.worktrees), "should have worktrees array");
    assert.equal(data.worktrees.length, 1);
    assert.equal(data.worktrees[0].path, "/tmp/test-wt");
    assert.equal(data.worktrees[0].branch, "feature/test");
  });

  test("appends additional worktrees", () => {
    runCreate({
      WORKTREE_PATH: "/tmp/test-wt-2",
      WORKTREE_BRANCH: "feature/test-2",
    });
    const data = readWorktreesJson();
    assert.equal(data.worktrees.length, 2);
    assert.equal(data.worktrees[1].path, "/tmp/test-wt-2");
  });

  test("exits 0 when no env vars", () => {
    const result = runCreate();
    assert.equal(result.exitCode, 0);
  });

  test("auto-creates .tinkerman/progress/ if missing", () => {
    rmSync(join(TMPDIR, ".tinkerman"), { recursive: true, force: true });
    const result = runCreate({
      WORKTREE_PATH: "/tmp/test-wt-3",
      WORKTREE_BRANCH: "feature/test-3",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(existsSync(join(TMPDIR, ".tinkerman", "progress", "worktrees.json")));
  });

  test("handles corrupted worktrees.json gracefully", () => {
    mkdirSync(join(TMPDIR, ".tinkerman", "progress"), { recursive: true });
    writeFileSync(
      join(TMPDIR, ".tinkerman", "progress", "worktrees.json"),
      "not json{{{"
    );
    const result = runCreate({
      WORKTREE_PATH: "/tmp/test-wt-4",
      WORKTREE_BRANCH: "feature/test-4",
    });
    assert.equal(result.exitCode, 0);
    const data = readWorktreesJson();
    assert.ok(data.worktrees.length >= 1);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});

describe("worktree-remove-hook.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(TMPDIR, { recursive: true });
  });

  beforeEach(() => {
    mkdirSync(join(TMPDIR, ".tinkerman", "progress"), { recursive: true });
    writeFileSync(
      join(TMPDIR, ".tinkerman", "progress", "worktrees.json"),
      JSON.stringify({
        worktrees: [
          { path: "/tmp/wt-a", branch: "feature/a", created: "2026-05-30" },
          { path: "/tmp/wt-b", branch: "feature/b", created: "2026-05-30" },
        ],
      })
    );
  });

  test("removes specified worktree from record", () => {
    const result = runRemove({
      WORKTREE_PATH: "/tmp/wt-a",
    });
    assert.equal(result.exitCode, 0);
    const data = readWorktreesJson();
    assert.equal(data.worktrees.length, 1);
    assert.equal(data.worktrees[0].path, "/tmp/wt-b");
  });

  test("exits 0 when worktree not found in record", () => {
    const result = runRemove({
      WORKTREE_PATH: "/tmp/nonexistent",
    });
    assert.equal(result.exitCode, 0);
    const data = readWorktreesJson();
    assert.equal(data.worktrees.length, 2);
  });

  test("exits 0 when no worktrees.json exists", () => {
    rmSync(join(TMPDIR, ".tinkerman", "progress", "worktrees.json"), { force: true });
    const result = runRemove({
      WORKTREE_PATH: "/tmp/wt-a",
    });
    assert.equal(result.exitCode, 0);
  });

  test("exits 0 when no env vars", () => {
    const result = runRemove();
    assert.equal(result.exitCode, 0);
  });

  test("uses FORGE_PROJECT_ROOT instead of cwd when provided", () => {
    const projectRoot = join(TMPDIR, "project-root");
    const otherCwd = join(TMPDIR, "other-cwd");
    mkdirSync(join(projectRoot, ".tinkerman", "progress"), { recursive: true });
    mkdirSync(otherCwd, { recursive: true });
    writeFileSync(
      join(projectRoot, ".tinkerman", "progress", "worktrees.json"),
      JSON.stringify({
        worktrees: [
          { path: "/tmp/wt-a", branch: "feature/a", created: "2026-05-30" },
          { path: "/tmp/wt-b", branch: "feature/b", created: "2026-05-30" },
        ],
      }),
    );

    const result = runRemove(
      {
        FORGE_PROJECT_ROOT: projectRoot,
        WORKTREE_PATH: "/tmp/wt-a",
      },
      otherCwd,
    );

    assert.equal(result.exitCode, 0);
    const data = readWorktreesJsonFrom(projectRoot);
    assert.equal(data.worktrees.length, 1);
    assert.equal(data.worktrees[0].path, "/tmp/wt-b");
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});
