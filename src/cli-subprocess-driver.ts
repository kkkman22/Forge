/**
 * CliSubprocessDriver — replaces Agent SDK with `claude --print --output-format stream-json`
 * subprocess invocation. T6 ships pure-function helpers (buildArgs, buildEnv,
 * scheduleSignalChain) plus a thin spawn request type. Actual spawn() wiring
 * lives in T8 SdkDriver swap (forge-loop-cli.ts), where these helpers are composed
 * with StreamJsonAdapter.
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 5
 *   - .kiro/specs/workflows-integration/design.md §3.x — CliSubprocessDriver
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

export interface SubprocessOptions {
  /** Path to .forge/runs/<runId>/ — used for stderr.log, signal_chain.jsonl, etc. */
  runDir: string;
  /** Run identifier — embedded in signal-chain records. */
  runId: string;

  permissionMode: PermissionMode;
  allowDangerouslySkipPermissions?: boolean;
  allowedTools: string[];
  disallowedTools: string[];
  mcpConfig?: string;
  additionalDirectories: string[];
  systemPromptPath?: string;

  maxTurns: number;
  resumeSessionId?: string;
  newSessionId?: string;
}

export interface CliSpawnRequest {
  cmd: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}

/**
 * Base environment vars always copied to the subprocess. Anything not in
 * BASE_ENV ∪ FORWARDED_ENV is dropped — this is a strict allowlist, not a
 * blocklist (F15). Adding a new variable requires editing this list.
 *
 * Rationale: leaking arbitrary parent-process env (AWS_SECRET_ACCESS_KEY,
 * GITHUB_TOKEN, ssh-agent sockets, ...) into a long-running child is a
 * classic supply-chain risk. The CLI only needs PATH for binary lookup and
 * HOME/USER for `~` expansion; everything else is opt-in.
 */
const BASE_ENV = ["PATH", "HOME", "USER", "SHELL", "TZ", "LANG", "LC_ALL", "TMPDIR"];

const FORWARDED_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_WORKFLOWS",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
];

export function buildArgs(opts: SubprocessOptions): string[] {
  const args: string[] = [
    "--print",
    "--output-format=stream-json",
    "--include-partial-messages",
    "--input-format=stream-json",
    "--max-turns",
    String(opts.maxTurns),
    "--permission-mode",
    opts.permissionMode,
  ];

  if (opts.allowDangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  if (opts.allowedTools.length > 0) {
    args.push("--allowed-tools", opts.allowedTools.join(","));
  }
  if (opts.disallowedTools.length > 0) {
    args.push("--disallowed-tools", opts.disallowedTools.join(","));
  }

  if (opts.mcpConfig) {
    args.push("--mcp-config", opts.mcpConfig);
  }

  for (const dir of opts.additionalDirectories) {
    args.push("--add-dir", dir);
  }

  if (opts.systemPromptPath) {
    args.push("--system-prompt-file", opts.systemPromptPath);
  }

  // Session: --resume wins over --session-id when both provided.
  if (opts.resumeSessionId) {
    args.push("--resume", opts.resumeSessionId);
  } else if (opts.newSessionId) {
    args.push("--session-id", opts.newSessionId);
  }

  return args;
}

export function buildEnv(
  baseEnv: Record<string, string | undefined>,
  overrides: Record<string, string>,
): Record<string, string> {
  // F15: strict allowlist — start from {} and only copy named keys. Drops
  // arbitrary parent-process env (AWS_*, GITHUB_TOKEN, ssh sockets, ...) that
  // would otherwise leak into the subprocess.
  const out: Record<string, string> = {};
  for (const key of [...BASE_ENV, ...FORWARDED_ENV]) {
    const v = baseEnv[key];
    if (typeof v === "string") out[key] = v;
  }
  Object.assign(out, overrides);
  return out;
}

// ---------------------------------------------------------------------------
// Signal forwarding chain (AC 5.8)
// ---------------------------------------------------------------------------

type Signal = "SIGINT" | "SIGTERM" | "SIGKILL";

export interface SignalChainDeps {
  send: (signal: Signal) => void;
  stillAlive: () => boolean;
  now: () => number;
  schedule: (cb: () => void, delayMs: number) => void;
  runDir?: string;
  runId?: string;
}

export interface SignalChain {
  start(): void;
}

const SIGTERM_DELAY_MS = 10_000;
const SIGKILL_DELAY_MS = 5_000;

export function scheduleSignalChain(deps: SignalChainDeps): SignalChain {
  const records: Array<{ signal: Signal; ts_ms: number }> = [];

  const log = (signal: Signal) => {
    records.push({ signal, ts_ms: deps.now() });
    if (deps.runDir) {
      mkdirSync(deps.runDir, { recursive: true });
      appendFileSync(
        join(deps.runDir, "signal_chain.jsonl"),
        `${JSON.stringify({
          signal,
          ts_ms: deps.now(),
          run_id: deps.runId ?? "",
          timestamp: new Date().toISOString(),
        })}\n`,
      );
    }
  };

  const start = () => {
    deps.send("SIGINT");
    log("SIGINT");

    deps.schedule(() => {
      if (!deps.stillAlive()) return;
      deps.send("SIGTERM");
      log("SIGTERM");

      deps.schedule(() => {
        if (!deps.stillAlive()) return;
        deps.send("SIGKILL");
        log("SIGKILL");
      }, SIGKILL_DELAY_MS);
    }, SIGTERM_DELAY_MS);
  };

  return { start };
}
