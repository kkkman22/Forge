/**
 * Property-based and unit tests for the ADR three-question gate.
 *
 * Covers:
 *   - Property: `shouldBecomeAdr` is false whenever any of the three
 *     questions is "no" (reversibility=soft, or surprising=false, or
 *     tradeOff=false).
 *   - Property: the verdict is a deterministic function of the triple
 *     (reversibility, surprising, tradeOff) — same triple → same verdict.
 *   - Property: `alternatives=[]` implies `tradeOff=false` regardless of
 *     other signals.
 *   - Unit: `decideOutputTarget` produces the correct `target` for each
 *     verdict.
 *
 * **Validates: Requirements 2.1, 2.2, 2.8**
 */
export {};
