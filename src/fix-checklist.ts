/**
 * Fix checklist — track P0/P1 findings through the review-fix-ship cycle.
 *
 * **Validates: Requirements 10.1–10.5**
 */

/** @public */
export type ChecklistStatus = "unfixed" | "in-progress" | "fixed" | "verified";

/** @public */
export interface ChecklistEntry {
  findingId: string;
  severity: "P0" | "P1";
  filePath: string;
  lineNumber: number;
  description: string;
  status: ChecklistStatus;
  fixCommit?: string;
}

/** @public */
export const VALID_TRANSITIONS: Record<ChecklistStatus, ChecklistStatus[]> = {
  unfixed: ["in-progress"],
  "in-progress": ["fixed", "unfixed"],
  fixed: ["verified", "unfixed"],
  verified: ["unfixed"],
};

/** @public */
export function isValidTransition(current: ChecklistStatus, next: ChecklistStatus): boolean {
  return VALID_TRANSITIONS[current].includes(next);
}

function assertP0P1(s: string): "P0" | "P1" {
  if (s !== "P0" && s !== "P1") throw new Error(`Invalid severity: ${s}`);
  return s;
}

/** @public */
export function createChecklist(
  findings: Array<{
    severity: string;
    filePath: string;
    lineNumber: number;
    description: string;
  }>,
): ChecklistEntry[] {
  return findings
    .filter((f) => f.severity === "P0" || f.severity === "P1")
    .map((f, i) => ({
      findingId: `F-${String(i + 1).padStart(3, "0")}`,
      severity: assertP0P1(f.severity),
      filePath: f.filePath,
      lineNumber: f.lineNumber,
      description: f.description,
      status: "unfixed" as ChecklistStatus,
    }));
}

/** @public */
export function updateEntryStatus(
  entry: ChecklistEntry,
  newStatus: ChecklistStatus,
  fixCommit?: string,
): { success: boolean; entry: ChecklistEntry; error?: string } {
  if (!isValidTransition(entry.status, newStatus)) {
    return {
      success: false,
      entry,
      error: `Invalid transition: ${entry.status} → ${newStatus}`,
    };
  }

  return {
    success: true,
    entry: {
      ...entry,
      status: newStatus,
      fixCommit: fixCommit ?? entry.fixCommit,
    },
  };
}

/** @public */
export function allEntriesVerified(entries: ChecklistEntry[]): boolean {
  return entries.length > 0 && entries.every((e) => e.status === "verified");
}

/** @public */
export function serializeChecklist(
  entries: ChecklistEntry[],
  topic: string,
  createdAt?: string,
): string {
  const p0Count = entries.filter((e) => e.severity === "P0").length;
  const p1Count = entries.filter((e) => e.severity === "P1").length;
  const allVerified = allEntriesVerified(entries);

  const lines: string[] = [
    "---",
    `topic: "${topic.replace(/"/g, '\\"')}"`,
    `created: "${createdAt ?? new Date().toISOString().slice(0, 10)}"`,
    `total_p0: ${p0Count}`,
    `total_p1: ${p1Count}`,
    `all_verified: ${allVerified}`,
    "---",
    "",
    "## P0/P1 Fix Checklist",
    "",
    "| # | Severity | File | Description | Status | Fix Commit |",
    "|---|----------|------|-------------|--------|------------|",
  ];

  for (const entry of entries) {
    const safeDesc = entry.description.replace(/\|/g, "&#124;");
    lines.push(
      `| ${entry.findingId} | ${entry.severity} | ${entry.filePath}:${entry.lineNumber} | ${safeDesc} | ${entry.status} | ${entry.fixCommit ?? "—"} |`,
    );
  }

  return lines.join("\n");
}

/** @public */
export function parseChecklist(content: string): ChecklistEntry[] {
  const entries: ChecklistEntry[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const m = line.match(
      /^\| (F-\d+) \| (P[01]) \| ([^|]+?):(\d+) \| ([^|]+) \| (\S+) \| (.+) \|$/,
    );
    if (m) {
      const lineNumber = Number.parseInt(m[4], 10);
      if (!Number.isFinite(lineNumber)) continue;
      const status = m[6];
      if (!(status in VALID_TRANSITIONS)) continue;
      entries.push({
        findingId: m[1],
        severity: m[2] as "P0" | "P1",
        filePath: m[3],
        lineNumber,
        description: m[5].replace(/&#124;/g, "|"),
        status: status as ChecklistStatus,
        fixCommit: m[7] === "—" ? undefined : m[7],
      });
    }
  }

  return entries;
}
