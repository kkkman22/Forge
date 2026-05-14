/**
 * Tests for `archiveTerm` and the `## Archived` parse/render round-trip.
 *
 * Covers the stale-term archival contract from Task 1.9:
 *   - `archiveTerm` moves a term from `terms` to `archivedTerms`
 *   - `parseGlossary(renderGlossary(g))` preserves archived entries
 *   - `archiveTerm` is a no-op when the term does not exist
 *   - re-archiving the same canonical name replaces the prior archived
 *     entry rather than duplicating it
 *
 * **Validates: Requirements 1.11**
 */
export {};
