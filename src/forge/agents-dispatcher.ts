/**
 * Parallel subagent dispatch via `claude agents` command.
 *
 * Provides dispatch and collectResults functions for spawning subagent
 * child processes and reading their results. Falls back to inline mode
 * (returns `{ status: "failed" }`) when the `claude agents` command is
 * unavailable or errors out — callers handle inline execution.
 *
 * Design reference: design.md "A.3 claude agents 并行调度（R5）"
 */

import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkSpawnPolicy, type LineageEntry, type SpawnPolicyDecision } from "../spawn-policy.js";
import { appendToolHealthRecord } from "../tool-health-writer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for dispatching a single subagent via `claude agents`. @public */
export interface DispatchOptions {
  /** Agent type (e.g. "spec-check", "quality-check", "security-check"). */
  agentType: string;
  /** Task instructions for the subagent. */
  prompt: string;
  /** Working directory for the agent process. */
  workdir: string;
  /** Optional effort level for the agent. */
  effort?: "low" | "medium" | "high" | "xhigh";
  /**
   * Explicit child process timeout in milliseconds. When set, this overrides
   * any per-tier resolution from {@link resolveAgentTimeoutMs}.
   */
  timeoutMs?: number;
  /**
   * Current routing tier ("light"|"standard"|"full"), read from
   * `.forge/status.md` by the caller. When {@link timeoutMs} is not set, the
   * timeout is resolved per-tier via {@link resolveAgentTimeoutMs} using
   * {@link configContent}.
   */
  tier?: string;
  /**
   * Raw text content of `.forge/config.md`, supplied by the caller so this
   * module stays IO-free. Used only when {@link timeoutMs} is not set.
   */
  configContent?: string;
  /** Collect all background sessions/results when supported by Claude Code. */
  includeAll?: boolean;
  /** Prepend Forge worktree edit preflight for agents that may edit files. */
  requiresWorktreePreflight?: boolean;
  /**
   * Spawn lineage (leader → ... → current parent) for spawn-time policy
   * (spec R2/R3). When omitted, spawn-policy is skipped (backward compat).
   */
  lineage?: LineageEntry[];
  /** Current chain depth (leader=0). Pairs with {@link lineage}. */
  depth?: number;
}

/** Claude background agent state reported by `claude agents --json`. @public */
export type AgentState =
  | "completed"
  | "failed"
  | "blocked"
  | "running"
  | "just-dispatched"
  | "unknown"
  | (string & {});

/** Result returned by a single subagent dispatch. @public */
export interface DispatchResult {
  /** Agent type that was dispatched. */
  agent: string;
  /** Whether the dispatch completed or failed. */
  status: "completed" | "failed";
  /** Background session id reported by Claude Code. */
  id?: string;
  /** Background session state reported by Claude Code. */
  state?: AgentState;
  /** Structured findings from the agent (on success). */
  findings?: unknown[];
  /** Wall-clock duration in milliseconds. */
  duration_ms?: number;
  /** Short diagnostic reason for failed dispatches. */
  diagnostic?: string;
}

export const WORKTREE_EDIT_PREFLIGHT =
  "Before editing files, verify you are operating in the intended worktree. If Forge policy reports shared-checkout edits are blocked, enter or request the assigned worktree before attempting edits.";

const DEFAULT_AGENT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Per-tier default agent timeouts in milliseconds.
 *
 * Used as the fallback for a *specific* tier when `review.agent_timeout_minutes.<tier>`
 * is present in config but the value for that tier is missing or invalid. When the
 * entire `review.agent_timeout_minutes.*` family is absent, all tiers fall back to
 * `DEFAULT_AGENT_TIMEOUT_MS` (15 min) to preserve backward compatibility.
 *
 * @see resolveAgentTimeoutMs
 */
const TIER_DEFAULT_TIMEOUT_MS: Record<string, number> = {
  light: 5 * 60 * 1000,
  standard: 15 * 60 * 1000,
  full: 30 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

const VALID_DISPATCH_MODES = ["inline", "agents", "auto"] as const;
type DispatchMode = (typeof VALID_DISPATCH_MODES)[number];

/**
 * Parse dispatch mode from `.forge/config.md` frontmatter.
 *
 * Looks for `review_dispatch_mode` or `decide_dispatch_mode` depending on the
 * `context` parameter. Returns `"inline"` as the safe default when the field
 * is absent or unrecognised.
 *
 * @param context  Either `"review"` or `"decide"`.
 * @param configContent  Raw text content of `.forge/config.md`.
 * @returns The resolved dispatch mode.
 * @public
 */
export function parseDispatchMode(
  context: "review" | "decide",
  configContent: string,
): DispatchMode {
  const fieldName = `${context}_dispatch_mode`;
  const match = configContent.match(new RegExp(`^\\s*${fieldName}:\\s*(\\S+)`, "m"));
  if (match) {
    const value = match[1];
    if (VALID_DISPATCH_MODES.includes(value as DispatchMode)) {
      return value as DispatchMode;
    }
  }
  return "inline";
}

/**
 * Resolve the agent dispatch timeout for a routing tier from `.forge/config.md`.
 *
 * Reads the per-tier flat fields `review.agent_timeout_minutes.light|standard|full`
 * (values in whole minutes) and returns the matching timeout in milliseconds.
 *
 * Fallback ladder (in order):
 * 1. Configured value for the tier, if a positive integer.
 * 2. `TIER_DEFAULT_TIMEOUT_MS` for the tier, if any tier-level config
 *    is present but this tier's value is missing or invalid.
 * 3. `DEFAULT_AGENT_TIMEOUT_MS` (15 min) when the entire
 *    `review.agent_timeout_minutes.*` family is absent — preserves the
 *    pre-existing fixed 15-minute behaviour (backward compatibility).
 * 4. `TIER_DEFAULT_TIMEOUT_MS`.standard (15 min) when the tier itself
 *    is unrecognised or undefined.
 *
 * @param tier  Current routing tier from `.forge/status.md` ("light"|"standard"|"full").
 * @param configContent  Raw text content of `.forge/config.md`.
 * @returns Timeout in milliseconds.
 * @public
 */
export function resolveAgentTimeoutMs(tier: string | undefined, configContent: string): number {
  // Unknown / undefined tier → standard default, regardless of config.
  if (tier === undefined || !(tier in TIER_DEFAULT_TIMEOUT_MS)) {
    return TIER_DEFAULT_TIMEOUT_MS.standard;
  }

  // Detect whether ANY review.agent_timeout_minutes.<tier> field exists.
  // If the whole family is absent, fall back to the legacy fixed default
  // so existing projects see no behaviour change on upgrade.
  const familyPresent = /\n\s*review\.agent_timeout_minutes\.[a-z]+:/m.test(`\n${configContent}`);
  if (!familyPresent) {
    return DEFAULT_AGENT_TIMEOUT_MS;
  }

  // Family is present — read this tier's value, falling back to its per-tier default.
  const fieldName = `review.agent_timeout_minutes.${tier}`;
  const match = configContent.match(new RegExp(`^\\s*${fieldName}:\\s*(\\S+)`, "m"));
  if (match) {
    const minutes = Number(match[1]);
    if (Number.isInteger(minutes) && minutes > 0) {
      return minutes * 60 * 1000;
    }
  }
  return TIER_DEFAULT_TIMEOUT_MS[tier];
}

/** Default max subagent nesting depth (spec R3). */
export const DEFAULT_MAX_SUBAGENT_DEPTH = 5;

/**
 * Resolve the max subagent depth from `.forge/config.md` content.
 * Reads `max_subagent_depth` (1-10); falls back to {@link DEFAULT_MAX_SUBAGENT_DEPTH}
 * when absent or invalid. Pure: accepts the raw config text.
 *
 * **Validates: Requirement R3 AC2**
 */
export function resolveMaxSubagentDepth(configContent: string): number {
  const match = configContent.match(/^\s*max_subagent_depth:\s*(\S+)/m);
  if (match) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 10) {
      return n;
    }
  }
  return DEFAULT_MAX_SUBAGENT_DEPTH;
}

/**
 * Evaluate spawn-time policy for a dispatch (spec R2/R3).
 *
 * Returns `null` when lineage/depth are not supplied (backward compat — no
 * policy check). Fail-open: errors are caught by the caller and logged to
 * tool-health rather than blocking dispatch.
 *
 * @internal — exported for dispatcher wiring tests.
 */
export function evaluateSpawnPolicy(
  opts: DispatchOptions,
  configContent: string,
): SpawnPolicyDecision | null {
  if (opts.lineage === undefined || opts.depth === undefined) {
    return null;
  }
  return checkSpawnPolicy({
    subagentIdentity: opts.agentType,
    lineage: opts.lineage,
    depth: opts.depth,
    maxDepth: resolveMaxSubagentDepth(configContent),
  });
}

/**
 * Best-effort tool-health log for a spawn-policy evaluation error (fail-open).
 * Writes are swallowed — a logging failure must NOT block dispatch (NFR-2).
 */
function appendSpawnPolicyError(agentType: string, err: unknown): void {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    appendToolHealthRecord(join(process.cwd(), ".forge/knowledge/tool-health.md"), {
      subcommand: "dispatch",
      event: "spawn-policy-error",
      details: `agent=${agentType} err=${msg}`,
    });
  } catch {
    // Swallow: logging is best-effort; never block the dispatch path.
  }
}

// ---------------------------------------------------------------------------
// CLI argument builder (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Build CLI arguments for `claude agents` invocation.
 *
 * @param opts  Dispatch options.
 * @returns Array of string arguments (excluding the `claude` binary itself).
 * @public
 */
export function buildAgentArgs(opts: DispatchOptions): string[] {
  const args = ["agents", `--agent-type=${opts.agentType}`, `--workdir=${opts.workdir}`];

  // Prompt is passed as a flag; truncate at 4096 chars for safety.
  const prompt = opts.requiresWorktreePreflight
    ? `${WORKTREE_EDIT_PREFLIGHT}\n\n${opts.prompt}`
    : opts.prompt;
  const truncatedPrompt = prompt.length > 4096 ? prompt.slice(0, 4096) : prompt;
  args.push(`--prompt=${truncatedPrompt}`);

  if (opts.effort) {
    args.push(`--effort=${opts.effort}`);
  }
  if (opts.includeAll) {
    args.push("--all");
  }

  return args;
}

function normalizeDispatchResult(
  parsed: Record<string, unknown>,
  fallbackAgent: string,
  elapsed: number | undefined,
): DispatchResult {
  const state = typeof parsed.state === "string" ? (parsed.state as AgentState) : undefined;
  const parsedStatus = parsed.status === "completed" ? "completed" : "failed";
  const status =
    parsedStatus === "completed" && (state === undefined || state === "completed")
      ? "completed"
      : "failed";
  const diagnostic =
    parsedStatus === "completed" && state !== undefined && state !== "completed"
      ? `non-completed state: ${state}`
      : undefined;

  return {
    agent: (parsed.agent as string) ?? fallbackAgent,
    status,
    id: typeof parsed.id === "string" ? parsed.id : undefined,
    state,
    findings: Array.isArray(parsed.findings) ? parsed.findings : undefined,
    duration_ms: typeof parsed.duration_ms === "number" ? parsed.duration_ms : elapsed,
    diagnostic,
  };
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a single subagent via `claude agents` child process.
 *
 * Spawns `claude agents --agent-type=<type> --workdir=<dir> --prompt=<prompt>`
 * and parses the JSON stdout. On any failure (ENOENT, non-zero exit, parse
 * error), returns `{ status: "failed" }` so the caller can fall back to
 * inline execution.
 *
 * @param opts  Dispatch options.
 * @returns A DispatchResult indicating success or failure.
 * @public
 */
export async function dispatch(opts: DispatchOptions): Promise<DispatchResult> {
  // Spawn-time policy (spec R2/R3). Fail-open: an internal error is logged to
  // tool-health and the dispatch proceeds, so review/decide orchestration is
  // never blocked by the policy layer itself (availability-first, NFR-2).
  try {
    const decision = evaluateSpawnPolicy(opts, opts.configContent ?? "");
    if (decision !== null && !decision.allowed) {
      return {
        agent: opts.agentType,
        status: "failed",
        diagnostic: `spawn-policy ${decision.verdict}: ${decision.reason}`,
      };
    }
  } catch (err) {
    // Fail-open: log and continue. (tool-health write is best-effort.)
    appendSpawnPolicyError(opts.agentType, err);
  }

  const args = buildAgentArgs(opts);
  const startTime = Date.now();
  // Explicit timeoutMs wins; otherwise resolve per-tier from config.
  // resolveAgentTimeoutMs handles undefined tier / empty config by falling
  // back to the standard default (== DEFAULT_AGENT_TIMEOUT_MS, 15min),
  // preserving backward compatibility for callers that pass neither.
  const timeoutMs = opts.timeoutMs ?? resolveAgentTimeoutMs(opts.tier, opts.configContent ?? "");

  return new Promise<DispatchResult>((resolve) => {
    execFile(
      "claude",
      args,
      { cwd: opts.workdir, timeout: timeoutMs, killSignal: "SIGTERM" },
      (err, stdout) => {
        const elapsed = Date.now() - startTime;

        if (err) {
          const maybeTimeout = err as NodeJS.ErrnoException & {
            killed?: boolean;
            signal?: string;
          };
          if (maybeTimeout.killed || maybeTimeout.signal === "SIGTERM") {
            resolve({
              agent: opts.agentType,
              status: "failed",
              duration_ms: elapsed,
              diagnostic: `timeout after ${timeoutMs}ms`,
            });
            return;
          }
          // Command not found or non-zero exit — signal failure for inline fallback.
          resolve({
            agent: opts.agentType,
            status: "failed",
            findings: undefined,
            duration_ms: undefined,
          });
          return;
        }

        // Attempt to parse JSON from stdout.
        try {
          const parsed = JSON.parse(stdout ?? "{}") as Record<string, unknown>;
          resolve(normalizeDispatchResult(parsed, opts.agentType, elapsed));
        } catch (_err: unknown) {
          // JSON parse failure — treat as failed dispatch.
          resolve({
            agent: opts.agentType,
            status: "failed",
            duration_ms: elapsed,
            diagnostic: "parse error: malformed JSON from claude agents",
          });
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// collectResults
// ---------------------------------------------------------------------------

/**
 * Read all agent result JSON files from `.forge/agent-results/<runId>/`.
 *
 * Each `<agent>.json` file is parsed and returned as a DispatchResult.
 * Malformed files are silently skipped. Returns an empty array when the
 * directory does not exist.
 *
 * @param runId  The run identifier (directory name under agent-results).
 * @param projectRoot  The project root directory containing `.forge/`.
 * @returns Array of parsed DispatchResult objects.
 * @public
 */
export async function collectResults(
  runId: string,
  projectRoot: string,
): Promise<DispatchResult[]> {
  const resultsDir = join(projectRoot, ".forge", "agent-results", runId);

  let entries: string[];
  try {
    entries = readdirSync(resultsDir);
  } catch (_err: unknown) {
    // Directory doesn't exist — no results to collect.
    return [];
  }

  const results: DispatchResult[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;

    const filePath = join(resultsDir, entry);
    try {
      const content = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      results.push(normalizeDispatchResult(parsed, entry.replace(/\.json$/, ""), undefined));
    } catch (_err: unknown) {
      // Skip malformed JSON files gracefully.
    }
  }

  return results;
}
