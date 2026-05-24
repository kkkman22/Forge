/**
 * Tests for `proposeStaleTerms` in `src/learn.ts`.
 *
 * `proposeStaleTerms` is the learn-level helper that surfaces stale active
 * glossary terms to the user before archival. Covers:
 *   - Stale term detection wraps `findStaleterms` with the default window
 *     (30 days)
 *   - The prompt is non-empty when there is at least one stale term and
 *     lists each term's canonical name
 *   - The prompt is empty when no terms are stale
 *   - Archived terms are never re-proposed
 *
 * **Validates: Requirements 1.11**
 */
export {};
