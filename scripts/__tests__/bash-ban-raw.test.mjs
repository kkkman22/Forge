#!/usr/bin/env node

/**
 * bash-ban-raw.test.mjs — Unit tests for bash-ban-raw.mjs PreToolUse hook.
 *
 * Tests the smart filtering logic:
 *   BLOCK: cat/head/tail/grep/rg single-file reads (non-piped)
 *   ALLOW: piped commands, npm/git/node, escape hatch
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dirname, "..", "bash-ban-raw.mjs");

/**
 * Run the bash-ban-raw.mjs script with a simulated tool input.
 * Returns { exitCode, stderr }.
 */
function runHook(command) {
  return new Promise((resolve) => {
    const input = JSON.stringify({ tool_input: { command } });
    const child = spawn("node", [SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.stdout.on("data", () => {}); // drain

    child.stdin.write(input);
    child.stdin.end();

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 0, stderr });
    });
  });
}

// --- Tests ---

describe("bash-ban-raw: single file reads are blocked", () => {
  it("blocks 'cat file.py'", async () => {
    const { exitCode } = await runHook("cat file.py");
    assert.equal(exitCode, 2);
  });

  it("blocks 'cat src/mcp/server.ts'", async () => {
    const { exitCode } = await runHook("cat src/mcp/server.ts");
    assert.equal(exitCode, 2);
  });

  it("blocks 'head -20 README.md'", async () => {
    const { exitCode } = await runHook("head -20 README.md");
    assert.equal(exitCode, 2);
  });

  it("blocks 'tail -50 package.json'", async () => {
    const { exitCode } = await runHook("tail -50 package.json");
    assert.equal(exitCode, 2);
  });

  it("blocks 'less file.py'", async () => {
    const { exitCode } = await runHook("less file.py");
    assert.equal(exitCode, 2);
  });

  it("blocks 'more file.py'", async () => {
    const { exitCode } = await runHook("more file.py");
    assert.equal(exitCode, 2);
  });

  it("blocks 'grep pattern file.py'", async () => {
    const { exitCode } = await runHook("grep pattern file.py");
    assert.equal(exitCode, 2);
  });

  it("blocks 'rg pattern src/'", async () => {
    const { exitCode } = await runHook("rg pattern src/");
    assert.equal(exitCode, 2);
  });

  it("blocks 'wc -l file.py'", async () => {
    const { exitCode } = await runHook("wc -l file.py");
    assert.equal(exitCode, 2);
  });

  it("outputs helpful message on block", async () => {
    const { exitCode, stderr } = await runHook("cat file.py");
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes("Read") || stderr.includes("Grep") || stderr.includes("Glob"));
  });
});

describe("bash-ban-raw: piped commands are allowed", () => {
  it("allows 'find . -name *.ts | grep export'", async () => {
    const { exitCode } = await runHook("find . -name '*.ts' | grep export");
    assert.equal(exitCode, 0);
  });

  it("allows 'cat file | grep pattern'", async () => {
    const { exitCode } = await runHook("cat file.py | grep TODO");
    assert.equal(exitCode, 0);
  });

  it("allows 'grep -r pattern src/ | head -20'", async () => {
    const { exitCode } = await runHook("grep -r pattern src/ | head -20");
    assert.equal(exitCode, 0);
  });

  it("allows 'echo hello | cat'", async () => {
    const { exitCode } = await runHook("echo hello | cat");
    assert.equal(exitCode, 0);
  });
});

describe("bash-ban-raw: non-file-read commands are allowed", () => {
  it("allows 'npm test'", async () => {
    const { exitCode } = await runHook("npm test");
    assert.equal(exitCode, 0);
  });

  it("allows 'git status'", async () => {
    const { exitCode } = await runHook("git status");
    assert.equal(exitCode, 0);
  });

  it("allows 'node scripts/foo.mjs'", async () => {
    const { exitCode } = await runHook("node scripts/foo.mjs");
    assert.equal(exitCode, 0);
  });

  it("allows 'npm run check'", async () => {
    const { exitCode } = await runHook("npm run check");
    assert.equal(exitCode, 0);
  });

  it("allows 'npx vitest run'", async () => {
    const { exitCode } = await runHook("npx vitest run");
    assert.equal(exitCode, 0);
  });

  it("allows 'pip install something'", async () => {
    const { exitCode } = await runHook("pip install something");
    assert.equal(exitCode, 0);
  });

  it("allows 'git diff'", async () => {
    const { exitCode } = await runHook("git diff");
    assert.equal(exitCode, 0);
  });

  it("allows 'git log --oneline -5'", async () => {
    const { exitCode } = await runHook("git log --oneline -5");
    assert.equal(exitCode, 0);
  });
});

describe("bash-ban-raw: escape hatch", () => {
  const escapeFile = join(tmpdir(), `bash-raw-unlock-${process.pid}`);

  afterEach(() => {
    try { unlinkSync(escapeFile); } catch { /* already removed */ }
  });

  it("allows blocked command when escape hatch exists", async () => {
    writeFileSync(escapeFile, "");
    const { exitCode } = await runHook("cat file.py");
    assert.equal(exitCode, 0);
  });
});
