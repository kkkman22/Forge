/**
 * Unit tests for the forge_exec MCP tool.
 *
 * Covers:
 *   - Successful small output (≤30 lines, returned unchanged)
 *   - Successful large output trimming (>30 lines, key lines + last 5)
 *   - Failure passthrough (non-zero exit, complete output)
 *   - Timeout handling (subprocess killed, error returned)
 *   - Deny rule blocking (command matched by deny pattern)
 *
 * **Validates: Requirements 2.1–2.7**
 */
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import {
  containsShellMetachars,
  execCommand,
  isCommandDenied,
  readDenyPatterns,
} from "../../src/mcp/tools/forge-exec.js";
import { trimCommandOutput } from "../../src/mcp/trimmers/output.js";

// ---------------------------------------------------------------------------
// Mock child_process.execFile
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

// Import mocked modules after vi.mock declarations
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

const mockedExecFile = execFile as unknown as MockInstance;
const mockedReadFile = readFile as unknown as MockInstance;

// Helper: generate N lines of plain output
function makeLines(n: number, prefix = "line"): string {
  return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n");
}

// ---------------------------------------------------------------------------
// execCommand tests
// ---------------------------------------------------------------------------

describe("execCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful small output", () => {
    it("returns full stdout for a simple command", async () => {
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "hello world\n", "");
          return {};
        },
      );

      const result = await execCommand("echo hello world", 30000);
      expect(result.stdout).toBe("hello world\n");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it("returns full stdout for output with ≤30 lines", async () => {
      const output = makeLines(30);
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, output, "");
          return {};
        },
      );

      const result = await execCommand("some-command", 30000);
      expect(result.stdout).toBe(output);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });
  });

  describe("successful large output", () => {
    it("returns full stdout for large output (trimming is done by caller)", async () => {
      const output = makeLines(100);
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, output, "");
          return {};
        },
      );

      const result = await execCommand("npm test", 30000);
      // execCommand returns raw output; trimming is applied by registerForgeExec
      expect(result.stdout).toBe(output);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });
  });

  describe("failure passthrough", () => {
    it("returns non-zero exit code with full output", async () => {
      const output = makeLines(50);
      const errOutput = "Error: test failed";
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: { code: number; killed: boolean }, stdout: string, stderr: string) => void,
        ) => {
          cb({ code: 1, killed: false }, output, errOutput);
          return {};
        },
      );

      const result = await execCommand("failing-command", 30000);
      expect(result.stdout).toBe(output);
      expect(result.stderr).toBe(errOutput);
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    });
  });

  describe("timeout handling", () => {
    it("returns timedOut=true when subprocess is killed", async () => {
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: { killed: boolean; code: null }, stdout: string, stderr: string) => void,
        ) => {
          cb({ killed: true, code: null }, "partial output", "");
          return {};
        },
      );

      const result = await execCommand("sleep 999", 100);
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("partial output");
    });
  });
});

// ---------------------------------------------------------------------------
// isCommandDenied tests
// ---------------------------------------------------------------------------

describe("isCommandDenied", () => {
  it("returns null when no deny patterns match", () => {
    const result = isCommandDenied("npm test", ["Bash(rm -rf *)"]);
    expect(result).toBeNull();
  });

  it("returns deny reason when command matches a pattern", () => {
    const result = isCommandDenied("rm -rf /", ["Bash(rm -rf *)"]);
    expect(result).toBe("Command denied by pattern: Bash(rm -rf *)");
  });

  it("matches exact command without wildcards", () => {
    const result = isCommandDenied("git push --force", ["Bash(git push --force)"]);
    expect(result).toBe("Command denied by pattern: Bash(git push --force)");
  });

  it("matches wildcard patterns", () => {
    const result = isCommandDenied("git push origin main", ["Bash(git push *)"]);
    expect(result).toBe("Command denied by pattern: Bash(git push *)");
  });

  it("ignores non-Bash patterns", () => {
    const result = isCommandDenied("rm -rf /", ["Write(*.json)", "Edit(*.ts)"]);
    expect(result).toBeNull();
  });

  it("returns null for empty deny patterns", () => {
    const result = isCommandDenied("npm test", []);
    expect(result).toBeNull();
  });

  it("checks multiple patterns and returns first match", () => {
    const result = isCommandDenied("npm publish", [
      "Bash(rm -rf *)",
      "Bash(npm publish)",
      "Bash(git push *)",
    ]);
    expect(result).toBe("Command denied by pattern: Bash(npm publish)");
  });

  // --- Security hardening tests ---

  it("blocks commands matching glob with ?", () => {
    const result = isCommandDenied("rm -rf /", ["Bash(rm -?? *)"]);
    expect(result).toBe("Command denied by pattern: Bash(rm -?? *)");
  });

  it("does not match single-char glob when two ? are required", () => {
    // "rm -r" has single char after dash, pattern requires two
    const result = isCommandDenied("rm -r /tmp", ["Bash(rm -?? *)"]);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readDenyPatterns tests
// ---------------------------------------------------------------------------

describe("readDenyPatterns", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads deny patterns from settings file", async () => {
    const settings = {
      permissions: {
        deny: ["Bash(rm -rf *)", "Bash(git push --force)"],
      },
    };
    mockedReadFile.mockResolvedValue(JSON.stringify(settings));

    const patterns = await readDenyPatterns("test-settings.json");
    expect(patterns).toEqual(["Bash(rm -rf *)", "Bash(git push --force)"]);
  });

  it("returns empty array when file is missing", async () => {
    mockedReadFile.mockRejectedValue(new Error("ENOENT"));

    const patterns = await readDenyPatterns("nonexistent.json");
    expect(patterns).toEqual([]);
  });

  it("returns empty array when permissions section is missing", async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ hooks: {} }));

    const patterns = await readDenyPatterns("test-settings.json");
    expect(patterns).toEqual([]);
  });

  it("returns empty array when deny is not an array", async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ permissions: { deny: "not-an-array" } }));

    const patterns = await readDenyPatterns("test-settings.json");
    expect(patterns).toEqual([]);
  });

  it("filters out non-string entries from deny array", async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify({ permissions: { deny: ["Bash(rm *)", 42, null, "Bash(git push *)"] } }),
    );

    const patterns = await readDenyPatterns("test-settings.json");
    expect(patterns).toEqual(["Bash(rm *)", "Bash(git push *)"]);
  });

  it("returns empty array for invalid JSON", async () => {
    mockedReadFile.mockResolvedValue("not valid json{{{");

    const patterns = await readDenyPatterns("test-settings.json");
    expect(patterns).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// execCommand cwd option
// ---------------------------------------------------------------------------

describe("execCommand with cwd", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes cwd option to execFile", async () => {
    mockedExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        opts: Record<string, unknown>,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        expect(opts.cwd).toBe("/custom/root");
        cb(null, "done", "");
        return {};
      },
    );

    const result = await execCommand("pwd", 30000, { cwd: "/custom/root" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// readDenyPatterns from root path
// ---------------------------------------------------------------------------

describe("readDenyPatterns from root path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads deny patterns from root-based settings path", async () => {
    const settings = {
      permissions: {
        deny: ["Bash(rm -rf *)"],
      },
    };
    mockedReadFile.mockResolvedValue(JSON.stringify(settings));

    const patterns = await readDenyPatterns("/custom/root/.claude/settings.json");
    expect(patterns).toEqual(["Bash(rm -rf *)"]);
    expect(mockedReadFile).toHaveBeenCalledWith("/custom/root/.claude/settings.json", "utf-8");
  });
});

// ---------------------------------------------------------------------------
// Integration: trimCommandOutput applied to exec results
// ---------------------------------------------------------------------------

describe("forge_exec output trimming integration", () => {
  // These tests verify the trimming behavior when applied to exec results,
  // using the real trimCommandOutput function (imported directly).
  // The trimCommandOutput function is already tested in output-trimmer.test.ts,
  // so these are lightweight integration checks.

  it("small successful output is returned unchanged", () => {
    const stdout = "All 5 tests passed\nDone in 1.2s";
    const result = trimCommandOutput(stdout, "", 0);
    expect(result).toBe(stdout);
  });

  it("large successful output is trimmed with key lines", () => {
    const lines = [
      ...Array.from({ length: 25 }, (_, i) => `compiling module ${i}`),
      "PASS src/foo.test.ts",
      "PASS src/bar.test.ts",
      "42 tests passed",
      "coverage: 92%",
      ...Array.from({ length: 5 }, (_, i) => `cleanup step ${i}`),
    ];
    const stdout = lines.join("\n");
    const result = trimCommandOutput(stdout, "", 0);

    expect(result).toContain("✅ exit:0");
    expect(result).toContain("PASS src/foo.test.ts");
    expect(result).toContain("42 tests passed");
    expect(result).toContain("coverage: 92%");
    expect(result).toContain("--- last 5 lines ---");
  });

  it("failed output is returned in full with stderr", () => {
    const stdout = makeLines(100);
    const stderr = "Error: compilation failed";
    const result = trimCommandOutput(stdout, stderr, 1);

    expect(result).toContain(stdout);
    expect(result).toContain("STDERR:");
    expect(result).toContain(stderr);
    expect(result).not.toContain("✅ exit:0");
  });
});

// ---------------------------------------------------------------------------
// containsShellMetachars tests — defense-in-depth
// ---------------------------------------------------------------------------

describe("containsShellMetachars", () => {
  it("detects command substitution $()", () => {
    expect(containsShellMetachars("$(cat /etc/passwd)")).toMatch(/\$\(\)/);
  });

  it("detects backtick injection", () => {
    expect(containsShellMetachars("`rm -rf /`")).toMatch(/`/);
  });

  it("allows safe commands with no metacharacters", () => {
    expect(containsShellMetachars("npm test")).toBeNull();
    expect(containsShellMetachars("npx vitest run test/foo.test.ts")).toBeNull();
  });

  it("allows git status style commands", () => {
    expect(containsShellMetachars("git status --short")).toBeNull();
  });

  it("allows shell operators (sh -c context)", () => {
    // Shell operators (;, &, |, >, <) are permitted because forge_exec
    // invokes via `sh -c` — these are part of normal shell usage.
    expect(containsShellMetachars("echo hello; rm -rf /")).toBeNull();
    expect(containsShellMetachars("echo hello && rm -rf /")).toBeNull();
    expect(containsShellMetachars("echo hello || rm -rf /")).toBeNull();
    expect(containsShellMetachars("echo hello | rm -rf /")).toBeNull();
    expect(containsShellMetachars("echo data > /tmp/out")).toBeNull();
    expect(containsShellMetachars("sort < /tmp/in")).toBeNull();
    expect(containsShellMetachars("sleep 30 & echo bg")).toBeNull();
  });

  it("detects newline injection", () => {
    expect(containsShellMetachars("echo hello\nrm -rf /")).toMatch(/newline/);
  });

  it("detects carriage return injection", () => {
    expect(containsShellMetachars("echo hello\rnpm install")).toMatch(/carriage-return/);
  });
});
