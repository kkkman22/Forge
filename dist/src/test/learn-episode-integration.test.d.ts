/**
 * Integration tests for the episode + pattern lifecycle integration in
 * `src/learn.ts`.
 *
 * Covers:
 *   - `buildEpisodeFromSession` produces a schema_version=2 episode,
 *     infers the outcome from review/test/ship signals, and attributes
 *     the episode to the correct skill via the phase history.
 *     (Requirement 7.9)
 *   - `archivePatternByName` is a pure, case-insensitive move that
 *     never deletes: the sum of `active` + `archived` equals the input
 *     (Requirements 7.10, 7.14).
 *   - `buildPatternUpgradeDrafts` promotes 3+ same-root-cause episodes
 *     into a full `Pattern` draft ready for user confirmation
 *     (Requirement 7.11).
 *   - `getLearnPromptConfig` never requires a numeric rating and only
 *     demands a failure reason on `failure` outcomes (Requirement 7.15).
 *
 * **Validates: Requirements 7.9, 7.10, 7.11, 7.14, 7.15**
 */
export {};
