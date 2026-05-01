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

/** Regex matching key output lines (test results, errors, warnings, coverage). */
const KEY_LINE_PATTERN = /pass|fail|error|warn|coverage|✓|✗|PASS|FAIL|\d+ tests?/i;

/** Maximum number of key lines to include in trimmed output. */
const MAX_KEY_LINES = 15;

/** Line count threshold: outputs with more lines than this get trimmed. */
const TRIM_THRESHOLD = 30;

/** Number of trailing lines to always include in trimmed output. */
const TAIL_LINES = 5;

/**
 * Trim command output based on exit code and line count.
 *
 * @param stdout - Standard output from the command
 * @param stderr - Standard error from the command
 * @param exitCode - Process exit code
 * @returns Trimmed or full output string
 */
export function trimCommandOutput(stdout: string, stderr: string, exitCode: number): string {
  // Failure: return complete output (Forge iron rule)
  if (exitCode !== 0) {
    return stderr ? `${stdout}\n\nSTDERR:\n${stderr}` : stdout;
  }

  const lines = stdout.split("\n");

  // Small output: return directly
  if (lines.length <= TRIM_THRESHOLD) return stdout;

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
