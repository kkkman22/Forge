import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/ultrareview-fallback.mjs");
const FIXTURE_DIR = join(tmpdir(), `forge-test-ultrareview-fallback-${Date.now()}`);

// Node's directory must be on PATH for execFileSync("node", ...) to work
const NODE_DIR = dirname(process.execPath);

function fixture(...paths: string[]): string {
  return join(FIXTURE_DIR, ...paths);
}

/**
 * Run the ultrareview-fallback script via execFileSync.
 * Mocks the `claude` CLI by prepending a mock bin dir to PATH.
 */
function runScript(opts: {
  mockClaudeScript?: string; // path to a shell script that acts as `claude`
  env?: Record<string, string>;
  configYaml?: string;
}): { stdout: string; stderr: string; exitCode: number } {
  const env: Record<string, string> = {
    ...process.env,
    FORGE_ROOT: FIXTURE_DIR,
    ...opts.env,
  };

  // If a mock claude script is provided, create a temp bin dir with it
  if (opts.mockClaudeScript) {
    const mockBin = fixture("mock-bin");
    mkdirSync(mockBin, { recursive: true });
    writeFileSync(join(mockBin, "claude"), opts.mockClaudeScript, { mode: 0o755 });
    env.PATH = `${mockBin}:${process.env.PATH}`;
  }

  // Write config if provided
  if (opts.configYaml !== undefined) {
    mkdirSync(fixture(".tinkerman"), { recursive: true });
    writeFileSync(fixture(".tinkerman", "config.md"), opts.configYaml);
  }

  try {
    const stdout = execFileSync("node", [SCRIPT], {
      cwd: FIXTURE_DIR,
      timeout: 5000,
      encoding: "utf-8",
      env,
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
 * Helper: create a mock claude script that outputs JSON to stdout.
 */
function mockClaueOutputJson(json: object, exitCode = 0): string {
  return `#!/bin/sh\ncat <<'JSONEOF'\n${JSON.stringify(json)}\nJSONEOF\nexit ${exitCode}\n`;
}

// ── Sample ultrareview output ──

const SAMPLE_ULTRAREVIEW_OUTPUT = {
  summary: "Found 2 P0 issues and 1 P2 issue.",
  findings: [
    {
      severity: "P0",
      file_path: "src/auth.ts",
      line: 42,
      message: "Hardcoded API key detected",
      category: "security",
    },
    {
      severity: "P0",
      file_path: "src/db.ts",
      line: 15,
      message: "SQL injection vulnerability",
      category: "security",
    },
    {
      severity: "P2",
      file_path: "src/utils.ts",
      line: 100,
      message: "Consider using optional chaining",
      category: "quality",
    },
    {
      severity: "P3",
      file_path: "src/types.ts",
      line: 1,
      message: "Typo in comment",
      category: "style",
    },
  ],
};

// ── Tests ──

describe("ultrareview-fallback.mjs (R9)", () => {
  beforeEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
    mkdirSync(fixture(".tinkerman"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
  });

  describe("calls claude ultrareview --json when available", () => {
    it("invokes claude ultrareview --json and outputs parsed findings", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty("findings");
      expect(output).toHaveProperty("summary");
      expect(Array.isArray(output.findings)).toBe(true);
      expect(output.findings).toHaveLength(4);
    });

    it("maps ultrareview findings to P0-P3 severity levels", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const severities = output.findings.map((f: { severity: string }) => f.severity);
      expect(severities).toContain("P0");
      expect(severities).toContain("P2");
      expect(severities).toContain("P3");
    });

    it("preserves all finding fields: severity, file_path, line, message, category", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const finding = output.findings[0];
      expect(finding).toHaveProperty("severity", "P0");
      expect(finding).toHaveProperty("file_path", "src/auth.ts");
      expect(finding).toHaveProperty("line", 42);
      expect(finding).toHaveProperty("message", "Hardcoded API key detected");
      expect(finding).toHaveProperty("category", "security");
    });

    it("includes methodology field set to ultrareview-fallback", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty("methodology", "ultrareview-fallback");
    });
  });

  describe("falls back gracefully when command unavailable", () => {
    it("exits 1 when claude command is not found", () => {
      // PATH includes node's dir but not claude's dir
      const nodePath = `${NODE_DIR}:/usr/bin:/bin`;
      const result = runScript({
        env: { PATH: nodePath },
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe("handles non-zero exit code from claude ultrareview", () => {
    it("exits 1 when claude ultrareview returns non-zero exit code", () => {
      const mockScript = `#!/bin/sh\necho "error: internal failure"\nexit 1\n`;

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe("handles malformed JSON output", () => {
    it("exits 1 when claude ultrareview outputs invalid JSON", () => {
      const mockScript = `#!/bin/sh\necho "this is not json {{"\nexit 0\n`;

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/parse|JSON|malformed/i);
    });

    it("exits 1 when claude ultrareview outputs empty string", () => {
      const mockScript = `#!/bin/sh\necho ""\nexit 0\n`;

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe("respects review_use_ultrareview config", () => {
    it("exits 1 with clear message when config is false", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: false\n---",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/disabled|review_use_ultrareview.*false/i);
    });

    it("exits 1 when config key is missing (defaults to false)", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nsome_other_key: value\n---",
      });

      expect(result.exitCode).toBe(1);
    });

    it("handles config with inline comments (real config format)", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true           # true | false\n---",
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.findings).toHaveLength(4);
    });
  });

  describe("output format matches forge-review finding structure", () => {
    it("output is valid JSON with findings array on stdout", () => {
      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty("findings");
      expect(Array.isArray(output.findings)).toBe(true);
      expect(output).toHaveProperty("summary");
      expect(output).toHaveProperty("methodology");
      expect(output).toHaveProperty("source");
      expect(output.source).toBe("ultrareview");
    });

    it("handles empty findings array (no issues found)", () => {
      const emptyOutput = {
        summary: "No issues found.",
        findings: [],
      };
      const mockScript = mockClaueOutputJson(emptyOutput);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.findings).toHaveLength(0);
      expect(output.summary).toBe("No issues found.");
    });

    it("handles findings with missing optional fields gracefully", () => {
      const sparseOutput = {
        summary: "Partial review.",
        findings: [{ severity: "P1", message: "Something wrong" }],
      };
      const mockScript = mockClaueOutputJson(sparseOutput);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: "---\nreview_use_ultrareview: true\n---",
      });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.findings).toHaveLength(1);
      expect(output.findings[0].severity).toBe("P1");
      expect(output.findings[0].message).toBe("Something wrong");
    });
  });

  describe("handles missing config file", () => {
    it("exits 1 when .tinkerman/config.md does not exist", () => {
      // Remove .forge dir to simulate missing config
      rmSync(fixture(".tinkerman"), { recursive: true, force: true });

      const mockScript = mockClaueOutputJson(SAMPLE_ULTRAREVIEW_OUTPUT);

      const result = runScript({
        mockClaudeScript: mockScript,
        configYaml: undefined, // don't write config
      });

      expect(result.exitCode).toBe(1);
    });
  });
});
