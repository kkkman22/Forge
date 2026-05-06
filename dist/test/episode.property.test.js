/**
 * Property-based and unit tests for the Episode data model.
 *
 * Covers:
 *   - Round-trip: `parseEpisode(renderEpisode(e))` ≡ `e` for any
 *     well-formed v2 episode
 *   - `generateEpisodeId` is idempotent and deterministic
 *   - Legacy (v1) parsing defaults fill sensibly
 *   - Structural validation rejects obviously broken v2 frontmatter
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.12**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateEpisodeId, parseEpisode, renderEpisode, } from "../src/episode.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/**
 * Generate a single-line scalar safe for the lightweight YAML
 * frontmatter helpers: no newlines, no literal `"`, no `#`, and no
 * surrounding whitespace. The helpers strip surrounding whitespace on
 * extraction, so a fixed-point round-trip requires pre-trimmed values.
 */
const scalarArb = fc
    .string({ minLength: 1, maxLength: 60 })
    .map((s) => s.replace(/[\n\r"#]/g, "").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.startsWith("-"))
    .filter((s) => !s.includes("---"));
/** Generate a positive integer zero-padded to three digits for ids. */
const seqArb = fc.integer({ min: 0, max: 999 });
const dateArb = fc
    .tuple(fc.integer({ min: 2020, max: 2099 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const idArb = fc.tuple(dateArb, seqArb).map(([d, n]) => `ep-${d}-${String(n).padStart(3, "0")}`);
const tierArb = fc.constantFrom("light", "standard", "full");
const outcomeArb = fc.constantFrom("success", "partial", "failure");
const skillArb = fc
    .constantFrom("forge-router", "forge-decide", "forge-spec", "forge-plan", "forge-build", "forge-review", "forge-test", "forge-ship", "forge-learn")
    .filter((s) => s.length > 0);
const ratingArb = fc.integer({ min: 1, max: 10 });
/**
 * Body text that does not accidentally look like a new frontmatter
 * block. We disallow leading `---` to keep the parser boundary clear
 * and disallow embedded `---\n` lines for the same reason.
 */
const bodyArb = fc
    .string({ maxLength: 160 })
    .map((s) => s.replace(/\r/g, ""))
    .filter((s) => !s.trimStart().startsWith("---"))
    .filter((s) => !s.includes("\n---"));
const relatedSkillsArb = fc.array(skillArb, { minLength: 0, maxLength: 3 });
/** Generate a complete v2 episode record. */
const episodeV2Arb = fc
    .record({
    schema_version: fc.constant(2),
    id: idArb,
    date: dateArb,
    skill: skillArb,
    tier: tierArb,
    situation: scalarArb,
    root_cause: fc.option(scalarArb, { nil: undefined }),
    solution: fc.option(scalarArb, { nil: undefined }),
    lesson: scalarArb,
    outcome: outcomeArb,
    user_rating: fc.option(ratingArb, { nil: undefined }),
    related_pattern: fc.option(scalarArb, { nil: undefined }),
    related_skills: fc.option(relatedSkillsArb, { nil: undefined }),
    body: bodyArb,
})
    .map((e) => {
    const out = {
        schema_version: e.schema_version,
        id: e.id,
        date: e.date,
        skill: e.skill,
        tier: e.tier,
        situation: e.situation,
        lesson: e.lesson,
        outcome: e.outcome,
        body: e.body,
    };
    if (e.root_cause !== undefined)
        out.root_cause = e.root_cause;
    if (e.solution !== undefined)
        out.solution = e.solution;
    if (e.user_rating !== undefined)
        out.user_rating = e.user_rating;
    if (e.related_pattern !== undefined)
        out.related_pattern = e.related_pattern;
    if (e.related_skills !== undefined && e.related_skills.length > 0) {
        out.related_skills = e.related_skills;
    }
    return out;
});
// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
describe("episode — parseEpisode / renderEpisode round-trip", () => {
    /**
     * **Validates: Requirements 7.3, 7.4**
     *
     * The rendered form of any v2 episode parses back to an equal
     * structure. This is the central contract that lets downstream code
     * treat `.md` files as a typed record store.
     */
    it("parseEpisode(renderEpisode(e)) ≡ e for v2 records", () => {
        fc.assert(fc.property(episodeV2Arb, (e) => {
            const rendered = renderEpisode(e);
            const parsed = parseEpisode(rendered);
            expect(parsed).toEqual(e);
        }));
    });
    it("returns null for content without frontmatter", () => {
        expect(parseEpisode("just a body\nno frontmatter here")).toBeNull();
    });
    it("returns null for v2 records missing required fields", () => {
        const withoutSkill = [
            "---",
            "schema_version: 2",
            "id: ep-2026-05-05-001",
            "date: 2026-05-05",
            "tier: light",
            'situation: "s"',
            'lesson: "l"',
            "outcome: success",
            "---",
            "",
        ].join("\n");
        expect(parseEpisode(withoutSkill)).toBeNull();
    });
    it("treats frontmatter without schema_version as legacy v1", () => {
        const legacy = [
            "---",
            "updated: 2026-04-29",
            "---",
            "",
            "## Summary",
            "Legacy narrative body preserved.",
        ].join("\n");
        const parsed = parseEpisode(legacy);
        expect(parsed).not.toBeNull();
        if (parsed === null)
            return;
        expect(parsed.schema_version).toBe(1);
        expect(parsed.body).toContain("Legacy narrative body preserved.");
    });
});
// ---------------------------------------------------------------------------
// Episode id idempotence
// ---------------------------------------------------------------------------
describe("episode — generateEpisodeId", () => {
    /**
     * **Validates: Requirements 7.12**
     *
     * `generateEpisodeId` is a pure function of its inputs: calling it
     * twice with the same `(date, sequenceInDay)` yields the same id.
     */
    it("is idempotent for any (date, seq) pair", () => {
        fc.assert(fc.property(dateArb, seqArb, (date, seq) => {
            const a = generateEpisodeId(date, seq);
            const b = generateEpisodeId(date, seq);
            expect(a).toBe(b);
        }));
    });
    it("zero-pads the sequence to three digits", () => {
        expect(generateEpisodeId("2026-05-05", 1)).toBe("ep-2026-05-05-001");
        expect(generateEpisodeId("2026-05-05", 42)).toBe("ep-2026-05-05-042");
        expect(generateEpisodeId("2026-05-05", 100)).toBe("ep-2026-05-05-100");
    });
    it("clamps negative and fractional sequences", () => {
        expect(generateEpisodeId("2026-05-05", -1)).toBe("ep-2026-05-05-000");
        expect(generateEpisodeId("2026-05-05", 2.7)).toBe("ep-2026-05-05-002");
    });
});
//# sourceMappingURL=episode.property.test.js.map