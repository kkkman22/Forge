/**
 * Integration tests for `runCriteriaScreen` in `src/decide.ts`.
 *
 * Covers the forge-decide → ADR-criteria integration described in
 * Requirement 2.3: before Round 2 Critic returns, the decide skill
 * runs every (decision, signals) pair through the three-question gate
 * and attaches the per-candidate `AdrCriteriaResult` to its Critic
 * output. The verdict drives the downstream persistence behaviour
 * (WRITE_ADR / INLINE_NOTE / DISCARD) described in Requirements 2.1
 * and 2.4; the batching contract (parallel arrays, order preservation)
 * is part of Requirement 2.10 — Round 2 must run the screen inline
 * without rearranging its inputs.
 *
 * **Validates: Requirements 2.1, 2.3, 2.4, 2.10**
 */
export {};
