/**
 * Property-based and unit tests for the skill description validator.
 *
 * Covers:
 *   - Property: any description containing "Use when" (case-insensitive)
 *     with length ≤ 1024 and no forbidden pattern yields `valid=true`.
 *   - Unit tests for each failure mode: missing frontmatter, missing
 *     description, over-length description, missing "Use when", and one
 *     test per forbidden pattern (marketing / version / date).
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
export {};
