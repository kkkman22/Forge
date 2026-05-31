/**
 * Output trimmer for forge_exec command results.
 *
 * Compression strategy:
 *   - Non-zero exit code → full output (Forge iron rule: failure output is never compressed)
 *   - Exit 0 + RTK available → RTK intelligent compression
 *   - Exit 0 + RTK unavailable → key line extraction fallback (trimCommandOutput)
 *
 * **Validates: Requirements 2.3, 2.4, 2.5**
 */
/**
 * Check if the RTK (Rust Token Killer) binary is available in PATH.
 * Result is cached for the process lifetime.
 */
export declare function isRtkAvailable(): Promise<boolean>;
/**
 * Trim command output based on exit code and line count.
 *
 * Fallback compression engine when RTK is unavailable.
 *
 * @param stdout - Standard output from the command
 * @param stderr - Standard error from the command
 * @param exitCode - Process exit code
 * @returns Trimmed or full output string
 */
export declare function trimCommandOutput(stdout: string, stderr: string, exitCode: number): string;
/**
 * Trim command output with RTK-first, fallback-to-legacy strategy.
 *
 * Compression ladder:
 *   1. Non-zero exit → full output (Iron Law, always)
 *   2. Short output (≤30 lines) → return as-is
 *   3. RTK available → RTK compression (intelligent noise removal)
 *   4. RTK unavailable / failed → trimCommandOutput fallback
 *
 * @param stdout - Standard output from the command
 * @param stderr - Standard error from the command
 * @param exitCode - Process exit code
 * @param rtkAvailable - Whether RTK binary was detected in PATH
 * @returns Trimmed or full output string
 */
export declare function trimWithFallback(stdout: string, stderr: string, exitCode: number, rtkAvailable: boolean): Promise<string>;
