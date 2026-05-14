/**
 * Property-based tests for the Glossary Registry parser/renderer.
 *
 * Covers the round-trip property for Task 1.1:
 *   - `parseGlossary(renderGlossary(g))` is structurally equivalent to `g`
 *     for any well-formed `Glossary` value
 *
 * **Validates: Requirements 1.1, 1.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseGlossary, renderGlossary, } from "../src/glossary.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/**
 * Generate a glossary term name. Constrained to avoid characters that would
 * collide with markdown structural tokens (`#`, newlines) or the YAML
 * frontmatter delimiter. Trimmed and non-empty. Also excludes the literal
 * "Archived" name because it collides with the sentinel H2 heading that
 * partitions active / archived entries during render.
 */
const termNameArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .map((s) => s.replace(/[\n\r#]/g, "").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.includes("---"))
    .filter((s) => s !== "Archived");
/**
 * Generate a single-line definition. Excludes newlines so the parser's
 * line-based field extraction always sees the whole definition on one
 * line. Excludes leading `##` to avoid accidental heading collisions.
 */
const definitionArb = fc
    .string({ minLength: 1, maxLength: 80 })
    .map((s) => s.replace(/[\n\r]/g, " ").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.startsWith("##"))
    .filter((s) => !s.includes("---"));
/**
 * Generate an alias token. Aliases are joined on comma at render time, so
 * disallow commas and the alternate separator `、` to keep the round-trip
 * lossless.
 */
const aliasArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .map((s) => s.replace(/[\n\r,、#]/g, "").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.includes("---"));
/** Generate an ISO-like date. */
const dateArb = fc
    .tuple(fc.integer({ min: 2020, max: 2099 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
/** Generate a source session filename. */
const sourceSessionArb = fc
    .string({ minLength: 1, maxLength: 40 })
    .map((s) => s.replace(/[\n\r"#]/g, "").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.includes("---"));
/** Generate a single `GlossaryTerm`. Optional fields appear independently. */
const termArb = fc
    .record({
    term: termNameArb,
    definition: definitionArb,
    last_updated: dateArb,
    aliases: fc.option(fc.array(aliasArb, { minLength: 1, maxLength: 3 }), { nil: undefined }),
    source_session: fc.option(sourceSessionArb, { nil: undefined }),
})
    .map((t) => {
    const out = {
        term: t.term,
        definition: t.definition,
        last_updated: t.last_updated,
    };
    if (t.aliases !== undefined)
        out.aliases = t.aliases;
    if (t.source_session !== undefined)
        out.source_session = t.source_session;
    return out;
});
/**
 * Generate a full `Glossary`. Terms are deduplicated by name because the
 * rendered format keys terms on their H2 heading, so duplicates would
 * collapse on round-trip. The same deduplication runs across the active
 * and archived sections so no name collides across the partition.
 */
const glossaryArb = fc
    .record({
    schema_version: fc.integer({ min: 1, max: 100 }),
    updated: dateArb,
    terms: fc.array(termArb, { minLength: 0, maxLength: 8 }),
    archivedTerms: fc.option(fc.array(termArb, { minLength: 0, maxLength: 4 }), { nil: undefined }),
})
    .map((g) => {
    const seen = new Set();
    const terms = g.terms.filter((t) => {
        if (seen.has(t.term))
            return false;
        seen.add(t.term);
        return true;
    });
    const out = { schema_version: g.schema_version, updated: g.updated, terms };
    if (g.archivedTerms !== undefined) {
        const archived = g.archivedTerms.filter((t) => {
            if (seen.has(t.term))
                return false;
            seen.add(t.term);
            return true;
        });
        if (archived.length > 0) {
            out.archivedTerms = archived;
        }
    }
    return out;
});
// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
describe("glossary — parse/render round-trip", () => {
    /**
     * **Validates: Requirements 1.1, 1.2**
     *
     * For any well-formed glossary value, rendering then parsing reproduces
     * the original structure. This is the central invariant that lets
     * downstream skills treat the glossary as a structured store while using
     * markdown as the on-disk representation.
     */
    it("parseGlossary(renderGlossary(g)) ≡ g", () => {
        fc.assert(fc.property(glossaryArb, (g) => {
            const rendered = renderGlossary(g);
            const parsed = parseGlossary(rendered);
            expect(parsed).toEqual(g);
        }));
    });
});
// ---------------------------------------------------------------------------
// Query, conflict, merge, and staleness properties (Task 1.2)
// ---------------------------------------------------------------------------
import { detectConflict, findStaleterms, findTerm, mergeTerm, } from "../src/glossary.js";
/**
 * Build a glossary value directly, bypassing the markdown round-trip
 * machinery. Useful when the test only cares about in-memory operations.
 */
function buildGlossary(terms) {
    return { schema_version: 1, updated: "2026-05-05", terms };
}
describe("glossary — findTerm", () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * `findTerm` resolves both canonical names and aliases
     * case-insensitively, for any non-empty glossary.
     */
    it("resolves both canonical name and any alias case-insensitively", () => {
        /**
         * Since canonical names are unique per glossary (the generator dedupes
         * them) but aliases may repeat across terms, we assert only that
         * `findTerm` returns *some* term whose name or alias matches, not the
         * specific term we iterated from.
         */
        const matchesQuery = (term, query) => {
            const needle = query.toLowerCase().trim();
            if (term.term.toLowerCase().trim() === needle)
                return true;
            if (term.aliases !== undefined) {
                return term.aliases.some((a) => a.toLowerCase().trim() === needle);
            }
            return false;
        };
        fc.assert(fc.property(glossaryArb, (g) => {
            for (const term of g.terms) {
                // Canonical lookup resolves to *some* term that matches the query.
                // When an earlier term carries this term's canonical name as an
                // alias, findTerm returns the earlier term — that is still valid.
                const canonicalHit = findTerm(g, term.term);
                expect(canonicalHit).not.toBeNull();
                if (canonicalHit !== null)
                    expect(matchesQuery(canonicalHit, term.term)).toBe(true);
                const upperHit = findTerm(g, term.term.toUpperCase());
                expect(upperHit).not.toBeNull();
                if (upperHit !== null)
                    expect(matchesQuery(upperHit, term.term.toUpperCase())).toBe(true);
                // Alias lookup resolves to some term that actually carries that
                // alias; when multiple terms share an alias, the first wins.
                if (term.aliases !== undefined) {
                    for (const alias of term.aliases) {
                        const hit = findTerm(g, alias);
                        expect(hit).not.toBeNull();
                        expect(hit).not.toBeUndefined();
                        if (hit !== null)
                            expect(matchesQuery(hit, alias)).toBe(true);
                    }
                }
            }
        }));
    });
    it("returns null for the empty query", () => {
        const g = buildGlossary([
            { term: "Tier", definition: "routing dimension", last_updated: "2026-05-05" },
        ]);
        expect(findTerm(g, "")).toBeNull();
        expect(findTerm(g, "   ")).toBeNull();
    });
    it("returns null when no term matches", () => {
        const g = buildGlossary([
            { term: "Tier", definition: "routing dimension", last_updated: "2026-05-05" },
        ]);
        expect(findTerm(g, "unknown")).toBeNull();
    });
});
describe("glossary — detectConflict", () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * When a candidate shares a canonical name with an existing term but
     * carries a different definition, `detectConflict` must surface this as
     * `hasConflict=true` with reason `same_term_different_definition`. This
     * is the property that gates user clarification in forge-spec /
     * forge-decide.
     */
    it("flags same name + different definition as a conflict", () => {
        const candidateArb = termArb.filter((t) => t.definition.trim().length > 0);
        fc.assert(fc.property(glossaryArb, candidateArb, definitionArb, (g, candidate, altDefinition) => {
            // Construct an existing term that clashes with the candidate.
            const existing = {
                term: candidate.term,
                definition: altDefinition,
                last_updated: candidate.last_updated,
            };
            // Skip degenerate cases where the "different" definition is
            // actually the same after trimming, or where the glossary already
            // contains this term under another casing.
            if (existing.definition.trim() === candidate.definition.trim())
                return;
            if (g.terms.some((t) => t.term.toLowerCase().trim() === candidate.term.toLowerCase().trim())) {
                return;
            }
            const withExisting = { ...g, terms: [existing, ...g.terms] };
            const result = detectConflict(withExisting, candidate);
            expect(result.hasConflict).toBe(true);
            expect(result.reason).toBe("same_term_different_definition");
            expect(result.conflictingTerm).toEqual(existing);
        }));
    });
    it("does not flag the identical term (same name, same definition)", () => {
        const g = buildGlossary([
            { term: "Spec", definition: "locked requirement artefact", last_updated: "2026-05-05" },
        ]);
        const candidate = {
            term: "Spec",
            definition: "locked requirement artefact",
            last_updated: "2026-05-06",
        };
        expect(detectConflict(g, candidate).hasConflict).toBe(false);
    });
    it("flags an alias that collides with another term's canonical name", () => {
        const g = buildGlossary([
            { term: "Tier", definition: "routing dimension", last_updated: "2026-05-05" },
        ]);
        const candidate = {
            term: "Level",
            definition: "separate concept",
            aliases: ["Tier"],
            last_updated: "2026-05-05",
        };
        const result = detectConflict(g, candidate);
        expect(result.hasConflict).toBe(true);
        expect(result.reason).toBe("same_alias_different_term");
    });
});
describe("glossary — mergeTerm", () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * `mergeTerm` is idempotent under each strategy: applying the same merge
     * twice yields the same glossary as applying it once. Writers rely on
     * this so replays during recovery or re-ingestion do not drift the
     * glossary.
     */
    it("is idempotent under append, replace, and add_alias", () => {
        const strategyArb = fc.constantFrom("append", "replace", "add_alias");
        fc.assert(fc.property(glossaryArb, termArb, strategyArb, (g, candidate, strategy) => {
            const once = mergeTerm(g, candidate, strategy);
            const twice = mergeTerm(once, candidate, strategy);
            expect(twice).toEqual(once);
        }));
    });
    it("append adds a new term and is a no-op for existing names", () => {
        const existing = {
            term: "Tier",
            definition: "routing dimension",
            last_updated: "2026-05-05",
        };
        const g = buildGlossary([existing]);
        const candidate = {
            term: "Spec",
            definition: "locked requirement",
            last_updated: "2026-05-05",
        };
        const added = mergeTerm(g, candidate, "append");
        expect(added.terms).toHaveLength(2);
        expect(added.terms[1]).toEqual(candidate);
        // Appending an entry whose name already exists is a no-op, even when
        // the definition differs (conflict resolution is the caller's job).
        const duplicate = {
            term: "Tier",
            definition: "something else",
            last_updated: "2026-05-06",
        };
        const noop = mergeTerm(added, duplicate, "append");
        expect(noop).toEqual(added);
    });
    it("replace overwrites the matching term in place", () => {
        const existing = {
            term: "Tier",
            definition: "routing dimension",
            last_updated: "2026-05-05",
        };
        const g = buildGlossary([existing]);
        const candidate = {
            term: "Tier",
            definition: "updated definition",
            last_updated: "2026-05-06",
        };
        const replaced = mergeTerm(g, candidate, "replace");
        expect(replaced.terms).toHaveLength(1);
        expect(replaced.terms[0]).toEqual(candidate);
    });
    it("add_alias dedupes aliases case-insensitively", () => {
        const existing = {
            term: "Tier",
            definition: "routing dimension",
            aliases: ["档位"],
            last_updated: "2026-05-05",
        };
        const g = buildGlossary([existing]);
        const candidate = {
            term: "Tier",
            definition: "routing dimension",
            aliases: ["档位", "复杂度档位"],
            last_updated: "2026-05-05",
        };
        const merged = mergeTerm(g, candidate, "add_alias");
        expect(merged.terms[0].aliases).toEqual(["档位", "复杂度档位"]);
    });
});
describe("glossary — findStaleterms", () => {
    /**
     * **Validates: Requirements 1.11**
     *
     * The returned stale list is always a subset (preserving order) of the
     * input terms. This invariant lets downstream code treat the result as a
     * filter of the glossary without structural surprises.
     */
    it("returns a subset of input terms in input order", () => {
        fc.assert(fc.property(glossaryArb, dateArb, fc.integer({ min: 0, max: 365 }), (g, nowIso, maxAge) => {
            const stale = findStaleterms(g, new Date(nowIso), maxAge);
            // Subset
            for (const t of stale) {
                expect(g.terms).toContainEqual(t);
            }
            // Order-preserving subset: the indices of stale terms inside the
            // original list are strictly increasing.
            let lastIndex = -1;
            for (const t of stale) {
                const idx = g.terms.indexOf(t);
                expect(idx).toBeGreaterThan(lastIndex);
                lastIndex = idx;
            }
        }));
    });
    it("defaults to a 30-day window", () => {
        const now = new Date("2026-05-05T00:00:00Z");
        const fresh = {
            term: "Fresh",
            definition: "d",
            last_updated: "2026-04-20", // 15 days old
        };
        const stale = {
            term: "Stale",
            definition: "d",
            last_updated: "2026-01-01", // > 30 days old
        };
        const g = buildGlossary([fresh, stale]);
        const result = findStaleterms(g, now);
        expect(result).toEqual([stale]);
    });
    it("treats malformed or empty last_updated as stale", () => {
        const now = new Date("2026-05-05T00:00:00Z");
        const malformed = {
            term: "Malformed",
            definition: "d",
            last_updated: "not-a-date",
        };
        const empty = {
            term: "Empty",
            definition: "d",
            last_updated: "",
        };
        const g = buildGlossary([malformed, empty]);
        expect(findStaleterms(g, now, 30)).toEqual([malformed, empty]);
    });
});
//# sourceMappingURL=glossary.property.test.js.map