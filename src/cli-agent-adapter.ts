/**
 * ClaudeCliAgentAdapter — implements `AgentInterface` by spawning the
 * `claude` CLI binary as a subprocess and translating stream-json events
 * into the existing AgentResult shape.
 *
 * Replaces the SDK-based `SdkAgentAdapter` for the forge-loop driver. The
 * SDK adapter is retained as deprecated for backwards compatibility (see
 * `sdk-agent-adapter.ts`).
 *
 * Wiring:
 *   - {@link buildArgs} / {@link buildEnv} from cli-subprocess-driver
 *   - {@link StreamJsonAdapter} from stream-json-adapter
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 5
 *   - .kiro/specs/workflows-integration/design.md §3.x — SdkDriver swap
 */

import type { ChildProcess } from "node:child_process";
import {
  buildArgs,
  buildEnv,
  type CliSpawnRequest,
  type SubprocessOptions,
} from "./cli-subprocess-driver.js";
import type { AgentInterface, AgentResult, AgentRunOptions, TokenUsage } from "./loop-types.js";
import { IterationFailedError, StreamJsonAdapter } from "./stream-json-adapter.js";

export interface ClaudeCliAgentAdapterDeps {
  runId: string;
  runDir: string;
  /**
   * Spawns the claude subprocess. Injection point lets tests stub
   * child_process.spawn without monkey-patching globals.
   */
  spawn: (req: CliSpawnRequest) => ChildProcess;
  permissionMode?: SubprocessOptions["permissionMode"];
  allowedTools?: string[];
  disallowedTools?: string[];
  additionalDirectories?: string[];
  maxTurns?: number;
}

export class ClaudeCliAgentAdapter implements AgentInterface {
  readonly name = "claude";
  private current: ChildProcess | null = null;

  constructor(private readonly deps: ClaudeCliAgentAdapterDeps) {}

  async run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult> {
    const subprocOpts: SubprocessOptions = {
      runDir: this.deps.runDir,
      runId: this.deps.runId,
      permissionMode: this.deps.permissionMode ?? "default",
      allowedTools: this.deps.allowedTools ?? [],
      disallowedTools: this.deps.disallowedTools ?? [],
      additionalDirectories: this.deps.additionalDirectories ?? [],
      maxTurns: this.deps.maxTurns ?? 10,
    };

    const args = buildArgs(subprocOpts);
    const env = buildEnv(process.env, {});

    const child = this.deps.spawn({ cmd: "claude", args, env, cwd });
    this.current = child;

    const adapter = new StreamJsonAdapter({ runDir: this.deps.runDir });
    const messages: string[] = [];

    adapter.on("event", (evt) => {
      if (evt.type === "assistant") {
        const msg = evt.message as { content?: unknown } | undefined;
        if (msg && typeof msg.content === "string") {
          messages.push(msg.content);
          options?.onMessage?.(msg.content);
        }
      }
    });

    return new Promise<AgentResult>((resolve, reject) => {
      child.stdout?.setEncoding?.("utf-8");
      child.stdout?.on("data", (chunk: Buffer | string) => {
        adapter.feed(typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
      });

      adapter.on("error", (err) => {
        reject(
          err instanceof IterationFailedError
            ? err
            : new IterationFailedError("unknown", err.message),
        );
      });

      // Feed the prompt as a single user NDJSON frame, then close stdin.
      child.stdin?.write(
        `${JSON.stringify({ type: "user", message: { role: "user", content: prompt } })}\n`,
      );
      child.stdin?.end();

      child.on("exit", (code: number | null) => {
        adapter.endOfStream();
        this.current = null;
        if (code === 0) {
          resolve({
            output: {
              success: true,
              summary: messages.join("\n"),
              key_changes_made: [],
              key_learnings: [],
            },
            usage: toTokenUsage(adapter),
          });
        } else {
          reject(new IterationFailedError("non_zero_exit", `claude exited with code ${code}`));
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this.current && !this.current.killed) {
      this.current.kill("SIGTERM");
    }
    this.current = null;
  }
}

function toTokenUsage(adapter: StreamJsonAdapter): TokenUsage {
  const t = adapter.usage.tokensSpent;
  return {
    inputTokens: t.input,
    outputTokens: t.output,
    cacheReadTokens: t.cacheRead,
    cacheCreationTokens: t.cacheCreation,
  };
}
