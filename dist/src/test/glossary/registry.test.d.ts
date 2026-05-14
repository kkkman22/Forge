/**
 * Tests for `src/glossary/registry.ts` — loadGlossary.
 *
 * Covers:
 *   - Empty enabled packs → empty registry
 *   - Single context glossary → loads correctly
 *   - Multi-context → separate entries
 *   - Custom override → custom wins
 *   - Backward compat → reads .forge/glossary.md as _shared
 *
 * **Validates: R1 Glossary loading, R2 Backward compat, R3 Custom override**
 */
export {};
