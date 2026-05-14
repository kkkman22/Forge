/**
 * Integration tests for the review evolution artefact helper added in
 * `src/review.ts`.
 *
 * Covers Requirement 8.5:
 *   - A new problem pattern that does not match any existing
 *     `knowledge/solutions/*.md` entry produces a v2 failure episode
 *     plus an Evolution marker targeting
 *     `forge-review#new_review_pattern`.
 *   - A known-failure match echoes the pattern name on `patternUpdate`
 *     so the driver can increment its success counter.
 *   - When neither signal is set, the helper returns an empty object.
 *
 * **Validates: Requirements 8.5, 8.12**
 */
export {};
