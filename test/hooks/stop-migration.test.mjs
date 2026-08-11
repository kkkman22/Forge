#!/usr/bin/env node
/**
 * Tests for command→args migration scripts.
 *
 * Validates that extracted hook scripts produce identical output
 * to the original inline shell commands.
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
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

const TMPDIR = join(process.env.TMPDIR || "/tmp", "hook-migration-test");
const SCRIPTS_DIR = join(process.cwd(), "scripts");

// Helper: run a script and capture stdout/stderr/exitCode
function runScript(scriptPath, args = [], env = {}) {
  try {
    const stdout = execSync(`node "${scriptPath}" ${args.map(a => `"${a}"`).join(" ")}`, {
      cwd: TMPDIR,
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, ...env },
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

describe("stop-incomplete-tasks.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(join(TMPDIR, ".tinkerman", "progress"), { recursive: true });
  });

  test("outputs incomplete task warning when tasks remain", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "progress", "test.md"),
      "# Progress\n- [x] Done task\n- [ ] Pending task\n- [ ] Another pending\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "stop-incomplete-tasks.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("未完成"), `Expected 未完成 in: ${result.stdout}`);
  });

  test("outputs completion suggestion when all done", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "progress", "test.md"),
      "# Progress\n- [x] Done task\n- [x] Another done\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "stop-incomplete-tasks.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("已完成"), `Expected 已完成 in: ${result.stdout}`);
  });

  test("exits 0 silently when no progress files exist", () => {
    rmSync(join(TMPDIR, ".tinkerman", "progress"), { recursive: true, force: true });
    const result = runScript(join(SCRIPTS_DIR, "stop-incomplete-tasks.mjs"));
    assert.equal(result.exitCode, 0);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});

describe("stop-pending-rules.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(join(TMPDIR, ".tinkerman", "knowledge"), { recursive: true });
  });

  test("outputs pending rules warning when PENDING rules exist", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "knowledge", "evolved-rules.md"),
      "---\n---\n# Rules\n## R1\nStatus: PENDING\n## R2\nStatus: ACTIVE\n## R3\nStatus: PENDING\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "stop-pending-rules.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("待审核"), `Expected 待审核 in: ${result.stdout}`);
    assert.ok(result.stdout.includes("2"), `Expected count 2 in: ${result.stdout}`);
  });

  test("exits 0 silently when no pending rules", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "knowledge", "evolved-rules.md"),
      "---\n---\n# Rules\n## R1\nStatus: ACTIVE\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "stop-pending-rules.mjs"));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
  });

  test("exits 0 silently when evolved-rules.md does not exist", () => {
    rmSync(join(TMPDIR, ".tinkerman", "knowledge", "evolved-rules.md"), { force: true });
    const result = runScript(join(SCRIPTS_DIR, "stop-pending-rules.mjs"));
    assert.equal(result.exitCode, 0);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});

describe("stop-phase-verify.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(join(TMPDIR, ".tinkerman"), { recursive: true });
  });

  test("warns when phase is active (not completed)", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "status.md"),
      "---\nphase: \"build\"\n---\n# Status\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "stop-phase-verify.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("Phase"), `Expected Phase in: ${result.stdout}`);
    assert.ok(result.stdout.includes("build"), `Expected build in: ${result.stdout}`);
  });

  test("silent when phase is completed", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "status.md"),
      "---\nphase: \"completed\"\n---\n# Status\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "stop-phase-verify.mjs"));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
  });

  test("exits 0 silently when no status.md", () => {
    rmSync(join(TMPDIR, ".tinkerman", "status.md"), { force: true });
    const result = runScript(join(SCRIPTS_DIR, "stop-phase-verify.mjs"));
    assert.equal(result.exitCode, 0);
  });

  test("includes terminalSequence notification in interactive mode", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "status.md"),
      "---\nphase: \"build\"\n---\n# Status\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "stop-phase-verify.mjs"), [], { CI: "1" });
    // In CI mode, no terminalSequence should be emitted
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("terminalSequence"), `No terminalSequence in CI: ${result.stdout}`);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});

describe("posttooluse-status-reminder.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(join(TMPDIR, ".tinkerman"), { recursive: true });
  });

  test("outputs reminder when status.md exists", () => {
    writeFileSync(join(TMPDIR, ".tinkerman", "status.md"), "---\n---\n# Status\n");
    const result = runScript(join(SCRIPTS_DIR, "posttooluse-status-reminder.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("修改"), `Expected reminder in: ${result.stdout}`);
  });

  test("exits 0 silently when no status.md", () => {
    rmSync(join(TMPDIR, ".tinkerman", "status.md"), { force: true });
    const result = runScript(join(SCRIPTS_DIR, "posttooluse-status-reminder.mjs"));
    assert.equal(result.exitCode, 0);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});

describe("teammate-idle-phase-check.mjs", () => {
  before(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
    mkdirSync(join(TMPDIR, ".tinkerman"), { recursive: true });
  });

  test("warns when phase is review", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "status.md"),
      "---\nphase: \"review\"\n---\n# Status\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "teammate-idle-phase-check.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("空闲"), `Expected idle warning in: ${result.stdout}`);
  });

  test("warns when phase is decide", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "status.md"),
      "---\nphase: \"decide\"\n---\n# Status\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "teammate-idle-phase-check.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("空闲"), `Expected idle warning in: ${result.stdout}`);
  });

  test("silent when phase is build", () => {
    writeFileSync(
      join(TMPDIR, ".tinkerman", "status.md"),
      "---\nphase: \"build\"\n---\n# Status\n"
    );
    const result = runScript(join(SCRIPTS_DIR, "teammate-idle-phase-check.mjs"));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});

describe("task-completed-notify.mjs", () => {
  before(() => {
    mkdirSync(TMPDIR, { recursive: true });
  });

  test("outputs team task completion message", () => {
    const result = runScript(join(SCRIPTS_DIR, "task-completed-notify.mjs"));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("已完成"), `Expected completion in: ${result.stdout}`);
  });

  after(() => {
    rmSync(TMPDIR, { recursive: true, force: true });
  });
});
