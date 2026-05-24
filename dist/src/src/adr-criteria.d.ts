/**
 * ADR Criteria Screen — the three-question gate applied to a decision
 * candidate before deciding whether it warrants a full Architecture
 * Decision Record on disk.
 *
 * The gate answers three questions:
 *
 *   A. Reversibility   — is this expensive to undo?
 *   B. Surprising      — will a future reader ask "why on earth?"
 *   C. Real trade-off  — is there a genuine alternative, not the only
 *                        natural choice?
 *
 * Only when all three are yes does the decision become an ADR on disk.
 * Partial answers route to an inline note in the upstream file; none of
 * the three yields a discard.
 *
 * This module is IO-free. It exposes pure functions that other layers
 * (`forge-decide`, tests) can compose:
 *
 *   - `evaluateAdrCriteria(decision, signals) -> AdrCriteriaResult`
 *   - `decideOutputTarget(result, upstreamFile) -> { target, path? }`
 *
 * The verdict is derived from a deterministic mapping over the three
 * booleans (`reversibility === "hard"`, `surprising`, `tradeOff`). The
 * mapping is total — every combination has a defined outcome — and is
 * covered by property tests.
 *
 * **Validates: Requirements 2.1, 2.2, 2.8**
 */
/**
 * Raw decision content supplied by the caller. Mirrors the four classic
 * ADR sections plus an optional list of alternatives considered.
 *
 *   - title:         short headline
 *   - context:       why this decision is being made, surrounding state
 *   - decision:      what was chosen
 *   - consequences:  resulting implications, follow-ups
 *   - alternatives:  other options weighed; empty / omitted means none
 *                    were explicitly surfaced
 */
export interface DecisionCandidate {
    title: string;
    context: string;
    decision: string;
    consequences: string;
    alternatives?: string[];
}
/**
 * Signals used by {@link evaluateAdrCriteria} that cannot be derived
 * from the decision text alone. These typically come from the four
 * `forge-decide` perspectives or from the caller's own metadata.
 *
 *   - reversalCostAssessment: caller's qualitative cost estimate for
 *                             reversing the decision later
 *   - hasExplicitTradeoff:    whether the decision surfaced a genuine
 *                             trade-off vs. the only natural choice
 *   - inferFromKeywords:      when true, the "surprising" check falls
 *                             through to the keyword heuristic; when
 *                             false, it relies on context richness
 */
export interface DecisionSignals {
    reversalCostAssessment: "low" | "medium" | "high";
    hasExplicitTradeoff: boolean;
    inferFromKeywords: boolean;
}
/**
 * Outcome of the three-question gate.
 *
 *   - reversibility:   "hard" if reversal cost is medium or high
 *   - surprising:      true if a future reader would ask "why?"
 *   - tradeOff:        true if alternatives exist and a trade-off was
 *                      explicitly surfaced
 *   - alternatives:    echo of the alternatives considered
 *   - shouldBecomeAdr: true only when all three questions answer yes
 *   - verdict:         where the decision should be routed
 *   - reasoning:       human-readable explanation of the verdict
 */
export interface AdrCriteriaResult {
    reversibility: "hard" | "soft";
    surprising: boolean;
    tradeOff: boolean;
    alternatives: string[];
    shouldBecomeAdr: boolean;
    verdict: "WRITE_ADR" | "INLINE_NOTE" | "DISCARD";
    reasoning: string;
}
/**
 * Apply the three-question gate to a decision candidate.
 *
 * The mapping from (reversibility, surprising, tradeOff) to verdict is
 * deterministic and total:
 *
 *   - all three yes                               → WRITE_ADR
 *   - at least one of (hard, surprising) is yes   → INLINE_NOTE
 *   - none of the three is yes                    → DISCARD
 *
 * Note that `tradeOff` alone (with soft reversibility and not
 * surprising) still lands in DISCARD: a trade-off without weight or
 * novelty is not worth a persistent note.
 */
export declare function evaluateAdrCriteria(decision: DecisionCandidate, signals: DecisionSignals): AdrCriteriaResult;
/**
 * Route an {@link AdrCriteriaResult} to a concrete output target.
 *
 *   - WRITE_ADR   → `{ target: "adr" }`; the actual file path is
 *                   determined downstream by the ADR registry, which
 *                   allocates the next `ADR-NNNN` id.
 *   - INLINE_NOTE → `{ target: "inline", path: upstreamFile }`; the
 *                   caller writes a `<!-- decision: ... -->` comment at
 *                   the end of the upstream spec / plan / progress file.
 *   - DISCARD     → `{ target: "discard" }`; no file side-effect.
 *
 * The function is a total mapping from verdict to target and never
 * throws.
 */
export declare function decideOutputTarget(result: AdrCriteriaResult, upstreamFile: string): {
    target: "adr" | "inline" | "discard";
    path?: string;
};
/**
 * Render the four-line "ADR Criteria Check" block shown in the
 * `forge-decide` Critic phase output. The exact layout is fixed by
 * requirement 2.5:
 *
 *   ADR Criteria Check:
 *     Reversibility: hard | soft
 *     Surprising: true | false
 *     Trade-off alternatives: [alt1, alt2] | none
 *     Verdict: WRITE ADR | INLINE NOTE | DISCARD
 *
 * The alternatives line prints `[alt1, alt2]` with a single space after
 * each comma when any alternatives are present, and the literal `none`
 * when the list is empty. The output is deterministic (no trailing
 * newline) so callers can embed it inside larger documents.
 *
 * **Validates: Requirements 2.5**
 */
export declare function renderCriteriaCheck(result: AdrCriteriaResult): string;
