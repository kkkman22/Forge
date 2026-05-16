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
import type { ResolvedRoot } from "../project-root.js";
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
 * Truncate full diff content for review context injection.
 *
 * Strategy:
 * 1. Split diff into per-file hunks
 * 2. For each file: keep up to DIFF_PER_FILE_MAX_LINES (prioritize hunks, truncate large files)
 * 3. If total exceeds DIFF_CONTENT_MAX_LINES, drop lowest-priority files (test files, generated)
 * 4. Append truncation notice with list of omitted files
 */
export declare function truncateDiffContent(rawDiff: string): string;
/**
 * Register the `forge_git` tool on the given MCP server.
 */
export declare function registerForgeGit(server: McpServer, root?: ResolvedRoot): void;
