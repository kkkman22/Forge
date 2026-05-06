/**
 * Backlog Manager — captures unfixed P2/P3 findings for future work cycles.
 *
 * **Validates: Requirements 6.1–6.6**
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BACKLOG_HEADER = `# Forge Backlog

> P2/P3 findings not addressed in the current release cycle.
> Captured automatically by \`/forge ship\`. Surfaced during \`/forge plan\` when file paths overlap.

`;
// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------
function buildEntryId(entry) {
    const normalizedPath = entry.filePath.replace(/\\/g, "/").toLowerCase().trim();
    const normalizedDesc = entry.description.trim().toLowerCase().slice(0, 80);
    return `${normalizedPath}:${entry.lineNumber}:${normalizedDesc}`;
}
export function serializeBacklog(backlog) {
    const lines = [BACKLOG_HEADER];
    const unresolved = backlog.entries.filter((e) => !e.resolved);
    const resolved = backlog.entries.filter((e) => e.resolved);
    if (unresolved.length === 0 && resolved.length === 0) {
        lines.push("*No entries.*\n");
        return lines.join("\n");
    }
    if (unresolved.length > 0) {
        lines.push("## Unresolved\n");
        for (const entry of unresolved) {
            lines.push(serializeEntry(entry));
        }
    }
    if (resolved.length > 0) {
        lines.push("## Resolved\n");
        for (const entry of resolved) {
            lines.push(serializeEntry(entry));
        }
    }
    return lines.join("\n");
}
function serializeEntry(entry) {
    const base = `- **${entry.severity}** | ${entry.filePath}:${entry.lineNumber} | ${entry.description}`;
    const meta = `  - Suggestion: ${entry.suggestion}`;
    const origin = `  - Origin: ${entry.originatingTask} (${entry.capturedAt}) · Review: ${entry.reviewRef}`;
    if (entry.resolved) {
        const resolved = `  - Resolved: ${entry.resolvedByTask} (${entry.resolvedAt})`;
        return [base, meta, origin, resolved].join("\n");
    }
    return [base, meta, origin].join("\n");
}
export function deserializeBacklog(content) {
    const entries = [];
    const lines = content.split("\n");
    let currentEntry = null;
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith("- **")) {
            if (currentEntry) {
                pushIfValid(entries, currentEntry);
            }
            currentEntry = parseEntryLine(line);
        }
        else if (line.startsWith("- Suggestion:") && currentEntry) {
            currentEntry.suggestion = line.slice("- Suggestion:".length).trim();
        }
        else if (line.startsWith("- Origin:") && currentEntry) {
            const originMatch = line.match(/- Origin:\s*(.+?)\s*\(([^)]+)\)\s*·\s*Review:\s*(.+)/);
            if (originMatch) {
                currentEntry.originatingTask = originMatch[1].trim();
                currentEntry.capturedAt = originMatch[2].trim();
                currentEntry.reviewRef = originMatch[3].trim();
            }
        }
        else if (line.startsWith("- Resolved:") && currentEntry) {
            const resolvedMatch = line.match(/- Resolved:\s*(.+?)\s*\(([^)]+)\)/);
            if (resolvedMatch) {
                currentEntry.resolved = true;
                currentEntry.resolvedByTask = resolvedMatch[1].trim();
                currentEntry.resolvedAt = resolvedMatch[2].trim();
            }
        }
    }
    if (currentEntry) {
        pushIfValid(entries, currentEntry);
    }
    return { entries };
}
function parseEntryLine(line) {
    const match = line.match(/- \*\*(P2|P3)\*\* \|\s*(.+?):(\d+)\s*\|\s*(.+)/);
    if (!match) {
        return {};
    }
    return {
        severity: match[1],
        filePath: match[2].trim(),
        lineNumber: parseInt(match[3], 10),
        description: match[4].trim(),
        resolved: false,
    };
}
function pushIfValid(entries, partial) {
    if (partial.severity &&
        partial.filePath &&
        partial.lineNumber !== undefined &&
        partial.description &&
        partial.capturedAt &&
        partial.originatingTask &&
        partial.reviewRef) {
        const entry = partial;
        entry.id = buildEntryId(entry);
        entries.push(entry);
    }
}
// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------
export function readBacklog(backlogPath) {
    if (!existsSync(backlogPath)) {
        return { entries: [] };
    }
    try {
        const content = readFileSync(backlogPath, "utf-8");
        return deserializeBacklog(content);
    }
    catch {
        return { entries: [] };
    }
}
export function writeBacklog(backlogPath, backlog) {
    const content = serializeBacklog(backlog);
    writeFileSync(backlogPath, content, "utf-8");
}
// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------
/**
 * Append P2/P3 findings to the backlog, skipping duplicates.
 *
 * @param backlogPath — path to `.forge/backlog.md`
 * @param findings — review findings to capture (only P2/P3 are retained)
 * @param originatingTask — name of the current task
 * @param reviewRef — reference to the review report file
 * @returns number of newly added entries
 */
export function captureFindings(backlogPath, findings, originatingTask, reviewRef) {
    const backlog = readBacklog(backlogPath);
    const existingIds = new Set(backlog.entries.map((e) => e.id));
    let added = 0;
    const now = new Date().toISOString().slice(0, 10);
    for (const finding of findings) {
        if (finding.severity !== "P2" && finding.severity !== "P3") {
            continue;
        }
        const entry = {
            id: buildEntryId(finding),
            severity: finding.severity,
            filePath: finding.filePath,
            lineNumber: finding.lineNumber,
            description: finding.description,
            suggestion: finding.suggestion,
            capturedAt: now,
            originatingTask,
            reviewRef,
            resolved: false,
        };
        if (!existingIds.has(entry.id)) {
            backlog.entries.push(entry);
            existingIds.add(entry.id);
            added++;
        }
    }
    if (added > 0) {
        writeBacklog(backlogPath, backlog);
    }
    return added;
}
/**
 * Find backlog entries whose file paths overlap with the given file paths.
 * Used during `/forge plan` to surface relevant historical findings.
 *
 * @param backlogPath — path to `.forge/backlog.md`
 * @param affectedFiles — list of file paths from the new plan
 * @returns matching unresolved entries
 */
export function findOverlappingEntries(backlogPath, affectedFiles) {
    const backlog = readBacklog(backlogPath);
    const normalizedAffected = affectedFiles.map((f) => f.replace(/\\/g, "/").toLowerCase().trim());
    return backlog.entries.filter((entry) => {
        if (entry.resolved)
            return false;
        const normalizedEntry = entry.filePath.replace(/\\/g, "/").toLowerCase().trim();
        return normalizedAffected.some((af) => normalizedEntry === af || normalizedEntry.startsWith(af + "/"));
    });
}
/**
 * Mark backlog entries as resolved.
 *
 * @param backlogPath — path to `.forge/backlog.md`
 * @param entryIds — IDs of entries to mark resolved
 * @param resolvingTask — name of the task that resolved them
 * @returns number of entries marked resolved
 */
export function markResolved(backlogPath, entryIds, resolvingTask) {
    const backlog = readBacklog(backlogPath);
    const idSet = new Set(entryIds);
    let marked = 0;
    const now = new Date().toISOString().slice(0, 10);
    for (const entry of backlog.entries) {
        if (idSet.has(entry.id) && !entry.resolved) {
            entry.resolved = true;
            entry.resolvedByTask = resolvingTask;
            entry.resolvedAt = now;
            marked++;
        }
    }
    if (marked > 0) {
        writeBacklog(backlogPath, backlog);
    }
    return marked;
}
//# sourceMappingURL=backlog.js.map