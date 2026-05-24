/**
 * Unit tests for the user ADR-verdict override mechanism in
 * `src/decide.ts`.
 *
 * Covers the two cooperating pure helpers introduced for
 * Requirement 2.6:
 *
 *   - `parseAdrOverride(userPrompt)` — scans a user prompt for the
 *     `--force-adr` and `--no-adr` keywords and returns a structured
 *     flag pair. When both keywords appear in the same prompt,
 *     `--no-adr` wins (conservative priority); when neither appears,
 *     both flags are `false`.
 *   - `applyAdrOverride(result, override)` — folds the parsed
 *     override back into an `AdrCriteriaResult`, replacing the
 *     `verdict`, `shouldBecomeAdr` and `reasoning` fields. When
 *     neither flag is set, the same reference is returned unchanged
 *     so callers can short-circuit downstream work with a `===`
 *     check.
 *
 * The tests cover both directions of the override:
 *
 *   1. `--force-adr` promotes a `DISCARD` verdict to `WRITE_ADR`.
 *   2. `--no-adr`    demotes a `WRITE_ADR` verdict to `DISCARD`.
 *
 * and the two edge cases that define the contract:
 *
 *   3. neither keyword → result is returned unchanged (same ref).
 *   4. both keywords   → the conservative `--no-adr` wins.
 *
 * **Validates: Requirements 2.6**
 */
export {};
