/**
 * Format a GitDiffSummary into a human-readable string matching the
 * `serializeGitDiff` output format from `context-budget.ts`.
 */
export function formatDiffSummary(summary: any): string;
/**
 * Format a GitStatusSummary into a human-readable string matching the
 * `serializeGitStatus` output format from `context-budget.ts`.
 */
export function formatStatusSummary(summary: any): string;
/**
 * Truncate full diff content for review context injection.
 *
 * Strategy:
 * 1. Split diff into per-file hunks
 * 2. For each file: keep up to DIFF_PER_FILE_MAX_LINES (prioritize hunks, truncate large files)
 * 3. If total exceeds DIFF_CONTENT_MAX_LINES, drop lowest-priority files (test files, generated)
 * 4. Append truncation notice with list of omitted files
 */
export function truncateDiffContent(rawDiff: any): any;
/**
 * Register the `forge_git` tool on the given MCP server.
 */
export function registerForgeGit(server: any, root: any): void;
