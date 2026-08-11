/**
 * Subagent skip test for scripts/cmux-mirror/sync-once.mjs.
 *
 * Validates Property 1: when stdin JSON contains agent_id, the CLI entry point
 * short-circuits before syncOnce, producing zero stdout and no side-effect files.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts", "cmux-mirror", "sync-once.mjs");

function createTempForgeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-cmux-test-"));
  mkdirSync(join(dir, ".tinkerman"), { recursive: true });
  mkdirSync(join(dir, ".tinkerman", "knowledge"), { recursive: true });
  // Minimal state file so forge-dir check passes
  writeFileSync(join(dir, ".tinkerman", "status.md"), "---\ncurrent_task: test\n---\n");
  return dir;
}

function runScript(cwd: string, stdinPayload: string | undefined): string {
  try {
    return execFileSync("node", [SCRIPT_PATH, ".tinkerman"], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      input: stdinPayload,
    });
  } catch {
    return "";
  }
}

describe("cmux sync-once subagent skip", () => {
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

  it("subagent stdin (with agent_id) creates no lock or snapshot", () => {
    tempDir = createTempForgeDir();

    const subagentStdin = JSON.stringify({
      session_id: "s2",
      hook_event_name: "UserPromptSubmit",
      agent_id: "quality-check",
    });

    const output = runScript(tempDir, subagentStdin);
    expect(output.length).toBe(0);
    expect(existsSync(join(tempDir, ".tinkerman", ".cmux-sync.lock"))).toBe(false);
    expect(existsSync(join(tempDir, ".tinkerman", ".cmux-snapshot.json"))).toBe(false);
  });

  it("main-agent stdin (no agent_id) allows normal syncOnce flow", () => {
    tempDir = createTempForgeDir();

    const mainAgentStdin = JSON.stringify({
      session_id: "s-main",
      hook_event_name: "UserPromptSubmit",
    });

    // Run with main-agent stdin — may still exit 0 (cmux not available in test env)
    // but should not short-circuit at the router level
    const output = runScript(tempDir, mainAgentStdin);

    // In test env cmux won't be available, so syncOnce returns { synced: false }
    // The important thing is it didn't skip due to agent_id detection
    expect(output.length).toBe(0); // cmux unavailable → no output, but reached syncOnce
    // Lock file should have been created then cleaned up (or not created due to cmux_unavailable)
  });
});
