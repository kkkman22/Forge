/**
 * Git output parsers for forge_git tool.
 *
 * Parses raw `git diff --stat` and `git status --porcelain` output into
 * structured summaries compatible with the serialization formats in
 * `context-budget.ts` (serializeGitDiff / serializeGitStatus).
 *
 * **Validates: Requirements 3.2, 3.3**
 */
/** Maximum files listed per status category. */
const MAX_FILES_PER_CATEGORY = 10;
/**
 * Parse `git diff --stat` output into a GitDiffSummary.
 *
 * Example input:
 *   src/foo.ts | 12 ++++++------
 *   src/bar.ts |  3 +++
 *   2 files changed, 9 insertions(+), 6 deletions(-)
 *
 * @param output - Raw stdout from `git diff --stat`
 * @returns Structured diff summary
 */
export function parseDiffStat(output) {
    const result = {
        fileCount: 0,
        files: [],
        totalAdded: 0,
        totalRemoved: 0,
        fullDiffPath: null,
    };
    if (!output.trim())
        return result;
    const lines = output.trim().split("\n");
    for (const line of lines) {
        // Match the summary line: "N file(s) changed, N insertion(s)(+), N deletion(s)(-)"
        const summaryMatch = line.match(/^\s*(\d+) files? changed(?:,\s*(\d+) insertions?\(\+\))?(?:,\s*(\d+) deletions?\(-\))?/);
        if (summaryMatch) {
            result.fileCount = Number.parseInt(summaryMatch[1], 10);
            result.totalAdded = summaryMatch[2] ? Number.parseInt(summaryMatch[2], 10) : 0;
            result.totalRemoved = summaryMatch[3] ? Number.parseInt(summaryMatch[3], 10) : 0;
            continue;
        }
        // Match per-file stat lines: " path/to/file | N +++---" or " path | Bin 0 -> 123 bytes"
        const fileMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+(\+*)(-*)/);
        if (fileMatch) {
            const filePath = fileMatch[1].trim();
            const added = fileMatch[3].length;
            const removed = fileMatch[4].length;
            result.files.push({ filePath, added, removed });
            continue;
        }
        // Binary file changes: " path | Bin 0 -> 123 bytes"
        const binMatch = line.match(/^\s*(.+?)\s+\|\s+Bin/);
        if (binMatch) {
            result.files.push({ filePath: binMatch[1].trim(), added: 0, removed: 0 });
        }
    }
    // If no summary line was found, derive fileCount from parsed files
    if (result.fileCount === 0 && result.files.length > 0) {
        result.fileCount = result.files.length;
    }
    return result;
}
/**
 * Parse `git status --porcelain` output into a GitStatusSummary.
 *
 * Porcelain format: XY filename
 *   X = index status, Y = worktree status
 *   ?? = untracked
 *   A/M/D/R in X position = staged
 *   M/D in Y position = modified (unstaged)
 *
 * @param output - Raw stdout from `git status --porcelain`
 * @returns Structured status summary
 */
export function parseStatusPorcelain(output) {
    const staged = [];
    const modified = [];
    const untracked = [];
    if (!output.trim()) {
        return {
            staged: { count: 0, files: [] },
            modified: { count: 0, files: [] },
            untracked: { count: 0, files: [] },
        };
    }
    // Do NOT trim individual lines — leading spaces are significant in porcelain format
    const lines = output.split("\n").filter((l) => l.length >= 3);
    for (const line of lines) {
        const x = line[0]; // index (staged) status
        const y = line[1]; // worktree status
        // Handle rename format: "R  old -> new" — extract the filename after " -> " or just the path
        const rawPath = line.slice(3);
        const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ")[1] : rawPath;
        // Untracked
        if (x === "?" && y === "?") {
            untracked.push(filePath);
            continue;
        }
        // Staged changes (index has A, M, D, R, C)
        if (x !== " " && x !== "?") {
            staged.push(filePath);
        }
        // Unstaged modifications (worktree has M, D)
        if (y !== " " && y !== "?") {
            modified.push(filePath);
        }
    }
    return {
        staged: {
            count: staged.length,
            files: staged.slice(0, MAX_FILES_PER_CATEGORY),
        },
        modified: {
            count: modified.length,
            files: modified.slice(0, MAX_FILES_PER_CATEGORY),
        },
        untracked: {
            count: untracked.length,
            files: untracked.slice(0, MAX_FILES_PER_CATEGORY),
        },
    };
}
//# sourceMappingURL=git.js.map