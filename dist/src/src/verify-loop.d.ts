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
/** Configuration for the Ralph Loop verification cycle. */
export interface VerifyConfig {
    /** Shell commands to run for verification (e.g. lint, typecheck, test). */
    commands: string[];
    /** Timeout per command in milliseconds. */
    timeoutMs: number;
    /** Maximum number of verification attempts before triggering soft failure. */
    maxAttempts: number;
}
/** Result of a single verification step. */
export interface VerifyResult {
    /** Whether all verification commands passed. */
    passed: boolean;
    /** The command that failed (if any). */
    failedCommand?: string;
    /** Error message from the failed command (if any). */
    error?: string;
    /** The attempt number (1-based). */
    attempt: number;
}
/** Decision produced by the verify loop state machine. */
export type VerifyLoopDecision = {
    action: "commit";
} | {
    action: "retry";
    attempt: number;
} | {
    action: "soft_failure";
};
/**
 * Parse verification configuration from config.md frontmatter content.
 *
 * Extracts `verify_commands`, `verify_timeout`, and `verify_max_attempts`
 * from the YAML frontmatter. Missing fields fall back to defaults.
 *
 * @param frontmatterContent - The full content of config.md (with frontmatter delimiters).
 * @returns Parsed VerifyConfig.
 */
export declare function parseVerifyConfig(frontmatterContent: string): VerifyConfig;
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
export declare function runVerifyStep(_config: VerifyConfig, attempt: number, failedCommand?: string, error?: string): VerifyResult;
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
export declare function shouldRetryVerify(result: VerifyResult, config: VerifyConfig): boolean;
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
export declare function advanceVerifyLoop(currentAttempt: number, passed: boolean, maxAttempts: number): VerifyLoopDecision;
