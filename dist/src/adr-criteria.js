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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Keywords that mark a decision as "obvious" — the first short-circuit
 * in {@link detectSurprising}. Matched case-insensitively as whole-word
 * occurrences in `decision.decision` or `decision.context`.
 */
const OBVIOUS_KEYWORDS = [
    "obvious",
    "standard",
    "conventional",
    "common practice",
];
/**
 * Context-length threshold (characters) used as the final fallback in
 * {@link detectSurprising} when no keyword signal is present.
 */
const NON_TRIVIAL_CONTEXT_LENGTH = 50;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Case-insensitive search for any of the given keywords in a text.
 * Returns true if at least one keyword occurs as a substring.
 */
function containsAnyKeyword(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}
/**
 * Heuristic for the "surprising" dimension of the ADR criteria. Applied
 * in a fixed priority order:
 *
 *   1. If the decision or context explicitly marks the choice as
 *      obvious / standard / conventional / common practice, it is not
 *      surprising.
 *   2. Else, when the caller opts in to keyword inference, the decision
 *      is treated as surprising (default assumption — the decide
 *      pipeline has already flagged it as worth considering).
 *   3. Else, fall back to context richness: a non-trivial context block
 *      (> {@link NON_TRIVIAL_CONTEXT_LENGTH} chars) signals that the
 *      author felt explanation was needed, which is itself a weak
 *      "surprising" signal.
 */
function detectSurprising(decision, signals) {
    const haystack = `${decision.decision}\n${decision.context}`;
    if (containsAnyKeyword(haystack, OBVIOUS_KEYWORDS)) {
        return false;
    }
    if (signals.inferFromKeywords) {
        return true;
    }
    return decision.context.length > NON_TRIVIAL_CONTEXT_LENGTH;
}
/**
 * Build the reasoning string shown to the user. Kept deterministic so
 * that tests can pin exact output when needed.
 */
function buildReasoning(reversibility, surprising, tradeOff, verdict) {
    switch (verdict) {
        case "WRITE_ADR":
            return "Hard to reverse + surprising + real trade-off → persist as ADR";
        case "INLINE_NOTE": {
            const parts = [];
            if (reversibility === "hard")
                parts.push("hard to reverse");
            if (surprising)
                parts.push("surprising");
            if (tradeOff)
                parts.push("real trade-off");
            const matched = parts.length > 0 ? parts.join(" + ") : "partial criteria met";
            return `Partial criteria met (${matched}) → inline note in upstream file`;
        }
        case "DISCARD":
            return "Easy to reverse + obvious + no alternatives → not worth documenting";
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
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
export function evaluateAdrCriteria(decision, signals) {
    const reversibility = signals.reversalCostAssessment === "low" ? "soft" : "hard";
    const surprising = detectSurprising(decision, signals);
    const alternatives = decision.alternatives ?? [];
    const tradeOff = signals.hasExplicitTradeoff && alternatives.length > 0;
    const shouldBecomeAdr = reversibility === "hard" && surprising && tradeOff;
    let verdict;
    if (shouldBecomeAdr) {
        verdict = "WRITE_ADR";
    }
    else if (reversibility === "hard" || surprising) {
        verdict = "INLINE_NOTE";
    }
    else {
        verdict = "DISCARD";
    }
    const reasoning = buildReasoning(reversibility, surprising, tradeOff, verdict);
    return {
        reversibility,
        surprising,
        tradeOff,
        alternatives,
        shouldBecomeAdr,
        verdict,
        reasoning,
    };
}
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
export function decideOutputTarget(result, upstreamFile) {
    switch (result.verdict) {
        case "WRITE_ADR":
            return { target: "adr" };
        case "INLINE_NOTE":
            return { target: "inline", path: upstreamFile };
        case "DISCARD":
            return { target: "discard" };
    }
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/**
 * Human-readable labels for the internal verdict enum. The rendered
 * form uses spaces rather than underscores so the Critic-phase block
 * reads like prose.
 */
const VERDICT_LABELS = {
    WRITE_ADR: "WRITE ADR",
    INLINE_NOTE: "INLINE NOTE",
    DISCARD: "DISCARD",
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
export function renderCriteriaCheck(result) {
    const alternatives = result.alternatives.length === 0 ? "none" : `[${result.alternatives.join(", ")}]`;
    const verdict = VERDICT_LABELS[result.verdict];
    return [
        "ADR Criteria Check:",
        `  Reversibility: ${result.reversibility}`,
        `  Surprising: ${result.surprising}`,
        `  Trade-off alternatives: ${alternatives}`,
        `  Verdict: ${verdict}`,
    ].join("\n");
}
//# sourceMappingURL=adr-criteria.js.map