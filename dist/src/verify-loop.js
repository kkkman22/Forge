/**
 * Ralph Loop verification cycle module.
 *
 * Implements the autonomous quality loop pattern: after a Build Subagent
 * completes, verification commands are run automatically. On failure the
 * agent is asked to fix rather than immediately rolling back. A bounded
 * retry counter (`verifyAttempts`) prevents infinite loops.
 *
 * All functions in this module are **pure** — no I/O or side-effects.
 * Actual command execution is delegated to the effect executor.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
 */
import { extractListField, extractNumericField, parseFrontmatter } from "./frontmatter.js";
// ---------------------------------------------------------------------------
// Constants (defaults)
// ---------------------------------------------------------------------------
/** Default timeout per verification command in milliseconds. */
const DEFAULT_TIMEOUT_MS = 120_000; // 120 seconds
/** Default maximum verification attempts before soft failure. */
const DEFAULT_MAX_ATTEMPTS = 3;
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse verification configuration from config.md frontmatter content.
 *
 * Extracts `verify_commands`, `verify_timeout`, and `verify_max_attempts`
 * from the YAML frontmatter. Missing fields fall back to defaults.
 *
 * @param frontmatterContent - The full content of config.md (with frontmatter delimiters).
 * @returns Parsed VerifyConfig.
 */
export function parseVerifyConfig(frontmatterContent) {
    const parsed = parseFrontmatter(frontmatterContent);
    const raw = parsed?.raw ?? "";
    const commands = extractListField(raw, "verify_commands");
    const timeoutSeconds = extractNumericField(raw, "verify_timeout");
    const timeoutMs = timeoutSeconds !== null && timeoutSeconds > 0 ? timeoutSeconds * 1000 : DEFAULT_TIMEOUT_MS;
    const maxAttempts = extractNumericField(raw, "verify_max_attempts");
    const resolvedMaxAttempts = maxAttempts !== null && maxAttempts > 0 ? maxAttempts : DEFAULT_MAX_ATTEMPTS;
    return {
        commands,
        timeoutMs,
        maxAttempts: resolvedMaxAttempts,
    };
}
/**
 * Determine the result of a verification step.
 *
 * This is a pure function that constructs a `VerifyResult` from the given
 * parameters. Actual command execution is handled externally.
 *
 * @param _config - The verification configuration.
 * @param attempt - The current attempt number (1-based).
 * @param failedCommand - The command that failed, or undefined if all passed.
 * @param error - Error message from the failed command, or undefined.
 * @returns A VerifyResult describing the outcome.
 */
export function runVerifyStep(_config, attempt, failedCommand, error) {
    if (failedCommand) {
        return {
            passed: false,
            failedCommand,
            error,
            attempt,
        };
    }
    return {
        passed: true,
        attempt,
    };
}
/**
 * Determine whether the verify loop should retry after a failed result.
 *
 * Returns `true` when the result indicates failure and the attempt count
 * has not yet reached the configured maximum.
 *
 * @param result - The result of the most recent verification step.
 * @param config - The verification configuration.
 * @returns Whether to retry verification.
 */
export function shouldRetryVerify(result, config) {
    return !result.passed && result.attempt < config.maxAttempts;
}
/**
 * Advance the verify loop state machine.
 *
 * Given the current attempt number and whether verification passed,
 * returns the next action:
 * - `"commit"` when verification passed (counter resets).
 * - `"retry"` when verification failed but attempts remain.
 * - `"soft_failure"` when verification failed and max attempts reached.
 *
 * @param currentAttempt - The current attempt number (1-based).
 * @param passed - Whether the verification step passed.
 * @param maxAttempts - The configured maximum number of attempts.
 * @returns The next action for the verify loop.
 */
export function advanceVerifyLoop(currentAttempt, passed, maxAttempts) {
    if (passed) {
        return { action: "commit" };
    }
    if (currentAttempt < maxAttempts) {
        return { action: "retry", attempt: currentAttempt + 1 };
    }
    return { action: "soft_failure" };
}
//# sourceMappingURL=verify-loop.js.map