/**
 * Fix recovery — scan git history to recover fix tracking state.
 *
 * **Validates: Requirements 11.1, 11.3**
 */
export function isFixCandidate(commitFiles, commitLineRanges, findingFilePath, findingLineNumber, lineTolerance = 10) {
    if (!commitFiles.includes(findingFilePath))
        return false;
    const ranges = commitLineRanges.get(findingFilePath);
    if (!ranges)
        return false;
    for (const [start, end] of ranges) {
        const overlapStart = Math.max(start, findingLineNumber - lineTolerance);
        const overlapEnd = Math.min(end, findingLineNumber + lineTolerance);
        if (overlapStart <= overlapEnd)
            return true;
    }
    return false;
}
export function parseGitLog(gitLogOutput) {
    if (!gitLogOutput.trim())
        return [];
    const commits = [];
    const lines = gitLogOutput.split("\n");
    let i = 0;
    while (i < lines.length) {
        const headerMatch = lines[i].match(/^([a-f0-9]{40})\|(.+?)\|(.+)$/);
        if (headerMatch) {
            const hash = headerMatch[1];
            const message = headerMatch[2];
            const date = headerMatch[3];
            const files = [];
            i++;
            while (i < lines.length && !lines[i].match(/^[a-f0-9]{40}\|/)) {
                const trimmed = lines[i].trim();
                if (trimmed)
                    files.push(trimmed);
                i++;
            }
            commits.push({ hash, message, date, files });
        }
        else {
            i++;
        }
    }
    return commits;
}
//# sourceMappingURL=fix-recovery.js.map