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
import { z } from "zod";
import { parseDiffStat, parseStatusPorcelain } from "../trimmers/git.js";
import { execCommand } from "./forge-exec.js";
// ---------------------------------------------------------------------------
// Serialization helpers (match context-budget.ts format)
// ---------------------------------------------------------------------------
/**
 * Format a GitDiffSummary into a human-readable string matching the
 * `serializeGitDiff` output format from `context-budget.ts`.
 */
export function formatDiffSummary(summary) {
    const lines = [
        `📊 Git Diff 摘要（完整 diff 见 ${summary.fullDiffPath ?? "N/A"}）`,
        `  变更文件：${summary.fileCount} 个`,
    ];
    for (const f of summary.files) {
        lines.push(`  ${f.filePath}: +${f.added} -${f.removed}`);
    }
    lines.push(`  总计：+${summary.totalAdded} -${summary.totalRemoved}`);
    return lines.join("\n");
}
/**
 * Format a GitStatusSummary into a human-readable string matching the
 * `serializeGitStatus` output format from `context-budget.ts`.
 */
export function formatStatusSummary(summary) {
    const lines = [
        "📊 Git Status 摘要",
        `  Staged: ${summary.staged.count} | Modified: ${summary.modified.count} | Untracked: ${summary.untracked.count}`,
    ];
    const formatCategory = (label, data) => {
        if (data.files.length === 0)
            return;
        const fileList = data.files.slice(0, 10).join(", ");
        lines.push(`  ${label}: ${fileList}${data.count > 10 ? ", ..." : ""}`);
    };
    formatCategory("Staged", summary.staged);
    formatCategory("Modified", summary.modified);
    formatCategory("Untracked", summary.untracked);
    return lines.join("\n");
}
// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------
const TOOL_DESCRIPTION = [
    "Execute git query commands and return structured summaries.",
    "",
    "Subcommands:",
    "- diff: file-level change summary (file count, per-file +/- stats)",
    "- status: categorized file listing (staged/modified/untracked counts)",
    "- log: recent commit history (oneline format, default 20 commits)",
    "",
    "NOT for: git writes (commit, push, merge, rebase).",
].join("\n");
/**
 * Register the `forge_git` tool on the given MCP server.
 */
export function registerForgeGit(server) {
    server.tool("forge_git", TOOL_DESCRIPTION, {
        subcommand: z.enum(["diff", "status", "log"]).describe("Git subcommand"),
        args: z.string().optional().describe("Additional git arguments"),
    }, async ({ subcommand, args }) => {
        const extraArgs = args ? ` ${args}` : "";
        switch (subcommand) {
            case "diff": {
                const result = await execCommand(`git diff --stat${extraArgs}`, 30000);
                if (result.exitCode !== 0) {
                    const errOutput = result.stderr
                        ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
                        : result.stdout;
                    return {
                        content: [{ type: "text", text: errOutput || "git diff failed" }],
                        isError: true,
                    };
                }
                const summary = parseDiffStat(result.stdout);
                return {
                    content: [{ type: "text", text: formatDiffSummary(summary) }],
                };
            }
            case "status": {
                const result = await execCommand(`git status --porcelain${extraArgs}`, 30000);
                if (result.exitCode !== 0) {
                    const errOutput = result.stderr
                        ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
                        : result.stdout;
                    return {
                        content: [{ type: "text", text: errOutput || "git status failed" }],
                        isError: true,
                    };
                }
                const summary = parseStatusPorcelain(result.stdout);
                return {
                    content: [{ type: "text", text: formatStatusSummary(summary) }],
                };
            }
            case "log": {
                // Default to 20 commits if no args override
                const logArgs = args || "--oneline -20";
                const command = args ? `git log ${args}` : `git log ${logArgs}`;
                const result = await execCommand(command, 30000);
                if (result.exitCode !== 0) {
                    const errOutput = result.stderr
                        ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
                        : result.stdout;
                    return {
                        content: [{ type: "text", text: errOutput || "git log failed" }],
                        isError: true,
                    };
                }
                return {
                    content: [{ type: "text", text: result.stdout }],
                };
            }
        }
    });
}
//# sourceMappingURL=forge-git.js.map