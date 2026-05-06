/**
 * Tests for `archiveTerm` and the `## Archived` parse/render round-trip.
 *
 * Covers the stale-term archival contract from Task 1.9:
 *   - `archiveTerm` moves a term from `terms` to `archivedTerms`
 *   - `parseGlossary(renderGlossary(g))` preserves archived entries
 *   - `archiveTerm` is a no-op when the term does not exist
 *   - re-archiving the same canonical name replaces the prior archived
 *     entry rather than duplicating it
 *
 * **Validates: Requirements 1.11**
 */
import { describe, expect, it } from "vitest";
import { archiveTerm, parseGlossary, renderGlossary, } from "../src/glossary.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function term(overrides) {
    return {
        definition: "placeholder definition",
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
// archiveTerm — behaviour
// ---------------------------------------------------------------------------
describe("archiveTerm — move semantics", () => {
    it("moves the matched term from terms to archivedTerms", () => {
        const a = term({ term: "Tier", definition: "routing dimension" });
        const b = term({ term: "Spec", definition: "locked requirement" });
        const g = buildGlossary([a, b]);
        const next = archiveTerm(g, "Tier");
        expect(next.terms).toEqual([b]);
        expect(next.archivedTerms).toEqual([a]);
    });
    it("matches the term name case- and whitespace-insensitively", () => {
        const a = term({ term: "Tier" });
        const g = buildGlossary([a]);
        const next = archiveTerm(g, "  tier  ");
        expect(next.terms).toEqual([]);
        expect(next.archivedTerms).toEqual([a]);
    });
    it("does not mutate the input glossary", () => {
        const a = term({ term: "Tier" });
        const g = buildGlossary([a]);
        const snapshot = JSON.parse(JSON.stringify(g));
        archiveTerm(g, "Tier");
        expect(g).toEqual(snapshot);
    });
    it("preserves the ordering of the remaining active terms", () => {
        const a = term({ term: "A" });
        const b = term({ term: "B" });
        const c = term({ term: "C" });
        const g = buildGlossary([a, b, c]);
        const next = archiveTerm(g, "B");
        expect(next.terms.map((t) => t.term)).toEqual(["A", "C"]);
    });
});
describe("archiveTerm — no-op paths", () => {
    it("returns the glossary unchanged when the term does not exist", () => {
        const a = term({ term: "Tier" });
        const g = buildGlossary([a]);
        const next = archiveTerm(g, "Unknown");
        expect(next).toBe(g);
    });
    it("returns the glossary unchanged when the name is blank", () => {
        const g = buildGlossary([term({ term: "Tier" })]);
        expect(archiveTerm(g, "")).toBe(g);
        expect(archiveTerm(g, "   ")).toBe(g);
    });
    it("does not treat already-archived entries as archivable", () => {
        // Requirement 1.11 says archivedTerms are never re-proposed. archiveTerm
        // mirrors that: a term living only in archivedTerms cannot be archived
        // again because it is no longer active.
        const archived = term({ term: "Legacy" });
        const g = buildGlossary([], [archived]);
        const next = archiveTerm(g, "Legacy");
        expect(next).toBe(g);
    });
});
describe("archiveTerm — replacement of existing archived entry", () => {
    it("replaces an existing archived entry with the same canonical name", () => {
        const oldArchived = term({
            term: "Legacy",
            definition: "previous definition",
            last_updated: "2025-01-01",
        });
        const active = term({
            term: "Legacy",
            definition: "newer definition",
            last_updated: "2026-05-05",
        });
        const g = buildGlossary([active], [oldArchived]);
        const next = archiveTerm(g, "Legacy");
        expect(next.archivedTerms).toHaveLength(1);
        expect(next.archivedTerms?.[0]).toEqual(active);
        expect(next.terms).toEqual([]);
    });
    it("matches prior archived entries case-insensitively when replacing", () => {
        const oldArchived = term({ term: "LEGACY", definition: "old" });
        const active = term({ term: "Legacy", definition: "new" });
        const g = buildGlossary([active], [oldArchived]);
        const next = archiveTerm(g, "Legacy");
        expect(next.archivedTerms).toHaveLength(1);
        expect(next.archivedTerms?.[0]).toEqual(active);
    });
});
// ---------------------------------------------------------------------------
// parseGlossary / renderGlossary — round-trip with archived terms
// ---------------------------------------------------------------------------
describe("parseGlossary + renderGlossary — archived section round-trip", () => {
    it("round-trips a glossary that carries both active and archived terms", () => {
        const original = {
            schema_version: 1,
            updated: "2026-05-05",
            terms: [
                term({ term: "Tier", definition: "routing dimension" }),
                term({ term: "Spec", definition: "locked requirement" }),
            ],
            archivedTerms: [term({ term: "LegacyTerm", definition: "deprecated concept" })],
        };
        const roundTripped = parseGlossary(renderGlossary(original));
        expect(roundTripped).toEqual(original);
    });
    it("renders the `## Archived` sentinel after the active terms", () => {
        const g = {
            schema_version: 1,
            updated: "2026-05-05",
            terms: [term({ term: "Active" })],
            archivedTerms: [term({ term: "Old" })],
        };
        const rendered = renderGlossary(g);
        const activeIndex = rendered.indexOf("## Active");
        const sentinelIndex = rendered.indexOf("## Archived");
        const oldIndex = rendered.indexOf("## Old");
        expect(activeIndex).toBeGreaterThan(-1);
        expect(sentinelIndex).toBeGreaterThan(activeIndex);
        expect(oldIndex).toBeGreaterThan(sentinelIndex);
    });
    it("omits the archived section when archivedTerms is absent or empty", () => {
        const g = {
            schema_version: 1,
            updated: "2026-05-05",
            terms: [term({ term: "Tier" })],
        };
        expect(renderGlossary(g)).not.toContain("## Archived");
        const withEmpty = { ...g, archivedTerms: [] };
        expect(renderGlossary(withEmpty)).not.toContain("## Archived");
    });
    it("preserves archived entries through an archive → render → parse cycle", () => {
        const g = buildGlossary([
            term({ term: "Tier", definition: "routing dimension" }),
            term({ term: "Spec", definition: "locked requirement" }),
        ]);
        const archived = archiveTerm(g, "Spec");
        const roundTripped = parseGlossary(renderGlossary(archived));
        expect(roundTripped.terms.map((t) => t.term)).toEqual(["Tier"]);
        expect(roundTripped.archivedTerms?.map((t) => t.term)).toEqual(["Spec"]);
    });
    it("treats a stray `## Archived` line without archived entries as an empty archive", () => {
        const content = [
            "---",
            "schema_version: 1",
            'updated: "2026-05-05"',
            "---",
            "",
            "# Forge Glossary",
            "",
            "## Tier",
            "**定义**: routing dimension",
            "**更新**: 2026-05-05",
            "",
            "## Archived",
            "",
        ].join("\n");
        const parsed = parseGlossary(content);
        expect(parsed.terms.map((t) => t.term)).toEqual(["Tier"]);
        expect(parsed.archivedTerms).toBeUndefined();
    });
});
//# sourceMappingURL=glossary-archive.test.js.map