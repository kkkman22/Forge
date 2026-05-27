import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDriverConfig } from "../src/cli-subprocess-driver.js";
import { buildArgs, buildEnv, CliSubprocessDriver } from "../src/cli-subprocess-driver.js";

describe("CliSubprocessDriver", () => {
  let runDir: string;

  beforeEach(() => {
    runDir = join(tmpdir(), `cli-driver-test-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
  });

  function makeConfig(overrides: Partial<CliDriverConfig> = {}): CliDriverConfig {
    return {
      cwd: "/tmp/project",
      runId: "run-001",
      runDir,
      permissionMode: "bypassPermissions",
      dangerouslySkipPermissions: true,
      maxTurns: 10,
      ...overrides,
    };
  }

  describe("buildArgs", () => {
    it("includes required flags (a-e)", () => {
      const args = buildArgs(makeConfig());
      expect(args).toContain("--print");
      expect(args).toContain("--output-format=stream-json");
      expect(args).toContain("--include-partial-messages");
      expect(args).toContain("--input-format=stream-json");
      expect(args).toContain("--permission-mode=bypassPermissions");
      expect(args).toContain("--max-turns=10");
    });

    it("maps allowedTools to --allowed-tools", () => {
      const args = buildArgs(makeConfig({ allowedTools: ["Read", "Edit", "Bash"] }));
      expect(args).toContain("--allowed-tools=Read,Edit,Bash");
    });

    it("maps disallowedTools to --disallowed-tools", () => {
      const args = buildArgs(makeConfig({ disallowedTools: ["Agent"] }));
      expect(args).toContain("--disallowed-tools=Agent");
    });

    it("maps mcpConfig to --mcp-config", () => {
      const args = buildArgs(makeConfig({ mcpConfig: "/tmp/mcp.json" }));
      expect(args).toContain("--mcp-config=/tmp/mcp.json");
    });

    it("maps additionalDirs to --add-dir", () => {
      const args = buildArgs(makeConfig({ additionalDirs: ["/dir1", "/dir2"] }));
      expect(args).toContain("--add-dir=/dir1");
      expect(args).toContain("--add-dir=/dir2");
    });

    it("maps resumeSessionId to --resume", () => {
      const args = buildArgs(makeConfig({ resumeSessionId: "sess-123" }));
      expect(args).toContain("--resume=sess-123");
      expect(args).not.toContain(/--session-id/);
    });

    it("maps sessionId to --session-id when no resume", () => {
      const args = buildArgs(makeConfig({ sessionId: "new-sess" }));
      expect(args).toContain("--session-id=new-sess");
      expect(args.find((a) => a.startsWith("--resume"))).toBeUndefined();
    });

    it("--resume takes priority over --session-id", () => {
      const args = buildArgs(makeConfig({ resumeSessionId: "resume-id", sessionId: "new-id" }));
      expect(args).toContain("--resume=resume-id");
      expect(args.find((a) => a.startsWith("--session-id"))).toBeUndefined();
    });

    it("maps systemPromptFile to --system-prompt-file", () => {
      const args = buildArgs(makeConfig({ systemPromptFile: "/tmp/prompt.txt" }));
      expect(args).toContain("--system-prompt-file=/tmp/prompt.txt");
    });
  });

  describe("buildEnv", () => {
    it("includes required env vars", () => {
      const env = buildEnv({ maxParallelAgents: 6, reviewConcurrency: 3 });
      expect(env.CLAUDE_CODE_WORKFLOWS).toBe("1");
      expect(env.FORGE_MAX_PARALLEL_AGENTS).toBe("6");
      expect(env.FORGE_REVIEW_CONCURRENCY).toBe("3");
    });

    it("preserves process.env", () => {
      process.env._TEST_VAR = "present";
      const env = buildEnv({ maxParallelAgents: 6, reviewConcurrency: 3 });
      expect(env._TEST_VAR).toBe("present");
      delete process.env._TEST_VAR;
    });
  });

  describe("shutdown signal chain", () => {
    it("sends SIGINT → SIGTERM → SIGKILL with correct timing", async () => {
      const driver = new CliSubprocessDriver(makeConfig());

      const mockChild = {
        killed: false,
        kill: vi.fn((sig: string) => {
          if (sig === "SIGKILL") mockChild.killed = true;
        }),
      };
      (driver as unknown as { child: unknown }).child = mockChild;

      // Use fake timers to control timing
      vi.useFakeTimers();
      const shutdownPromise = driver.shutdown("SIGINT");

      // Advance through the signal chain
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");

      await vi.advanceTimersByTimeAsync(5_000);
      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

      vi.useRealTimers();
      await shutdownPromise;
    });
  });

  describe("stderr → LogSink (R4)", () => {
    it("splits stderr by line and calls logSink per line", () => {
      const logSink = { log: vi.fn() };
      const driver = new CliSubprocessDriver(makeConfig({ logSink }));

      // Access private method via cast
      const captureStderr = (
        driver as unknown as { captureStderr: (s: NodeJS.ReadableStream) => void }
      ).captureStderr.bind(driver);

      const chunks: ((chunk: Buffer) => void)[] = [];
      const endCbs: (() => void)[] = [];
      const mockStream = {
        on: vi.fn((event: string, cb: (data?: unknown) => void) => {
          if (event === "data") chunks.push(cb as (chunk: Buffer) => void);
          if (event === "end") endCbs.push(cb as () => void);
        }),
      } as unknown as NodeJS.ReadableStream;

      captureStderr(mockStream);

      // Simulate one chunk with 3 lines
      const data = chunks[0];
      data(Buffer.from("line1\nline2\nline3\n"));

      expect(logSink.log).toHaveBeenCalledTimes(3);
      for (const call of logSink.log.mock.calls) {
        expect(call[0].event).toBe("subprocess_stderr");
        expect(call[0].level).toBe("warn");
      }
    });

    it("writes to stderr.log even without logSink", () => {
      const driver = new CliSubprocessDriver(makeConfig());
      const captureStderr = (
        driver as unknown as { captureStderr: (s: NodeJS.ReadableStream) => void }
      ).captureStderr.bind(driver);

      const chunks: ((chunk: Buffer) => void)[] = [];
      const endCbs: (() => void)[] = [];
      const mockStream = {
        on: vi.fn((event: string, cb: (data?: unknown) => void) => {
          if (event === "data") chunks.push(cb as (chunk: Buffer) => void);
          if (event === "end") endCbs.push(cb as () => void);
        }),
      } as unknown as NodeJS.ReadableStream;

      captureStderr(mockStream);
      chunks[0](Buffer.from("error output\n"));

      const stderrContent = readFileSync(join(runDir, "stderr.log"), "utf-8");
      expect(stderrContent).toContain("error output");
    });

    it("does not throw when logSink is undefined", () => {
      const driver = new CliSubprocessDriver(makeConfig());
      const captureStderr = (
        driver as unknown as { captureStderr: (s: NodeJS.ReadableStream) => void }
      ).captureStderr.bind(driver);

      const chunks: ((chunk: Buffer) => void)[] = [];
      const endCbs: (() => void)[] = [];
      const mockStream = {
        on: vi.fn((event: string, cb: (data?: unknown) => void) => {
          if (event === "data") chunks.push(cb as (chunk: Buffer) => void);
          if (event === "end") endCbs.push(cb as () => void);
        }),
      } as unknown as NodeJS.ReadableStream;

      expect(() => {
        captureStderr(mockStream);
        chunks[0](Buffer.from("test\n"));
        endCbs[0]();
      }).not.toThrow();
    });
  });
});
