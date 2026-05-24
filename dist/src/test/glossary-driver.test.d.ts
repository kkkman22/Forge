/**
 * Tests for the glossary driver (`src/glossary-driver.ts`).
 *
 * Covers:
 *   - Integration: on an empty in-memory filesystem, the first call
 *     produces `.forge/glossary.md` containing all 12 preset terms.
 *   - Existing file is parsed and returned untouched (no overwrite).
 *
 * **Validates: Requirements 1.3, 1.10**
 */
export {};
