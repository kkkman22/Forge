#!/usr/bin/env node

/**
 * Tests for scripts/permission-denied-hook.mjs
 *
 * Validates: retry logic for denied operations
 * - Read ops → retry: true
 * - Write ops → no retry
 * Fail-open: exits 0 on any condition.
 */

import { execSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

const TMPDIR = join(process.env.TMPDIR || "/tmp", "permission-denied-test");
const SCRIPT = join(process.cwd(), "scripts", "permission-denied-hook.mjs");

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
    return { stdout: (e.stdout || "").trim(), exitCode: e.status ?? 1 };
  }
}

describe("permission-denied-hook.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(TMPDIR, { recursive: true });
  });

  test("retries read operation (Read tool)", () => {
    const result = runHook({
      PERMISSION_DENIED_TOOL: "Read",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("retry"), `Expected retry in: ${result.stdout}`);
  });

  test("retries read operation (Grep tool)", () => {
    const result = runHook({
      PERMISSION_DENIED_TOOL: "Grep",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("retry"), `Expected retry in: ${result.stdout}`);
  });

  test("retries read operation (Glob tool)", () => {
    const result = runHook({
      PERMISSION_DENIED_TOOL: "Glob",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("retry"), `Expected retry in: ${result.stdout}`);
  });

  test("does not retry Write tool", () => {
    const result = runHook({
      PERMISSION_DENIED_TOOL: "Write",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("retry"), `Should NOT retry write: ${result.stdout}`);
  });

  test("does not retry Edit tool", () => {
    const result = runHook({
      PERMISSION_DENIED_TOOL: "Edit",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("retry"), `Should NOT retry edit: ${result.stdout}`);
  });

  test("does not retry Bash tool", () => {
    const result = runHook({
      PERMISSION_DENIED_TOOL: "Bash",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("retry"), `Should NOT retry bash: ${result.stdout}`);
  });

  test("exits 0 when no env var", () => {
    const result = runHook();
    assert.equal(result.exitCode, 0);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});
