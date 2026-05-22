/**
 * Context overflow detection and recovery utilities.
 *
 * Provides helpers for detecting when an agent iteration hits the model's
 * context window limit and triggering recovery (notes compaction + retry).
 */

// ---------------------------------------------------------------------------
// Error detection
// ---------------------------------------------------------------------------

/** Regex patterns that indicate a context window overflow error. */
const CONTEXT_OVERFLOW_PATTERNS = /context.window.limit|context_window_limit|maxTokens.*exceed/i;

/**
 * Determine whether an error was caused by the model's context window limit.
 *
 * @param error - The thrown value to inspect.
 * @returns True when the error message matches a known context overflow pattern.
 */
export function isContextOverflowError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return CONTEXT_OVERFLOW_PATTERNS.test(msg);
}
