/**
 * forge_git — Git query operations with structured summary output.
 *
 * Subcommands:
 *   - diff:   Execute `git diff --stat`, parse into file-level summary
 *   - status: Execute `git status --porcelain`, parse into categorized summary
 *   - log:    Execute `git log --oneline -20`, return directly
 *
 * Output formats match `serializeGitDiff` / `serializeGitStatus` from
 * `context-budget.ts` for consistency across Forge tooling.
 *
 * **Validates: Requirement 3**
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitDiffSummary, GitStatusSummary } from "../../context-budget.js";
/**
 * Format a GitDiffSummary into a human-readable string matching the
 * `serializeGitDiff` output format from `context-budget.ts`.
 */
export declare function formatDiffSummary(summary: GitDiffSummary): string;
/**
 * Format a GitStatusSummary into a human-readable string matching the
 * `serializeGitStatus` output format from `context-budget.ts`.
 */
export declare function formatStatusSummary(summary: GitStatusSummary): string;
/**
 * Register the `forge_git` tool on the given MCP server.
 */
export declare function registerForgeGit(server: McpServer): void;
