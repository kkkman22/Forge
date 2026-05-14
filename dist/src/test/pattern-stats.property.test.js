/**
 * Property-based and unit tests for the Pattern Confidence lifecycle.
 *
 * Covers:
 *   - Round-trip: `parseInstinct(renderInstincts(ps))` ≡ `ps`
 *   - `updatePatternStats` preserves `confidence ∈ [0, 1]` and
 *     `successes ≤ applications` invariants for any sequence
 *   - `findStaleOrDecayedPatterns` always returns a subset of the
 *     input in original order
 *   - Legacy parsing fills missing counters with zeros
 *
 * **Validates: Requirements 7.5, 7.6, 7.7, 7.8, 7.11, 7.13, 7.14**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findStaleOrDecayedPatterns, findUpgradableEpisodes, parseInstinct, renderInstincts, updatePatternStats, } from "../src/pattern-stats.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/**
 * Generate a pattern name that uses only H3-safe characters: no line
 * breaks, no leading `#`, no `**` bold markers that could look like a
 * field line, and stripped of surrounding whitespace.
 */
const nameArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .map((s) => s.replace(/[\n\r#*]/g, "").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.includes("---"));
const tagArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .map((s) => s.replace(/[\n\r,、*]/g, "").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.includes("---"));
const dateArb = fc
    .tuple(fc.integer({ min: 2020, max: 2099 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const patternIdArb = fc
    .tuple(dateArb, fc.integer({ min: 0, max: 999 }))
    .map(([d, n]) => `pat-${d}-${String(n).padStart(3, "0")}`);
/**
 * Confidence values are drawn from [0, 1] with a small set of
 * representable decimals so the default formatter produces bytes that
 * round-trip cleanly.
 */
const confidenceArb = fc.integer({ min: 0, max: 100 }).map((n) => n / 100);
const bodyArb = fc
    .array(fc
    .string({ maxLength: 40 })
    .map((s) => s.replace(/\r/g, ""))
    .filter((s) => !s.trimStart().startsWith("#"))
    .filter((s) => !s.trimStart().startsWith("**"))
    .filter((s) => !s.trimStart().startsWith("---"))
    .filter((s) => !s.startsWith("##")), { maxLength: 3 })
    // Drop leading / trailing blank lines since the round-trip normalizes
    // them; keeping them here would make the fixed-point vacuously fail.
    .map((lines) => {
    const arr = lines.map((l) => l.replace(/\n/g, " "));
    let start = 0;
    let end = arr.length;
    while (start < end && arr[start].trim() === "")
        start += 1;
    while (end > start && arr[end - 1].trim() === "")
        end -= 1;
    return arr.slice(start, end).join("\n");
});
/**
 * Generate a single well-formed pattern where
 * `successes + failures === applications` so that `updatePatternStats`
 * invariants stay well-defined after the fact.
 */
const patternArb = fc
    .record({
    pattern_id: patternIdArb,
    name: nameArb,
    successes: fc.integer({ min: 0, max: 50 }),
    failures: fc.integer({ min: 0, max: 50 }),
    confidence: confidenceArb,
    last_triggered: dateArb,
    decay_threshold: confidenceArb,
    tags: fc.array(tagArb, { minLength: 0, maxLength: 3 }),
    body: bodyArb,
})
    .map((p) => ({
    pattern_id: p.pattern_id,
    name: p.name,
    confidence: p.confidence,
    applications: p.successes + p.failures,
    successes: p.successes,
    failures: p.failures,
    last_triggered: p.last_triggered,
    decay_threshold: p.decay_threshold,
    tags: p.tags,
    body: p.body,
}));
/** Deduplicate patterns by H3 name since names key the rendered sections. */
const patternsArb = fc
    .array(patternArb, { minLength: 0, maxLength: 5 })
    .map((ps) => {
    const seen = new Set();
    return ps.filter((p) => {
        const key = p.name.toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
});
// ---------------------------------------------------------------------------
// Round-trip property
// ---------------------------------------------------------------------------
describe("pattern-stats — parseInstinct / renderInstincts round-trip", () => {
    /**
     * **Validates: Requirements 7.5, 7.14**
     */
    it("parseInstinct(renderInstincts(ps)) ≡ ps", () => {
        fc.assert(fc.property(patternsArb, (ps) => {
            const rendered = renderInstincts(ps);
            const parsed = parseInstinct(rendered);
            expect(parsed).toEqual(ps);
        }));
    });
    it("tolerates the legacy Confidence_Score / Tags layout", () => {
        const legacy = [
            "---",
            'updated: "2026-04-29"',
            "---",
            "",
            "## 模式列表",
            "",
            "### 正则 `.test()` 永远使用内联正则",
            "",
            "**Confidence_Score**: 0.85",
            "**Tags**: regex, testing",
            "",
            "Narrative description of the pattern.",
        ].join("\n");
        const parsed = parseInstinct(legacy);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].confidence).toBeCloseTo(0.85, 2);
        expect(parsed[0].tags).toEqual(["regex", "testing"]);
        expect(parsed[0].applications).toBe(0);
        expect(parsed[0].pattern_id).toBe("");
    });
});
// ---------------------------------------------------------------------------
// updatePatternStats invariants
// ---------------------------------------------------------------------------
describe("pattern-stats — updatePatternStats invariants", () => {
    /**
     * **Validates: Requirements 7.6, 7.7, 7.13**
     *
     * No matter how many times we fold a (possibly adversarial) stream
     * of outcomes into a pattern, the Beta-mean confidence stays in the
     * closed unit interval and the counter relationship
     * `successes + failures === applications` holds.
     */
    it("keeps confidence in [0,1] and counters coherent across any sequence", () => {
        const outcomeArb = fc.constantFrom("success", "failure");
        const startingPattern = {
            pattern_id: "pat-2026-05-05-001",
            name: "seed",
            confidence: 0.5,
            applications: 0,
            successes: 0,
            failures: 0,
            last_triggered: "2026-05-05",
            decay_threshold: 0.5,
            tags: [],
            body: "",
        };
        fc.assert(fc.property(fc.array(outcomeArb, { minLength: 1, maxLength: 50 }), (outcomes) => {
            let current = startingPattern;
            const now = new Date("2026-06-01T00:00:00Z");
            for (const outcome of outcomes) {
                current = updatePatternStats(current, outcome, now);
                expect(current.confidence).toBeGreaterThanOrEqual(0);
                expect(current.confidence).toBeLessThanOrEqual(1);
                expect(current.successes).toBeGreaterThanOrEqual(0);
                expect(current.failures).toBeGreaterThanOrEqual(0);
                expect(current.successes).toBeLessThanOrEqual(current.applications);
                expect(current.failures).toBeLessThanOrEqual(current.applications);
                expect(current.successes + current.failures).toBe(current.applications);
            }
        }));
    });
    it("applies the Beta(α=2, β=2) prior exactly on a single success", () => {
        const p = {
            pattern_id: "pat-2026-05-05-001",
            name: "seed",
            confidence: 0.5,
            applications: 0,
            successes: 0,
            failures: 0,
            last_triggered: "2026-05-05",
            decay_threshold: 0.5,
            tags: [],
            body: "",
        };
        const updated = updatePatternStats(p, "success", new Date("2026-05-10T00:00:00Z"));
        // (1 + 2) / (1 + 4) === 0.6
        expect(updated.confidence).toBeCloseTo(0.6, 10);
        expect(updated.applications).toBe(1);
        expect(updated.successes).toBe(1);
        expect(updated.last_triggered).toBe("2026-05-10");
    });
});
// ---------------------------------------------------------------------------
// findStaleOrDecayedPatterns subset property
// ---------------------------------------------------------------------------
describe("pattern-stats — findStaleOrDecayedPatterns", () => {
    /**
     * **Validates: Requirements 7.8, 7.13**
     *
     * The returned list is an order-preserving subset of the input for
     * any glossary / now / maxAgeDays tuple.
     */
    it("returns an order-preserving subset of the input patterns", () => {
        fc.assert(fc.property(patternsArb, dateArb, fc.integer({ min: 0, max: 365 }), (patterns, nowIso, maxAgeDays) => {
            const stale = findStaleOrDecayedPatterns(patterns, new Date(nowIso), maxAgeDays);
            for (const p of stale)
                expect(patterns).toContain(p);
            let lastIndex = -1;
            for (const p of stale) {
                const idx = patterns.indexOf(p);
                expect(idx).toBeGreaterThan(lastIndex);
                lastIndex = idx;
            }
        }));
    });
    it("marks patterns with enough samples and low confidence as decayed", () => {
        const decayed = {
            pattern_id: "pat-2026-05-05-001",
            name: "decayed",
            confidence: 0.3,
            applications: 10,
            successes: 2,
            failures: 8,
            last_triggered: "2026-05-05",
            decay_threshold: 0.5,
            tags: [],
            body: "",
        };
        const strong = {
            ...decayed,
            pattern_id: "pat-2026-05-05-002",
            name: "strong",
            confidence: 0.9,
            applications: 10,
            successes: 9,
            failures: 1,
        };
        const result = findStaleOrDecayedPatterns([decayed, strong], new Date("2026-05-10T00:00:00Z"), 60);
        expect(result).toEqual([decayed]);
    });
    it("marks patterns with stale last_triggered as stale", () => {
        const stale = {
            pattern_id: "pat-2026-01-01-001",
            name: "old",
            confidence: 0.9,
            applications: 20,
            successes: 18,
            failures: 2,
            last_triggered: "2026-01-01",
            decay_threshold: 0.5,
            tags: [],
            body: "",
        };
        const result = findStaleOrDecayedPatterns([stale], new Date("2026-06-01T00:00:00Z"), 60);
        expect(result).toEqual([stale]);
    });
});
// ---------------------------------------------------------------------------
// findUpgradableEpisodes
// ---------------------------------------------------------------------------
describe("pattern-stats — findUpgradableEpisodes", () => {
    function makeEp(overrides = {}) {
        return {
            schema_version: 2,
            id: "ep-2026-05-05-001",
            date: "2026-05-05",
            skill: "forge-review",
            tier: "standard",
            situation: "s",
            lesson: "l",
            outcome: "success",
            body: "",
            root_cause: "stale reference in doc",
            ...overrides,
        };
    }
    it("clusters recent same-root-cause episodes and returns drafts", () => {
        const episodes = [
            makeEp({ id: "ep-2026-05-05-001", date: "2026-05-05" }),
            makeEp({ id: "ep-2026-05-10-001", date: "2026-05-10" }),
            makeEp({ id: "ep-2026-05-20-001", date: "2026-05-20" }),
        ];
        const now = new Date("2026-05-25T00:00:00Z");
        const suggestions = findUpgradableEpisodes(episodes, [], now, 60, 3);
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].episodes).toHaveLength(3);
        expect(suggestions[0].patternDraft.tags).toContain("forge-review");
    });
    it("does not suggest when fewer than minOccurrences", () => {
        const episodes = [makeEp({ id: "ep-2026-05-05-001" })];
        const suggestions = findUpgradableEpisodes(episodes, [], new Date("2026-05-25T00:00:00Z"), 60, 3);
        expect(suggestions).toEqual([]);
    });
    it("filters out episodes outside the window", () => {
        const old = makeEp({ id: "ep-2026-01-01-001", date: "2026-01-01" });
        const episodes = [
            old,
            makeEp({ id: "ep-2026-05-05-001", date: "2026-05-05" }),
            makeEp({ id: "ep-2026-05-10-001", date: "2026-05-10" }),
        ];
        const suggestions = findUpgradableEpisodes(episodes, [], new Date("2026-05-25T00:00:00Z"), 60, 3);
        expect(suggestions).toEqual([]);
    });
});
//# sourceMappingURL=pattern-stats.property.test.js.map