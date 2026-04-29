/**
 * Fix checklist — track P0/P1 findings through the review-fix-ship cycle.
 *
 * **Validates: Requirements 10.1–10.5**
 */

export type ChecklistStatus = "unfixed" | "in-progress" | "fixed" | "verified";

export interface ChecklistEntry {
  findingId: string;
  severity: "P0" | "P1";
  filePath: string;
  lineNumber: number;
  description: string;
  status: ChecklistStatus;
  fixCommit?: string;
}

export const VALID_TRANSITIONS: Record<ChecklistStatus, ChecklistStatus[]> = {
  unfixed: ["in-progress"],
  "in-progress": ["fixed", "unfixed"],
  fixed: ["verified", "unfixed"],
  verified: ["unfixed"],
};

export function isValidTransition(current: ChecklistStatus, next: ChecklistStatus): boolean {
  return VALID_TRANSITIONS[current].includes(next);
}

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
      severity: f.severity as "P0" | "P1",
      filePath: f.filePath,
      lineNumber: f.lineNumber,
      description: f.description,
      status: "unfixed" as ChecklistStatus,
    }));
}

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

export function allEntriesVerified(entries: ChecklistEntry[]): boolean {
  return entries.length > 0 && entries.every((e) => e.status === "verified");
}

export function serializeChecklist(entries: ChecklistEntry[], topic: string): string {
  const p0Count = entries.filter((e) => e.severity === "P0").length;
  const p1Count = entries.filter((e) => e.severity === "P1").length;
  const allVerified = allEntriesVerified(entries);

  const lines: string[] = [
    "---",
    `topic: "${topic}"`,
    `created: "${new Date().toISOString().slice(0, 10)}"`,
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
    lines.push(
      `| ${entry.findingId} | ${entry.severity} | ${entry.filePath}:${entry.lineNumber} | ${entry.description} | ${entry.status} | ${entry.fixCommit ?? "—"} |`,
    );
  }

  return lines.join("\n");
}

export function parseChecklist(content: string): ChecklistEntry[] {
  const entries: ChecklistEntry[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const m = line.match(/^\| (F-\d+) \| (P[01]) \| (.+):(\d+) \| (.+) \| (\S+) \| (.+) \|$/);
    if (m) {
      entries.push({
        findingId: m[1],
        severity: m[2] as "P0" | "P1",
        filePath: m[3],
        lineNumber: Number.parseInt(m[4], 10),
        description: m[5],
        status: m[6] as ChecklistStatus,
        fixCommit: m[7] === "—" ? undefined : m[7],
      });
    }
  }

  return entries;
}
