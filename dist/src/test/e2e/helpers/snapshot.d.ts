/**
 * Assert that the git log in `cwd` contains messages matching all provided regex patterns.
 * Checks messages in order from newest to oldest.
 */
export declare function assertGitLog(cwd: string, patterns: RegExp[]): void;
/**
 * Assert that a file exists at the given path and contains the expected content (optional).
 */
export declare function assertFileExists(path: string, contentPattern?: RegExp): void;
/**
 * Get the current git status as a string (for snapshot-style assertions).
 */
export declare function getGitStatus(cwd: string): string;
/**
 * Assert the working tree is clean (no uncommitted changes).
 */
export declare function assertWorkingTreeClean(cwd: string): void;
