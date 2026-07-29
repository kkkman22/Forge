/**
 * Subagent_Summary_Protocol — serialize/deserialize subagent handoff summaries.
 *
 * Extracted from `context-budget.ts` (audit P2 #9 god-file split).
 */

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
