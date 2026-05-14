/**
 * Property-based and unit tests for the glossary term extractor.
 *
 * Covers:
 *   - Property: `extractCandidates` never throws for any string input.
 *   - Property: `filterCandidates` is monotone with respect to filter
 *     tightness — stricter rules produce a subset of looser rules' output
 *     when the cap is non-binding on both sides.
 *   - Unit tests: default-rule exclusion patterns, existingTerms filter,
 *     top-N capping, sort stability.
 *
 * **Validates: Requirements 1.2, 1.6, 1.8, 1.9**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXTRACTION_RULES, extractCandidates, filterCandidates, } from "../src/glossary-extractor.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/**
 * Arbitrary `TermCandidate`. `term` is constrained to a printable subset
 * that the filter can meaningfully reason about; `frequency` is kept
 * bounded so sort / cap behaviour stays within interpretable ranges.
 */
const candidateArb = fc.record({
    term: fc
        .string({ minLength: 1, maxLength: 20 })
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter((s) => s.length > 0),
    context: fc.string({ maxLength: 40 }),
    frequency: fc.integer({ min: 1, max: 20 }),
});
// ---------------------------------------------------------------------------
// Property: extractCandidates never throws
// ---------------------------------------------------------------------------
describe("glossary-extractor — extractCandidates", () => {
    /**
     * **Validates: Requirements 1.8**
     *
     * The extractor walks untrusted free-form text (spec drafts, session
     * notes, pasted transcripts). It must never blow up the session with an
     * exception, regardless of how weird the input looks.
     */
    it("never throws for any string input", () => {
        fc.assert(fc.property(fc.string(), fc.array(fc.string(), { maxLength: 10 }), (text, existing) => {
            expect(() => extractCandidates(text, existing)).not.toThrow();
        }));
    });
    it("returns an empty list for the empty string", () => {
        expect(extractCandidates("", [])).toEqual([]);
    });
    it("deduplicates repeated surface forms and counts frequency", () => {
        const text = "Dynamic Dispatch resolves late. Dynamic Dispatch is powerful.";
        const candidates = extractCandidates(text, []);
        const dd = candidates.find((c) => c.term === "Dynamic Dispatch");
        expect(dd).toBeDefined();
        expect(dd?.frequency).toBe(2);
    });
    it("picks up PascalCase single-word terms", () => {
        const text = "We use EventSourcing here. Related: EventSourcing docs.";
        const terms = extractCandidates(text, []).map((c) => c.term);
        expect(terms).toContain("EventSourcing");
    });
    it("picks up contiguous Chinese sequences of 2+ characters", () => {
        const text = "这里使用 冻结区 来保护核心文件。冻结区 的边界明确。";
        const terms = extractCandidates(text, []).map((c) => c.term);
        expect(terms).toContain("冻结区");
    });
    it("skips terms that already exist in the glossary (case-insensitive)", () => {
        const text = "Event Sourcing is used. Dynamic Dispatch is also used.";
        const existing = ["event sourcing"];
        const terms = extractCandidates(text, existing).map((c) => c.term);
        expect(terms).not.toContain("Event Sourcing");
        expect(terms).toContain("Dynamic Dispatch");
    });
});
// ---------------------------------------------------------------------------
// Property: filterCandidates monotonicity
// ---------------------------------------------------------------------------
describe("glossary-extractor — filterCandidates", () => {
    /**
     * **Validates: Requirements 1.9**
     *
     * With a non-binding cap on both sides, tightening any filter axis
     * (higher `minFrequency`, higher `minLength`, or superset
     * `excludePatterns`) yields a subset of the looser rule's output.
     *
     * Rationale: this is the property skills rely on when they tune rules
     * upward after user feedback — the shortlist only ever shrinks, it
     * never introduces new surprises.
     */
    it("stricter rules produce a subset of looser rules' output", () => {
        const extraPatternArb = fc.constantFrom(/^[xX]/, /\d/, /^[A-Z]$/);
        fc.assert(fc.property(fc.array(candidateArb, { minLength: 0, maxLength: 12 }), fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 3 }), fc.array(extraPatternArb, { maxLength: 2 }), (candidates, minFreqLoose, minFreqDelta, minLenLoose, minLenDelta, extraPatterns) => {
            const cap = candidates.length + 10; // non-binding on both sides
            const loose = {
                minFrequency: minFreqLoose,
                minLength: minLenLoose,
                excludePatterns: [],
                maxCandidatesPerSession: cap,
            };
            const strict = {
                minFrequency: minFreqLoose + minFreqDelta,
                minLength: minLenLoose + minLenDelta,
                excludePatterns: extraPatterns,
                maxCandidatesPerSession: cap,
            };
            const looseOut = filterCandidates(candidates, loose);
            const strictOut = filterCandidates(candidates, strict);
            // Each strict survivor must appear in the loose survivors, matched
            // by (case-insensitive) term and frequency.
            const looseKey = (c) => `${c.term.toLowerCase()}\u0000${c.frequency}`;
            const looseSet = new Set(looseOut.map(looseKey));
            for (const c of strictOut) {
                expect(looseSet.has(looseKey(c))).toBe(true);
            }
        }));
    });
    // -------------------------------------------------------------------------
    // Unit tests
    // -------------------------------------------------------------------------
    it("drops candidates shorter than minLength", () => {
        const out = filterCandidates([
            { term: "ok", context: "", frequency: 5 },
            { term: "okay", context: "", frequency: 5 },
        ], { ...DEFAULT_EXTRACTION_RULES, minLength: 3, excludePatterns: [], minFrequency: 1 });
        expect(out.map((c) => c.term)).toEqual(["okay"]);
    });
    it("drops candidates below minFrequency", () => {
        const out = filterCandidates([
            { term: "Alpha", context: "", frequency: 1 },
            { term: "Beta", context: "", frequency: 3 },
        ], { ...DEFAULT_EXTRACTION_RULES, minFrequency: 2, excludePatterns: [] });
        expect(out.map((c) => c.term)).toEqual(["Beta"]);
    });
    it("drops candidates matching any exclude pattern", () => {
        const out = filterCandidates([
            { term: "camelCaseVar", context: "", frequency: 5 },
            { term: "_privateFn", context: "", frequency: 5 },
            { term: "EventSourcing", context: "", frequency: 5 },
        ], { ...DEFAULT_EXTRACTION_RULES, minFrequency: 1 });
        expect(out.map((c) => c.term)).toEqual(["EventSourcing"]);
    });
    it("caps the result at maxCandidatesPerSession", () => {
        const cs = Array.from({ length: 15 }, (_, i) => ({
            term: `Term${String(i).padStart(2, "0")}`,
            context: "",
            frequency: 20 - i, // strictly decreasing so sort is predictable
        }));
        const out = filterCandidates(cs, { ...DEFAULT_EXTRACTION_RULES, minFrequency: 1 });
        expect(out).toHaveLength(DEFAULT_EXTRACTION_RULES.maxCandidatesPerSession);
        // Top 10 by frequency = first 10 in the input order here.
        expect(out.map((c) => c.term)).toEqual(cs.slice(0, 10).map((c) => c.term));
    });
    it("sorts by frequency desc, breaking ties by term ascending", () => {
        const out = filterCandidates([
            { term: "Zeta", context: "", frequency: 3 },
            { term: "Alpha", context: "", frequency: 3 },
            { term: "Mega", context: "", frequency: 5 },
        ], { ...DEFAULT_EXTRACTION_RULES, minFrequency: 1, excludePatterns: [] });
        expect(out.map((c) => c.term)).toEqual(["Mega", "Alpha", "Zeta"]);
    });
    it("collapses case-insensitive duplicates and keeps the higher frequency", () => {
        const out = filterCandidates([
            { term: "Spec", context: "ctx1", frequency: 2 },
            { term: "spec", context: "ctx2", frequency: 5 },
        ], { ...DEFAULT_EXTRACTION_RULES, minFrequency: 1, excludePatterns: [] });
        expect(out).toHaveLength(1);
        expect(out[0].frequency).toBe(5);
        // First-seen surface form wins.
        expect(out[0].term).toBe("Spec");
        expect(out[0].context).toBe("ctx1");
    });
    it("default rules produce empty output when maxCandidatesPerSession would be 0", () => {
        const out = filterCandidates([{ term: "Alpha", context: "", frequency: 10 }], {
            ...DEFAULT_EXTRACTION_RULES,
            maxCandidatesPerSession: 0,
        });
        expect(out).toEqual([]);
    });
});
// ---------------------------------------------------------------------------
// Default rules sanity check
// ---------------------------------------------------------------------------
describe("glossary-extractor — DEFAULT_EXTRACTION_RULES", () => {
    it("encodes the documented defaults", () => {
        expect(DEFAULT_EXTRACTION_RULES.minFrequency).toBe(2);
        expect(DEFAULT_EXTRACTION_RULES.minLength).toBe(3);
        expect(DEFAULT_EXTRACTION_RULES.maxCandidatesPerSession).toBe(10);
        // camelCase and underscored names should match an exclude pattern.
        const matchesAny = (s) => DEFAULT_EXTRACTION_RULES.excludePatterns.some((p) => p.test(s));
        expect(matchesAny("camelCaseVar")).toBe(true);
        expect(matchesAny("_privateFn")).toBe(true);
        expect(matchesAny("EventSourcing")).toBe(false);
    });
});
//# sourceMappingURL=glossary-extractor.property.test.js.map