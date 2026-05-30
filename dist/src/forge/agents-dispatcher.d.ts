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
declare const VALID_DISPATCH_MODES: readonly ["inline", "agents", "auto"];
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
export declare function parseDispatchMode(context: "review" | "decide", configContent: string): DispatchMode;
/**
 * Build CLI arguments for `claude agents` invocation.
 *
 * @param opts  Dispatch options.
 * @returns Array of string arguments (excluding the `claude` binary itself).
 * @public
 */
export declare function buildAgentArgs(opts: DispatchOptions): string[];
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
export declare function dispatch(opts: DispatchOptions): Promise<DispatchResult>;
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
export declare function collectResults(runId: string, projectRoot: string): Promise<DispatchResult[]>;
export {};
