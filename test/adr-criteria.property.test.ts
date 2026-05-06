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

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AdrCriteriaResult,
  type DecisionCandidate,
  type DecisionSignals,
  decideOutputTarget,
  evaluateAdrCriteria,
  renderCriteriaCheck,
} from "../src/adr-criteria.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * A decision candidate with neutral text (no "obvious" keywords) so the
 * surprising heuristic is driven purely by the signals. Alternatives
 * length varies freely to exercise the trade-off rule.
 */
const neutralDecisionArb: fc.Arbitrary<DecisionCandidate> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 40 }),
  // Context padded to ensure it exceeds the non-trivial threshold (> 50).
  context: fc.string({ minLength: 60, maxLength: 120 }).map((s) => `chosen because: ${s}`),
  decision: fc.string({ minLength: 1, maxLength: 60 }).map((s) => `adopt ${s}`),
  consequences: fc.string({ maxLength: 80 }),
  alternatives: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
});

const signalsArb: fc.Arbitrary<DecisionSignals> = fc.record({
  reversalCostAssessment: fc.constantFrom("low", "medium", "high") as fc.Arbitrary<
    DecisionSignals["reversalCostAssessment"]
  >,
  hasExplicitTradeoff: fc.boolean(),
  inferFromKeywords: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property: any "no" → shouldBecomeAdr=false
// ---------------------------------------------------------------------------

describe("evaluateAdrCriteria — property-based", () => {
  /**
   * **Validates: Requirements 2.8**
   *
   * If any of the three dimensions (reversibility, surprising, tradeOff)
   * is false, `shouldBecomeAdr` must be false and verdict must not be
   * WRITE_ADR.
   */
  it("any 'no' on the three questions blocks shouldBecomeAdr", () => {
    fc.assert(
      fc.property(neutralDecisionArb, signalsArb, (decision, signals) => {
        const result = evaluateAdrCriteria(decision, signals);
        const anyNo = result.reversibility === "soft" || !result.surprising || !result.tradeOff;
        if (anyNo) {
          expect(result.shouldBecomeAdr).toBe(false);
          expect(result.verdict).not.toBe("WRITE_ADR");
        }
      }),
    );
  });

  /**
   * **Validates: Requirements 2.2, 2.8**
   *
   * The verdict is a pure function of the triple
   * (reversibility, surprising, tradeOff). Two evaluations that end up
   * with the same triple must produce the same verdict.
   */
  it("verdict is uniquely determined by (reversibility, surprising, tradeOff)", () => {
    const seen = new Map<string, AdrCriteriaResult["verdict"]>();
    fc.assert(
      fc.property(neutralDecisionArb, signalsArb, (decision, signals) => {
        const result = evaluateAdrCriteria(decision, signals);
        const key = `${result.reversibility}|${result.surprising}|${result.tradeOff}`;
        const prior = seen.get(key);
        if (prior === undefined) {
          seen.set(key, result.verdict);
        } else {
          expect(result.verdict).toBe(prior);
        }
      }),
    );
  });

  /**
   * **Validates: Requirements 2.8**
   *
   * The verdict mapping must cover the entire boolean cube deterministically.
   * All eight combinations are exercised exhaustively and matched against
   * the contract:
   *   - (hard, surprising, tradeOff) → WRITE_ADR
   *   - (hard, *, *) OR (*, surprising, *) but not all three → INLINE_NOTE
   *   - (soft, false, *) → DISCARD
   */
  it("verdict mapping is total and matches the contract", () => {
    const cases: Array<{
      reversibility: "hard" | "soft";
      surprising: boolean;
      tradeOff: boolean;
      verdict: AdrCriteriaResult["verdict"];
    }> = [
      { reversibility: "hard", surprising: true, tradeOff: true, verdict: "WRITE_ADR" },
      { reversibility: "hard", surprising: true, tradeOff: false, verdict: "INLINE_NOTE" },
      { reversibility: "hard", surprising: false, tradeOff: true, verdict: "INLINE_NOTE" },
      { reversibility: "hard", surprising: false, tradeOff: false, verdict: "INLINE_NOTE" },
      { reversibility: "soft", surprising: true, tradeOff: true, verdict: "INLINE_NOTE" },
      { reversibility: "soft", surprising: true, tradeOff: false, verdict: "INLINE_NOTE" },
      { reversibility: "soft", surprising: false, tradeOff: true, verdict: "DISCARD" },
      { reversibility: "soft", surprising: false, tradeOff: false, verdict: "DISCARD" },
    ];

    for (const c of cases) {
      // Construct inputs that force the desired triple.
      const decision: DecisionCandidate = {
        title: "t",
        context: c.surprising
          ? "this decision needs careful thought because the domain is tricky here"
          : "this is a standard conventional choice",
        decision: "adopt X",
        consequences: "",
        alternatives: c.tradeOff ? ["Y", "Z"] : [],
      };
      const signals: DecisionSignals = {
        reversalCostAssessment: c.reversibility === "hard" ? "high" : "low",
        hasExplicitTradeoff: c.tradeOff,
        inferFromKeywords: c.surprising,
      };
      const result = evaluateAdrCriteria(decision, signals);
      expect({
        reversibility: result.reversibility,
        surprising: result.surprising,
        tradeOff: result.tradeOff,
        verdict: result.verdict,
      }).toEqual(c);
    }
  });

  /**
   * **Validates: Requirements 2.8**
   *
   * When alternatives is empty (or omitted), tradeOff must always be
   * false regardless of signals.hasExplicitTradeoff.
   */
  it("empty alternatives forces tradeOff=false", () => {
    fc.assert(
      fc.property(signalsArb, (signals) => {
        const decision: DecisionCandidate = {
          title: "t",
          context: "ctx",
          decision: "adopt X",
          consequences: "",
          alternatives: [],
        };
        const result = evaluateAdrCriteria(decision, signals);
        expect(result.tradeOff).toBe(false);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("evaluateAdrCriteria — unit", () => {
  it("alternatives=undefined yields tradeOff=false and alternatives=[]", () => {
    const decision: DecisionCandidate = {
      title: "t",
      context: "ctx",
      decision: "adopt X",
      consequences: "",
    };
    const signals: DecisionSignals = {
      reversalCostAssessment: "high",
      hasExplicitTradeoff: true,
      inferFromKeywords: true,
    };
    const result = evaluateAdrCriteria(decision, signals);
    expect(result.alternatives).toEqual([]);
    expect(result.tradeOff).toBe(false);
  });

  it("reversalCostAssessment=low maps to reversibility=soft", () => {
    const result = evaluateAdrCriteria(
      { title: "t", context: "c", decision: "d", consequences: "" },
      { reversalCostAssessment: "low", hasExplicitTradeoff: false, inferFromKeywords: false },
    );
    expect(result.reversibility).toBe("soft");
  });

  it("reversalCostAssessment=medium maps to reversibility=hard", () => {
    const result = evaluateAdrCriteria(
      { title: "t", context: "c", decision: "d", consequences: "" },
      { reversalCostAssessment: "medium", hasExplicitTradeoff: false, inferFromKeywords: false },
    );
    expect(result.reversibility).toBe("hard");
  });

  it("obvious keyword in context forces surprising=false", () => {
    const result = evaluateAdrCriteria(
      {
        title: "t",
        context: "this is the standard way to do it",
        decision: "adopt X",
        consequences: "",
        alternatives: ["Y"],
      },
      { reversalCostAssessment: "high", hasExplicitTradeoff: true, inferFromKeywords: true },
    );
    expect(result.surprising).toBe(false);
  });

  it("all three yes → WRITE_ADR with shouldBecomeAdr=true", () => {
    const result = evaluateAdrCriteria(
      {
        title: "t",
        context: "nontrivial context that demands explanation because the domain is unusual",
        decision: "adopt X",
        consequences: "",
        alternatives: ["Y", "Z"],
      },
      { reversalCostAssessment: "high", hasExplicitTradeoff: true, inferFromKeywords: true },
    );
    expect(result.shouldBecomeAdr).toBe(true);
    expect(result.verdict).toBe("WRITE_ADR");
  });
});

// ---------------------------------------------------------------------------
// decideOutputTarget unit tests
// ---------------------------------------------------------------------------

describe("decideOutputTarget", () => {
  function resultWithVerdict(verdict: AdrCriteriaResult["verdict"]): AdrCriteriaResult {
    return {
      reversibility: verdict === "DISCARD" ? "soft" : "hard",
      surprising: verdict !== "DISCARD",
      tradeOff: verdict === "WRITE_ADR",
      alternatives: verdict === "WRITE_ADR" ? ["Y"] : [],
      shouldBecomeAdr: verdict === "WRITE_ADR",
      verdict,
      reasoning: "",
    };
  }

  it("WRITE_ADR → target=adr, no path (assigned by registry)", () => {
    const routed = decideOutputTarget(resultWithVerdict("WRITE_ADR"), "plan/progress.md");
    expect(routed).toEqual({ target: "adr" });
  });

  it("INLINE_NOTE → target=inline, path=upstream file", () => {
    const routed = decideOutputTarget(resultWithVerdict("INLINE_NOTE"), "plan/progress.md");
    expect(routed).toEqual({ target: "inline", path: "plan/progress.md" });
  });

  it("DISCARD → target=discard, no path", () => {
    const routed = decideOutputTarget(resultWithVerdict("DISCARD"), "plan/progress.md");
    expect(routed).toEqual({ target: "discard" });
  });
});

// ---------------------------------------------------------------------------
// renderCriteriaCheck unit tests
// ---------------------------------------------------------------------------

describe("renderCriteriaCheck", () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * WRITE_ADR with non-empty alternatives renders the four-line block
   * with `[a, b]` style list and the space-separated "WRITE ADR"
   * verdict label.
   */
  it("WRITE_ADR with alternatives renders the full four-line block", () => {
    const result: AdrCriteriaResult = {
      reversibility: "hard",
      surprising: true,
      tradeOff: true,
      alternatives: ["Postgres", "SQLite"],
      shouldBecomeAdr: true,
      verdict: "WRITE_ADR",
      reasoning: "",
    };
    expect(renderCriteriaCheck(result)).toBe(
      [
        "ADR Criteria Check:",
        "  Reversibility: hard",
        "  Surprising: true",
        "  Trade-off alternatives: [Postgres, SQLite]",
        "  Verdict: WRITE ADR",
      ].join("\n"),
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * INLINE_NOTE without alternatives renders `none` for the trade-off
   * line and the space-separated "INLINE NOTE" verdict label.
   */
  it("INLINE_NOTE without alternatives renders 'none' and 'INLINE NOTE'", () => {
    const result: AdrCriteriaResult = {
      reversibility: "hard",
      surprising: true,
      tradeOff: false,
      alternatives: [],
      shouldBecomeAdr: false,
      verdict: "INLINE_NOTE",
      reasoning: "",
    };
    expect(renderCriteriaCheck(result)).toBe(
      [
        "ADR Criteria Check:",
        "  Reversibility: hard",
        "  Surprising: true",
        "  Trade-off alternatives: none",
        "  Verdict: INLINE NOTE",
      ].join("\n"),
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * DISCARD with soft reversibility renders the soft reversibility
   * line, `none` for the empty alternatives list, and the plain
   * "DISCARD" verdict label.
   */
  it("DISCARD with soft reversibility renders 'soft' and 'DISCARD'", () => {
    const result: AdrCriteriaResult = {
      reversibility: "soft",
      surprising: false,
      tradeOff: false,
      alternatives: [],
      shouldBecomeAdr: false,
      verdict: "DISCARD",
      reasoning: "",
    };
    expect(renderCriteriaCheck(result)).toBe(
      [
        "ADR Criteria Check:",
        "  Reversibility: soft",
        "  Surprising: false",
        "  Trade-off alternatives: none",
        "  Verdict: DISCARD",
      ].join("\n"),
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * A single alternative renders without a trailing comma: `[alt1]`.
   */
  it("single alternative renders without trailing comma", () => {
    const result: AdrCriteriaResult = {
      reversibility: "hard",
      surprising: true,
      tradeOff: true,
      alternatives: ["Redis"],
      shouldBecomeAdr: true,
      verdict: "WRITE_ADR",
      reasoning: "",
    };
    const rendered = renderCriteriaCheck(result);
    expect(rendered).toContain("Trade-off alternatives: [Redis]");
  });
});
