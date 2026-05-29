export function findFrontmatterRange(lines) {
    if (lines.length === 0)
        return null;
    // First line must be --- (with optional BOM)
    const first = lines[0].replace(/^﻿/, "");
    if (first.trim() !== "---")
        return null;
    // Find second standalone ---
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
            return { start: 0, end: i };
        }
    }
    return null;
}
export function parseDiffHunks(diff) {
    const hunks = [];
    const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
    let match = hunkRe.exec(diff);
    while (match !== null) {
        hunks.push({
            oldStart: Number.parseInt(match[1], 10),
            oldCount: match[2] ? Number.parseInt(match[2], 10) : 1,
            newStart: Number.parseInt(match[3], 10),
            newCount: match[4] ? Number.parseInt(match[4], 10) : 1,
        });
        match = hunkRe.exec(diff);
    }
    return hunks;
}
export function isFrontmatterOnlyChange(fileContent, diff) {
    const lines = fileContent.split("\n");
    const fmRange = findFrontmatterRange(lines);
    if (!fmRange)
        return false;
    const hunks = parseDiffHunks(diff);
    if (hunks.length === 0)
        return true; // No diff = no body change
    for (const hunk of hunks) {
        // Check if hunk range overlaps with body (lines after frontmatter)
        const hunkStart = hunk.newStart;
        const hunkEnd = hunk.newStart + hunk.newCount - 1;
        // Frontmatter is 0-indexed in fmRange, but diff is 1-indexed
        const fmEndLine = fmRange.end + 1; // Convert to 1-indexed
        if (hunkStart > fmEndLine) {
            // Hunk is entirely in body
            return false;
        }
        if (hunkEnd > fmEndLine) {
            // Hunk spans frontmatter and body
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=updated-auditor.js.map