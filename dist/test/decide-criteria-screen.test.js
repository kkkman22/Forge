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
import { describe, expect, it } from "vitest";
import { runCriteriaScreen } from "../src/decide.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
/**
 * A high-stakes decision: costly to reverse, surprising to a future
 * reader, and backed by a real trade-off against named alternatives.
 * All three gate questions should answer "yes" → `WRITE_ADR`.
 */
const adrWorthyDecision = {
    title: "Adopt SQLite for episode store",
    context: "The episode store must survive process restarts and support ad-hoc queries. Keeping the current JSON-lines file forfeits indexed reads; switching to a relational engine introduces a hard dependency we cannot undo without a migration.",
    decision: "Embed SQLite via better-sqlite3 for the episode store.",
    consequences: "All read paths gain indexed queries; writers must manage transactions.",
    alternatives: ["Keep JSON-lines file", "Use external Postgres"],
};
const adrWorthySignals = {
    reversalCostAssessment: "high",
    hasExplicitTradeoff: true,
    inferFromKeywords: true,
};
/**
 * A clearly obvious decision with negligible reversal cost and no real
 * alternative. All three gate questions answer "no" → `DISCARD`.
 */
const discardDecision = {
    title: "Name the helper `toKebabCase`",
    context: "Standard naming",
    decision: "Name it toKebabCase — obvious, conventional Lodash-style name.",
    consequences: "None.",
    alternatives: [],
};
const discardSignals = {
    reversalCostAssessment: "low",
    hasExplicitTradeoff: false,
    inferFromKeywords: false,
};
/**
 * Hard to reverse (medium cost) but no alternatives were weighed and
 * no trade-off was surfaced. Reversibility=hard → `INLINE_NOTE`.
 */
const inlineDecision = {
    title: "Enable `strict` in tsconfig for new packages",
    context: "New packages default to strict TypeScript. Flipping the flag off later requires rewriting any code that leaned on implicit any, which is a non-trivial reversal.",
    decision: "Set `strict: true` in tsconfig for all new packages.",
    consequences: "New code must pass strict null checks from day one.",
    alternatives: [],
};
const inlineSignals = {
    reversalCostAssessment: "medium",
    hasExplicitTradeoff: false,
    inferFromKeywords: true,
};
// ---------------------------------------------------------------------------
// Verdict coverage
// ---------------------------------------------------------------------------
describe("runCriteriaScreen — verdict coverage", () => {
    it("routes a high-reversal-cost, surprising, trade-off-backed decision to WRITE_ADR", () => {
        const items = runCriteriaScreen([adrWorthyDecision], [adrWorthySignals]);
        expect(items).toHaveLength(1);
        const [{ result, decision, signals }] = items;
        expect(result.verdict).toBe("WRITE_ADR");
        expect(result.shouldBecomeAdr).toBe(true);
        expect(result.reversibility).toBe("hard");
        expect(result.surprising).toBe(true);
        expect(result.tradeOff).toBe(true);
        expect(result.alternatives).toEqual(["Keep JSON-lines file", "Use external Postgres"]);
        // Inputs are echoed back verbatim for correlation downstream.
        expect(decision).toBe(adrWorthyDecision);
        expect(signals).toBe(adrWorthySignals);
    });
    it("routes a low-cost, obvious, alternative-less decision to DISCARD", () => {
        const items = runCriteriaScreen([discardDecision], [discardSignals]);
        expect(items).toHaveLength(1);
        const [{ result }] = items;
        expect(result.verdict).toBe("DISCARD");
        expect(result.shouldBecomeAdr).toBe(false);
        expect(result.reversibility).toBe("soft");
        expect(result.surprising).toBe(false);
        expect(result.tradeOff).toBe(false);
    });
    it("routes a hard-to-reverse decision with no alternatives to INLINE_NOTE", () => {
        const items = runCriteriaScreen([inlineDecision], [inlineSignals]);
        expect(items).toHaveLength(1);
        const [{ result }] = items;
        expect(result.verdict).toBe("INLINE_NOTE");
        expect(result.shouldBecomeAdr).toBe(false);
        expect(result.reversibility).toBe("hard");
        expect(result.tradeOff).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// Batching contract
// ---------------------------------------------------------------------------
describe("runCriteriaScreen — batching", () => {
    it("preserves input order across a mixed batch of verdicts", () => {
        const decisions = [
            discardDecision,
            adrWorthyDecision,
            inlineDecision,
            adrWorthyDecision,
        ];
        const signals = [
            discardSignals,
            adrWorthySignals,
            inlineSignals,
            adrWorthySignals,
        ];
        const items = runCriteriaScreen(decisions, signals);
        expect(items.map((i) => i.result.verdict)).toEqual([
            "DISCARD",
            "WRITE_ADR",
            "INLINE_NOTE",
            "WRITE_ADR",
        ]);
        // Each item must point back to the matching input by index.
        for (let i = 0; i < decisions.length; i++) {
            expect(items[i].decision).toBe(decisions[i]);
            expect(items[i].signals).toBe(signals[i]);
        }
    });
    it("returns an empty array when there are no candidates", () => {
        expect(runCriteriaScreen([], [])).toEqual([]);
    });
    it("throws RangeError when parallel arrays have different lengths", () => {
        expect(() => runCriteriaScreen([adrWorthyDecision, inlineDecision], [adrWorthySignals])).toThrow(RangeError);
        expect(() => runCriteriaScreen([adrWorthyDecision], [adrWorthySignals, inlineSignals])).toThrow(/same length/);
    });
});
//# sourceMappingURL=decide-criteria-screen.test.js.map