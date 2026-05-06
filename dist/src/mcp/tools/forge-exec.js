/**
 * forge_exec — sandboxed shell command execution with output trimming.
 *
 * Intended for: test runners, lint, typecheck, CI commands, any command
 * producing >30 lines of output.
 *
 * NOT for: file mutations, git writes, interactive commands.
 *
 * Security: reads deny patterns from `.claude/settings.json` permissions
 * and blocks matching commands before execution.
 *
 * **Validates: Requirement 2**
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { trimCommandOutput } from "../trimmers/output.js";
// ---------------------------------------------------------------------------
// Deny-rule helpers
// ---------------------------------------------------------------------------
/**
 * Read deny patterns from `.claude/settings.json`.
 *
 * Patterns follow the Claude Code format: `Bash(glob)`.
 * Returns the raw pattern strings from `permissions.deny`.
 */
export async function readDenyPatterns(settingsPath = ".claude/settings.json") {
    try {
        const raw = await readFile(settingsPath, "utf-8");
        const settings = JSON.parse(raw);
        const permissions = settings.permissions;
        if (!permissions)
            return [];
        const deny = permissions.deny;
        if (!Array.isArray(deny))
            return [];
        return deny.filter((p) => typeof p === "string");
    }
    catch {
        // File missing or unparseable — no deny rules
        return [];
    }
}
/**
 * Escape a character for use in a regex pattern.
 */
function escapeRegexChar(ch) {
    return `\\${ch}`;
}
/**
 * Check whether a command is blocked by any deny pattern.
 *
 * Deny patterns use the Claude Code format `Bash(glob)`.
 * The glob inside the parentheses is matched against the command string.
 * A simple wildcard match is used (supports `*` as any-chars wildcard).
 */
export function isCommandDenied(command, denyPatterns) {
    for (const pattern of denyPatterns) {
        // Extract glob from Bash(...) wrapper
        const match = pattern.match(/^Bash\((.+)\)$/);
        if (!match)
            continue;
        const glob = match[1];
        // Convert simple glob to regex: escape special chars, replace * with .*
        const escaped = glob.replace(/[.+^${}()|[\]\\]/g, escapeRegexChar).replace(/\*/g, ".*");
        const re = new RegExp(`^${escaped}$`);
        if (re.test(command)) {
            return `Command denied by pattern: ${pattern}`;
        }
    }
    return null;
}
/**
 * Execute a shell command in a child subprocess with timeout support.
 */
export function execCommand(command, timeoutMs) {
    return new Promise((resolve) => {
        const child = execFile("/bin/sh", ["-c", command], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error && "killed" in error && error.killed) {
                resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: 1, timedOut: true });
                return;
            }
            const exitCode = error && "code" in error ? (error.code ?? 1) : 0;
            resolve({ stdout: String(stdout), stderr: String(stderr), exitCode, timedOut: false });
        });
        // Safety: if the child is somehow null, resolve immediately
        if (!child) {
            resolve({ stdout: "", stderr: "Failed to spawn subprocess", exitCode: 1, timedOut: false });
        }
    });
}
// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------
const TOOL_DESCRIPTION = [
    "Execute a shell command in a sandboxed subprocess with automatic output trimming.",
    "",
    "Intended for: test runners, lint, typecheck, CI commands, any command producing >30 lines of output.",
    "NOT for: file mutations, git writes, interactive commands.",
    "",
    "Behavior:",
    "- Success + ≤30 lines: returns full output",
    "- Success + >30 lines: returns trimmed summary (key lines + last 5 lines)",
    "- Failure (non-zero exit): returns complete output unchanged (Forge iron rule)",
    "- Timeout: kills subprocess and returns error",
].join("\n");
/**
 * Register the `forge_exec` tool on the given MCP server.
 */
export function registerForgeExec(server) {
    server.tool("forge_exec", TOOL_DESCRIPTION, {
        command: z.string().describe("Shell command to execute"),
        timeout: z.number().optional().default(30000).describe("Timeout in ms"),
    }, async ({ command, timeout }) => {
        // 1. Check deny rules
        const denyPatterns = await readDenyPatterns();
        const denyReason = isCommandDenied(command, denyPatterns);
        if (denyReason) {
            return {
                content: [{ type: "text", text: denyReason }],
                isError: true,
            };
        }
        // 2. Execute command
        const result = await execCommand(command, timeout);
        // 3. Handle timeout
        if (result.timedOut) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Command timed out after ${timeout}ms: ${command}`,
                    },
                ],
                isError: true,
            };
        }
        // 4. Trim output and return
        const trimmed = trimCommandOutput(result.stdout, result.stderr, result.exitCode);
        return {
            content: [{ type: "text", text: trimmed }],
            isError: result.exitCode !== 0,
        };
    });
}
//# sourceMappingURL=forge-exec.js.map