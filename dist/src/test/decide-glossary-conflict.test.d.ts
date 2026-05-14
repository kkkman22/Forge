/**
 * Integration tests for the glossary alignment check in `src/decide.ts`.
 *
 * Covers the forge-decide → glossary integration described in Requirement
 * 1.7: before Round 1 perspective output, the decide skill inspects the
 * user's candidate terms against `.forge/glossary.md`. Any conflict
 * (same term / different definition, or a candidate alias colliding with
 * another term's name) must be surfaced as a clarification prompt that
 * the user resolves before Round 1 proceeds.
 *
 * **Validates: Requirements 1.7**
 */
export {};
