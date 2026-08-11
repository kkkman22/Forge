/**
 * Integration tests for frozen-zone hooks.
 *
 * Simulates Claude Code hook events by piping JSON to hook scripts
 * and verifying the output format.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

function runHook(
  script: string,
  input: Record<string, unknown>,
  env: Record<string, string> = {},
): { stdout: string; exitCode: number } {
  const inputJson = JSON.stringify(input);
  const envStr = Object.entries({ FORGE_STRUCTURED_FROZEN: "1", ...env })
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const cmd = `echo '${inputJson}' | ${envStr} bash ${resolve(ROOT, script)} 2>/dev/null`;

  try {
    const stdout = execSync(cmd, { encoding: "utf-8", cwd: ROOT }).trim();
    return { stdout, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string };
    return { stdout: (err.stdout || "").toString().trim(), exitCode: err.status ?? 1 };
  }
}

describe("Integration: PreToolUse structured hook", () => {
  it("denies write to frozen config.md with valid JSON", () => {
    const { stdout, exitCode } = runHook("scripts/hook-check-frozen-structured.sh", {
      tool_name: "Write",
      tool_input: { file_path: ".tinkerman/config.md" },
    });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.decision).toBe("deny");
    expect(output.systemMessage).toContain("config.md");
    expect(output).toHaveProperty("additionalContext");
  });

  it("allows write to open-zone file (no output)", () => {
    const { stdout, exitCode } = runHook("scripts/hook-check-frozen-structured.sh", {
      tool_name: "Write",
      tool_input: { file_path: "src/main.ts" },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });

  it("denies write to approved plan with frozen-plan category", () => {
    const { stdout, exitCode } = runHook("scripts/hook-check-frozen-structured.sh", {
      tool_name: "Edit",
      tool_input: { file_path: ".tinkerman/plans/frozen-zone-structured-feedback.md" },
    });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.decision).toBe("deny");
  });
});

describe("Integration: PostToolUse defence-in-depth hook", () => {
  it("detects breach on frozen config.md", () => {
    const { stdout, exitCode } = runHook("scripts/hook-check-frozen-post.sh", {
      tool_name: "Write",
      tool_input: { file_path: ".tinkerman/config.md" },
      tool_response: { success: true },
    });

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout);
    expect(output).toHaveProperty("hookSpecificOutput");
    expect(output.hookSpecificOutput).toHaveProperty("updatedToolOutput");
    expect(output.hookSpecificOutput.updatedToolOutput).toContain("frozen-zone violation");
  });

  it("passes through for open-zone file", () => {
    const { stdout, exitCode } = runHook("scripts/hook-check-frozen-post.sh", {
      tool_name: "Write",
      tool_input: { file_path: "src/main.ts" },
      tool_response: { success: true },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });

  it("skips when tool_response.success is false", () => {
    const { stdout, exitCode } = runHook("scripts/hook-check-frozen-post.sh", {
      tool_name: "Write",
      tool_input: { file_path: ".tinkerman/config.md" },
      tool_response: { success: false },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });
});

describe("Integration: audit logging", () => {
  const logDir = resolve(ROOT, ".tinkerman", "runs");

  it("log_event writes JSONL entry", () => {
    runHook("scripts/hook-check-frozen-structured.sh", {
      tool_name: "Write",
      tool_input: { file_path: ".tinkerman/config.md" },
    });

    // Verify log was written (at least one new line)
    const today = new Date().toISOString().slice(0, 10);
    const logFile = resolve(logDir, `${today}-frozen-events.jsonl`);
    expect(existsSync(logFile)).toBe(true);

    const content = readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = JSON.parse(lines[lines.length - 1]);
    expect(lastLine).toHaveProperty("timestamp");
    expect(lastLine).toHaveProperty("category");
    expect(lastLine).toHaveProperty("outcome");
  });
});

describe("Integration: feature flag FORGE_STRUCTURED_FROZEN=0", () => {
  it("falls back to legacy mode", () => {
    const { exitCode } = runHook(
      "scripts/hook-check-frozen-structured.sh",
      { tool_name: "Write", tool_input: { file_path: "src/main.ts" } },
      { FORGE_STRUCTURED_FROZEN: "0" },
    );

    // Legacy mode delegates to TS hook which exits 0 for non-frozen files
    expect(exitCode).toBe(0);
  });
});
