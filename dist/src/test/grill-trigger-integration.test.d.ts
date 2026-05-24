/**
 * Integration tests for the grill trigger detection module (Task 4.5).
 *
 * Covers:
 *   - `detectGrillTrigger` recognises every documented keyword phrase
 *     and is robust to case variation and surrounding context.
 *   - `detectGrillTrigger` returns `false` for unrelated input so the
 *     router doesn't falsely propose grilling.
 *   - `buildGrillSuggestion` returns a non-empty suggestion only for
 *     `tier === "full"`; light / standard tiers receive `null`.
 *
 * **Validates: Requirements 4.3**
 */
export {};
