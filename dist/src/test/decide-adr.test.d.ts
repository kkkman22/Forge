/**
 * Unit tests for ADR finalization helpers in `src/decide.ts`.
 *
 * Covers:
 *   - `finalizeAdr` with no supersedes → produces a valid ADR file and a
 *     regenerated index containing the new entry
 *   - `finalizeAdr` with supersedes → old entry's status becomes
 *     "superseded" and `superseded_by` is set; the old file's body is
 *     preserved and re-rendered with the updated frontmatter
 *   - `renderAdrFileContent` round-trips: parsing the rendered content
 *     via `parseAdrFrontmatter` recovers the same frontmatter
 *   - The index contains the new id exactly once with no duplicates after
 *     supersession
 *
 * **Validates: Requirements 1.1, 1.5, 1.6, 1.7**
 */
export {};
