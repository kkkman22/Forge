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
export declare function isFixCandidate(commitFiles: string[], commitLineRanges: Map<string, [number, number][]>, findingFilePath: string, findingLineNumber: number, lineTolerance?: number): boolean;
/** @public */
export declare function parseGitLog(gitLogOutput: string): Array<{
    hash: string;
    message: string;
    date: string;
    files: string[];
}>;
