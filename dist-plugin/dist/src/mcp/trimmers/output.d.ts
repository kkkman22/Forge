/**
 * Output trimmer for forge_exec command results.
 *
 * Compression strategy:
 *   - Non-zero exit code → full output (Forge iron rule: failure output is never compressed)
 *   - Exit 0 + ≤30 lines → full output
 *   - Exit 0 + >30 lines → key line extraction (trimCommandOutput)
 *
 * Forge no longer ships a compression engine (RTK integration removed); compression
 * of successful large outputs is delegated to Headroom's HTTP-layer proxy when the
 * user runs `headroom wrap claude`. This trimmer remains as a fallback for the
 * Headroom-absent path (direct API connection).
 */
/**
 * Format failure output — Iron Law: never compressed, always complete.
 *
 * Exported so the Iron Law behavior can be unit-tested independently of
 * trimCommandOutput's success-path logic.
 */
export declare function formatFailureOutput(stdout: string, stderr: string): string;
/**
 * Trim command output based on exit code and line count.
 *
 * Fallback compression for Headroom-absent environments. When the user runs
 * `headroom wrap claude`, successful large outputs pass through unchanged here
 * and are compressed at the HTTP layer by Headroom's `router:tool_result:text`
 * (failed outputs are further protected by Headroom's `router:protected:error_output`,
 * which zero-compresses them in practice).
 *
 * @param stdout - Standard output from the command
 * @param stderr - Standard error from the command
 * @param exitCode - Process exit code
 * @returns Trimmed or full output string
 */
export declare function trimCommandOutput(stdout: string, stderr: string, exitCode: number): string;
