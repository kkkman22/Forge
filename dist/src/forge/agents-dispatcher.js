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
// Config helper
// ---------------------------------------------------------------------------
const VALID_DISPATCH_MODES = ["inline", "agents"];
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
export function parseDispatchMode(context, configContent) {
    const fieldName = `${context}_dispatch_mode`;
    const match = configContent.match(new RegExp(`^\\s*${fieldName}:\\s*(\\S+)`, "m"));
    if (match) {
        const value = match[1];
        if (VALID_DISPATCH_MODES.includes(value)) {
            return value;
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
export function buildAgentArgs(opts) {
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
export async function dispatch(opts) {
    const args = buildAgentArgs(opts);
    const startTime = Date.now();
    return new Promise((resolve) => {
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
                const parsed = JSON.parse(stdout ?? "{}");
                resolve({
                    agent: parsed.agent ?? opts.agentType,
                    status: parsed.status === "completed" ? "completed" : "failed",
                    findings: Array.isArray(parsed.findings) ? parsed.findings : undefined,
                    duration_ms: typeof parsed.duration_ms === "number" ? parsed.duration_ms : elapsed,
                });
            }
            catch {
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
export async function collectResults(runId, projectRoot) {
    const resultsDir = join(projectRoot, ".forge", "agent-results", runId);
    let entries;
    try {
        entries = readdirSync(resultsDir);
    }
    catch {
        // Directory doesn't exist — no results to collect.
        return [];
    }
    const results = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json"))
            continue;
        const filePath = join(resultsDir, entry);
        try {
            const content = readFileSync(filePath, "utf-8");
            const parsed = JSON.parse(content);
            results.push({
                agent: parsed.agent ?? entry.replace(/\.json$/, ""),
                status: parsed.status === "completed" ? "completed" : "failed",
                findings: Array.isArray(parsed.findings) ? parsed.findings : undefined,
                duration_ms: typeof parsed.duration_ms === "number" ? parsed.duration_ms : undefined,
            });
        }
        catch {
            // Skip malformed JSON files gracefully.
        }
    }
    return results;
}
//# sourceMappingURL=agents-dispatcher.js.map