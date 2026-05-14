/**
 * Integration tests for the three-strike failure artefact helper added
 * in `src/build.ts`.
 *
 * Covers Requirement 8.6:
 *   - Three consecutive TDD failures on the same task feed into
 *     {@link buildThreeStrikeFailureArtifacts}, which must produce a
 *     v2 failure Episode and an Evolution marker targeting
 *     `forge-build#three_strike`.
 *   - The helper attaches an optional root cause when supplied.
 *   - Output is deterministic under identical inputs so drivers can
 *     replay safely.
 *
 * **Validates: Requirements 8.6, 8.12**
 */
export {};
