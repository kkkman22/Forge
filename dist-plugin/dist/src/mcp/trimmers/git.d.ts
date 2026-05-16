/**
 * Git output parsers for forge_git tool.
 *
 * Parses raw `git diff --stat` and `git status --porcelain` output into
 * structured summaries compatible with the serialization formats in
 * `context-budget.ts` (serializeGitDiff / serializeGitStatus).
 *
 * **Validates: Requirements 3.2, 3.3**
 */
import type { GitDiffSummary, GitStatusSummary } from "../../context-budget.js";
/**
 * Parse `git diff --stat` output into a GitDiffSummary.
 *
 * Example input:
 *   src/foo.ts | 12 ++++++------
 *   src/bar.ts |  3 +++
 *   2 files changed, 9 insertions(+), 6 deletions(-)
 *
 * @param output - Raw stdout from `git diff --stat`
 * @returns Structured diff summary
 */
export declare function parseDiffStat(output: string): GitDiffSummary;
/**
 * Parse `git status --porcelain` output into a GitStatusSummary.
 *
 * Porcelain format: XY filename
 *   X = index status, Y = worktree status
 *   ?? = untracked
 *   A/M/D/R in X position = staged
 *   M/D in Y position = modified (unstaged)
 *
 * @param output - Raw stdout from `git status --porcelain`
 * @returns Structured status summary
 */
export declare function parseStatusPorcelain(output: string): GitStatusSummary;
