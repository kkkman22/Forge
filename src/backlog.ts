/**
 * Backlog Manager — captures unfixed P2/P3 findings for future work cycles.
 *
 * **Validates: Requirements 6.1–6.6**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @internal
 * A single backlog entry representing an unfixed P2/P3 finding.
 */
export interface BacklogEntry {
  /** Unique ID derived from the finding fingerprint. */
  id: string;
  severity: "P2" | "P3";
  filePath: string;
  lineNumber: number;
  description: string;
  /** Path to the source review report. */
  sourceReview: string;
  /** Task name that generated the finding. */
  originTask: string;
  /** ISO date when the entry was captured. */
  capturedDate: string;
  /** Whether the entry has been resolved. */
  resolved: boolean;
  /** Task name that resolved the entry (if resolved). */
  resolvedBy?: string;
  /** ISO date when the entry was resolved (if resolved). */
  resolvedDate?: string;
}

// ---------------------------------------------------------------------------
// File format
// ---------------------------------------------------------------------------

/** @internal Generate the standard header for a new backlog file. */
export function generateBacklogHeader(): string {
  return `---
title: "Forge Backlog"
updated: "${new Date().toISOString().slice(0, 10)}"
total_entries: 0
unresolved: 0
---

## Backlog Entries

`;
}

function serializeEntry(entry: BacklogEntry): string {
  const lines = [
    `### ${entry.id}`,
    `- **Severity:** ${entry.severity}`,
    `- **File:** ${entry.filePath}:${entry.lineNumber}`,
    `- **Description:** ${entry.description}`,
    `- **Source Review:** ${entry.sourceReview}`,
    `- **Origin Task:** ${entry.originTask}`,
    `- **Captured:** ${entry.capturedDate}`,
    `- **Status:** ${entry.resolved ? "resolved" : "unresolved"}`,
  ];
  if (entry.resolved) {
    lines.push(`- **Resolved By:** ${entry.resolvedBy ?? ""}`);
    lines.push(`- **Resolved Date:** ${entry.resolvedDate ?? ""}`);
  }
  return `${lines.join("\n")}\n`;
}

/** @internal Serialize backlog entries to `.tinkerman/backlog.md` format. */
export function serializeBacklog(entries: BacklogEntry[]): string {
  const unresolved = entries.filter((e) => !e.resolved);
  const resolved = entries.filter((e) => e.resolved);

  const lines: string[] = [
    `---`,
    `title: "Forge Backlog"`,
    `updated: "${new Date().toISOString().slice(0, 10)}"`,
    `total_entries: ${entries.length}`,
    `unresolved: ${unresolved.length}`,
    `---`,
    ``,
    `## Backlog Entries`,
    ``,
  ];

  if (entries.length === 0) {
    lines.push("*No entries.*\n");
    return lines.join("\n");
  }

  for (const entry of unresolved) {
    lines.push(serializeEntry(entry));
  }
  for (const entry of resolved) {
    lines.push(serializeEntry(entry));
  }

  return lines.join("\n");
}

/** @internal Parse `.tinkerman/backlog.md` content into structured entries. */
export function parseBacklog(content: string): BacklogEntry[] {
  const entries: BacklogEntry[] = [];
  const lines = content.split("\n");
  let current: Partial<BacklogEntry> & Record<string, unknown> = {};
  let inEntry = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("### ")) {
      if (inEntry && isCompleteEntry(current)) {
        entries.push(current as BacklogEntry);
      }
      current = { id: line.slice(4).trim() };
      inEntry = true;
    } else if (line.startsWith("- **Severity:** ") && inEntry) {
      const v = line.slice("- **Severity:** ".length).trim();
      if (v === "P2" || v === "P3") current.severity = v;
    } else if (line.startsWith("- **File:** ") && inEntry) {
      const rest = line.slice("- **File:** ".length).trim();
      const colonIdx = rest.lastIndexOf(":");
      if (colonIdx > 0) {
        current.filePath = rest.slice(0, colonIdx).trim();
        const lineNum = parseInt(rest.slice(colonIdx + 1), 10);
        if (!Number.isNaN(lineNum)) current.lineNumber = lineNum;
      }
    } else if (line.startsWith("- **Description:** ") && inEntry) {
      current.description = line.slice("- **Description:** ".length).trim();
    } else if (line.startsWith("- **Source Review:** ") && inEntry) {
      current.sourceReview = line.slice("- **Source Review:** ".length).trim();
    } else if (line.startsWith("- **Origin Task:** ") && inEntry) {
      current.originTask = line.slice("- **Origin Task:** ".length).trim();
    } else if (line.startsWith("- **Captured:** ") && inEntry) {
      current.capturedDate = line.slice("- **Captured:** ".length).trim();
    } else if (line.startsWith("- **Status:** ") && inEntry) {
      current.resolved = line.slice("- **Status:** ".length).trim() === "resolved";
    } else if (line.startsWith("- **Resolved By:** ") && inEntry) {
      current.resolvedBy = line.slice("- **Resolved By:** ".length).trim();
    } else if (line.startsWith("- **Resolved Date:** ") && inEntry) {
      current.resolvedDate = line.slice("- **Resolved Date:** ".length).trim();
    }
  }

  if (inEntry && isCompleteEntry(current)) {
    entries.push(current as BacklogEntry);
  }

  return entries;
}

function isCompleteEntry(e: Record<string, unknown>): boolean {
  return (
    typeof e.id === "string" &&
    (e.severity === "P2" || e.severity === "P3") &&
    typeof e.filePath === "string" &&
    typeof e.lineNumber === "number" &&
    typeof e.description === "string" &&
    typeof e.sourceReview === "string" &&
    typeof e.originTask === "string" &&
    typeof e.capturedDate === "string" &&
    typeof e.resolved === "boolean"
  );
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Append new findings to the backlog, deduplicating by ID.
 * Returns the merged list and the count of newly added entries.
 * @internal
 */
export function appendToBacklog(
  existing: BacklogEntry[],
  newFindings: BacklogEntry[],
): { entries: BacklogEntry[]; added: number } {
  const seen = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  let added = 0;

  for (const finding of newFindings) {
    if (!seen.has(finding.id)) {
      seen.add(finding.id);
      merged.push(finding);
      added++;
    }
  }

  return { entries: merged, added };
}

/**
 * Find backlog entries whose filePath overlaps with a set of affected files.
 * Used by `/tinkerman plan` to surface relevant backlog items.
 * @internal
 */
export function findOverlappingEntries(
  entries: BacklogEntry[],
  affectedFiles: string[],
): BacklogEntry[] {
  const normalized = affectedFiles.map((f) => f.replace(/\\/g, "/").toLowerCase().trim());

  return entries.filter((entry) => {
    const entryPath = entry.filePath.replace(/\\/g, "/").toLowerCase().trim();
    return normalized.some((af) => entryPath === af || entryPath.startsWith(`${af}/`));
  });
}

/**
 * Mark a backlog entry as resolved.
 * Returns the updated entry, or null if the ID was not found.
 * @internal
 */
export function resolveEntry(
  entries: BacklogEntry[],
  entryId: string,
  resolvedBy: string,
  resolvedDate: string,
): BacklogEntry | null {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;

  entry.resolved = true;
  entry.resolvedBy = resolvedBy;
  entry.resolvedDate = resolvedDate;
  return entry;
}
