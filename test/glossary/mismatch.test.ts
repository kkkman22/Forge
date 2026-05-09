/**
 * Tests for `src/glossary/mismatch.ts` — detectContextTermMismatch.
 *
 * Covers:
 *   - Same context → no mismatch reported
 *   - Cross-context → reports mismatch
 *   - `_shared` terms → never trigger mismatch
 *
 * **Validates: R1 Context boundary enforcement**
 */

import { describe, expect, it } from "vitest";
import type { GlossaryEntry, GlossaryRegistry } from "../../src/pack/types.js";
import { detectContextTermMismatch } from "../../src/glossary/mismatch.js";

function makeEntry(
  term: string,
  context: string,
  overrides?: Partial<GlossaryEntry>,
): GlossaryEntry {
  return {
    term,
    context,
    definition: `${term} definition`,
    aliases: [],
    updated: "2025-06-01",
    source: null,
    sourcePath: "/test",
    sourceLayer: "core",
    ...overrides,
  };
}

function makeRegistry(
  entries: GlossaryEntry[],
): GlossaryRegistry {
  const entryMap = new Map<string, GlossaryEntry>();
  const byTerm = new Map<string, GlossaryEntry[]>();

  for (const entry of entries) {
    entryMap.set(`${entry.context}::${entry.term}`, entry);
    let list = byTerm.get(entry.term);
    if (!list) {
      list = [];
      byTerm.set(entry.term, list);
    }
    list.push(entry);
  }

  return { entries: entryMap, byTerm };
}

describe("detectContextTermMismatch", () => {
  it("reports no mismatch when term is in the same context", () => {
    const registry = makeRegistry([
      makeEntry("Order", "orders"),
      makeEntry("Invoice", "billing"),
    ]);

    const mismatches = detectContextTermMismatch(
      "The Order was placed.",
      "orders",
      registry,
    );
    expect(mismatches).toHaveLength(0);
  });

  it("reports mismatch for cross-context term usage", () => {
    const registry = makeRegistry([
      makeEntry("Order", "orders"),
      makeEntry("Invoice", "billing"),
    ]);

    const mismatches = detectContextTermMismatch(
      "The Invoice was sent.",
      "orders",
      registry,
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].term).toBe("Invoice");
    expect(mismatches[0].usedContext).toBe("orders");
    expect(mismatches[0].definedIn).toEqual(["billing"]);
  });

  it("never reports mismatch for _shared terms", () => {
    const registry = makeRegistry([
      makeEntry("Epic", "_shared"),
      makeEntry("Order", "orders"),
    ]);

    // Using Epic in billing context should NOT be a mismatch because it's _shared
    const mismatches = detectContextTermMismatch(
      "The Epic was reviewed.",
      "billing",
      registry,
    );
    expect(mismatches).toHaveLength(0);
  });

  it("reports multiple mismatches for multiple cross-context terms", () => {
    const registry = makeRegistry([
      makeEntry("Order", "orders"),
      makeEntry("Invoice", "billing"),
      makeEntry("SKU", "inventory"),
    ]);

    const mismatches = detectContextTermMismatch(
      "The Invoice references SKU.",
      "orders",
      registry,
    );
    expect(mismatches).toHaveLength(2);
    const terms = mismatches.map((m) => m.term).sort();
    expect(terms).toEqual(["Invoice", "SKU"]);
  });

  it("deduplicates tokens — repeated cross-context term appears once", () => {
    const registry = makeRegistry([
      makeEntry("Invoice", "billing"),
    ]);

    const mismatches = detectContextTermMismatch(
      "Invoice Invoice Invoice",
      "orders",
      registry,
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].term).toBe("Invoice");
  });

  it("returns empty array for empty text", () => {
    const registry = makeRegistry([
      makeEntry("Order", "orders"),
    ]);

    const mismatches = detectContextTermMismatch("", "billing", registry);
    expect(mismatches).toHaveLength(0);
  });

  it("returns empty array for unknown terms", () => {
    const registry = makeRegistry([
      makeEntry("Order", "orders"),
    ]);

    const mismatches = detectContextTermMismatch(
      "Something completely unknown.",
      "billing",
      registry,
    );
    expect(mismatches).toHaveLength(0);
  });
});
