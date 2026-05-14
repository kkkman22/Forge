/**
 * Integration tests for glossary writeback in `src/learn.ts`.
 *
 * Covers the forge-learn → glossary integration described in Requirement
 * 1.6: at the end of a learn session we scan the decisions / findings /
 * reviews / progress / sessions text for candidate terms that are not yet
 * defined in `.forge/glossary.md`, promote the user-confirmed subset into
 * `GlossaryTerm` drafts, and append them via `mergeTerm(..., "append")`.
 *
 * **Validates: Requirements 1.6**
 */
export {};
