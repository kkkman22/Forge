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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Regex matching key output lines (test results, errors, warnings, coverage). */
const KEY_LINE_PATTERN = /pass|fail|error|warn|coverage|✓|✗|PASS|FAIL|\d+ tests?/i;
/** Maximum number of key lines to include in trimmed output. */
const MAX_KEY_LINES = 15;
/** Line count threshold: outputs with more lines than this get trimmed. */
const TRIM_THRESHOLD = 30;
/** Number of trailing lines to always include in trimmed output. */
const TAIL_LINES = 5;
// ---------------------------------------------------------------------------
// Iron Law helper
// ---------------------------------------------------------------------------
/**
 * Format failure output — Iron Law: never compressed, always complete.
 *
 * Exported so the Iron Law behavior can be unit-tested independently of
 * trimCommandOutput's success-path logic.
 */
export function formatFailureOutput(stdout, stderr) {
    return stderr ? `${stdout}\n\nSTDERR:\n${stderr}` : stdout;
}
// ---------------------------------------------------------------------------
// Trimmer
// ---------------------------------------------------------------------------
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
export function trimCommandOutput(stdout, stderr, exitCode) {
    // Failure: return complete output (Forge iron rule)
    if (exitCode !== 0) {
        return formatFailureOutput(stdout, stderr);
    }
    const lines = stdout.split("\n");
    // Small output: return directly
    if (lines.length <= TRIM_THRESHOLD)
        return stdout;
    // Large output: extract key lines + stats
    const keyLines = lines.filter((l) => KEY_LINE_PATTERN.test(l));
    return [
        `✅ exit:0 | ${lines.length} lines`,
        "--- key lines ---",
        ...keyLines.slice(0, MAX_KEY_LINES),
        "--- last 5 lines ---",
        ...lines.slice(-TAIL_LINES),
    ].join("\n");
}
//# sourceMappingURL=output.js.map