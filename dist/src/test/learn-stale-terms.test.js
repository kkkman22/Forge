/**
 * Tests for `proposeStaleTerms` in `src/learn.ts`.
 *
 * `proposeStaleTerms` is the learn-level helper that surfaces stale active
 * glossary terms to the user before archival. Covers:
 *   - Stale term detection wraps `findStaleterms` with the default window
 *     (30 days)
 *   - The prompt is non-empty when there is at least one stale term and
 *     lists each term's canonical name
 *   - The prompt is empty when no terms are stale
 *   - Archived terms are never re-proposed
 *
 * **Validates: Requirements 1.11**
 */
import { describe, expect, it } from "vitest";
import { proposeStaleTerms } from "../src/learn.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const NOW = new Date("2026-05-05T00:00:00Z");
function term(overrides) {
    return {
        definition: "d",
        last_updated: "2026-05-05",
        ...overrides,
    };
}
function buildGlossary(terms, archivedTerms) {
    const out = { schema_version: 1, updated: "2026-05-05", terms };
    if (archivedTerms !== undefined)
        out.archivedTerms = archivedTerms;
    return out;
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("proposeStaleTerms — stale detection", () => {
    it("returns stale terms and a non-empty prompt when there are stale terms", () => {
        const fresh = term({ term: "Fresh", last_updated: "2026-04-20" }); // 15 days old
        const stale = term({ term: "Stale", last_updated: "2026-01-01" }); // >30 days old
        const glossary = buildGlossary([fresh, stale]);
        const result = proposeStaleTerms(glossary, NOW);
        expect(result.staleTerms).toEqual([stale]);
        expect(result.prompt.length).toBeGreaterThan(0);
        expect(result.prompt).toContain("Stale");
        expect(result.prompt).toContain("1");
    });
    it("defaults to a 30-day window matching findStaleterms", () => {
        const stale = term({ term: "Stale", last_updated: "2026-03-01" }); // >30 days old
        const borderline = term({ term: "Borderline", last_updated: "2026-04-20" }); // 15 days old
        const glossary = buildGlossary([stale, borderline]);
        const result = proposeStaleTerms(glossary, NOW);
        expect(result.staleTerms.map((t) => t.term)).toEqual(["Stale"]);
    });
    it("honours a custom maxAgeDays threshold in both the list and the prompt", () => {
        const t = term({ term: "OneWeekOld", last_updated: "2026-04-28" }); // 7 days old
        const glossary = buildGlossary([t]);
        const result = proposeStaleTerms(glossary, NOW, 5);
        expect(result.staleTerms).toEqual([t]);
        expect(result.prompt).toContain(">5");
        expect(result.prompt).toContain("OneWeekOld");
    });
    it("lists every stale term name in the prompt", () => {
        const a = term({ term: "Alpha", last_updated: "2025-01-01" });
        const b = term({ term: "Beta", last_updated: "2025-01-01" });
        const glossary = buildGlossary([a, b]);
        const result = proposeStaleTerms(glossary, NOW);
        expect(result.staleTerms).toEqual([a, b]);
        expect(result.prompt).toContain("Alpha");
        expect(result.prompt).toContain("Beta");
        expect(result.prompt).toContain("2"); // count
    });
});
describe("proposeStaleTerms — empty paths", () => {
    it("returns an empty list and empty prompt when no terms are stale", () => {
        const t = term({ term: "Fresh", last_updated: "2026-04-25" }); // 10 days old
        const glossary = buildGlossary([t]);
        const result = proposeStaleTerms(glossary, NOW);
        expect(result.staleTerms).toEqual([]);
        expect(result.prompt).toBe("");
    });
    it("returns an empty result for a glossary without any active terms", () => {
        const glossary = buildGlossary([]);
        const result = proposeStaleTerms(glossary, NOW);
        expect(result.staleTerms).toEqual([]);
        expect(result.prompt).toBe("");
    });
    it("never re-proposes already archived terms", () => {
        // Only active terms can be archived; entries that already live in
        // `archivedTerms` must not surface again even if their `last_updated`
        // is ancient.
        const fresh = term({ term: "Fresh", last_updated: "2026-04-25" });
        const archived = term({ term: "AlreadyArchived", last_updated: "2020-01-01" });
        const glossary = buildGlossary([fresh], [archived]);
        const result = proposeStaleTerms(glossary, NOW);
        expect(result.staleTerms).toEqual([]);
        expect(result.prompt).toBe("");
    });
});
//# sourceMappingURL=learn-stale-terms.test.js.map