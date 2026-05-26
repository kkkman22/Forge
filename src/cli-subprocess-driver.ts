import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createLogEntry } from "./logger/index.js";
import type { AgentInterface, AgentResult, AgentRunOptions } from "./loop-types.js";
import { StreamJsonAdapter } from "./stream-json-adapter.js";
import { STUCK_TIMEOUT_MS } from "./error-handler.js";

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
  logSink?: { log: (entry: ReturnType<typeof createLogEntry>) => void };
  stuckTimeoutMs?: number;
}

interface SignalChainEntry {
  signal: "SIGINT" | "SIGTERM" | "SIGKILL";
  reason: "stuck_timeout" | "user_interrupt" | "backpressure_unrelieved";
  elapsed_ms: number;
  timestamp: string;
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
  private runStartTime = 0;

  constructor(config: CliDriverConfig) {
    this.config = config;
    this.adapter = new StreamJsonAdapter(config.runDir);
    mkdirSync(config.runDir, { recursive: true });
  }

  async run(prompt: string, cwd: string, _options?: AgentRunOptions): Promise<AgentResult> {
    const args = buildArgs(this.config);
    const env = buildEnv({ maxParallelAgents: 6, reviewConcurrency: 3 });
    const stuckTimeout = this.config.stuckTimeoutMs ?? STUCK_TIMEOUT_MS;

    const child = spawn("claude", args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.runStartTime = Date.now();

    // Track last stdout activity for stuck detection
    let lastStdoutEvent = Date.now();
    if (child.stdout) {
      child.stdout.on("data", () => {
        lastStdoutEvent = Date.now();
      });
    }

    // Stuck detection interval
    const checkInterval = Math.min(Math.floor(stuckTimeout / 10), 5_000);
    let stuckHandled = false;
    const stuckCheckInterval = setInterval(() => {
      if (stuckHandled) return;
      if (Date.now() - lastStdoutEvent >= stuckTimeout) {
        stuckHandled = true;
        this.recordSignalChain("SIGTERM", "stuck_timeout");
        child.kill("SIGTERM");

        // Escalate to SIGKILL after 30s if still alive
        setTimeout(() => {
          if (!child.killed) {
            this.recordSignalChain("SIGKILL", "stuck_timeout");
            child.kill("SIGKILL");
          }
        }, 30_000);
      }
    }, checkInterval);

    try {
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
    } finally {
      clearInterval(stuckCheckInterval);
    }
  }

  async shutdown(_signal: NodeJS.Signals): Promise<void> {
    if (!this.child || this.child.killed) return;

    this.recordSignalChain("SIGINT", "user_interrupt");
    this.child.kill("SIGINT");

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!this.child?.killed) {
          this.recordSignalChain("SIGTERM", "user_interrupt");
          this.child?.kill("SIGTERM");
        }
        setTimeout(() => {
          if (!this.child?.killed) {
            this.recordSignalChain("SIGKILL", "user_interrupt");
            this.child?.kill("SIGKILL");
          }
          resolve();
        }, 5_000);
      }, 10_000);
    });
  }

  private recordSignalChain(
    signal: SignalChainEntry["signal"],
    reason: SignalChainEntry["reason"],
  ): void {
    const entry: SignalChainEntry = {
      signal,
      reason,
      elapsed_ms: Date.now() - this.runStartTime,
      timestamp: new Date().toISOString(),
    };
    const path = join(this.config.runDir, "signal_chain.jsonl");
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
  }

  private captureStderr(stderr: NodeJS.ReadableStream): void {
    const stderrPath = join(this.config.runDir, "stderr.log");
    let buffer = "";
    stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      appendFileSync(stderrPath, text, "utf-8");

      if (this.config.logSink) {
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.length > 0) {
            this.config.logSink.log(
              createLogEntry("subprocess_stderr", "warn", line, { runId: this.config.runId }),
            );
          }
        }
      }
    });
    stderr.on("end", () => {
      if (this.config.logSink && buffer.length > 0) {
        this.config.logSink.log(
          createLogEntry("subprocess_stderr", "warn", buffer, { runId: this.config.runId }),
        );
      }
    });
  }
}
