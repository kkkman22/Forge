export interface TempRepo {
    cwd: string;
    cleanup: () => void;
}
/**
 * Create a temporary git repo with a forge skeleton.
 * The repo is cleaned up automatically when `cleanup()` is called.
 */
export declare function createTempRepo(seed?: string): TempRepo;
/**
 * Get the current HEAD commit SHA from a git repo.
 */
export declare function getHeadSha(cwd: string): string;
/**
 * Get the git log as an array of { sha, message } entries.
 */
export declare function getGitLog(cwd: string): Array<{
    sha: string;
    message: string;
}>;
