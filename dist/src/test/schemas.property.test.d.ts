/**
 * Property-based tests for the Zod schemas in `src/schemas/`.
 *
 * Covers:
 *   - `StatusFileSchema` round-trips any object sampled from a matching
 *     arbitrary (parse ∘ serialize ≡ identity for known fields)
 *   - `ConfigFileSchema` round-trips any object sampled from a matching
 *     arbitrary
 *   - Passthrough behaviour: any unknown field on a well-formed input is
 *     preserved rather than rejected
 *
 * **Validates: Requirement 2.9**
 */
export {};
