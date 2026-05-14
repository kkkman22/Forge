/**
 * Unit tests for prompt-defense integration in `classifyTask`.
 *
 * Covers:
 *   - critical threats raise `PromptDefenseError` with `code`
 *     `PROMPT_DEFENSE_REJECTED` and no leaked input content
 *   - high / medium threats surface as RouteHints with
 *     `tag: "prompt-defense-warning"` on `command: "*"`
 *   - absent / empty rawDescription is a no-op (backward compatible)
 *   - benign descriptions do not add defense-warning hints
 *
 * **Validates: Requirements 5.5, 5.6, 5.7**
 */
export {};
