import { describe, expect, it } from "vitest";
import {
  ClaudeCliAgentAdapter,
  type ClaudeCliAgentAdapterDeps,
} from "../../src/cli-agent-adapter.js";

function makeDeps(over: Partial<ClaudeCliAgentAdapterDeps> = {}): ClaudeCliAgentAdapterDeps {
  return {
    runId: "run_t8",
    runDir: "/tmp/run_t8",
    spawn: () => {
      throw new Error("spawn not stubbed");
    },
    ...over,
  };
}

describe("ClaudeCliAgentAdapter: AgentInterface contract", () => {
  it("exposes name='claude'", () => {
    const adapter = new ClaudeCliAgentAdapter(makeDeps());
    expect(adapter.name).toBe("claude");
  });

  it("exposes async run() method", () => {
    const adapter = new ClaudeCliAgentAdapter(makeDeps());
    expect(typeof adapter.run).toBe("function");
  });

  it("exposes optional close() method", () => {
    const adapter = new ClaudeCliAgentAdapter(makeDeps());
    expect(typeof adapter.close).toBe("function");
  });

  it("close() resolves without error when no subprocess is running", async () => {
    const adapter = new ClaudeCliAgentAdapter(makeDeps());
    await expect(adapter.close()).resolves.toBeUndefined();
  });
});

describe("ClaudeCliAgentAdapter: spawn integration shape", () => {
  it("delegates spawn to the injected dep with claude binary + buildArgs output", async () => {
    let capturedCmd: string | undefined;
    let capturedArgs: string[] | undefined;
    const adapter = new ClaudeCliAgentAdapter(
      makeDeps({
        spawn: (req) => {
          capturedCmd = req.cmd;
          capturedArgs = req.args;
          // Return a fake "child" that immediately ends with a result event.
          return makeFakeChild({
            stdout: `${JSON.stringify({
              type: "result",
              subtype: "success",
              message: { id: "m1", usage: { cost_usd: 0.01, input_tokens: 5 } },
            })}\n`,
            exitCode: 0,
          });
        },
      }),
    );

    await adapter.run("hello", "/tmp", undefined);
    expect(capturedCmd).toBe("claude");
    expect(capturedArgs).toContain("--print");
    expect(capturedArgs).toContain("--output-format=stream-json");
    expect(capturedArgs).toContain("--include-partial-messages");
    expect(capturedArgs).toContain("--input-format=stream-json");
  });

  it("captures usage from result event into AgentResult.usage", async () => {
    const adapter = new ClaudeCliAgentAdapter(
      makeDeps({
        spawn: () =>
          makeFakeChild({
            stdout: `${JSON.stringify({
              type: "result",
              subtype: "success",
              message: { id: "m1", usage: { input_tokens: 100, output_tokens: 50 } },
            })}\n`,
            exitCode: 0,
          }),
      }),
    );
    const result = await adapter.run("hi", "/tmp");
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
  });

  it("propagates non-zero exit code as iteration failure", async () => {
    const adapter = new ClaudeCliAgentAdapter(
      makeDeps({
        spawn: () =>
          makeFakeChild({
            stdout: "",
            exitCode: 1,
          }),
      }),
    );
    await expect(adapter.run("hi", "/tmp")).rejects.toThrow();
  });
});

function makeFakeChild(opts: { stdout: string; exitCode: number }) {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const stdoutListeners: Array<(chunk: Buffer) => void> = [];
  const stdinWrites: string[] = [];

  const child = {
    pid: 12345,
    stdin: {
      write: (chunk: string) => {
        stdinWrites.push(chunk);
        return true;
      },
      end: () => {
        // No-op
      },
    },
    stdout: {
      on: (event: string, cb: (chunk: Buffer) => void) => {
        if (event === "data") stdoutListeners.push(cb);
      },
      setEncoding: () => {},
    },
    stderr: {
      on: () => {},
      setEncoding: () => {},
    },
    on: (event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] ??= [];
      listeners[event].push(cb);
      // Fire the synthetic events on next microtask.
      if (event === "exit" || event === "close") {
        queueMicrotask(() => {
          for (const lst of stdoutListeners) {
            if (opts.stdout.length > 0) lst(Buffer.from(opts.stdout, "utf-8"));
          }
          for (const ev of ["exit", "close"]) {
            for (const fn of listeners[ev] ?? []) fn(opts.exitCode, null);
          }
        });
      }
    },
    kill: () => true,
  };
  return child as unknown as import("node:child_process").ChildProcess;
}
