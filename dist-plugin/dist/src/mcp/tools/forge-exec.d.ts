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
import type { ResolvedRoot } from "../project-root.js";
/**
 * Read deny patterns from `.claude/settings.json`.
 *
 * Patterns follow the Claude Code format: `Bash(glob)`.
 * Returns the raw pattern strings from `permissions.deny`.
 */
export declare function readDenyPatterns(settingsPath?: string): Promise<string[]>;
export declare function isCommandDenied(command: string, denyPatterns: string[]): string | null;
/**
 * Check if a command is in the readonly allowlist.
 * This is the primary security boundary — settings.json deny is supplementary.
 */
export declare function isCommandAllowed(command: string): boolean;
/**
 * Detect shell metacharacters that could enable command injection.
 * Returns the metachar label if found, or null if the command appears safe.
 *
 * P0-2 fix: now flags ALL shell operators (;, &, |, >, <, &&, ||, >>) and
 * command substitution ($() and ``) as defense-in-depth. Even though
 * forge_exec invokes via `sh -c`, these operators enable chaining arbitrary
 * commands which is unsafe for a readonly tool.
 */
export declare function containsShellMetachars(command: string): string | null;
/**
 * Check if a command is a "simple" command — a single binary with arguments,
 * no shell operators. Simple commands can be executed via `execFile(bin, args)`
 * without going through `/bin/sh -c`, eliminating shell injection risk.
 */
export declare function isSimpleCommand(command: string): boolean;
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}
export interface LegacyTypedReplacementWarning {
    code: "LEGACY_TYPED_REPLACEMENT_AVAILABLE";
    replacement: "forge_docs_drift" | "forge_dist_sync";
    message: string;
}
export declare function legacyTypedReplacementWarning(command: string): LegacyTypedReplacementWarning | null;
/**
 * Execute a shell command in a child subprocess with timeout support.
 *
 * For simple commands (no shell operators), uses `execFile` directly with
 * array arguments — no shell interpretation, no injection risk.
 * For complex commands (pipes, redirects, etc.), falls back to `/bin/sh -c`.
 */
export declare function execCommand(command: string, timeoutMs: number, options?: {
    cwd?: string;
}): Promise<ExecResult>;
export interface ExecTrackedOptions {
    cwd?: string;
    timeoutMs: number;
    reapGraceMs: number;
}
export interface ExecTrackedResult extends ExecResult {
    reapedPids: number[];
    reapErrors: string[];
}
/**
 * Execute a shell command in a detached process group with background
 * process reaping. Uses existing process-tree-cleaner for cleanup.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.7, 6.8**
 */
export declare function execCommandTracked(command: string, options: ExecTrackedOptions): Promise<ExecTrackedResult>;
/**
 * Register the `forge_exec` tool on the given MCP server.
 */
export declare function registerForgeExec(server: McpServer, root?: ResolvedRoot): void;
