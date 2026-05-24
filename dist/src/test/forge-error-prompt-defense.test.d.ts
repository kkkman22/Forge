/**
 * Unit tests for `PromptDefenseError`.
 *
 * Covers:
 *   - `code` field equals the canonical `PROMPT_DEFENSE_REJECTED`
 *   - message is preserved as the `Error.message`
 *   - `threats` summary carries only type / pattern id / optional location
 *     — never the matched content or raw input text
 *   - serialising the error does not leak PII-shaped sentinels
 *
 * **Validates: Requirements 5.6, 5.12**
 */
export {};
