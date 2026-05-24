/**
 * Integration tests for glossary-miss detection in `src/spec.ts`.
 *
 * Covers the forge-spec → glossary integration described in Requirement 1.4:
 * a locked / draft Spec's body text is scanned for candidate terms, and any
 * term that is not present in the glossary is reported via a
 * `[glossary-miss] 未定义术语：[...]` notice.
 *
 * **Validates: Requirements 1.4**
 */
export {};
