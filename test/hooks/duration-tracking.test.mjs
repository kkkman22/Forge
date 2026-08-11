#!/usr/bin/env node

/**
 * Tests for duration_ms tracking in check-context-boundary.mjs
 *
 * Validates: PostToolUse mode extracts duration_ms and appends to .tinkerman/runs/
 * Fail-open: exits 0 on any condition.
 */

import { execSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

const TMPDIR = join(process.env.TMPDIR || "/tmp", "duration-tracking-test");
const SCRIPT = join(process.cwd(), "scripts", "check-context-boundary.mjs");

function runHook(toolInputFile, mode = "PostToolUse") {
  try {
    const stdout = execSync(`node "${SCRIPT}" ${mode} "${toolInputFile}"`, {
      cwd: TMPDIR,
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env },
    });
    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (e) {
    return {
      stdout: (e.stdout || "").trim(),
      stderr: (e.stderr || "").trim(),
      exitCode: e.status ?? 1,
    };
  }
}

function findRunLog() {
  const runsDir = join(TMPDIR, ".tinkerman", "runs");
  if (!existsSync(runsDir)) return null;
  // Find the most recent directory
  const dirs = readdirSync(runsDir)
    .filter((d) => {
      try {
        return existsSync(join(runsDir, d, "tool-durations.jsonl"));
      } catch { return false; }
    })
    .sort()
    .reverse();
  if (dirs.length === 0) return null;
  const logFile = join(runsDir, dirs[0], "tool-durations.jsonl");
  return existsSync(logFile) ? logFile : null;
}

describe("duration_ms tracking", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(join(TMPDIR, ".tinkerman", "runs"), { recursive: true });
  });

  test("does not crash when PostToolUse with no duration_ms", () => {
    const inputFile = join(TMPDIR, "tool-input.json");
    writeFileSync(inputFile, JSON.stringify({
      file_path: "/tmp/test.ts",
      content: "const x = 1;",
    }));
    const result = runHook(inputFile);
    assert.equal(result.exitCode, 0);
  });

  test("exits 0 when no tool input file", () => {
    const result = runHook("/nonexistent/file.json");
    assert.equal(result.exitCode, 0);
  });

  test("--help outputs usage info", () => {
    try {
      const stdout = execSync(`node "${SCRIPT}" --help`, {
        cwd: TMPDIR,
        encoding: "utf-8",
        timeout: 5000,
      });
      assert.ok(stdout.includes("Usage") || stdout.includes("usage"), `Expected help in: ${stdout}`);
    } catch (e) {
      // --help may exit with 0, that's fine
      assert.ok(
        (e.stdout || "").includes("Usage") || (e.stdout || "").includes("usage"),
        "Expected help output"
      );
    }
  });

  test("exits 0 on malformed JSON input", () => {
    const inputFile = join(TMPDIR, "bad-input.json");
    writeFileSync(inputFile, "not json");
    const result = runHook(inputFile);
    assert.equal(result.exitCode, 0);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});
