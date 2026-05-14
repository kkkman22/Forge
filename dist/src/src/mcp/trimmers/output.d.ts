/**
 * Output trimmer for forge_exec command results.
 *
 * Trimming strategy:
 *   - Non-zero exit code → full output (Forge iron rule: failure output is never compressed)
 *   - Exit 0 + ≤30 lines → full output
 *   - Exit 0 + >30 lines → key line extraction + last 5 lines + stats
 *
 * **Validates: Requirements 2.3, 2.4, 2.5**
 */
/**
 * Trim command output based on exit code and line count.
 *
 * @param stdout - Standard output from the command
 * @param stderr - Standard error from the command
 * @param exitCode - Process exit code
 * @returns Trimmed or full output string
 */
export declare function trimCommandOutput(stdout: string, stderr: string, exitCode: number): string;
