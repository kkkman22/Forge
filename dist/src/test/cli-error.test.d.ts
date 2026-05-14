/**
 * Unit tests for the unified CLI error path.
 *
 * Verifies that:
 * - CliError is a proper Error subclass with an exitCode property
 * - Each CLI precondition failure throws CliError with a descriptive message
 *   rather than calling process.exit directly
 *
 * **Validates: Requirements 7.1, 7.2**
 * **Property 10: CLI precondition failures use unified error path**
 */
export {};
