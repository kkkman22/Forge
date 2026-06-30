import { describe, expect, it } from "vitest";
import { mergeGlossaries } from "../../src/glossary/merge.js";
import type { Glossary, GlossaryTerm } from "../../src/glossary.js";
import type { GlossaryEntry } from "../../src/pack/types.js";

function flatTerm(term: string, definition: string, aliases?: string[]): GlossaryTerm {
  return { term, definition, last_updated: "2026-01-01", ...(aliases ? { aliases } : {}) };
}

function flatGlossary(terms: GlossaryTerm[]): Glossary {
  return { schema_version: 1, updated: "2026-01-01", terms };
}

function packEntry(
  term: string,
  definition: string,
  opts: { aliases?: string[]; updated?: string; source?: string | null } = {},
): GlossaryEntry {
  return {
    term,
    context: `context for ${term}`,
    definition,
    aliases: opts.aliases ?? [],
    updated: opts.updated ?? "2026-02-02",
    source: opts.source === undefined ? null : opts.source,
    sourcePath: `/packs/pms/glossary/${term}.md`,
    sourceLayer: "pack:pms",
  };
}

describe("mergeGlossaries", () => {
  it("returns flat unchanged (identity) when packEntries is empty", () => {
    const flat = flatGlossary([flatTerm("Tier", "复杂度档位")]);
    const result = mergeGlossaries(flat, []);
    expect(result).toBe(flat); // same reference — no allocation
  });

  it("appends pack terms the flat file does not cover", () => {
    const flat = flatGlossary([flatTerm("Tier", "复杂度档位")]);
    const result = mergeGlossaries(flat, [packEntry("Reservation", "a booking")]);
    expect(result.terms).toHaveLength(2);
    expect(result.terms.map((t) => t.term)).toEqual(["Tier", "Reservation"]);
    expect(result.terms[1].definition).toBe("a booking");
    // schema_version + updated preserved from flat
    expect(result.schema_version).toBe(flat.schema_version);
    expect(result.updated).toBe(flat.updated);
  });

  it("skips a pack term whose name collides with a flat term (flat wins)", () => {
    const flat = flatGlossary([flatTerm("Reservation", "FLAT definition")]);
    const result = mergeGlossaries(flat, [packEntry("Reservation", "PACK definition")]);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].definition).toBe("FLAT definition"); // flat wins
  });

  it("skips a pack term whose alias collides with a flat term name", () => {
    const flat = flatGlossary([flatTerm("Reservation", "FLAT")]);
    const result = mergeGlossaries(flat, [
      packEntry("Booking", "PACK", { aliases: ["Reservation"] }), // alias collides
    ]);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].term).toBe("Reservation");
  });

  it("skips a pack term whose name collides with a flat alias", () => {
    const flat = flatGlossary([flatTerm("Reservation", "FLAT", ["Booking"])]);
    const result = mergeGlossaries(flat, [packEntry("Booking", "PACK")]);
    expect(result.terms).toHaveLength(1); // Booking skipped, covered by flat alias
  });

  it("dedupes case- and whitespace-insensitively", () => {
    const flat = flatGlossary([flatTerm("Reservation", "FLAT")]);
    const result = mergeGlossaries(flat, [
      packEntry("reservation", "PACK lower"), // same term, different case
      packEntry(" Reservation ", "PACK spaces"), // same term, surrounding spaces
    ]);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].definition).toBe("FLAT");
  });

  it("maps GlossaryEntry fields to GlossaryTerm", () => {
    const flat = flatGlossary([]);
    const result = mergeGlossaries(flat, [
      packEntry("Folio", "guest bill", {
        aliases: ["Bill"],
        updated: "2026-03-03",
        source: "pms-pack",
      }),
    ]);
    const appended = result.terms[0];
    expect(appended.term).toBe("Folio");
    expect(appended.definition).toBe("guest bill");
    expect(appended.aliases).toEqual(["Bill"]);
    expect(appended.last_updated).toBe("2026-03-03");
    expect(appended.source_session).toBe("pms-pack");
  });

  it("omits aliases when the pack entry has none", () => {
    const flat = flatGlossary([]);
    const result = mergeGlossaries(flat, [packEntry("Solo", "no aliases")]);
    expect(result.terms[0].aliases).toBeUndefined();
  });

  it("returns identity when all pack terms are covered by flat", () => {
    const flat = flatGlossary([flatTerm("A", "flatA"), flatTerm("B", "flatB")]);
    const result = mergeGlossaries(flat, [packEntry("A", "packA"), packEntry("B", "packB")]);
    expect(result).toBe(flat); // nothing appended → identity
  });

  it("dedupes pack-vs-pack term collisions (only first appended)", () => {
    // Two packs define the same term name in different contexts — must produce
    // ONE appended entry, not duplicates (quality review P2-1).
    const flat = flatGlossary([flatTerm("Tier", "档位")]);
    const result = mergeGlossaries(flat, [
      packEntry("Guest", "pms definition"),
      packEntry("Guest", "pos conflicting definition"),
    ]);
    const guestTerms = result.terms.filter((t) => t.term === "Guest");
    expect(guestTerms).toHaveLength(1); // deduped, not duplicated
    expect(guestTerms[0].definition).toBe("pms definition"); // first wins
  });

  it("dedupes a pack alias that collides with a sibling pack term", () => {
    const flat = flatGlossary([]);
    const result = mergeGlossaries(flat, [
      packEntry("Guest", "pms", { aliases: ["Visitor"] }),
      packEntry("Visitor", "pos"), // alias-collides with the appended Guest
    ]);
    const names = result.terms.map((t) => t.term);
    expect(names).toEqual(["Guest"]); // Visitor skipped (covered by Guest's alias)
  });
});
