/**
 * Unit tests for scripts/inject-evolved-rules.mjs — capped SessionStart injector.
 *
 * Validates 4KB byte limit, subagent zero-injection, and fail-open on missing file.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts", "inject-evolved-rules.mjs");
const RULES_FILE = ".forge/knowledge/evolved-rules.md";

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-evolved-rules-test-"));
  mkdirSync(join(dir, ".forge", "knowledge"), { recursive: true });
  return dir;
}

function runScript(
  cwd: string,
  stdinPayload?: string,
): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [SCRIPT_PATH], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      input: stdinPayload,
    });
    return { stdout, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

describe("inject-evolved-rules.mjs", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
    }
  });

  it("file not found → exit 0, stdout zero bytes", () => {
    tempDir = createTempDir();
    // Don't create evolved-rules.md
    const mainStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "SessionStart",
    });
    const result = runScript(tempDir, mainStdin);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(0);
  });

  it("file ≤ 4KB → stdout equals header + full file content, no truncation", () => {
    tempDir = createTempDir();
    const content = "---\nupdated: '2026-05-16'\n---\n## Rules\nR1 content here";
    writeFileSync(join(tempDir, RULES_FILE), content);

    const mainStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "SessionStart",
    });
    const result = runScript(tempDir, mainStdin);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("=== Evolved Rules ===\n" + content);
    expect(result.stdout).not.toContain("truncated");
  });

  it("file > 4KB → stdout contains first 4096 bytes + truncation marker", () => {
    tempDir = createTempDir();
    // Create a file > 4KB
    const content = "x".repeat(5000);
    writeFileSync(join(tempDir, RULES_FILE), content);

    const mainStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "SessionStart",
    });
    const result = runScript(tempDir, mainStdin);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("=== Evolved Rules ===\n");
    expect(result.stdout).toContain("bytes truncated");
    // Header + first 4096 bytes + truncation marker
    expect(result.stdout.length).toBeLessThan(content.length + 100);
  });

  it("subagent stdin (with agent_id) → exit 0, stdout zero bytes", () => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, RULES_FILE, "../" + RULES_FILE.split("/").pop()!), "should not appear");
    writeFileSync(join(tempDir, RULES_FILE), "Rules content that should be skipped");

    const subagentStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "SessionStart",
      agent_id: "spec-check",
    });
    const result = runScript(tempDir, subagentStdin);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(0);
  });
});
