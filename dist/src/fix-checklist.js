/**
 * Fix checklist — track P0/P1 findings through the review-fix-ship cycle.
 *
 * **Validates: Requirements 10.1–10.5**
 */
export const VALID_TRANSITIONS = {
    unfixed: ["in-progress"],
    "in-progress": ["fixed", "unfixed"],
    fixed: ["verified", "unfixed"],
    verified: ["unfixed"],
};
export function isValidTransition(current, next) {
    return VALID_TRANSITIONS[current].includes(next);
}
function assertP0P1(s) {
    if (s !== "P0" && s !== "P1")
        throw new Error(`Invalid severity: ${s}`);
    return s;
}
export function createChecklist(findings) {
    return findings
        .filter((f) => f.severity === "P0" || f.severity === "P1")
        .map((f, i) => ({
        findingId: `F-${String(i + 1).padStart(3, "0")}`,
        severity: assertP0P1(f.severity),
        filePath: f.filePath,
        lineNumber: f.lineNumber,
        description: f.description,
        status: "unfixed",
    }));
}
export function updateEntryStatus(entry, newStatus, fixCommit) {
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
export function allEntriesVerified(entries) {
    return entries.length > 0 && entries.every((e) => e.status === "verified");
}
export function serializeChecklist(entries, topic, createdAt) {
    const p0Count = entries.filter((e) => e.severity === "P0").length;
    const p1Count = entries.filter((e) => e.severity === "P1").length;
    const allVerified = allEntriesVerified(entries);
    const lines = [
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
        lines.push(`| ${entry.findingId} | ${entry.severity} | ${entry.filePath}:${entry.lineNumber} | ${safeDesc} | ${entry.status} | ${entry.fixCommit ?? "—"} |`);
    }
    return lines.join("\n");
}
export function parseChecklist(content) {
    const entries = [];
    const lines = content.split("\n");
    for (const line of lines) {
        const m = line.match(/^\| (F-\d+) \| (P[01]) \| ([^|]+?):(\d+) \| ([^|]+) \| (\S+) \| (.+) \|$/);
        if (m) {
            const lineNumber = Number.parseInt(m[4], 10);
            if (!Number.isFinite(lineNumber))
                continue;
            const status = m[6];
            if (!(status in VALID_TRANSITIONS))
                continue;
            entries.push({
                findingId: m[1],
                severity: m[2],
                filePath: m[3],
                lineNumber,
                description: m[5].replace(/&#124;/g, "|"),
                status: status,
                fixCommit: m[7] === "—" ? undefined : m[7],
            });
        }
    }
    return entries;
}
//# sourceMappingURL=fix-checklist.js.map