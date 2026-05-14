/**
 * Unit tests and property test for inner-layer frozen zone check.
 *
 * Verifies that the inner-layer check in `effect-executor.ts` blocks
 * commits independently of the Hook layer, and produces the same
 * judgment as the outer-layer check in `check-frozen.ts`.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */
export {};
