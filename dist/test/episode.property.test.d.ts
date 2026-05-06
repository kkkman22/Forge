/**
 * Property-based and unit tests for the Episode data model.
 *
 * Covers:
 *   - Round-trip: `parseEpisode(renderEpisode(e))` ≡ `e` for any
 *     well-formed v2 episode
 *   - `generateEpisodeId` is idempotent and deterministic
 *   - Legacy (v1) parsing defaults fill sensibly
 *   - Structural validation rejects obviously broken v2 frontmatter
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.12**
 */
export {};
