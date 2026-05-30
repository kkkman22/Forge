#!/usr/bin/env node

/**
 * Tests for scripts/stop-failure-hook.mjs
 *
 * Validates: appends API error info to .forge/debug/failures.jsonl
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

const TMPDIR = join(process.env.TMPDIR || "/tmp", "stop-failure-test");
const SCRIPT = join(process.cwd(), "scripts", "stop-failure-hook.mjs");

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

function readFailures() {
  const p = join(TMPDIR, ".forge", "debug", "failures.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("stop-failure-hook.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(TMPDIR, { recursive: true });
  });

  test("appends error to failures.jsonl", () => {
    const result = runHook({
      STOP_ERROR_TYPE: "rate_limit",
      STOP_ERROR_MESSAGE: "HTTP 429 Too Many Requests",
    });
    assert.equal(result.exitCode, 0);

    const entries = readFailures();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].error_type, "rate_limit");
    assert.ok(entries[0].timestamp);
  });

  test("auto-creates .forge/debug/ directory", () => {
    rmSync(join(TMPDIR, ".forge"), { recursive: true, force: true });
    const result = runHook({
      STOP_ERROR_TYPE: "auth_failure",
      STOP_ERROR_MESSAGE: "Invalid API key",
    });
    assert.equal(result.exitCode, 0);
    assert.ok(existsSync(join(TMPDIR, ".forge", "debug", "failures.jsonl")));
  });

  test("appends multiple entries", () => {
    runHook({
      STOP_ERROR_TYPE: "rate_limit",
      STOP_ERROR_MESSAGE: "HTTP 429",
    });
    runHook({
      STOP_ERROR_TYPE: "timeout",
      STOP_ERROR_MESSAGE: "Request timeout",
    });
    const entries = readFailures();
    assert.ok(entries.length >= 2);
  });

  test("exits 0 when no error env vars", () => {
    const result = runHook();
    assert.equal(result.exitCode, 0);
  });

  test("JSONL format has required fields", () => {
    rmSync(join(TMPDIR, ".forge"), { recursive: true, force: true });
    runHook({
      STOP_ERROR_TYPE: "rate_limit",
      STOP_ERROR_MESSAGE: "HTTP 429",
    });
    const entries = readFailures();
    const entry = entries[0];
    assert.ok(entry.error_type, "should have error_type");
    assert.ok(entry.timestamp, "should have timestamp");
    assert.ok(entry.details, "should have details");
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});
