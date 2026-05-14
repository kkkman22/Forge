/**
 * Unit tests for the user ADR-verdict override mechanism in
 * `src/decide.ts`.
 *
 * Covers the two cooperating pure helpers introduced for
 * Requirement 2.6:
 *
 *   - `parseAdrOverride(userPrompt)` — scans a user prompt for the
 *     `--force-adr` and `--no-adr` keywords and returns a structured
 *     flag pair. When both keywords appear in the same prompt,
 *     `--no-adr` wins (conservative priority); when neither appears,
 *     both flags are `false`.
 *   - `applyAdrOverride(result, override)` — folds the parsed
 *     override back into an `AdrCriteriaResult`, replacing the
 *     `verdict`, `shouldBecomeAdr` and `reasoning` fields. When
 *     neither flag is set, the same reference is returned unchanged
 *     so callers can short-circuit downstream work with a `===`
 *     check.
 *
 * The tests cover both directions of the override:
 *
 *   1. `--force-adr` promotes a `DISCARD` verdict to `WRITE_ADR`.
 *   2. `--no-adr`    demotes a `WRITE_ADR` verdict to `DISCARD`.
 *
 * and the two edge cases that define the contract:
 *
 *   3. neither keyword → result is returned unchanged (same ref).
 *   4. both keywords   → the conservative `--no-adr` wins.
 *
 * **Validates: Requirements 2.6**
 */
import { describe, expect, it } from "vitest";
import { applyAdrOverride, parseAdrOverride } from "../src/decide.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
/**
 * A baseline `DISCARD` verdict: soft reversibility, not surprising,
 * no trade-off. Used to verify that `--force-adr` can forcibly
 * promote even the least-deserving candidate to a full ADR.
 */
const discardResult = {
    reversibility: "soft",
    surprising: false,
    tradeOff: false,
    alternatives: [],
    shouldBecomeAdr: false,
    verdict: "DISCARD",
    reasoning: "Easy to reverse + obvious + no alternatives → not worth documenting",
};
/**
 * A baseline `WRITE_ADR` verdict: hard reversibility, surprising,
 * real trade-off. Used to verify that `--no-adr` can forcibly demote
 * even an ADR-worthy decision to `DISCARD`.
 */
const writeAdrResult = {
    reversibility: "hard",
    surprising: true,
    tradeOff: true,
    alternatives: ["Keep JSON-lines file", "Use external Postgres"],
    shouldBecomeAdr: true,
    verdict: "WRITE_ADR",
    reasoning: "Hard to reverse + surprising + real trade-off → persist as ADR",
};
// ---------------------------------------------------------------------------
// parseAdrOverride
// ---------------------------------------------------------------------------
describe("parseAdrOverride", () => {
    it("returns both flags false when neither keyword is present", () => {
        expect(parseAdrOverride("please review this decision")).toEqual({
            forceAdr: false,
            noAdr: false,
        });
    });
    it("detects `--force-adr` in isolation", () => {
        expect(parseAdrOverride("keep this one --force-adr")).toEqual({
            forceAdr: true,
            noAdr: false,
        });
    });
    it("detects `--no-adr` in isolation", () => {
        expect(parseAdrOverride("drop this one --no-adr")).toEqual({
            forceAdr: false,
            noAdr: true,
        });
    });
    it("lets `--no-adr` win when both keywords appear (conservative)", () => {
        expect(parseAdrOverride("--force-adr --no-adr")).toEqual({
            forceAdr: false,
            noAdr: true,
        });
        // Reversed order: the priority rule is not order-dependent.
        expect(parseAdrOverride("--no-adr --force-adr")).toEqual({
            forceAdr: false,
            noAdr: true,
        });
    });
    it("matches the keywords anywhere in the prompt, including mid-sentence", () => {
        expect(parseAdrOverride("context --force-adr trailing words")).toEqual({
            forceAdr: true,
            noAdr: false,
        });
    });
});
// ---------------------------------------------------------------------------
// applyAdrOverride — forward direction (force WRITE_ADR)
// ---------------------------------------------------------------------------
describe("applyAdrOverride — force-adr promotes DISCARD to WRITE_ADR", () => {
    it("flips verdict to WRITE_ADR even when the automatic verdict was DISCARD", () => {
        const override = { forceAdr: true, noAdr: false };
        const out = applyAdrOverride(discardResult, override);
        expect(out.verdict).toBe("WRITE_ADR");
        expect(out.shouldBecomeAdr).toBe(true);
        expect(out.reasoning).toBe("User override: --force-adr");
    });
    it("preserves the original criteria fields so the audit trail remains intact", () => {
        const out = applyAdrOverride(discardResult, { forceAdr: true, noAdr: false });
        expect(out.reversibility).toBe(discardResult.reversibility);
        expect(out.surprising).toBe(discardResult.surprising);
        expect(out.tradeOff).toBe(discardResult.tradeOff);
        expect(out.alternatives).toEqual(discardResult.alternatives);
    });
    it("returns a fresh object, leaving the original result untouched", () => {
        const out = applyAdrOverride(discardResult, { forceAdr: true, noAdr: false });
        expect(out).not.toBe(discardResult);
        expect(discardResult.verdict).toBe("DISCARD");
        expect(discardResult.shouldBecomeAdr).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// applyAdrOverride — reverse direction (force DISCARD)
// ---------------------------------------------------------------------------
describe("applyAdrOverride — no-adr demotes WRITE_ADR to DISCARD", () => {
    it("flips verdict to DISCARD even when the automatic verdict was WRITE_ADR", () => {
        const override = { forceAdr: false, noAdr: true };
        const out = applyAdrOverride(writeAdrResult, override);
        expect(out.verdict).toBe("DISCARD");
        expect(out.shouldBecomeAdr).toBe(false);
        expect(out.reasoning).toBe("User override: --no-adr");
    });
    it("preserves the original criteria fields so the audit trail remains intact", () => {
        const out = applyAdrOverride(writeAdrResult, { forceAdr: false, noAdr: true });
        expect(out.reversibility).toBe(writeAdrResult.reversibility);
        expect(out.surprising).toBe(writeAdrResult.surprising);
        expect(out.tradeOff).toBe(writeAdrResult.tradeOff);
        expect(out.alternatives).toEqual(writeAdrResult.alternatives);
    });
    it("returns a fresh object, leaving the original result untouched", () => {
        const out = applyAdrOverride(writeAdrResult, { forceAdr: false, noAdr: true });
        expect(out).not.toBe(writeAdrResult);
        expect(writeAdrResult.verdict).toBe("WRITE_ADR");
        expect(writeAdrResult.shouldBecomeAdr).toBe(true);
    });
    it("lets --no-adr win when the caller hand-builds an override with both flags set", () => {
        const out = applyAdrOverride(writeAdrResult, { forceAdr: true, noAdr: true });
        expect(out.verdict).toBe("DISCARD");
        expect(out.shouldBecomeAdr).toBe(false);
        expect(out.reasoning).toBe("User override: --no-adr");
    });
});
// ---------------------------------------------------------------------------
// applyAdrOverride — no-op passthrough
// ---------------------------------------------------------------------------
describe("applyAdrOverride — no flags set", () => {
    it("returns the same reference when neither forceAdr nor noAdr is set", () => {
        const override = { forceAdr: false, noAdr: false };
        // Same-reference equality is part of the contract: downstream code
        // relies on `===` to short-circuit no-op overrides without having
        // to diff every field.
        expect(applyAdrOverride(discardResult, override)).toBe(discardResult);
        expect(applyAdrOverride(writeAdrResult, override)).toBe(writeAdrResult);
    });
});
// ---------------------------------------------------------------------------
// parse + apply — end-to-end composition
// ---------------------------------------------------------------------------
describe("parseAdrOverride + applyAdrOverride composition", () => {
    it("promotes DISCARD to WRITE_ADR when the user prompt carries --force-adr", () => {
        const override = parseAdrOverride("please persist this --force-adr");
        const out = applyAdrOverride(discardResult, override);
        expect(out.verdict).toBe("WRITE_ADR");
        expect(out.reasoning).toBe("User override: --force-adr");
    });
    it("demotes WRITE_ADR to DISCARD when the user prompt carries --no-adr", () => {
        const override = parseAdrOverride("not worth documenting --no-adr");
        const out = applyAdrOverride(writeAdrResult, override);
        expect(out.verdict).toBe("DISCARD");
        expect(out.reasoning).toBe("User override: --no-adr");
    });
    it("is a no-op when the user prompt carries no override keywords", () => {
        const override = parseAdrOverride("just a normal reply");
        expect(applyAdrOverride(writeAdrResult, override)).toBe(writeAdrResult);
        expect(applyAdrOverride(discardResult, override)).toBe(discardResult);
    });
});
//# sourceMappingURL=decide-adr-override.test.js.map