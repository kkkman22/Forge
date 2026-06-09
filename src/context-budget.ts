/**
 * Context budget management — data models, classification mapping,
 * serializers and deserializers for context window consumption control.
 *
 * **Validates: Requirements 1.1–1.6, 2.1–2.5, 3.1–3.5, 4.1–4.5,
 * 5.1–5.5, 6.1–6.6, 8.1–8.4, 9.1–9.3, 10.1–10.5**
 */

// ---------------------------------------------------------------------------
// Information Lifecycle type
// ---------------------------------------------------------------------------

/** @public */
export type InformationLifecycle =
  | "persistent"
  | "phase-scoped"
  | "ephemeral"
  | "write-and-discard";

// ---------------------------------------------------------------------------
// Classification mapping
// ---------------------------------------------------------------------------

/** @public */
export interface ClassificationEntry {
  source: string;
  lifecycle: InformationLifecycle;
  trimmer: string | null;
}

/** @public */
export const CLASSIFICATION_MAP: ClassificationEntry[] = [
  { source: "plan-task-list", lifecycle: "persistent", trimmer: null },
  { source: "current-task", lifecycle: "persistent", trimmer: null },
  { source: "key-interfaces", lifecycle: "persistent", trimmer: null },
  { source: "explore-results", lifecycle: "ephemeral", trimmer: "Explore_Summarizer" },
  { source: "review-reports", lifecycle: "write-and-discard", trimmer: "Review_Summarizer" },
  { source: "test-output", lifecycle: "ephemeral", trimmer: "Test_Output_Trimmer" },
  { source: "git-diff", lifecycle: "ephemeral", trimmer: "Git_Output_Limiter" },
  { source: "git-status", lifecycle: "ephemeral", trimmer: "Git_Output_Limiter" },
  { source: "subagent-results", lifecycle: "ephemeral", trimmer: "Subagent_Summary_Protocol" },
  { source: "progress-updates", lifecycle: "write-and-discard", trimmer: null },
  { source: "decision-documents", lifecycle: "write-and-discard", trimmer: null },
  { source: "tdd-test-output", lifecycle: "phase-scoped", trimmer: null },
  { source: "closure-first-probes", lifecycle: "phase-scoped", trimmer: null },
];

/** @public */
export function classifySource(source: string): InformationLifecycle | undefined {
  return CLASSIFICATION_MAP.find((e) => e.source === source)?.lifecycle;
}

// ---------------------------------------------------------------------------
// Model-window-aware thresholds
// ---------------------------------------------------------------------------

/** @public */
export interface ContextWindowBudgetInput {
  configuredBudgetTokens?: number;
  contextWindowTokens?: number;
  warningRatio?: number;
  compactRatio?: number;
  criticalRatio?: number;
}

/** @public */
export interface ContextBudgetThresholds {
  warningTokens: number;
  compactTokens: number;
  criticalTokens: number;
  source: "context-window" | "configured-budget";
}

const DEFAULT_CONFIGURED_BUDGET_TOKENS = 100_000;
const DEFAULT_WARNING_RATIO = 0.3;
const DEFAULT_COMPACT_RATIO = 0.5;
const DEFAULT_CRITICAL_RATIO = 0.7;

function validPositiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function validRatio(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1
    ? value
    : fallback;
}

/** @public */
export function computeContextBudgetThresholds(
  input: ContextWindowBudgetInput,
): ContextBudgetThresholds {
  const contextWindowTokens = validPositiveInteger(input.contextWindowTokens);
  const configuredBudgetTokens =
    validPositiveInteger(input.configuredBudgetTokens) ?? DEFAULT_CONFIGURED_BUDGET_TOKENS;
  const baseTokens = contextWindowTokens ?? configuredBudgetTokens;
  const source = contextWindowTokens ? "context-window" : "configured-budget";

  return {
    warningTokens: Math.ceil(baseTokens * validRatio(input.warningRatio, DEFAULT_WARNING_RATIO)),
    compactTokens: Math.ceil(baseTokens * validRatio(input.compactRatio, DEFAULT_COMPACT_RATIO)),
    criticalTokens: Math.ceil(baseTokens * validRatio(input.criticalRatio, DEFAULT_CRITICAL_RATIO)),
    source,
  };
}

// ---------------------------------------------------------------------------
// Explore_Summarizer
// ---------------------------------------------------------------------------

/** @public */
export interface ExploreSummary {
  entryPoints: Array<{ filePath: string; line: number; functionName: string }>;
  dependencyChain: string[];
  relatedTests: Array<{ filePath: string; testCount: number }>;
  keyInterfaces: Array<{ name: string; filePath: string; line: number }>;
  fileGroups: Array<{ moduleName: string; fileCount: number }>;
}

/** @public */
export function serializeExploreResult(input: ExploreSummary | string | null | undefined): string {
  if (input === null || input === undefined) {
    return "Explore Agent 返回空结果";
  }
  if (typeof input === "string") {
    return input;
  }
  if (
    input.entryPoints.length === 0 &&
    input.dependencyChain.length === 0 &&
    input.relatedTests.length === 0 &&
    input.keyInterfaces.length === 0 &&
    input.fileGroups.length === 0
  ) {
    return "Explore Agent 返回空结果";
  }
  return serializeExploreSummary(input);
}

/** @public */
export function serializeExploreSummary(summary: ExploreSummary): string {
  const lines: string[] = [
    "\u{1F4CD} \u{4EE3}\u{7801}\u{5E93}\u{63A2}\u{7D22}\u{7ED3}\u{679C}\u{FF08}\u{6458}\u{8981}\u{FF09}",
  ];

  for (const ep of summary.entryPoints) {
    lines.push(`  \u{5165}\u{53E3}\u{70B9}\u{FF1A}${ep.filePath}:${ep.line} (${ep.functionName})`);
  }

  if (summary.dependencyChain.length > 0) {
    lines.push(`  \u{4F9D}\u{8D56}\u{94FE}\u{FF1A}${summary.dependencyChain.join(" \u2192 ")}`);
  }

  for (const t of summary.relatedTests) {
    lines.push(
      `  \u{76F8}\u{5173}\u{6D4B}\u{8BD5}\u{FF1A}${t.filePath}\u{FF08}${t.testCount} \u{4E2A}\u{7528}\u{4F8B}\u{FF09}`,
    );
  }

  for (const iface of summary.keyInterfaces) {
    lines.push(
      `  \u{5173}\u{952E}\u{63A5}\u{53E3}\u{FF1A}${iface.name} (${iface.filePath}:${iface.line})`,
    );
  }

  if (summary.fileGroups.length > 0) {
    const groups = summary.fileGroups.map(
      (g) => `${g.moduleName}\u{FF08}${g.fileCount} \u{4E2A}\u{6587}\u{4EF6}\u{FF09}`,
    );
    lines.push(`  \u{6587}\u{4EF6}\u{5206}\u{7EC4}\u{FF1A}${groups.join(", ")}`);
  }

  return lines.join("\n");
}

/** @public */
export function deserializeExploreSummary(text: string): ExploreSummary {
  const result: ExploreSummary = {
    entryPoints: [],
    dependencyChain: [],
    relatedTests: [],
    keyInterfaces: [],
    fileGroups: [],
  };

  const lines = text.split("\n");
  for (const line of lines) {
    let m: RegExpMatchArray | null;

    m = line.match(/^\s*入口点：(.+):(\d+) \((\w+)\)$/u);
    if (m) {
      result.entryPoints.push({
        filePath: m[1],
        line: Number.parseInt(m[2], 10),
        functionName: m[3],
      });
      continue;
    }

    m = line.match(/^\s*依赖链：(.+)$/u);
    if (m) {
      result.dependencyChain = m[1].split(" → ");
      continue;
    }

    m = line.match(/^\s*相关测试：(.+)（(\d+) 个用例）$/u);
    if (m) {
      result.relatedTests.push({
        filePath: m[1],
        testCount: Number.parseInt(m[2], 10),
      });
      continue;
    }

    m = line.match(/^\s*关键接口：(\w+) \((.+):(\d+)\)$/u);
    if (m) {
      result.keyInterfaces.push({
        name: m[1],
        filePath: m[2],
        line: Number.parseInt(m[3], 10),
      });
      continue;
    }

    m = line.match(/^\s*文件分组：(.+)$/u);
    if (m) {
      const parts = m[1].split(", ");
      for (const part of parts) {
        const gMatch = part.match(/^(.+)（(\d+) 个文件）$/u);
        if (gMatch) {
          result.fileGroups.push({
            moduleName: gMatch[1],
            fileCount: Number.parseInt(gMatch[2], 10),
          });
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Review_Summarizer
// ---------------------------------------------------------------------------

/** @public */
export interface ReviewSummary {
  filePath: string;
  severityCounts: { p0: number; p1: number; p2: number; p3: number };
  findings: Array<{
    severity: "P0" | "P1" | "P2" | "P3";
    filePath: string;
    line: number;
    description: string;
  }>;
}

/** @public */
export function serializeReviewSummary(summary: ReviewSummary): string {
  const { severityCounts, findings, filePath } = summary;
  const total = severityCounts.p0 + severityCounts.p1 + severityCounts.p2 + severityCounts.p3;

  if (total === 0 && findings.length === 0) {
    return `\u{1F4CB} \u{8BC4}\u{5BA1}\u{901A}\u{8FC7}\u{FF0C}\u{96F6}\u{53D1}\u{73B0}\u{FF08}\u{8BE6}\u{89C1} ${filePath}\u{FF09}`;
  }

  const lines: string[] = [
    `\u{1F4CB} \u{8BC4}\u{5BA1}\u{7ED3}\u{679C}\u{6458}\u{8981}\u{FF08}\u{8BE6}\u{89C1} ${filePath}\u{FF09}`,
    `  P0: ${severityCounts.p0} | P1: ${severityCounts.p1} | P2: ${severityCounts.p2} | P3: ${severityCounts.p3}`,
  ];

  for (const f of findings) {
    lines.push(`  ${f.severity}: ${f.filePath}:${f.line} \u2014 ${f.description}`);
  }

  return lines.join("\n");
}

/** @public */
export function deserializeReviewSummary(text: string): ReviewSummary {
  const result: ReviewSummary = {
    filePath: "",
    severityCounts: { p0: 0, p1: 0, p2: 0, p3: 0 },
    findings: [],
  };

  const lines = text.split("\n");

  // Extract filePath from first line
  const headerMatch = text.match(/详见 (.+?)）/u) ?? text.match(/（详见 (.+?)）/u);
  if (headerMatch) {
    result.filePath = headerMatch[1];
  }

  for (const line of lines) {
    let m: RegExpMatchArray | null;

    m = line.match(/^\s*P0: (\d+) \| P1: (\d+) \| P2: (\d+) \| P3: (\d+)$/);
    if (m) {
      result.severityCounts = {
        p0: Number.parseInt(m[1], 10),
        p1: Number.parseInt(m[2], 10),
        p2: Number.parseInt(m[3], 10),
        p3: Number.parseInt(m[4], 10),
      };
      continue;
    }

    m = line.match(/^\s*(P[0-3]): (.+):(\d+) — (.+)$/);
    if (m) {
      if (!["P0", "P1", "P2", "P3"].includes(m[1])) continue;
      result.findings.push({
        severity: m[1] as "P0" | "P1" | "P2" | "P3",
        filePath: m[2],
        line: Number.parseInt(m[3], 10),
        description: m[4],
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Test_Output_Trimmer
// ---------------------------------------------------------------------------

/** @public */
export interface TestOutputSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: Array<{
    testName: string;
    filePath: string;
    line: number;
    errorMessage: string;
  }>;
  parseFailed?: boolean;
}

/** @public */
export function serializeTestOutput(summary: TestOutputSummary): string {
  if (summary.failed === 0) {
    return `\u2713 ${summary.passed}/${summary.total} tests passed (0 failed, ${summary.skipped} skipped) in ${(summary.duration / 1000).toFixed(1)}s`;
  }

  const lines: string[] = [
    `\u2717 ${summary.failed} failed, ${summary.passed} passed, ${summary.skipped} skipped in ${(summary.duration / 1000).toFixed(1)}s`,
  ];

  for (const f of summary.failures) {
    lines.push(`  FAIL ${f.testName} (${f.filePath}:${f.line})`);
    lines.push(`    ${f.errorMessage}`);
  }

  return lines.join("\n");
}

/** @public */
export function canParseTestOutput(text: string): boolean {
  const firstLine = text.split("\n")[0].trim();
  return (
    !!firstLine.match(/^✓ (\d+)\/(\d+) tests passed \(0 failed, (\d+) skipped\) in ([\d.]+)s$/) ||
    !!firstLine.match(/^✗ (\d+) failed, (\d+) passed, (\d+) skipped in ([\d.]+)s$/)
  );
}

/** @public */
export function deserializeTestOutput(text: string): TestOutputSummary {
  const result: TestOutputSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    failures: [],
  };

  const firstLine = text.split("\n")[0].trim();

  // All-pass format: ✓ N/M tests passed (0 failed, N skipped) in Xs
  const passMatch = firstLine.match(
    /^✓ (\d+)\/(\d+) tests passed \(0 failed, (\d+) skipped\) in ([\d.]+)s$/,
  );
  if (passMatch) {
    result.passed = Number.parseInt(passMatch[1], 10);
    result.total = Number.parseInt(passMatch[2], 10);
    result.failed = 0;
    result.skipped = Number.parseInt(passMatch[3], 10);
    result.duration = Math.round(Number.parseFloat(passMatch[4]) * 1000);
    return result;
  }

  // Failure format: ✗ N failed, N passed, N skipped in Xs
  const failMatch = firstLine.match(/^✗ (\d+) failed, (\d+) passed, (\d+) skipped in ([\d.]+)s$/);
  if (failMatch) {
    result.failed = Number.parseInt(failMatch[1], 10);
    result.passed = Number.parseInt(failMatch[2], 10);
    result.skipped = Number.parseInt(failMatch[3], 10);
    result.duration = Math.round(Number.parseFloat(failMatch[4]) * 1000);
    result.total = result.failed + result.passed + result.skipped;
  } else {
    result.parseFailed = true;
    return result;
  }

  // Parse failure entries
  const allLines = text.split("\n");
  let i = 1;
  while (i < allLines.length) {
    const m = allLines[i].match(/^\s*FAIL (.+) \((.+):(\d+)\)$/);
    if (m) {
      const errorMsg = i + 1 < allLines.length ? allLines[i + 1].replace(/^\s{4}/, "") : "";
      result.failures.push({
        testName: m[1],
        filePath: m[2],
        line: Number.parseInt(m[3], 10),
        errorMessage: errorMsg,
      });
      i += 2;
      continue;
    }
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Git_Output_Limiter
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Subagent_Summary_Protocol
// ---------------------------------------------------------------------------

/** @public */
export interface SubagentSummary {
  status: "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";
  taskDescription: string;
  changedFiles: string[];
  testResult: { passed: number; failed: number };
  commitMessage: string;
  selfCheckResults: string;
  blockingReason?: string;
  concerns?: string[];
}

/** @public */
export function serializeSubagentSummary(summary: SubagentSummary): string {
  const lines: string[] = [`状态：${summary.status}`, `任务：${summary.taskDescription}`];

  if (summary.changedFiles.length > 0) {
    lines.push(`变更文件：${summary.changedFiles.join(", ")}`);
  } else {
    lines.push("变更文件：(none)");
  }

  lines.push(
    `测试结果：✓ ${summary.testResult.passed} passed, ✗ ${summary.testResult.failed} failed`,
  );
  lines.push(`Commit：${summary.commitMessage}`);
  lines.push(`自检：${summary.selfCheckResults}`);

  if (
    (summary.status === "BLOCKED" || summary.status === "NEEDS_CONTEXT") &&
    summary.blockingReason
  ) {
    lines.push(`阻塞原因：${summary.blockingReason}`);
  }

  if (summary.status === "DONE_WITH_CONCERNS" && summary.concerns && summary.concerns.length > 0) {
    lines.push(`疑虑：${JSON.stringify(summary.concerns)}`);
  }

  return lines.join("\n");
}

/** @public */
export function deserializeSubagentSummary(text: string): SubagentSummary {
  const result: SubagentSummary = {
    status: "DONE",
    taskDescription: "",
    changedFiles: [],
    testResult: { passed: 0, failed: 0 },
    commitMessage: "",
    selfCheckResults: "",
  };

  const lines = text.split("\n");
  for (const line of lines) {
    let m: RegExpMatchArray | null;

    m = line.match(/^\s*状态：(.+)$/u);
    if (m) {
      const VALID_STATUSES = ["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"] as const;
      const rawStatus = m[1].trim();
      if (VALID_STATUSES.includes(rawStatus as (typeof VALID_STATUSES)[number])) {
        result.status = rawStatus as SubagentSummary["status"];
      }
      continue;
    }
    m = line.match(/^\s*任务：(.+)$/u);
    if (m) {
      result.taskDescription = m[1];
      continue;
    }
    m = line.match(/^\s*变更文件：(.+)$/u);
    if (m && !line.includes("(none)")) {
      result.changedFiles = m[1].split(", ");
      continue;
    }
    m = line.match(/✓ (\d+) passed, ✗ (\d+) failed/);
    if (m) {
      result.testResult = {
        passed: Number.parseInt(m[1], 10),
        failed: Number.parseInt(m[2], 10),
      };
      continue;
    }
    m = line.match(/^\s*Commit：(.+)$/u);
    if (m) {
      result.commitMessage = m[1];
      continue;
    }
    m = line.match(/^\s*自检：(.+)$/u);
    if (m) {
      result.selfCheckResults = m[1];
      continue;
    }
    m = line.match(/^\s*阻塞原因：(.+)$/u);
    if (m) {
      result.blockingReason = m[1];
      continue;
    }
    m = line.match(/^\s*疑虑：(.+)$/u);
    if (m) {
      try {
        result.concerns = JSON.parse(m[1]);
      } catch (_err: unknown) {
        // Fallback for legacy format (semicolon-separated)
        result.concerns = m[1].split("; ");
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// ContextBudgetReport
// ---------------------------------------------------------------------------

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
