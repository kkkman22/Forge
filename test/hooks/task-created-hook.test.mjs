#!/usr/bin/env node

/**
 * Tests for scripts/task-created-hook.mjs
 *
 * Validates: reads .forge/plans/ and outputs task summary.
 * Fail-open: exits 0 on any condition.
 */

import { execSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

const TMPDIR = join(process.env.TMPDIR || "/tmp", "task-created-test");
const SCRIPT = join(process.cwd(), "scripts", "task-created-hook.mjs");

function runHook(env = {}) {
  try {
    const stdout = execSync(`node "${SCRIPT}"`, {
      cwd: TMPDIR,
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (e) {
    return {
      stdout: (e.stdout || "").trim(),
      exitCode: e.status ?? 1,
    };
  }
}

describe("task-created-hook.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });

  test("outputs task summary when plan file exists", () => {
    mkdirSync(join(TMPDIR, ".forge", "plans"), { recursive: true });
    writeFileSync(
      join(TMPDIR, ".forge", "plans", "test-plan.md"),
      `# Plan

## Task 1: Setup database
- [ ] Create schema
- [ ] Run migrations

## Task 2: Add API endpoints
- [ ] GET /users
- [ ] POST /users
`
    );
    const result = runHook();
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("Task"), `Expected task in: ${result.stdout}`);
  });

  test("exits 0 silently when no plan files exist", () => {
    rmSync(join(TMPDIR, ".forge", "plans"), { recursive: true, force: true });
    mkdirSync(join(TMPDIR, ".forge", "plans"), { recursive: true });
    const result = runHook();
    assert.equal(result.exitCode, 0);
  });

  test("exits 0 silently when .forge/plans/ does not exist", () => {
    rmSync(join(TMPDIR, ".forge"), { recursive: true, force: true });
    const result = runHook();
    assert.equal(result.exitCode, 0);
  });

  test("exits 0 even on malformed plan file", () => {
    mkdirSync(join(TMPDIR, ".forge", "plans"), { recursive: true });
    writeFileSync(
      join(TMPDIR, ".forge", "plans", "bad-plan.md"),
      "\x00\x01\x02 binary garbage"
    );
    const result = runHook();
    assert.equal(result.exitCode, 0);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});
