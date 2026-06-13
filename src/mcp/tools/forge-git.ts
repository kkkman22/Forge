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
import { z } from "zod";
import type { GitDiffSummary, GitStatusSummary } from "../../context-budget.js";
import type { ResolvedRoot } from "../project-root.js";
import { parseDiffStat, parseStatusPorcelain } from "../trimmers/git.js";
import { containsShellMetachars, execCommand } from "./forge-exec.js";

// ---------------------------------------------------------------------------
// Serialization helpers (match context-budget.ts format)
// ---------------------------------------------------------------------------

/**
 * Format a GitDiffSummary into a human-readable string matching the
 * `serializeGitDiff` output format from `context-budget.ts`.
 */
export function formatDiffSummary(summary: GitDiffSummary): string {
  const lines: string[] = [
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
export function formatStatusSummary(summary: GitStatusSummary): string {
  const lines: string[] = [
    "📊 Git Status 摘要",
    `  Staged: ${summary.staged.count} | Modified: ${summary.modified.count} | Untracked: ${summary.untracked.count}`,
  ];

  const formatCategory = (label: string, data: { count: number; files: string[] }) => {
    if (data.files.length === 0) return;
    const fileList = data.files.slice(0, 10).join(", ");
    lines.push(`  ${label}: ${fileList}${data.count > 10 ? ", ..." : ""}`);
  };

  formatCategory("Staged", summary.staged);
  formatCategory("Modified", summary.modified);
  formatCategory("Untracked", summary.untracked);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Diff content truncation for review context injection
// ---------------------------------------------------------------------------

/** Maximum total lines for diff-content output. */
const DIFF_CONTENT_MAX_LINES = 1500;

/** Maximum lines per single file in diff output. */
const DIFF_PER_FILE_MAX_LINES = 100;

/**
 * Truncate full diff content for review context injection.
 *
 * Strategy:
 * 1. Split diff into per-file hunks
 * 2. For each file: keep up to DIFF_PER_FILE_MAX_LINES (prioritize hunks, truncate large files)
 * 3. If total exceeds DIFF_CONTENT_MAX_LINES, drop lowest-priority files (test files, generated)
 * 4. Append truncation notice with list of omitted files
 */
export function truncateDiffContent(rawDiff: string): string {
  if (!rawDiff.trim()) return "（无 diff 内容）";

  const lines = rawDiff.split("\n");
  if (lines.length <= DIFF_CONTENT_MAX_LINES) {
    return rawDiff;
  }

  // Split into per-file sections
  const fileSections: Array<{ header: string; filePath: string; lines: string[] }> = [];
  let currentSection: { header: string; filePath: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentSection) fileSections.push(currentSection);
      const pathMatch = line.match(/diff --git a\/.+ b\/(.+)/);
      const filePath = pathMatch ? pathMatch[1] : "unknown";
      currentSection = { header: line, filePath, lines: [] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  }
  if (currentSection) fileSections.push(currentSection);

  // Priority: source files > config > tests > generated/lock files
  const priority = (filePath: string): number => {
    if (filePath.match(/\.(lock|lockb)$|package-lock|yarn\.lock/)) return 0;
    if (filePath.match(/dist\/|\.d\.ts$/)) return 1;
    if (filePath.match(/test\/|\.test\.|\.spec\.|__tests__/)) return 2;
    if (filePath.match(/\.(json|yml|yaml|toml)$/)) return 3;
    return 4; // source files highest priority
  };

  // Sort by priority descending (highest first)
  const sorted = [...fileSections].sort((a, b) => priority(b.filePath) - priority(a.filePath));

  // Truncate per-file and accumulate
  const outputSections: string[] = [];
  const omittedFiles: string[] = [];
  let totalLines = 0;

  for (const section of sorted) {
    let sectionLines: string[];
    if (section.lines.length > DIFF_PER_FILE_MAX_LINES) {
      sectionLines = section.lines.slice(0, DIFF_PER_FILE_MAX_LINES);
      sectionLines.push(
        `\n... [truncated: ${section.lines.length - DIFF_PER_FILE_MAX_LINES} more lines in ${section.filePath}]`,
      );
    } else {
      sectionLines = section.lines;
    }

    const sectionTotal = sectionLines.length + 1; // +1 for header
    if (totalLines + sectionTotal > DIFF_CONTENT_MAX_LINES) {
      omittedFiles.push(section.filePath);
      continue;
    }

    outputSections.push(`${section.header}\n${sectionLines.join("\n")}`);
    totalLines += sectionTotal;
  }

  let result = outputSections.join("\n");

  if (omittedFiles.length > 0) {
    result += `\n\n--- [diff truncated: ${omittedFiles.length} files omitted for context budget] ---`;
    result += `\n省略文件：${omittedFiles.join(", ")}`;
    result += "\n（对省略文件如有存疑，可用 Read 或 forge_read 深入验证）";
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = [
  "Execute git query commands and return structured summaries.",
  "",
  "Subcommands:",
  "- diff: file-level change summary (file count, per-file +/- stats)",
  "- diff-content: patch content with intelligent truncation for review (max ~3000 lines)",
  "- status: categorized file listing (staged/modified/untracked counts)",
  "- log: recent commit history (oneline format, default 20 commits)",
  "",
  "NOT for: git writes (commit, push, merge, rebase).",
].join("\n");

/**
 * Register the `forge_git` tool on the given MCP server.
 */
export function registerForgeGit(server: McpServer, root?: ResolvedRoot): void {
  const execOpts = root ? { cwd: root.path } : undefined;
  server.registerTool(
    "forge_git",
    {
      description: TOOL_DESCRIPTION,
      inputSchema: {
        subcommand: z.enum(["diff", "diff-content", "status", "log"]).describe("Git subcommand"),
        args: z.string().optional().describe("Additional git arguments"),
      },
      _meta: {
        "anthropic/maxResultSizeChars": 200_000,
      },
    },
    async ({ subcommand, args }) => {
      // Defense-in-depth: `args` is caller-controlled (MCP client / model) and is
      // interpolated into a command string that execCommand routes through
      // /bin/sh -c whenever it contains shell operators. Reject any operator
      // before it reaches the subprocess layer. Benign git arguments
      // (HEAD~1, --oneline -20) contain no operators and pass through.
      if (args) {
        const metacharReason = containsShellMetachars(args);
        if (metacharReason) {
          return {
            content: [{ type: "text" as const, text: metacharReason }],
            isError: true,
          };
        }
      }

      const extraArgs = args ? ` ${args}` : "";

      switch (subcommand) {
        case "diff": {
          const result = await execCommand(`git diff --stat${extraArgs}`, 30000, execOpts);
          if (result.exitCode !== 0) {
            const errOutput = result.stderr
              ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
              : result.stdout;
            return {
              content: [{ type: "text" as const, text: errOutput || "git diff failed" }],
              isError: true,
            };
          }
          const summary = parseDiffStat(result.stdout);
          return {
            content: [{ type: "text" as const, text: formatDiffSummary(summary) }],
          };
        }

        case "diff-content": {
          const result = await execCommand(`git diff${extraArgs}`, 60000, execOpts);
          if (result.exitCode !== 0) {
            const errOutput = result.stderr
              ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
              : result.stdout;
            return {
              content: [{ type: "text" as const, text: errOutput || "git diff failed" }],
              isError: true,
            };
          }
          const truncated = truncateDiffContent(result.stdout);
          return {
            content: [{ type: "text" as const, text: truncated }],
          };
        }

        case "status": {
          const result = await execCommand(`git status --porcelain${extraArgs}`, 30000, execOpts);
          if (result.exitCode !== 0) {
            const errOutput = result.stderr
              ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
              : result.stdout;
            return {
              content: [{ type: "text" as const, text: errOutput || "git status failed" }],
              isError: true,
            };
          }
          const summary = parseStatusPorcelain(result.stdout);
          return {
            content: [{ type: "text" as const, text: formatStatusSummary(summary) }],
          };
        }

        case "log": {
          // Default to 20 commits if no args override
          const logArgs = args || "--oneline -20";
          const command = args ? `git log ${args}` : `git log ${logArgs}`;
          const result = await execCommand(command, 30000, execOpts);
          if (result.exitCode !== 0) {
            const errOutput = result.stderr
              ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
              : result.stdout;
            return {
              content: [{ type: "text" as const, text: errOutput || "git log failed" }],
              isError: true,
            };
          }
          return {
            content: [{ type: "text" as const, text: result.stdout }],
          };
        }
      }
    },
  );
}
