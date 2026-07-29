/**
 * Git_Output_Limiter — serialize/deserialize git diff + status summaries.
 *
 * Extracted from `context-budget.ts` (audit P2 #9 god-file split).
 */

/** @public */
export interface GitDiffSummary {
  fileCount: number;
  files: Array<{ filePath: string; added: number; removed: number }>;
  totalAdded: number;
  totalRemoved: number;
  fullDiffPath: string | null;
}

/** @public */
export interface GitStatusSummary {
  staged: { count: number; files: string[] };
  modified: { count: number; files: string[] };
  untracked: { count: number; files: string[] };
}

/** @public */
export function serializeGitDiff(summary: GitDiffSummary, lineCount: number): string {
  if (lineCount <= 50) {
    // Pass through - caller handles this
    return `📊 Git Diff 摘要（完整 diff 见 ${summary.fullDiffPath ?? "N/A"}）\n  变更文件：${summary.fileCount} 个\n  总计：+${summary.totalAdded} -${summary.totalRemoved}`;
  }

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

/** @public */
export function deserializeGitDiff(text: string): GitDiffSummary {
  const result: GitDiffSummary = {
    fileCount: 0,
    files: [],
    totalAdded: 0,
    totalRemoved: 0,
    fullDiffPath: null,
  };

  const pathMatch = text.match(/完整 diff 见 (.+?)）/u);
  if (pathMatch && pathMatch[1] !== "N/A") {
    result.fullDiffPath = pathMatch[1];
  }

  const lines = text.split("\n");
  for (const line of lines) {
    let m: RegExpMatchArray | null;

    m = line.match(/^\s*变更文件：(\d+) 个$/u);
    if (m) {
      result.fileCount = Number.parseInt(m[1], 10);
      continue;
    }

    m = line.match(/^\s*总计：\+(\d+) -(\d+)$/);
    if (m) {
      result.totalAdded = Number.parseInt(m[1], 10);
      result.totalRemoved = Number.parseInt(m[2], 10);
      continue;
    }

    m = line.match(/^\s*(\S+(?:\s+\S+)*): \+(\d+) -(\d+)$/);
    if (m && !line.includes("变更") && !line.includes("总计") && !line.includes("📊")) {
      result.files.push({
        filePath: m[1],
        added: Number.parseInt(m[2], 10),
        removed: Number.parseInt(m[3], 10),
      });
    }
  }

  return result;
}

/** @public */
export function serializeGitStatus(summary: GitStatusSummary, fileCount: number): string {
  if (fileCount <= 30) {
    return `📊 Git Status 摘要\n  Staged: ${summary.staged.count} | Modified: ${summary.modified.count} | Untracked: ${summary.untracked.count}`;
  }

  const lines: string[] = [
    "📊 Git Status 摘要",
    `  Staged: ${summary.staged.count} | Modified: ${summary.modified.count} | Untracked: ${summary.untracked.count}`,
  ];

  const formatCategory = (label: string, data: { count: number; files: string[] }) => {
    const fileList = data.files.slice(0, 10).join(", ");
    lines.push(`  ${label}: ${fileList}${data.count > 10 ? ", ..." : ""}`);
  };

  formatCategory("Staged", summary.staged);
  formatCategory("Modified", summary.modified);
  formatCategory("Untracked", summary.untracked);

  return lines.join("\n");
}

/** @public */
export function deserializeGitStatus(text: string): GitStatusSummary {
  const result: GitStatusSummary = {
    staged: { count: 0, files: [] },
    modified: { count: 0, files: [] },
    untracked: { count: 0, files: [] },
  };

  const lines = text.split("\n");
  for (const line of lines) {
    let m: RegExpMatchArray | null;

    m = line.match(/^\s*Staged: (\d+) \| Modified: (\d+) \| Untracked: (\d+)$/);
    if (m) {
      result.staged.count = Number.parseInt(m[1], 10);
      result.modified.count = Number.parseInt(m[2], 10);
      result.untracked.count = Number.parseInt(m[3], 10);
      continue;
    }

    m = line.match(/^\s*(Staged|Modified|Untracked): (.+)$/);
    if (m) {
      const VALID_CATEGORIES = ["staged", "modified", "untracked"] as const;
      const rawCategory = m[1].toLowerCase();
      if (!VALID_CATEGORIES.includes(rawCategory as (typeof VALID_CATEGORIES)[number])) continue;
      const category = rawCategory as "staged" | "modified" | "untracked";
      const files = m[2]
        .replace(/, \.\.\.$/, "")
        .split(", ")
        .filter(Boolean);
      result[category].files = files;
    }
  }

  return result;
}
