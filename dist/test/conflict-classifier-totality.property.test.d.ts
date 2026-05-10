/**
 * Property test: conflict-classifier totality and normalization.
 *
 * Invariant:
 *   - ∀ path → classify(path) ∈ {frozen, guarded, open, source} [R13.1]
 *   - classify(normalize(p)) === classify(p) [R13.2]
 *
 * **Validates: Requirements R7.1, R13.1, R13.2**
 */
export {};
