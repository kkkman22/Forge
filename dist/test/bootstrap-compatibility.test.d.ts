/**
 * Tests for bootstrap-check.mjs Claude version diagnostic integration.
 *
 * Validates Requirements 1.3, 1.4, 1.7:
 * - Low version → diagnostic containing current and minimum versions
 * - Unparseable → no version diagnostic (fail-open)
 * - High version with max → soft warn with "forge-doctor"
 */
export {};
