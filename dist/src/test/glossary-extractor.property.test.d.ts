/**
 * Property-based and unit tests for the glossary term extractor.
 *
 * Covers:
 *   - Property: `extractCandidates` never throws for any string input.
 *   - Property: `filterCandidates` is monotone with respect to filter
 *     tightness — stricter rules produce a subset of looser rules' output
 *     when the cap is non-binding on both sides.
 *   - Unit tests: default-rule exclusion patterns, existingTerms filter,
 *     top-N capping, sort stability.
 *
 * **Validates: Requirements 1.2, 1.6, 1.8, 1.9**
 */
export {};
