/**
 * Unit tests for the forge_read MCP tool.
 *
 * Covers:
 *   - Script execution with file paths via FORGE_FILES env var
 *   - stdout-only return (output isolation)
 *   - Error handling (non-zero exit, timeout)
 *   - JavaScript and shell language support
 *
 * **Validates: Requirements 4.1–4.5**
 */
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { execReadScript, validatePaths, validateScript } from "../../src/mcp/tools/forge-read.js";

// ---------------------------------------------------------------------------
// Mock child_process.execFile
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

const mockedExecFile = execFile as unknown as MockInstance;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture the env and args passed to execFile. */
function captureExecCall(): {
  getCmd: () => string;
  getArgs: () => string[];
  getEnv: () => Record<string, string | undefined>;
} {
  let capturedCmd = "";
  let capturedArgs: string[] = [];
  let capturedEnv: Record<string, string | undefined> = {};

  mockedExecFile.mockImplementation(
    (
      cmd: string,
      args: string[],
      opts: { env?: Record<string, string | undefined> },
      cb: (err: null, stdout: string, stderr: string) => void,
    ) => {
      capturedCmd = cmd;
      capturedArgs = args;
      capturedEnv = opts.env ?? {};
      cb(null, "script output", "");
      return {};
    },
  );

  return {
    getCmd: () => capturedCmd,
    getArgs: () => capturedArgs,
    getEnv: () => capturedEnv,
  };
}

/** Mock a successful script execution with given stdout. */
function mockScriptSuccess(stdout: string) {
  mockedExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, stdout, "");
      return {};
    },
  );
}

/** Mock a failed script execution. */
function mockScriptFailure(stdout: string, stderr: string, exitCode = 1) {
  mockedExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: { code: number; killed: boolean }, stdout: string, stderr: string) => void,
    ) => {
      cb({ code: exitCode, killed: false }, stdout, stderr);
      return {};
    },
  );
}

/** Mock a timed-out script execution. */
function mockScriptTimeout() {
  mockedExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: { killed: boolean; code: null }, stdout: string, stderr: string) => void,
    ) => {
      cb({ killed: true, code: null }, "partial", "");
      return {};
    },
  );
}

// ---------------------------------------------------------------------------
// execReadScript tests
// ---------------------------------------------------------------------------

describe("execReadScript", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("FORGE_FILES env var injection", () => {
    it("passes file paths as JSON array in FORGE_FILES env var", async () => {
      const capture = captureExecCall();
      const paths = ["src/foo.ts", "src/bar.ts", "lib/baz.js"];

      await execReadScript("console.log('hello')", "javascript", paths, 30000);

      const env = capture.getEnv();
      expect(env.FORGE_FILES).toBe(JSON.stringify(paths));
    });

    it("passes empty array when no paths provided", async () => {
      const capture = captureExecCall();

      await execReadScript("echo test", "shell", [], 30000);

      const env = capture.getEnv();
      expect(env.FORGE_FILES).toBe("[]");
    });
  });

  describe("JavaScript language execution", () => {
    it("executes script via node -e for javascript language", async () => {
      const capture = captureExecCall();
      const script = "console.log(JSON.parse(process.env.FORGE_FILES).length)";

      await execReadScript(script, "javascript", ["a.ts"], 30000);

      expect(capture.getCmd()).toBe("node");
      expect(capture.getArgs()).toEqual(["-e", script]);
    });

    it("returns stdout from successful javascript execution", async () => {
      mockScriptSuccess("3 files analyzed\n2 exports found\n");

      const result = await execReadScript(
        "console.log('3 files analyzed\\n2 exports found')",
        "javascript",
        ["a.ts", "b.ts", "c.ts"],
        30000,
      );

      expect(result.stdout).toBe("3 files analyzed\n2 exports found\n");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });
  });

  describe("Shell language execution", () => {
    it("executes script via /bin/sh -c for shell language", async () => {
      const capture = captureExecCall();
      const script = "echo $FORGE_FILES | jq length";

      await execReadScript(script, "shell", ["a.ts"], 30000);

      expect(capture.getCmd()).toBe("/bin/sh");
      expect(capture.getArgs()).toEqual(["-c", script]);
    });

    it("returns stdout from successful shell execution", async () => {
      mockScriptSuccess("file count: 2\n");

      const result = await execReadScript("echo file count: 2", "shell", ["a.ts", "b.ts"], 30000);

      expect(result.stdout).toBe("file count: 2\n");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("output isolation", () => {
    it("returns only stdout, not stderr on success", async () => {
      // Even if stderr has content, on success we only care about stdout
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "analysis result", "some debug info");
          return {};
        },
      );

      const result = await execReadScript("script", "javascript", ["a.ts"], 30000);

      expect(result.stdout).toBe("analysis result");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("error handling", () => {
    it("returns non-zero exit code on script failure", async () => {
      mockScriptFailure("", "SyntaxError: unexpected token", 1);

      const result = await execReadScript("invalid{{{", "javascript", ["a.ts"], 30000);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("SyntaxError: unexpected token");
      expect(result.timedOut).toBe(false);
    });

    it("returns timedOut=true when script exceeds timeout", async () => {
      mockScriptTimeout();

      const result = await execReadScript("while(true){}", "javascript", ["a.ts"], 100);

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(1);
    });

    it("handles null child process gracefully", async () => {
      mockedExecFile.mockReturnValue(null);

      const result = await execReadScript("echo test", "shell", [], 30000);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("Failed to spawn subprocess");
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: forge_read tool response format
// ---------------------------------------------------------------------------

describe("forge_read tool response format", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("successful execution returns stdout-only content", async () => {
    mockScriptSuccess("Module exports: 5\nDependencies: 3\n");

    const result = await execReadScript(
      "analyze-script",
      "javascript",
      ["src/a.ts", "src/b.ts"],
      30000,
    );

    // The tool handler would wrap this in MCP response format
    // Here we verify the raw result that feeds into the response
    expect(result.stdout).toBe("Module exports: 5\nDependencies: 3\n");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("failed execution provides error details", async () => {
    mockScriptFailure("partial output", "Error: file not found", 1);

    const result = await execReadScript("bad-script", "javascript", ["missing.ts"], 30000);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("partial output");
    expect(result.stderr).toBe("Error: file not found");
  });

  it("timeout provides clear indication", async () => {
    mockScriptTimeout();

    const result = await execReadScript("slow-script", "javascript", ["big.ts"], 30000);

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// execReadScript with cwd option
// ---------------------------------------------------------------------------

describe("execReadScript with cwd", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes cwd option to execFile", async () => {
    let capturedOpts: Record<string, unknown> = {};
    mockedExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        opts: Record<string, unknown>,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        capturedOpts = opts;
        cb(null, "done", "");
        return {};
      },
    );

    const result = await execReadScript("console.log(1)", "javascript", [], 30000, {
      cwd: "/custom/root",
    });
    expect(capturedOpts.cwd).toBe("/custom/root");
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// validatePaths — path traversal prevention
// ---------------------------------------------------------------------------

describe("validatePaths", () => {
  it("allows paths within project root", () => {
    expect(validatePaths(["/home/user/project/src/index.ts"], "/home/user/project")).toBeNull();
  });

  it("allows relative paths within project root", () => {
    expect(validatePaths(["src/index.ts"], "/home/user/project")).toBeNull();
  });

  it("rejects absolute paths escaping project root", () => {
    const result = validatePaths(["/etc/passwd"], "/home/user/project");
    expect(result).toMatch(/escapes project root/);
  });

  it("rejects relative paths with .. traversal", () => {
    const result = validatePaths(["../../../etc/passwd"], "/home/user/project");
    expect(result).toMatch(/escapes project root/);
  });

  it("rejects mixed valid and invalid paths", () => {
    const result = validatePaths(["src/a.ts", "/tmp/evil"], "/home/user/project");
    expect(result).toMatch(/escapes project root/);
  });

  it("allows multiple valid paths", () => {
    expect(
      validatePaths(["src/a.ts", "src/b.ts", "test/c.test.ts"], "/home/user/project"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateScript — dangerous pattern detection
// ---------------------------------------------------------------------------

describe("validateScript", () => {
  it("rejects scripts using process.env (blocked by P0-1 fix)", () => {
    // P0-1 fix: scripts can no longer access process.env or require('fs')
    // Legitimate scripts must use only the FORGE_FILES env var via
    // the safe accessor provided by the tool infrastructure
    const script = `
      const files = JSON.parse(process.env.FORGE_FILES);
      files.forEach(f => {
        console.log(f, "analyzed");
      });
    `;
    // This script uses process.env which is now blocked — this is expected
    expect(validateScript(script)).toMatch(/process\.env/);
  });

  it("allows safe scripts without fs/process access", () => {
    // P0-1 fix: scripts using only pure computation are still allowed
    // process.env and require('fs') are blocked; shell mode should be used for file access
    const script = `
      const x = 1 + 1;
      console.log(x);
    `;
    expect(validateScript(script)).toBeNull();
  });

  it("rejects scripts requiring fs for read operations", () => {
    const script = `
      const fs = require('fs');
      files.forEach(f => {
        const content = fs.readFileSync(f, 'utf-8');
        console.log(f, content.split('\\n').length);
      });
    `;
    expect(validateScript(script)).toMatch(/require.*fs/);
  });

  it("rejects child_process require", () => {
    expect(validateScript("require('child_process').exec('rm -rf /')")).toMatch(/child_process/);
  });

  it("rejects process.exit", () => {
    expect(validateScript("process.exit(1)")).toMatch(/process\.exit/);
  });

  it("rejects eval usage", () => {
    expect(validateScript("eval('malicious code')")).toMatch(/eval/);
  });

  it("rejects Function constructor", () => {
    expect(validateScript("Function('return process')()")).toMatch(/Function/);
  });

  it("rejects writeFileSync", () => {
    expect(validateScript("require('fs').writeFileSync('/tmp/x','')")).toMatch(/writeFileSync/);
  });

  it("rejects writeFile", () => {
    expect(validateScript("require('fs').writeFile('/tmp/x','')")).toMatch(/writeFile/);
  });

  it("rejects execSync", () => {
    // child_process appears first in the pattern list, so either match is valid
    const result = validateScript("require('child_process').execSync('id')");
    expect(result).toMatch(/child_process|execSync/);
  });

  it("rejects require('fs') as filesystem access", () => {
    // P0-1 fix: ALL fs access is blocked, including read-only
    expect(validateScript("require('fs').readFileSync('a.ts','utf-8')")).toMatch(/require.*fs/);
  });

  it("rejects require('node:fs')", () => {
    expect(validateScript("require('node:fs').readFileSync('a.ts','utf-8')")).toMatch(/node:fs/);
  });

  it("rejects dynamic import()", () => {
    expect(validateScript("import('fs').then(m => m.readFileSync('/etc/passwd'))")).toMatch(
      /import\(\)/,
    );
  });

  it("rejects Buffer.from", () => {
    expect(validateScript("Buffer.from('data')")).toMatch(/Buffer/);
  });

  it("rejects WebAssembly", () => {
    expect(validateScript("WebAssembly.instantiate({})")).toMatch(/WebAssembly/);
  });

  it("rejects process.binding", () => {
    expect(validateScript("process.binding('fs')")).toMatch(/process\.binding/);
  });

  it("rejects process.env access", () => {
    expect(validateScript("const x = process.env.SECRET")).toMatch(/process\.env/);
  });
});

// ---------------------------------------------------------------------------
// VM sandbox — script resource limits
// ---------------------------------------------------------------------------

describe("sandboxOptions — resource limits for script execution", () => {
  it("provides NODE_OPTIONS with resource limits for javascript language", () => {
    const opts = buildSandboxEnv("javascript", ["a.ts"]);
    expect(opts.FORGE_FILES).toBe(JSON.stringify(["a.ts"]));
    // Must include --max-old-space-size to prevent memory exhaustion
    expect(opts.NODE_OPTIONS).toContain("--max-old-space-size");
  });

  it("does not set NODE_OPTIONS for shell language", () => {
    const opts = buildSandboxEnv("shell", ["a.ts"]);
    expect(opts.NODE_OPTIONS).toBeUndefined();
  });
});

// Import for sandbox tests
import { buildSandboxEnv } from "../../src/mcp/tools/forge-read.js";
