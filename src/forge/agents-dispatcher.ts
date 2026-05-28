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
}

/** Result returned by a single subagent dispatch. @public */
export interface DispatchResult {
  /** Agent type that was dispatched. */
  agent: string;
  /** Whether the dispatch completed or failed. */
  status: "completed" | "failed";
  /** Structured findings from the agent (on success). */
  findings?: unknown[];
  /** Wall-clock duration in milliseconds. */
  duration_ms?: number;
}

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

const VALID_DISPATCH_MODES = ["inline", "agents"] as const;
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
  const truncatedPrompt = opts.prompt.length > 4096 ? opts.prompt.slice(0, 4096) : opts.prompt;
  args.push(`--prompt=${truncatedPrompt}`);

  if (opts.effort) {
    args.push(`--effort=${opts.effort}`);
  }

  return args;
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
  const args = buildAgentArgs(opts);
  const startTime = Date.now();

  return new Promise<DispatchResult>((resolve) => {
    execFile("claude", args, { cwd: opts.workdir }, (err, stdout) => {
      const elapsed = Date.now() - startTime;

      if (err) {
        // Command not found or non-zero exit — signal failure for inline fallback.
        resolve({
          agent: opts.agentType,
          status: "failed",
        });
        return;
      }

      // Attempt to parse JSON from stdout.
      try {
        const parsed = JSON.parse(stdout ?? "{}") as Record<string, unknown>;
        resolve({
          agent: (parsed.agent as string) ?? opts.agentType,
          status: parsed.status === "completed" ? "completed" : "failed",
          findings: Array.isArray(parsed.findings) ? parsed.findings : undefined,
          duration_ms: typeof parsed.duration_ms === "number" ? parsed.duration_ms : elapsed,
        });
      } catch {
        // JSON parse failure — treat as failed dispatch.
        resolve({
          agent: opts.agentType,
          status: "failed",
          duration_ms: elapsed,
        });
      }
    });
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
  } catch {
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

      results.push({
        agent: (parsed.agent as string) ?? entry.replace(/\.json$/, ""),
        status: parsed.status === "completed" ? "completed" : "failed",
        findings: Array.isArray(parsed.findings) ? parsed.findings : undefined,
        duration_ms: typeof parsed.duration_ms === "number" ? parsed.duration_ms : undefined,
      });
    } catch {
      // Skip malformed JSON files gracefully.
    }
  }

  return results;
}
