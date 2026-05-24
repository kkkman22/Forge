/**
 * Context overflow detection and recovery utilities.
 *
 * Provides helpers for detecting when an agent iteration hits the model's
 * context window limit and triggering recovery (notes compaction + retry).
 */
/**
 * Determine whether an error was caused by the model's context window limit.
 *
 * @param error - The thrown value to inspect.
 * @returns True when the error message matches a known context overflow pattern.
 */
export declare function isContextOverflowError(error: unknown): boolean;
