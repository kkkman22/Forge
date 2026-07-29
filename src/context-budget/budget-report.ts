/**
 * ContextBudgetReport — serialize/deserialize the aggregated budget report.
 *
 * Extracted from `context-budget.ts` (audit P2 #9 god-file split).
 */

/** @public */
export interface ContextBudgetReport {
  date: string;
  topic: string;
  totalBeforeTokens: number;
  totalAfterTokens: number;
  savingsPercentage: number;
  breakdown: {
    explore: { before: number; after: number };
    review: { before: number; after: number };
    test: { before: number; after: number };
    git: { before: number; after: number };
    subagent: { before: number; after: number };
  };
}

/** @public */
export function serializeContextBudgetReport(report: ContextBudgetReport): string {
  const lines: string[] = [
    "# 📊 上下文预算报告",
    "",
    `- 日期：${report.date}`,
    `- 主题：${report.topic}`,
    `- 裁剪前估算：~${report.totalBeforeTokens} tokens`,
    `- 裁剪后估算：~${report.totalAfterTokens} tokens`,
    `- 节省比例：${report.savingsPercentage.toFixed(1)}%`,
    "",
    "## 分类明细",
    "",
    `| 类别 | 裁剪前 | 裁剪后 |`,
    `|------|--------|--------|`,
    `| Explore | ~${report.breakdown.explore.before} | ~${report.breakdown.explore.after} |`,
    `| Review | ~${report.breakdown.review.before} | ~${report.breakdown.review.after} |`,
    `| Test | ~${report.breakdown.test.before} | ~${report.breakdown.test.after} |`,
    `| Git | ~${report.breakdown.git.before} | ~${report.breakdown.git.after} |`,
    `| Subagent | ~${report.breakdown.subagent.before} | ~${report.breakdown.subagent.after} |`,
  ];

  if (report.savingsPercentage < 30) {
    lines.push("", "> ⚠️ 节省比例低于 30%，建议检查裁剪阈值配置。");
  }

  return lines.join("\n");
}

/** @public */
export function deserializeContextBudgetReport(text: string): ContextBudgetReport {
  const result: ContextBudgetReport = {
    date: "",
    topic: "",
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    savingsPercentage: 0,
    breakdown: {
      explore: { before: 0, after: 0 },
      review: { before: 0, after: 0 },
      test: { before: 0, after: 0 },
      git: { before: 0, after: 0 },
      subagent: { before: 0, after: 0 },
    },
  };

  const dateMatch = text.match(/日期：(.+)/);
  if (dateMatch) result.date = dateMatch[1].trim();

  const topicMatch = text.match(/主题：(.+)/);
  if (topicMatch) result.topic = topicMatch[1].trim();

  const beforeMatch = text.match(/裁剪前估算：~(\d+)/);
  if (beforeMatch) result.totalBeforeTokens = Number.parseInt(beforeMatch[1], 10);

  const afterMatch = text.match(/裁剪后估算：~(\d+)/);
  if (afterMatch) result.totalAfterTokens = Number.parseInt(afterMatch[1], 10);

  const savingsMatch = text.match(/节省比例：([\d.]+)%/);
  if (savingsMatch) result.savingsPercentage = Number.parseFloat(savingsMatch[1]);

  // Parse breakdown table rows
  const breakdownPatterns: Array<{ key: keyof ContextBudgetReport["breakdown"]; pattern: RegExp }> =
    [
      { key: "explore", pattern: /\| Explore \| ~(\d+) \| ~(\d+) \|/ },
      { key: "review", pattern: /\| Review \| ~(\d+) \| ~(\d+) \|/ },
      { key: "test", pattern: /\| Test \| ~(\d+) \| ~(\d+) \|/ },
      { key: "git", pattern: /\| Git \| ~(\d+) \| ~(\d+) \|/ },
      { key: "subagent", pattern: /\| Subagent \| ~(\d+) \| ~(\d+) \|/ },
    ];

  for (const { key, pattern } of breakdownPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.breakdown[key] = {
        before: Number.parseInt(match[1], 10),
        after: Number.parseInt(match[2], 10),
      };
    }
  }

  return result;
}
