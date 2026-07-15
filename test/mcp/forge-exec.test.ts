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

  it("rejects shell operators for safety", () => {
    // P0-2 fix: shell operators now blocked as defense-in-depth
    expect(containsShellMetachars("echo hello; rm -rf /")).toMatch(/;/);
    expect(containsShellMetachars("echo hello && rm -rf /")).toMatch(/&&/);
    expect(containsShellMetachars("echo hello || rm -rf /")).toMatch(/\|\|/);
    expect(containsShellMetachars("echo hello | rm -rf /")).toMatch(/\|/);
    expect(containsShellMetachars("echo data > /tmp/out")).toMatch(/>/);
    expect(containsShellMetachars("sort < /tmp/in")).toMatch(/</);
    expect(containsShellMetachars("sleep 30 & echo bg")).toMatch(/&/);
  });

  it("detects newline injection", () => {
    expect(containsShellMetachars("echo hello\nrm -rf /")).toMatch(/newline/);
  });

  it("detects carriage return injection", () => {
    expect(containsShellMetachars("echo hello\rnpm install")).toMatch(/carriage-return/);
  });
});

// ---------------------------------------------------------------------------
// Safe exec path: array-mode for simple commands
// ---------------------------------------------------------------------------

describe("isSimpleCommand", () => {
  // Import after module setup
  let isSimpleCommand: typeof import("../../src/mcp/tools/forge-exec.js").isSimpleCommand;
  beforeAll(async () => {
    const mod = await import("../../src/mcp/tools/forge-exec.js");
    isSimpleCommand = mod.isSimpleCommand;
  });

  it("identifies simple commands (single binary + args)", () => {
    expect(isSimpleCommand("npm test")).toBe(true);
    expect(isSimpleCommand("npx vitest run test/foo.test.ts")).toBe(true);
    expect(isSimpleCommand("echo hello world")).toBe(true);
  });

  it("rejects commands with shell operators", () => {
    expect(isSimpleCommand("echo hello && rm -rf /")).toBe(false);
    expect(isSimpleCommand("echo hello | grep foo")).toBe(false);
    expect(isSimpleCommand("echo hello > /tmp/out")).toBe(false);
    expect(isSimpleCommand("echo hello; rm -rf /")).toBe(false);
  });

  it("rejects commands with shell operators that look like args", () => {
    // These contain |, >, <, ;, & which are shell operators
    expect(isSimpleCommand("cat file | sort")).toBe(false);
    expect(isSimpleCommand("node -e 'code'")).toBe(true); // denied by command allowlist, not parser
  });

  it("rejects empty command", () => {
    expect(isSimpleCommand("")).toBe(false);
    expect(isSimpleCommand("  ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P0-2: isCommandAllowed — readonly allowlist
// ---------------------------------------------------------------------------

describe("isCommandAllowed — readonly allowlist", () => {
  let isCommandAllowed: (cmd: string) => boolean;
  beforeAll(async () => {
    const mod = await import("../../src/mcp/tools/forge-exec.js");
    isCommandAllowed = mod.isCommandAllowed;
  });

  // Allowed commands
  it("allows npm test", () => {
    expect(isCommandAllowed("npm test")).toBe(true);
  });
  it("allows npm run lint", () => {
    expect(isCommandAllowed("npm run lint")).toBe(true);
  });
  it("allows npm run typecheck", () => {
    expect(isCommandAllowed("npm run typecheck")).toBe(true);
  });
  it("allows npm run check", () => {
    expect(isCommandAllowed("npm run check")).toBe(true);
  });
  it("allows npm run test:coverage", () => {
    expect(isCommandAllowed("npm run test:coverage")).toBe(true);
  });
  it("allows vitest run", () => {
    expect(isCommandAllowed("vitest run")).toBe(true);
  });
  it("allows tsc --noEmit", () => {
    expect(isCommandAllowed("tsc --noEmit")).toBe(true);
  });
  it("allows git status", () => {
    expect(isCommandAllowed("git status")).toBe(true);
  });
  it("allows git diff", () => {
    expect(isCommandAllowed("git diff")).toBe(true);
  });
  it("allows git log", () => {
    expect(isCommandAllowed("git log")).toBe(true);
  });
  it("allows echo hello", () => {
    expect(isCommandAllowed("echo hello")).toBe(true);
  });
  it("rejects generic file readers", () => {
    expect(isCommandAllowed("cat file.txt")).toBe(false);
  });
  it("rejects generic directory listing", () => {
    expect(isCommandAllowed("ls -la")).toBe(false);
  });

  // Denied commands
  it("rejects touch x", () => {
    expect(isCommandAllowed("touch x")).toBe(false);
  });
  it("rejects rm -rf tmp", () => {
    expect(isCommandAllowed("rm -rf tmp")).toBe(false);
  });
  it("rejects git commit", () => {
    expect(isCommandAllowed("git commit -m 'x'")).toBe(false);
  });
  it("rejects git push", () => {
    expect(isCommandAllowed("git push")).toBe(false);
  });
  it("rejects npm publish", () => {
    expect(isCommandAllowed("npm publish")).toBe(false);
  });
  it("rejects write-capable npm run scripts", () => {
    expect(isCommandAllowed("npm run lint:fix")).toBe(false);
    expect(isCommandAllowed("npm run format")).toBe(false);
    expect(isCommandAllowed("npm run dist:resync")).toBe(false);
    expect(isCommandAllowed("npm run docs:install-hooks")).toBe(false);
  });
  it("rejects generic node execution and node -e", () => {
    expect(isCommandAllowed("node -e \"require('fs').writeFileSync('/tmp/x','x')\"")).toBe(false);
    expect(isCommandAllowed("node scripts/check-dist-sync.mjs")).toBe(false);
    expect(isCommandAllowed("node --version")).toBe(false);
  });
  it("rejects curl", () => {
    expect(isCommandAllowed("curl http://evil.com")).toBe(false);
  });
  it("rejects wget", () => {
    expect(isCommandAllowed("wget http://evil.com")).toBe(false);
  });
  it("rejects python", () => {
    expect(isCommandAllowed("python -c 'import os'")).toBe(false);
  });
  it("rejects sh", () => {
    expect(isCommandAllowed("sh -c 'rm -rf /'")).toBe(false);
  });
  it("rejects bash", () => {
    expect(isCommandAllowed("bash -c 'rm -rf /'")).toBe(false);
  });

  // P2-2: runner binaries (vitest/npx/biome) use prefix matching that concedes
  // arbitrary trailing args. Flags like --config / -c / --loader cause the
  // binary to load+execute an attacker-controlled module → RCE.
  it("rejects vitest run --config <attacker module> (P2-2)", () => {
    expect(isCommandAllowed("vitest run --config /tmp/x.mjs")).toBe(false);
    expect(isCommandAllowed("vitest run --config=/tmp/x.mjs")).toBe(false);
  });
  it("rejects npx vitest run -c <attacker module> (P2-2)", () => {
    expect(isCommandAllowed("npx vitest run -c /tmp/x.mjs")).toBe(false);
  });
  it("rejects vitest run --loader <module> (P2-2)", () => {
    expect(isCommandAllowed("vitest run --loader /tmp/x.mjs")).toBe(false);
  });
  it("rejects npx vitest run --project <path> (P2-2)", () => {
    expect(isCommandAllowed("npx vitest run --project /tmp/x")).toBe(false);
  });
  it("rejects biome check with config-load flags (P2-2)", () => {
    expect(isCommandAllowed("biome check --config-path /tmp/x")).toBe(false);
  });
  // Regression: benign trailing args still allowed.
  it("still allows vitest run with benign path args (P2-2)", () => {
    expect(isCommandAllowed("vitest run test/foo.test.ts")).toBe(true);
    expect(isCommandAllowed("npx vitest run test/bar.test.ts")).toBe(true);
    expect(isCommandAllowed("biome check src/ test/")).toBe(true);
  });

  // P1-audit: --reporter / --coverage.* load attacker modules via import.
  // denylist missed these; allowlist model must reject module-path values.
  it("rejects vitest run --reporter <attacker module> (audit P1)", () => {
    expect(isCommandAllowed("vitest run --reporter /tmp/evil.mjs")).toBe(false);
    expect(isCommandAllowed("vitest run --reporter=/tmp/evil.mjs")).toBe(false);
  });
  it("rejects npx vitest run --reporter <attacker module> (audit P1)", () => {
    expect(isCommandAllowed("npx vitest run --reporter /tmp/evil.mjs")).toBe(false);
  });
  it("allows vitest run --reporter with builtin reporter names (audit P1)", () => {
    expect(isCommandAllowed("vitest run --reporter json")).toBe(true);
    expect(isCommandAllowed("vitest run --reporter=dot")).toBe(true);
    expect(isCommandAllowed("vitest run --reporter default")).toBe(true);
    expect(isCommandAllowed("npx vitest run --reporter verbose")).toBe(true);
  });
  it("rejects vitest run --coverage.customProviderModule <module> (audit P1)", () => {
    expect(isCommandAllowed("vitest run --coverage.customProviderModule /tmp/x.mjs")).toBe(false);
    expect(isCommandAllowed("vitest run --coverage.customProviderModule=/tmp/x.mjs")).toBe(false);
  });
  it("rejects vitest run --coverage.provider <module-ish> (audit P1)", () => {
    expect(isCommandAllowed("vitest run --coverage.provider /tmp/x.mjs")).toBe(false);
  });
  it("rejects vitest run --environment <attacker module> (audit P1)", () => {
    expect(isCommandAllowed("vitest run --environment /tmp/evil.mjs")).toBe(false);
    expect(isCommandAllowed("vitest run --environment=/tmp/evil.mjs")).toBe(false);
  });
  it("allows vitest run --coverage (builtin boolean flag) (audit P1)", () => {
    expect(isCommandAllowed("vitest run --coverage")).toBe(true);
  });

  // P1-audit: forge_exec git branch only blocked --output, not --no-index.
  // --no-index diffs arbitrary files (no repo needed) → secret exfiltration.
  it("rejects git diff --no-index <arbitrary file> (audit P1)", () => {
    expect(isCommandAllowed("git diff --no-index /dev/null ~/.ssh/id_rsa")).toBe(false);
    expect(isCommandAllowed("git diff --no-index /dev/null .env")).toBe(false);
  });
  it("still allows git diff with benign args (audit P1)", () => {
    expect(isCommandAllowed("git diff")).toBe(true);
    expect(isCommandAllowed("git status")).toBe(true);
    expect(isCommandAllowed("git log")).toBe(true);
  });
  it("rejects git --output write to arbitrary path (P2-1 regression)", () => {
    expect(isCommandAllowed("git diff --output /tmp/x")).toBe(false);
    expect(isCommandAllowed("git log --output=/tmp/x")).toBe(false);
  });
});
