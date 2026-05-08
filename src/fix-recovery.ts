/**
 * Fix recovery — scan git history to recover fix tracking state.
 *
 * **Validates: Requirements 11.1, 11.3**
 */

/** @public */
export interface RecoveryCandidate {
  commitHash: string;
  commitMessage: string;
  commitDate: string;
  modifiedFiles: string[];
  matchesLineRange: boolean;
}

/** @public */
export interface RecoveryResult {
  findingId: string;
  candidates: RecoveryCandidate[];
  hasCandidate: boolean;
}

/** @public */
export function isFixCandidate(
  commitFiles: string[],
  commitLineRanges: Map<string, [number, number][]>,
  findingFilePath: string,
  findingLineNumber: number,
  lineTolerance = 10,
): boolean {
  if (!commitFiles.includes(findingFilePath)) return false;

  const ranges = commitLineRanges.get(findingFilePath);
  if (!ranges) return false;

  for (const [start, end] of ranges) {
    const overlapStart = Math.max(start, findingLineNumber - lineTolerance);
    const overlapEnd = Math.min(end, findingLineNumber + lineTolerance);
    if (overlapStart <= overlapEnd) return true;
  }

  return false;
}

/** @public */
export function parseGitLog(
  gitLogOutput: string,
): Array<{ hash: string; message: string; date: string; files: string[] }> {
  if (!gitLogOutput.trim()) return [];

  const commits: Array<{ hash: string; message: string; date: string; files: string[] }> = [];
  const lines = gitLogOutput.split("\n");

  let i = 0;
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^([a-f0-9]{40})\|(.+?)\|(.+)$/);
    if (headerMatch) {
      const hash = headerMatch[1];
      const message = headerMatch[2];
      const date = headerMatch[3];
      const files: string[] = [];

      i++;
      while (i < lines.length && !lines[i].match(/^[a-f0-9]{40}\|/)) {
        const trimmed = lines[i].trim();
        if (trimmed) files.push(trimmed);
        i++;
      }

      commits.push({ hash, message, date, files });
    } else {
      i++;
    }
  }

  return commits;
}
