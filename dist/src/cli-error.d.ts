/**
 * Unified CLI error type for precondition failures.
 *
 * Replaces scattered `process.exit(1)` calls in CLI entry points with a
 * throwable error that carries an exit code. The top-level `main().catch()`
 * handler becomes the single exit point, making resource cleanup reliable
 * and extensible.
 *
 * **Validates: Requirements 7.1, 7.2, 7.4**
 */
export declare class CliError extends Error {
    readonly exitCode: number;
    constructor(message: string, exitCode?: number);
}
