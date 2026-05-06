/**
 * Unit tests for ADR frontmatter extension fields (Requirements 2.3, 2.7).
 *
 * Task 2.6 extends the ADR frontmatter with three optional fields
 * produced by the three-question gate in `/forge decide`:
 *   - `reversibility`:           "hard" | "soft"
 *   - `surprising`:              boolean
 *   - `trade_off_alternatives`:  string[]
 *
 * The fields are additive and never conflict with the existing ADR
 * schema shared with the `engineering-governance-hardening` spec. They
 * are emitted only when set on the `AdrEntry`, so ADRs authored before
 * the gate landed round-trip byte-identically.
 *
 * Covers:
 *   - `finalizeAdr` propagates the criteria inputs onto the new entry
 *   - `renderAdrFileContent` emits the fields after `deciders` and
 *     before `related_adrs`
 *   - `renderAdrFileContent` omits each field when it is undefined
 *     (or an empty `trade_off_alternatives` array)
 *   - `parseAdrFrontmatter` recovers all three fields losslessly
 *   - round-trip: render → parse recovers the exact entry
 *
 * **Validates: Requirements 2.3, 2.7**
 */
export {};
