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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Read deny patterns from `.claude/settings.json`.
 *
 * Patterns follow the Claude Code format: `Bash(glob)`.
 * Returns the raw pattern strings from `permissions.deny`.
 */
export declare function readDenyPatterns(settingsPath?: string): Promise<string[]>;
/**
 * Check whether a command is blocked by any deny pattern.
 *
 * Deny patterns use the Claude Code format `Bash(glob)`.
 * The glob inside the parentheses is matched against the command string.
 * A simple wildcard match is used (supports `*` as any-chars wildcard).
 */
export declare function isCommandDenied(command: string, denyPatterns: string[]): string | null;
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}
/**
 * Execute a shell command in a child subprocess with timeout support.
 */
export declare function execCommand(command: string, timeoutMs: number): Promise<ExecResult>;
/**
 * Register the `forge_exec` tool on the given MCP server.
 */
export declare function registerForgeExec(server: McpServer): void;
