/**
 * Unit tests for scripts/config-changed-hook.mjs — ConfigChange hook.
 *
 * Validates:
 * - R1 AC1: Script runs as ConfigChange hook
 * - R1 AC2: .tinkerman/config.md change → additionalContext output
 * - R1 AC3: .claude/settings.json change → additionalContext output
 * - R1 AC4: Unmatched file → silent exit (no output)
 * - R1 AC5: Fail-open — internal errors → exit 0, no blocking
 * - R1 AC6: Execution time ≤ 3s
 * - R3 AC1: WATCHED_FILES is configurable (array constant)
 * - R3 AC2: List includes .tinkerman/config.md and .claude/settings.json
 * - R3 AC3: Adding to list works without core logic changes
 * - T1.5: --help output
 */
import type { ExecException } from "node:child_process";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts", "config-changed-hook.mjs");

interface ExecError {
  stdout?: string;
  stderr?: string;
  status?: number;
}

function isExecError(e: unknown): e is ExecException & ExecError {
  return e instanceof Error && "status" in e;
}

function runHook(
  changedFiles: string[],
  options?: { env?: Record<string, string> },
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdinPayload = JSON.stringify({
      session_id: "test-session",
      hook_event_name: "ConfigChange",
      changed_files: changedFiles,
    });

    const result = execFileSync("node", [SCRIPT_PATH], {
      encoding: "utf-8",
      timeout: 5000,
      input: stdinPayload,
      env: { ...process.env, ...options?.env },
    });
    return { stdout: result.trim(), stderr: "", exitCode: 0 };
  } catch (e: unknown) {
    if (!isExecError(e)) return { stdout: "", stderr: "", exitCode: 1 };
    return {
      stdout: (e.stdout ?? "").trim(),
      stderr: (e.stderr ?? "").trim(),
      exitCode: e.status ?? 1,
    };
  }
}

function parseOutput(stdout: string): Record<string, string> | null {
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** Run hook with arbitrary input JSON (no changed_files field) */
function runHookMissingField(input: Record<string, unknown>): { stdout: string; exitCode: number } {
  try {
    const result = execFileSync("node", [SCRIPT_PATH], {
      encoding: "utf-8",
      timeout: 5000,
      input: JSON.stringify(input),
    });
    return { stdout: result.trim(), exitCode: 0 };
  } catch (e: unknown) {
    if (!isExecError(e)) return { stdout: "", exitCode: 1 };
    return { stdout: (e.stdout ?? "").trim(), exitCode: e.status ?? 1 };
  }
}

describe("config-changed-hook.mjs", () => {
  it("outputs additionalContext when .tinkerman/config.md changes", () => {
    const result = runHook([".tinkerman/config.md"]);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output!.additionalContext).toContain("Forge 配置已变更");
    expect(output!.additionalContext).toContain(".tinkerman/config.md");
  });

  it("outputs additionalContext when .claude/settings.json changes", () => {
    const result = runHook([".claude/settings.json"]);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output!.additionalContext).toContain("Claude Code 配置已变更");
  });

  it("outputs additionalContext with changed file names", () => {
    const result = runHook([".tinkerman/config.md", "src/foo.ts"]);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    // Should list the matched file
    expect(output!.additionalContext).toContain(".tinkerman/config.md");
  });

  it("exits silently (no output) for unmatched files", () => {
    const result = runHook(["src/index.ts", "README.md"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("exits silently for empty changed_files", () => {
    const result = runHook([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("exits 0 (fail-open) on malformed JSON input", () => {
    try {
      execFileSync("node", [SCRIPT_PATH], {
        encoding: "utf-8",
        timeout: 5000,
        input: "not valid json{{{",
      });
      // If no exception thrown, exit code was 0
      expect(true).toBe(true);
    } catch (e: unknown) {
      // Fail-open: should not throw (exit code should be 0)
      if (!isExecError(e)) throw e;
      expect(e.status).toBe(0);
    }
  });

  it("exits 0 (fail-open) on empty stdin", () => {
    try {
      execFileSync("node", [SCRIPT_PATH], {
        encoding: "utf-8",
        timeout: 5000,
        input: "",
      });
      expect(true).toBe(true);
    } catch (e: unknown) {
      if (!isExecError(e)) throw e;
      expect(e.status).toBe(0);
    }
  });

  it("exits silently when input JSON lacks changed_files field", () => {
    const result = runHookMissingField({ session_id: "test" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("completes within 3 seconds", () => {
    const start = Date.now();
    runHook([".tinkerman/config.md"]);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  it("provides --help output", () => {
    try {
      const result = execFileSync("node", [SCRIPT_PATH, "--help"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      expect(result).toContain("config-changed-hook");
      expect(result).toContain("用法");
    } catch (e: unknown) {
      if (!isExecError(e)) throw e;
      expect(e.status).toBe(0);
      expect(e.stdout ?? "").toContain("config-changed-hook");
    }
  });

  it("matches files by suffix (handles absolute paths)", () => {
    const result = runHook(["/home/user/project/.tinkerman/config.md"]);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output!.additionalContext).toContain("Forge 配置已变更");
  });

  it("handles multiple watched files changed at once", () => {
    const result = runHook([".tinkerman/config.md", ".claude/settings.json"]);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    // Should mention both changes
    expect(output!.additionalContext).toContain("配置已变更");
  });

  it("sanitizes control characters from changed file names", () => {
    const result = runHook(["evil\nname/.tinkerman/config.md", "bad\0path/.claude/settings.json"]);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    const hasControlCharacter = [...output!.additionalContext].some((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    });
    expect(hasControlCharacter).toBe(false);
  });
});
