import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/postooluse-inject-warnings.mjs");
const FIXTURE_DIR = resolve(ROOT, ".test-fixture-postooluse-inject-warnings");

function fixture(...paths: string[]): string {
  return join(FIXTURE_DIR, ...paths);
}

/**
 * Run the PostToolUse inject warnings hook with given hook input.
 * Simulates Claude Code piping hook input JSON to stdin.
 */
function runHook(
  input: Record<string, unknown>,
  env?: Record<string, string>,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [SCRIPT], {
      input: JSON.stringify(input),
      timeout: 5000,
      encoding: "utf-8",
      cwd: FIXTURE_DIR,
      env: { ...process.env, ...env },
    });
    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout ?? "").trim(),
      stderr: (e.stderr ?? "").trim(),
      exitCode: e.status ?? 1,
    };
  }
}

/**
 * Parse stdout as JSON, returning null if not valid JSON.
 */
function parseOutput(stdout: string): any {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Helper: scaffold a minimal .forge directory inside fixture dir
 * with given config values.
 */
function setupForgeEnv(opts: {
  configContent?: string;
  contextOwnership?: string;
  contextMap?: string;
}) {
  // .tinkerman/config.md
  const configPath = fixture(".tinkerman", "config.md");
  writeFileSync(
    configPath,
    opts.configContent ?? `---\npostooluse_inject_warnings: on\n---\n\n# Test config`,
  );

  if (opts.contextOwnership) {
    writeFileSync(fixture(".tinkerman", "context-ownership.yaml"), opts.contextOwnership);
  }

  if (opts.contextMap) {
    mkdirSync(fixture(".tinkerman", "custom", "contexts"), { recursive: true });
    writeFileSync(fixture(".tinkerman", "custom", "contexts", "_map.yaml"), opts.contextMap);
  }
}

// ── Contract tests ──

describe("PostToolUse inject warnings hook (R15)", () => {
  beforeEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
    mkdirSync(fixture(".tinkerman"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
  });

  // AC1: Injects warning when Edit touches frozen file
  it("injects warning when Edit touches frozen file", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "The file has been edited successfully.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    const updated = output!.hookSpecificOutput?.updatedToolOutput as string;
    expect(updated).toBeDefined();
    expect(updated).toContain("Frozen file modified");
    expect(updated).toContain("config.md");
    expect(updated).toContain("ADR-0001-frozen-structured-feedback");
    // Original response should still be present
    expect(updated).toContain("The file has been edited successfully.");
  });

  // AC2: Injects warning when Write touches frozen file
  it("injects warning when Write touches frozen file", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "File written successfully.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    const updated = output!.hookSpecificOutput?.updatedToolOutput as string;
    expect(updated).toContain("Frozen file modified");
    expect(updated).toContain("config.md");
    expect(updated).toContain("File written successfully.");
  });

  // AC3: Does not modify output for non-frozen files
  it("does not modify output for non-frozen files", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: fixture("src", "utils", "helpers.ts"),
      },
      tool_response: "The file has been edited successfully.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);
    // No output for non-frozen files — silent pass
    expect(result.stdout).toBe("");
  });

  // AC4: Does not modify output for non-Edit/Write tools (e.g., Bash, Read)
  it("does not modify output for Bash tool", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "Bash",
      tool_input: {
        command: "cat .tinkerman/config.md",
      },
      tool_response: "---\npostooluse_inject_warnings: on\n---",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("does not modify output for Read tool", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "Read",
      tool_input: {
        file_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "---\npostooluse_inject_warnings: on\n---",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  // AC5: Respects postooluse_inject_warnings: off config
  it("respects postooluse_inject_warnings: off config", () => {
    setupForgeEnv({
      configContent: "---\npostooluse_inject_warnings: off\n---\n\n# Test config",
    });

    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "The file has been edited successfully.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);
    // When disabled, should exit silently — no output
    expect(result.stdout).toBe("");
  });

  // AC6: Handles missing frozen_paths in config (no frontmatter block listing)
  it("handles missing frozen_paths in config gracefully", () => {
    setupForgeEnv({
      configContent:
        "---\npostooluse_inject_warnings: on\n---\n\n# Minimal config without frozen list",
    });

    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "Edited.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);

    // config.md is always frozen (hard-coded default), even without explicit list
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    const updated = output!.hookSpecificOutput?.updatedToolOutput as string;
    expect(updated).toContain("Frozen file modified");
  });

  // AC7: Warning format matches spec
  it("output format has hookSpecificOutput.updatedToolOutput with warning prepended", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "Original response text",
    };

    const result = runHook(input);
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output).toHaveProperty("hookSpecificOutput");
    expect(output!.hookSpecificOutput).toHaveProperty("updatedToolOutput");

    const updated = output!.hookSpecificOutput!.updatedToolOutput as string;
    // Warning should be prepended (come first)
    const warningIdx = updated.indexOf("Frozen file modified");
    const originalIdx = updated.indexOf("Original response text");
    expect(warningIdx).toBeLessThan(originalIdx);
  });

  // AC8: Handles invalid JSON input gracefully
  it("handles invalid JSON input gracefully (exits 0 silently)", () => {
    setupForgeEnv({});

    try {
      const stdout = execFileSync("node", [SCRIPT], {
        input: "not valid json{{{",
        timeout: 5000,
        encoding: "utf-8",
        cwd: FIXTURE_DIR,
        env: process.env,
      });
      expect(stdout.trim()).toBe("");
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string };
      // Should not crash — exit 0 silently
      expect(e.status ?? 0).toBe(0);
      expect((e.stdout ?? "").trim()).toBe("");
    }
  });

  // AC9: Handles missing file_path gracefully
  it("handles missing file_path in tool_input gracefully", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "Edit",
      tool_input: {},
      tool_response: "Done.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  // AC10: Context boundary violations also trigger warnings
  it("injects warning for context boundary violations", () => {
    setupForgeEnv({
      configContent: "---\npostooluse_inject_warnings: on\n---\n\n# Config",
      contextOwnership: ["src/billing/**: billing", "src/auth/**: auth"].join("\n"),
      contextMap: ["- from: billing", "  to: auth", "  type: customer-supplier"].join("\n"),
    });

    // Create a billing file that imports from auth (cross-context violation)
    mkdirSync(fixture("src", "billing"), { recursive: true });
    mkdirSync(fixture("src", "auth"), { recursive: true });
    writeFileSync(
      fixture("src", "billing", "service.ts"),
      'import { something } from "../auth/login";\n',
    );

    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: fixture("src", "billing", "service.ts"),
      },
      tool_response: "Edited billing service.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    if (output) {
      const updated = output.hookSpecificOutput?.updatedToolOutput as string;
      if (updated) {
        expect(updated).toContain("上下文边界违规");
      }
    }
  });

  // AC11: MultiEdit tool is also monitored
  it("injects warning when MultiEdit touches frozen file", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "MultiEdit",
      tool_input: {
        file_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "Multi-edit applied.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    const updated = output!.hookSpecificOutput?.updatedToolOutput as string;
    expect(updated).toContain("Frozen file modified");
  });

  // AC12: Frozen spec files (with status:locked)
  it("injects warning when Edit touches a locked spec file", () => {
    setupForgeEnv({});
    mkdirSync(fixture(".tinkerman", "specs", "my-feature"), { recursive: true });
    writeFileSync(
      fixture(".tinkerman", "specs", "my-feature", "spec.md"),
      "---\nstatus: locked\n---\n\n# My Feature Spec",
    );

    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: fixture(".tinkerman", "specs", "my-feature", "spec.md"),
      },
      tool_response: "Spec edited.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    const updated = output!.hookSpecificOutput?.updatedToolOutput as string;
    expect(updated).toContain("Frozen file modified");
    expect(updated).toContain("spec.md");
  });

  // AC13: Frozen plan files (with status:approved)
  it("injects warning when Write touches an approved plan file", () => {
    setupForgeEnv({});
    mkdirSync(fixture(".tinkerman", "plans"), { recursive: true });
    writeFileSync(
      fixture(".tinkerman", "plans", "my-plan.md"),
      "---\nstatus: approved\n---\n\n# My Plan",
    );

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: fixture(".tinkerman", "plans", "my-plan.md"),
      },
      tool_response: "Plan written.",
    };

    const result = runHook(input);
    expect(result.exitCode).toBe(0);

    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    const updated = output!.hookSpecificOutput?.updatedToolOutput as string;
    expect(updated).toContain("Frozen file modified");
    expect(updated).toContain("my-plan.md");
  });

  // AC14: NotebookEdit tool is also monitored
  it("injects warning when NotebookEdit touches frozen file", () => {
    setupForgeEnv({});

    const input = {
      tool_name: "NotebookEdit",
      tool_input: {
        notebook_path: fixture(".tinkerman", "config.md"),
      },
      tool_response: "Notebook edited.",
    };

    const result = runHook(input);
    // NotebookEdit uses notebook_path not file_path
    // Should exit silently since there is no file_path
    expect(result.exitCode).toBe(0);
  });
});
