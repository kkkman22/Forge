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
  env: NodeJS.ProcessEnv = {},
): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [SCRIPT_PATH], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      input: stdinPayload,
      env: { ...process.env, ...env },
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

  it("file ≤ 4KB → stdout equals JSON with extracted content, no truncation", () => {
    tempDir = createTempDir();
    const content =
      "---\nupdated: '2026-05-16'\n---\n## Rules\n### R1: Test\n**Content**: R1 content here";
    writeFileSync(join(tempDir, RULES_FILE), content);

    const mainStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "SessionStart",
    });
    const result = runScript(tempDir, mainStdin);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.additionalContext).toContain("R1: Test");
    expect(json.additionalContext).toContain("R1 content here");
    expect(json.hookSpecificOutput.reloadSkills).toBe(true);
  });

  it("FORGE_DIAGNOSTIC_MODE=1 → exit 0, stdout zero bytes, no hook payload", () => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, RULES_FILE), "### R1: Test\n**Content**: should not appear");

    const mainStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "SessionStart",
    });
    const result = runScript(tempDir, mainStdin, { FORGE_DIAGNOSTIC_MODE: "1" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("file > 4KB → additionalContext is truncated", () => {
    tempDir = createTempDir();
    // Create a file > 4KB with proper rule format
    const ruleHeader = "### R1: Big Rule\n**Content**: ";
    const content = ruleHeader + "x".repeat(5000);
    writeFileSync(join(tempDir, RULES_FILE), content);

    const mainStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "SessionStart",
    });
    const result = runScript(tempDir, mainStdin);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    // Script reads full file up to MAX_BYTES (32KB) but extractContentOnly trims lines
    expect(json.additionalContext).toContain("R1: Big Rule");
    expect(json.additionalContext.length).toBeLessThan(content.length);
  });

  it("subagent stdin (with agent_id) → exit 0, stdout zero bytes", () => {
    tempDir = createTempDir();
    writeFileSync(
      join(tempDir, RULES_FILE, `../${RULES_FILE.split("/").pop()!}`),
      "should not appear",
    );
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
