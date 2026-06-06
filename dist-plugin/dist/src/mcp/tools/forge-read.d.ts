/**
 * forge_read — batch file analysis via sandboxed script execution.
 *
 * Executes a user-provided script in a child subprocess with file paths
 * injected via the `FORGE_FILES` environment variable (JSON array).
 * Only the script's stdout is returned — file contents never enter the context.
 *
 * Supported languages:
 *   - javascript: `node -e "<script>"` with FORGE_FILES env var
 *   - shell: `/bin/sh -c "<script>"` with FORGE_FILES env var
 *
 * **Validates: Requirement 4**
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResolvedRoot } from "../project-root.js";
export { validatePaths } from "./path-validator.js";
/**
 * Validate that a script does not contain dangerous patterns.
 * Returns an error message if dangerous, or null if safe.
 */
export declare function validateScript(script: string): string | null;
/**
 * Build the environment variables for sandboxed script execution.
 * For JavaScript, adds `NODE_OPTIONS` with resource limits (max heap, etc.)
 * to prevent resource exhaustion from malicious or buggy scripts.
 */
export declare function buildSandboxEnv(language: "javascript" | "shell", paths: string[]): Record<string, string | undefined>;
export interface ReadExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}
/**
 * Execute a script in a child subprocess with FORGE_FILES env var injection.
 *
 * @param script - The script code to execute
 * @param language - "javascript" or "shell"
 * @param paths - File paths to inject via FORGE_FILES env var
 * @param timeoutMs - Timeout in milliseconds
 */
export declare function execReadScript(script: string, language: "javascript" | "shell", paths: string[], timeoutMs: number, options?: {
    cwd?: string;
}): Promise<ReadExecResult>;
/**
 * Register the `forge_read` tool on the given MCP server.
 */
export declare function registerForgeRead(server: McpServer, root?: ResolvedRoot): void;
