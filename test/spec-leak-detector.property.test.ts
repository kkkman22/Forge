/**
 * Property tests for spec leak detector invariants.
 *
 * Invariants:
 *   - Empty banned registry → empty results for any spec text
 *   - Glossary coverage monotonicity: adding glossary entries only reduces findings
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BannedPatternRegistry, GlossaryEntry, GlossaryRegistry } from "../src/pack/types.js";
import { detectSpecLeak } from "../src/spec-leak-detector.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyGlossary(): GlossaryRegistry {
  return { entries: new Map(), byTerm: new Map() };
}

function makeBannedRegistry(
  categories: Record<string, { pattern: string; description: string }[]>,
): BannedPatternRegistry {
  const map = new Map<string, { pattern: string; description: string }[]>();
  for (const [name, patterns] of Object.entries(categories)) {
    map.set(name, patterns);
  }
  return { categories: map };
}

function makeGlossary(entries: GlossaryEntry[]): GlossaryRegistry {
  const entryMap = new Map<string, GlossaryEntry>();
  const byTerm = new Map<string, GlossaryEntry[]>();
  for (const e of entries) {
    entryMap.set(`${e.context}::${e.term}`, e);
    const arr = byTerm.get(e.term) ?? [];
    arr.push(e);
    byTerm.set(e.term, arr);
  }
  return { entries: entryMap, byTerm };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const textArb = fc.string({ minLength: 0, maxLength: 500 });

const bannedPatternArb = fc.record({
  pattern: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes("regex:")),
  description: fc.string({ minLength: 0, maxLength: 80 }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectSpecLeak property: empty banned → empty results", () => {
  it("always returns empty array when banned registry has no categories", () => {
    fc.assert(
      fc.property(textArb, (specText) => {
        const banned: BannedPatternRegistry = { categories: new Map() };
        const findings = detectSpecLeak(specText, "spec.md", banned, emptyGlossary(), "booking");
        expect(findings).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});

describe("detectSpecLeak property: glossary monotonicity", () => {
  it("adding glossary entries never increases findings count", () => {
    const banned = makeBannedRegistry({
      code: [
        { pattern: "UserService", description: "impl" },
        { pattern: "Redis", description: "infra" },
      ],
    });

    const specTextArb = fc.string({ minLength: 5, maxLength: 200 });

    fc.assert(
      fc.property(specTextArb, (specText) => {
        const glossaryEntries: GlossaryEntry[] = [
          {
            term: "UserService",
            context: "booking",
            definition: "allowed term",
            aliases: [],
            updated: "2026-01-01",
            source: null,
            sourcePath: "",
            sourceLayer: "core",
          },
        ];

        const findingsWithout = detectSpecLeak(
          specText,
          "spec.md",
          banned,
          emptyGlossary(),
          "booking",
        );

        const findingsWith = detectSpecLeak(
          specText,
          "spec.md",
          banned,
          makeGlossary(glossaryEntries),
          "booking",
        );

        expect(findingsWith.length).toBeLessThanOrEqual(findingsWithout.length);
      }),
      { numRuns: 300 },
    );
  });
});
