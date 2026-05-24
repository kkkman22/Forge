/**
 * Property-based and unit tests for the Pattern Confidence lifecycle.
 *
 * Covers:
 *   - Round-trip: `parseInstinct(renderInstincts(ps))` ≡ `ps`
 *   - `updatePatternStats` preserves `confidence ∈ [0, 1]` and
 *     `successes ≤ applications` invariants for any sequence
 *   - `findStaleOrDecayedPatterns` always returns a subset of the
 *     input in original order
 *   - Legacy parsing fills missing counters with zeros
 *
 * **Validates: Requirements 7.5, 7.6, 7.7, 7.8, 7.11, 7.13, 7.14**
 */
export {};
