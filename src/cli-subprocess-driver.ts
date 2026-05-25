import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentInterface, AgentResult, AgentRunOptions } from "./loop-types.js";
import { StreamJsonAdapter } from "./stream-json-adapter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CliDriverConfig {
  cwd: string;
  runId: string;
  runDir: string;
  permissionMode: string;
  dangerouslySkipPermissions: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpConfig?: string;
  additionalDirs?: string[];
  systemPromptFile?: string;
  maxTurns: number;
  resumeSessionId?: string;
  sessionId?: string;
}

interface BuildEnvOpts {
  maxParallelAgents: number;
  reviewConcurrency: number;
  runtimeConcurrency?: number;
}

// ---------------------------------------------------------------------------
// buildArgs — CLI argument construction (exported for testing)
// ---------------------------------------------------------------------------

export function buildArgs(config: CliDriverConfig): string[] {
  const args = [
    "--print",
    "--output-format=stream-json",
    "--include-partial-messages",
    "--input-format=stream-json",
    `--permission-mode=${config.permissionMode}`,
    `--max-turns=${config.maxTurns}`,
  ];

  if (config.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  if (config.allowedTools?.length) {
    args.push(`--allowed-tools=${config.allowedTools.join(",")}`);
  }
  if (config.disallowedTools?.length) {
    args.push(`--disallowed-tools=${config.disallowedTools.join(",")}`);
  }
  if (config.mcpConfig) {
    args.push(`--mcp-config=${config.mcpConfig}`);
  }
  for (const dir of config.additionalDirs ?? []) {
    args.push(`--add-dir=${dir}`);
  }
  if (config.systemPromptFile) {
    args.push(`--system-prompt-file=${config.systemPromptFile}`);
  }

  // Session: --resume takes priority over --session-id
  if (config.resumeSessionId) {
    args.push(`--resume=${config.resumeSessionId}`);
  } else if (config.sessionId) {
    args.push(`--session-id=${config.sessionId}`);
  }

  return args;
}

// ---------------------------------------------------------------------------
// buildEnv — environment construction (exported for testing)
// ---------------------------------------------------------------------------

export function buildEnv(opts: BuildEnvOpts): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLAUDE_CODE_WORKFLOWS: process.env.CLAUDE_CODE_WORKFLOWS ?? "1",
    FORGE_MAX_PARALLEL_AGENTS: String(opts.maxParallelAgents),
    FORGE_REVIEW_CONCURRENCY: String(opts.reviewConcurrency),
    ...(opts.runtimeConcurrency != null
      ? { FORGE_MAX_PARALLEL_AGENTS_RUNTIME: String(opts.runtimeConcurrency) }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// CliSubprocessDriver
// ---------------------------------------------------------------------------

export class CliSubprocessDriver implements AgentInterface {
  readonly name = "claude-cli";
  private config: CliDriverConfig;
  private adapter: StreamJsonAdapter;
  child: ChildProcess | null = null;

  constructor(config: CliDriverConfig) {
    this.config = config;
    this.adapter = new StreamJsonAdapter(config.runDir);
    mkdirSync(config.runDir, { recursive: true });
  }

  async run(prompt: string, cwd: string, _options?: AgentRunOptions): Promise<AgentResult> {
    const args = buildArgs(this.config);
    const env = buildEnv({ maxParallelAgents: 6, reviewConcurrency: 3 });

    const child = spawn("claude", args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    // stdin: write NDJSON frame then close
    const frame = `${JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
    })}\n`;
    child.stdin?.write(frame);
    child.stdin?.end();

    // stderr: capture to file (set up before consuming stdout)
    if (child.stderr) {
      this.captureStderr(child.stderr);
    }

    // stdout: pipe through StreamJsonAdapter
    const result = child.stdout
      ? await this.adapter.consume(child.stdout)
      : {
          delivered: [],
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
          costUsd: 0,
          lastEventType: null,
        };

    // Wait for exit
    const exitCode = await new Promise<number>((resolve) => {
      child.on("exit", (code) => resolve(code ?? 0));
    });

    this.child = null;

    return {
      output: {
        success: exitCode === 0,
        summary:
          result.delivered
            .filter((e) => e.type === "result")
            .map((e) => String(e.result ?? ""))
            .join("") || "completed",
        key_changes_made: [],
        key_learnings: [],
      },
      usage: result.usage,
    };
  }

  async shutdown(_signal: NodeJS.Signals): Promise<void> {
    if (!this.child || this.child.killed) return;

    this.child.kill("SIGINT");

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!this.child?.killed) this.child?.kill("SIGTERM");
        setTimeout(() => {
          if (!this.child?.killed) this.child?.kill("SIGKILL");
          resolve();
        }, 5_000);
      }, 10_000);
    });
  }

  private captureStderr(stderr: NodeJS.ReadableStream): void {
    const stderrPath = join(this.config.runDir, "stderr.log");
    stderr.on("data", (chunk: Buffer) => {
      appendFileSync(stderrPath, chunk.toString(), "utf-8");
    });
  }
}
