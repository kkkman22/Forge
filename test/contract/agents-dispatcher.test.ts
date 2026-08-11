/**
 * Contract tests for agents-dispatcher.ts (R5).
 *
 * Validates the parallel subagent dispatch via `claude agents` command
 * with inline fallback. All subprocess calls are mocked — no real `claude`
 * binary is invoked.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We'll import after the module exists; for RED phase we test against the
// expected interface by dynamically importing and catching.
const MODULE_PATH = "../../src/forge/agents-dispatcher.js";

// Reusable fixtures
const MOCK_EXEC_FILE = vi.fn();

// Intercept child_process.execFile
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => MOCK_EXEC_FILE(...args),
}));

// Intercept node:fs for collectResults tests
const MOCK_READ_FILE = vi.fn();
const MOCK_READDIR_SYNC = vi.fn();
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (...args: unknown[]) => MOCK_READ_FILE(...args),
    readdirSync: (...args: unknown[]) => MOCK_READDIR_SYNC(...args),
  };
});

describe("agents-dispatcher (R5)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `agents-dispatcher-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    MOCK_EXEC_FILE.mockReset();
    MOCK_READ_FILE.mockRestore();
    MOCK_READDIR_SYNC.mockRestore();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // 1. Module imports and interface shape
  // -----------------------------------------------------------------------

  it("exports dispatch and collectResults functions", async () => {
    const mod = await import(MODULE_PATH);
    expect(typeof mod.dispatch).toBe("function");
    expect(typeof mod.collectResults).toBe("function");
  });

  it("exports DispatchOptions and DispatchResult types (structural check)", async () => {
    const mod = await import(MODULE_PATH);

    // execFile("claude", args, { cwd }, callback) — callback is 4th arg
    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string) => void) =>
        cb(null, '{"status":"completed"}'),
    );

    const opts: any = {
      agentType: "spec-check",
      prompt: "Review spec completeness",
      workdir: tmpDir,
      lineage: [],
    };
    const result = await mod.dispatch(opts);

    expect(result).toHaveProperty("agent");
    expect(result).toHaveProperty("status");
  });

  // -----------------------------------------------------------------------
  // 2. Returns failed result when claude agents is unavailable
  // -----------------------------------------------------------------------

  it("returns { status: 'failed' } when claude agents command is not found", async () => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        const err = new Error("spawn claude ENOENT");
        (err as NodeJS.ErrnoException).code = "ENOENT";
        cb(err);
      },
    );

    const result = await dispatch({
      agentType: "spec-check",
      prompt: "test",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result.status).toBe("failed");
    expect(result.agent).toBe("spec-check");
  });

  it("returns { status: 'failed' } when claude agents exits with non-zero code", async () => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        const err = new Error("Command failed") as NodeJS.ErrnoException;
        (err as unknown as { code: number }).code = 1;
        cb(err);
      },
    );

    const result = await dispatch({
      agentType: "quality-check",
      prompt: "test quality",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result.status).toBe("failed");
    expect(result.agent).toBe("quality-check");
  });

  // -----------------------------------------------------------------------
  // 3. Builds correct command arguments from DispatchOptions
  // -----------------------------------------------------------------------

  it("builds correct CLI arguments with agent type and prompt", async () => {
    const { dispatch } = await import(MODULE_PATH);

    let capturedArgs: string[] = [];
    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, args: string[], _opts: unknown, cb: (err: null, stdout: string) => void) => {
        capturedArgs = args;
        cb(null, '{"status":"completed"}');
      },
    );

    await dispatch({
      agentType: "security-check",
      prompt: "Scan for vulnerabilities",
      workdir: "/tmp/project",
      lineage: [],
    });

    // Should call 'claude' with 'agents' subcommand and appropriate flags
    expect(capturedArgs[0]).toBe("agents");
    expect(capturedArgs).toContain("--agent-type=security-check");
    expect(capturedArgs).toContain("--workdir=/tmp/project");
    // The prompt should be passed as well
    const promptArg = capturedArgs.find(
      (a) => a.startsWith("--prompt=") || a.startsWith("--prompt "),
    );
    expect(promptArg).toBeTruthy();
  });

  it("includes --effort flag when effort is specified", async () => {
    const { dispatch } = await import(MODULE_PATH);

    let capturedArgs: string[] = [];
    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, args: string[], _opts: unknown, cb: (err: null, stdout: string) => void) => {
        capturedArgs = args;
        cb(null, '{"status":"completed"}');
      },
    );

    await dispatch({
      agentType: "architect",
      prompt: "Design review",
      workdir: tmpDir,
      lineage: [],
      effort: "high",
    });

    expect(capturedArgs).toContain("--effort=high");
  });

  it("includes --all when includeAll is specified", async () => {
    const { buildAgentArgs } = await import(MODULE_PATH);

    const args = buildAgentArgs({
      agentType: "spec-check",
      prompt: "Collect all sessions",
      workdir: tmpDir,
      lineage: [],
      includeAll: true,
    });

    expect(args).toContain("--all");
  });

  it("prepends worktree edit preflight before truncation-sensitive prompt text", async () => {
    const { buildAgentArgs, WORKTREE_EDIT_PREFLIGHT } = await import(MODULE_PATH);

    const args = buildAgentArgs({
      agentType: "forge-build",
      prompt: "x".repeat(5000),
      workdir: tmpDir,
      lineage: [],
      requiresWorktreePreflight: true,
    });

    const promptArg = args.find((arg: string) => arg.startsWith("--prompt=")) ?? "";
    expect(promptArg).toContain(WORKTREE_EDIT_PREFLIGHT);
    expect(promptArg.length).toBeLessThanOrEqual("--prompt=".length + 4096);
  });

  it("omits --effort flag when effort is not specified", async () => {
    const { dispatch } = await import(MODULE_PATH);

    let capturedArgs: string[] = [];
    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, args: string[], _opts: unknown, cb: (err: null, stdout: string) => void) => {
        capturedArgs = args;
        cb(null, '{"status":"completed"}');
      },
    );

    await dispatch({
      agentType: "architect",
      prompt: "Design review",
      workdir: tmpDir,
      lineage: [],
    });

    const effortArg = capturedArgs.find((a) => a.startsWith("--effort"));
    expect(effortArg).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 4. Reads results from .tinkerman/agent-results/ directory
  // -----------------------------------------------------------------------

  it("collectResults reads JSON files from agent-results/<runId>/", async () => {
    const { collectResults } = await import(MODULE_PATH);

    const runDir = join(tmpDir, ".tinkerman", "agent-results", "run-123");
    mkdirSync(runDir, { recursive: true });

    const result1 = {
      agent: "spec-check",
      status: "completed",
      findings: ["f1"],
      duration_ms: 1000,
    };
    const result2 = {
      agent: "quality-check",
      status: "completed",
      findings: ["f2"],
      duration_ms: 2000,
    };

    writeFileSync(join(runDir, "spec-check.json"), JSON.stringify(result1));
    writeFileSync(join(runDir, "quality-check.json"), JSON.stringify(result2));

    // Use real fs for collectResults — restore actual implementations
    const { readFileSync: _realRead, readdirSync: realReaddir } = await import("node:fs");
    MOCK_READDIR_SYNC.mockImplementation((dir: string) => {
      if (dir === runDir || dir === join(tmpDir, ".tinkerman", "agent-results", "run-123")) {
        return ["spec-check.json", "quality-check.json"];
      }
      return [];
    });
    MOCK_READ_FILE.mockImplementation((filePath: string) => {
      if (filePath.endsWith("spec-check.json")) return JSON.stringify(result1);
      if (filePath.endsWith("quality-check.json")) return JSON.stringify(result2);
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const results = await collectResults("run-123", tmpDir);

    expect(results).toHaveLength(2);
    expect(results[0].agent).toBe("spec-check");
    expect(results[0].status).toBe("completed");
    expect(results[0].findings).toEqual(["f1"]);
    expect(results[1].agent).toBe("quality-check");
  });

  it("collectResults returns empty array when run directory does not exist", async () => {
    const { collectResults } = await import(MODULE_PATH);

    MOCK_READDIR_SYNC.mockImplementation(() => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    const results = await collectResults("nonexistent-run", tmpDir);
    expect(results).toEqual([]);
  });

  it("collectResults skips malformed JSON files gracefully", async () => {
    const { collectResults } = await import(MODULE_PATH);

    const runDir = join(tmpDir, ".tinkerman", "agent-results", "run-malformed");

    MOCK_READDIR_SYNC.mockImplementation((dir: string) => {
      if (dir === runDir) return ["bad.json", "good.json"];
      return [];
    });
    MOCK_READ_FILE.mockImplementation((filePath: string) => {
      if (filePath.endsWith("bad.json")) return "NOT VALID JSON{{{";
      if (filePath.endsWith("good.json"))
        return JSON.stringify({ agent: "security-check", status: "completed" });
      throw new Error(`Unexpected: ${filePath}`);
    });

    const results = await collectResults("run-malformed", tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].agent).toBe("security-check");
  });

  // -----------------------------------------------------------------------
  // 5. Fallback to inline mode on command failure
  // -----------------------------------------------------------------------

  it("dispatch returns status='failed' with no findings on ENOENT (caller handles inline)", async () => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        const err = new Error("command not found") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        cb(err);
      },
    );

    const result = await dispatch({
      agentType: "product",
      prompt: "Product analysis",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result).toEqual({
      agent: "product",
      status: "failed",
      findings: undefined,
      duration_ms: undefined,
    });
  });

  // -----------------------------------------------------------------------
  // 6. Config integration: reads dispatch_mode from config content
  // -----------------------------------------------------------------------

  it("parseDispatchMode returns 'inline' by default", async () => {
    const { parseDispatchMode } = await import(MODULE_PATH);
    expect(parseDispatchMode("review", "")).toBe("inline");
  });

  it("parseDispatchMode reads review_dispatch_mode from config", async () => {
    const { parseDispatchMode } = await import(MODULE_PATH);
    const config = "review_dispatch_mode: agents\ndecide_dispatch_mode: inline\n";
    expect(parseDispatchMode("review", config)).toBe("agents");
  });

  it("parseDispatchMode reads decide_dispatch_mode from config", async () => {
    const { parseDispatchMode } = await import(MODULE_PATH);
    const config = "review_dispatch_mode: inline\ndecide_dispatch_mode: agents\n";
    expect(parseDispatchMode("decide", config)).toBe("agents");
  });

  it("parseDispatchMode returns 'auto' when config sets auto", async () => {
    const { parseDispatchMode } = await import(MODULE_PATH);
    const config = "decide_dispatch_mode: auto\n";
    expect(parseDispatchMode("decide", config)).toBe("auto");
  });

  // -----------------------------------------------------------------------
  // 7. Successful dispatch returns completed result
  // -----------------------------------------------------------------------

  it("returns completed result with findings on successful dispatch", async () => {
    const { dispatch } = await import(MODULE_PATH);

    const agentOutput = {
      agent: "spec-check",
      status: "completed",
      findings: [{ severity: "P1", message: "Missing error handling" }],
      duration_ms: 5000,
    };

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string) => void) => {
        cb(null, JSON.stringify(agentOutput));
      },
    );

    const result = await dispatch({
      agentType: "spec-check",
      prompt: "Review spec",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result.status).toBe("completed");
    expect(result.agent).toBe("spec-check");
    expect(result.findings).toEqual(agentOutput.findings);
    expect(result.duration_ms).toBe(5000);
  });

  it("preserves Claude agents JSON id and state fields", async () => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string) => void) => {
        cb(
          null,
          JSON.stringify({
            id: "agent-session-123",
            state: "completed",
            agent: "spec-check",
            status: "completed",
            findings: [],
          }),
        );
      },
    );

    const result = await dispatch({
      agentType: "spec-check",
      prompt: "Review spec",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result.id).toBe("agent-session-123");
    expect(result.state).toBe("completed");
    expect(result.status).toBe("completed");
  });

  it.each([
    "blocked",
    "running",
    "just-dispatched",
    "unknown-state",
  ])("maps non-completed state %s to failed dispatch result", async (state) => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string) => void) => {
        cb(
          null,
          JSON.stringify({
            id: `agent-${state}`,
            state,
            agent: "quality-check",
            status: "completed",
          }),
        );
      },
    );

    const result = await dispatch({
      agentType: "quality-check",
      prompt: "Review quality",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result.status).toBe("failed");
    expect(result.state).toBe(state);
    expect(result.diagnostic).toContain("non-completed state");
  });

  it("passes execFile timeout and reports timeout diagnostics", async () => {
    const { dispatch } = await import(MODULE_PATH);

    let capturedOpts: { timeout?: number; killSignal?: string } = {};
    MOCK_EXEC_FILE.mockImplementation(
      (
        _cmd: unknown,
        _args: unknown,
        opts: { timeout?: number; killSignal?: string },
        cb: (err: Error) => void,
      ) => {
        capturedOpts = opts;
        const err = new Error("Command timed out") as Error & { killed?: boolean; signal?: string };
        err.killed = true;
        err.signal = "SIGTERM";
        cb(err);
      },
    );

    const result = await dispatch({
      agentType: "security-check",
      prompt: "Review security",
      workdir: tmpDir,
      lineage: [],
      timeoutMs: 1234,
    });

    expect(capturedOpts.timeout).toBe(1234);
    expect(capturedOpts.killSignal).toBe("SIGTERM");
    expect(result.status).toBe("failed");
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.diagnostic).toContain("timeout after 1234ms");
  });

  it("returns parse diagnostic for malformed JSON stdout", async () => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string) => void) => {
        cb(null, "not json {{{");
      },
    );

    const result = await dispatch({
      agentType: "critic",
      prompt: "Review",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result.status).toBe("failed");
    expect(result.diagnostic).toMatch(/parse/i);
  });

  it("records duration_ms even when not returned by agent", async () => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string) => void) => {
        cb(null, JSON.stringify({ agent: "critic", status: "completed" }));
      },
    );

    const result = await dispatch({
      agentType: "critic",
      prompt: "Criticize",
      workdir: tmpDir,
      lineage: [],
    });

    expect(result.status).toBe("completed");
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // 8. Per-tier agent timeout resolution (spec: review-agent-timeout-dynamic)
  // -----------------------------------------------------------------------

  it("resolveAgentTimeoutMs returns per-tier configured values", async () => {
    const { resolveAgentTimeoutMs } = await import(MODULE_PATH);
    const config = [
      "review.agent_timeout_minutes.light: 5",
      "review.agent_timeout_minutes.standard: 15",
      "review.agent_timeout_minutes.full: 30",
    ].join("\n");
    expect(resolveAgentTimeoutMs("light", config)).toBe(5 * 60 * 1000);
    expect(resolveAgentTimeoutMs("standard", config)).toBe(15 * 60 * 1000);
    expect(resolveAgentTimeoutMs("full", config)).toBe(30 * 60 * 1000);
  });

  it("resolveAgentTimeoutMs falls back to per-tier default when a single tier is missing", async () => {
    const { resolveAgentTimeoutMs } = await import(MODULE_PATH);
    // Only 'full' configured; light/standard fall back to defaults.
    const config = "review.agent_timeout_minutes.full: 45";
    expect(resolveAgentTimeoutMs("light", config)).toBe(5 * 60 * 1000);
    expect(resolveAgentTimeoutMs("standard", config)).toBe(15 * 60 * 1000);
    expect(resolveAgentTimeoutMs("full", config)).toBe(45 * 60 * 1000);
  });

  it("resolveAgentTimeoutMs falls back to 15min for all tiers when config field absent (backward compat)", async () => {
    const { resolveAgentTimeoutMs } = await import(MODULE_PATH);
    // No review.agent_timeout_minutes.* anywhere — current behaviour preserved.
    const config = "review.subagent_concurrency: 3\nreview_dispatch_mode: agents\n";
    expect(resolveAgentTimeoutMs("light", config)).toBe(15 * 60 * 1000);
    expect(resolveAgentTimeoutMs("standard", config)).toBe(15 * 60 * 1000);
    expect(resolveAgentTimeoutMs("full", config)).toBe(15 * 60 * 1000);
  });

  it("resolveAgentTimeoutMs falls back to per-tier default for non-positive / non-integer values", async () => {
    const { resolveAgentTimeoutMs } = await import(MODULE_PATH);
    const config = [
      "review.agent_timeout_minutes.light: 0",
      "review.agent_timeout_minutes.standard: -5",
      "review.agent_timeout_minutes.full: abc",
    ].join("\n");
    expect(resolveAgentTimeoutMs("light", config)).toBe(5 * 60 * 1000);
    expect(resolveAgentTimeoutMs("standard", config)).toBe(15 * 60 * 1000);
    expect(resolveAgentTimeoutMs("full", config)).toBe(30 * 60 * 1000);
  });

  it("resolveAgentTimeoutMs falls back to standard default when tier is unknown", async () => {
    const { resolveAgentTimeoutMs } = await import(MODULE_PATH);
    // Unknown tier + no config at all → standard default (15min).
    expect(resolveAgentTimeoutMs("unknown", "")).toBe(15 * 60 * 1000);
    // Unknown tier + config present → still standard default.
    const config = "review.agent_timeout_minutes.full: 30";
    expect(resolveAgentTimeoutMs("nonsense-tier", config)).toBe(15 * 60 * 1000);
  });

  it("resolveAgentTimeoutMs falls back to standard default when tier is undefined", async () => {
    const { resolveAgentTimeoutMs } = await import(MODULE_PATH);
    expect(resolveAgentTimeoutMs(undefined, "")).toBe(15 * 60 * 1000);
  });

  // -----------------------------------------------------------------------
  // 9. dispatch integrates per-tier timeout from config (spec: review-agent-timeout-dynamic)
  // -----------------------------------------------------------------------

  it("dispatch uses resolved per-tier timeout when opts.timeoutMs is not set", async () => {
    const { dispatch } = await import(MODULE_PATH);

    let capturedOpts: { timeout?: number } = {};
    MOCK_EXEC_FILE.mockImplementation(
      (
        _cmd: unknown,
        _args: unknown,
        opts: { timeout?: number },
        cb: (err: null, stdout: string) => void,
      ) => {
        capturedOpts = opts;
        cb(null, '{"status":"completed"}');
      },
    );

    const config = "review.agent_timeout_minutes.full: 25\n";
    await dispatch({
      agentType: "quality-check",
      prompt: "Review",
      workdir: tmpDir,
      lineage: [],
      tier: "full",
      configContent: config,
    });

    // full=25min configured; dispatch should pass that to execFile.
    expect(capturedOpts.timeout).toBe(25 * 60 * 1000);
  });

  it("dispatch honours explicit opts.timeoutMs over config resolution (override)", async () => {
    const { dispatch } = await import(MODULE_PATH);

    let capturedOpts: { timeout?: number } = {};
    MOCK_EXEC_FILE.mockImplementation(
      (
        _cmd: unknown,
        _args: unknown,
        opts: { timeout?: number },
        cb: (err: null, stdout: string) => void,
      ) => {
        capturedOpts = opts;
        cb(null, '{"status":"completed"}');
      },
    );

    await dispatch({
      agentType: "quality-check",
      prompt: "Review",
      workdir: tmpDir,
      lineage: [],
      tier: "full",
      configContent: "review.agent_timeout_minutes.full: 30\n",
      timeoutMs: 7000, // explicit override wins
    });

    expect(capturedOpts.timeout).toBe(7000);
  });

  it("dispatch reports the resolved timeout in failure diagnostics", async () => {
    const { dispatch } = await import(MODULE_PATH);

    MOCK_EXEC_FILE.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        const err = new Error("timed out") as Error & { killed?: boolean; signal?: string };
        err.killed = true;
        err.signal = "SIGTERM";
        cb(err);
      },
    );

    const result = await dispatch({
      agentType: "security-check",
      prompt: "Review",
      workdir: tmpDir,
      lineage: [],
      tier: "light",
      configContent: "review.agent_timeout_minutes.light: 8\n",
    });

    // light=8min resolved; diagnostic must echo that, not the legacy 15min.
    expect(result.diagnostic).toBe(`timeout after ${8 * 60 * 1000}ms`);
  });

  // Backward compatibility: callers that predate this feature pass neither
  // tier nor configContent. They must keep seeing the legacy 15-minute timeout
  // so existing projects see no behaviour change on upgrade (Req4).
  it("dispatch uses legacy 15min timeout when caller passes neither tier nor configContent", async () => {
    const { dispatch } = await import(MODULE_PATH);

    let capturedOpts: { timeout?: number } = {};
    MOCK_EXEC_FILE.mockImplementation(
      (
        _cmd: unknown,
        _args: unknown,
        opts: { timeout?: number },
        cb: (err: null, stdout: string) => void,
      ) => {
        capturedOpts = opts;
        cb(null, '{"status":"completed"}');
      },
    );

    // Minimal DispatchOptions — no tier, no configContent, no timeoutMs.
    await dispatch({
      agentType: "spec-check",
      prompt: "Review",
      workdir: tmpDir,
      lineage: [],
    });

    expect(capturedOpts.timeout).toBe(15 * 60 * 1000);
  });
});
