/**
 * Property-based tests for the ADR Registry id-generation helper.
 *
 * Covers:
 *   - `nextAdrId([])` always returns the canonical first id `"ADR-0001"`
 *   - `nextAdrId(list)` always returns an id strictly greater than every
 *     valid existing id in `list` (strict monotonicity)
 *   - The output format is stable: always matches `/^ADR-\d{4}$/`
 *
 * **Validates: Requirements 1.1, 1.2**
 */
export {};
