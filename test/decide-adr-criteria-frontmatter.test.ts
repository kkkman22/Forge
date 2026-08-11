/**
 * Unit tests for ADR frontmatter extension fields (Requirements 2.3, 2.7).
 *
 * Task 2.6 extends the ADR frontmatter with three optional fields
 * produced by the three-question gate in `/tinkerman decide`:
 *   - `reversibility`:           "hard" | "soft"
 *   - `surprising`:              boolean
 *   - `trade_off_alternatives`:  string[]
 *
 * The fields are additive and never conflict with the existing ADR
 * schema shared with the `engineering-governance-hardening` spec. They
 * are emitted only when set on the `AdrEntry`, so ADRs authored before
 * the gate landed round-trip byte-identically.
 *
 * Covers:
 *   - `finalizeAdr` propagates the criteria inputs onto the new entry
 *   - `renderAdrFileContent` emits the fields after `deciders` and
 *     before `related_adrs`
 *   - `renderAdrFileContent` omits each field when it is undefined
 *     (or an empty `trade_off_alternatives` array)
 *   - `parseAdrFrontmatter` recovers all three fields losslessly
 *   - round-trip: render → parse recovers the exact entry
 *
 * **Validates: Requirements 2.3, 2.7**
 */

import { describe, expect, it } from "vitest";
import { type AdrEntry, parseAdrFrontmatter } from "../src/adr-registry.js";
import { type FinalizeAdrInput, finalizeAdr, renderAdrFileContent } from "../src/decide.js";

// ---------------------------------------------------------------------------
// renderAdrFileContent — criteria fields emission
// ---------------------------------------------------------------------------

describe("renderAdrFileContent — ADR criteria fields", () => {
  const baseEntry: AdrEntry = {
    id: "ADR-0007",
    title: "Adopt approach X",
    status: "accepted",
    date: "2026-05-10",
    deciders: ["@maintainer-a"],
    filePath: ".forge/decisions/ADR-0007-x.md",
  };

  it("omits all three criteria fields when unset", () => {
    const rendered = renderAdrFileContent(baseEntry, "## Context\n\nBody.\n");
    expect(rendered).not.toContain("reversibility:");
    expect(rendered).not.toContain("surprising:");
    expect(rendered).not.toContain("trade_off_alternatives:");
  });

  it("emits reversibility when set to 'hard'", () => {
    const entry: AdrEntry = { ...baseEntry, reversibility: "hard" };
    const rendered = renderAdrFileContent(entry, "");
    expect(rendered).toContain("reversibility: hard");
  });

  it("emits reversibility when set to 'soft'", () => {
    const entry: AdrEntry = { ...baseEntry, reversibility: "soft" };
    const rendered = renderAdrFileContent(entry, "");
    expect(rendered).toContain("reversibility: soft");
  });

  it("emits surprising: true as lowercase 'true'", () => {
    const entry: AdrEntry = { ...baseEntry, surprising: true };
    const rendered = renderAdrFileContent(entry, "");
    expect(rendered).toContain("surprising: true");
  });

  it("emits surprising: false when explicitly false", () => {
    const entry: AdrEntry = { ...baseEntry, surprising: false };
    const rendered = renderAdrFileContent(entry, "");
    expect(rendered).toContain("surprising: false");
  });

  it("emits trade_off_alternatives as indented YAML list when non-empty", () => {
    const entry: AdrEntry = {
      ...baseEntry,
      trade_off_alternatives: ["Use SQLite embedded storage", "Use external Postgres"],
    };
    const rendered = renderAdrFileContent(entry, "");
    expect(rendered).toContain("trade_off_alternatives:");
    expect(rendered).toContain('  - "Use SQLite embedded storage"');
    expect(rendered).toContain('  - "Use external Postgres"');
  });

  it("omits trade_off_alternatives when provided as an empty array", () => {
    const entry: AdrEntry = { ...baseEntry, trade_off_alternatives: [] };
    const rendered = renderAdrFileContent(entry, "");
    expect(rendered).not.toContain("trade_off_alternatives:");
  });

  it("emits criteria fields after 'deciders' and before 'related_adrs'", () => {
    const entry: AdrEntry = {
      ...baseEntry,
      reversibility: "hard",
      surprising: true,
      trade_off_alternatives: ["alt A", "alt B"],
      related_adrs: ["ADR-0001"],
      supersedes: "ADR-0002",
    };
    const rendered = renderAdrFileContent(entry, "");

    const decidersIdx = rendered.indexOf("deciders:");
    const reversibilityIdx = rendered.indexOf("reversibility:");
    const surprisingIdx = rendered.indexOf("surprising:");
    const tradeOffIdx = rendered.indexOf("trade_off_alternatives:");
    const relatedIdx = rendered.indexOf("related_adrs:");
    const supersedesIdx = rendered.indexOf("supersedes:");

    expect(decidersIdx).toBeGreaterThan(-1);
    expect(reversibilityIdx).toBeGreaterThan(decidersIdx);
    expect(surprisingIdx).toBeGreaterThan(reversibilityIdx);
    expect(tradeOffIdx).toBeGreaterThan(surprisingIdx);
    expect(relatedIdx).toBeGreaterThan(tradeOffIdx);
    expect(supersedesIdx).toBeGreaterThan(relatedIdx);
  });

  it("escapes double quotes in trade_off_alternatives items", () => {
    const entry: AdrEntry = {
      ...baseEntry,
      trade_off_alternatives: ['use "Postgres" in Docker'],
    };
    const rendered = renderAdrFileContent(entry, "");
    expect(rendered).toContain('  - "use \\"Postgres\\" in Docker"');
  });
});

// ---------------------------------------------------------------------------
// parseAdrFrontmatter — round-trip recovery of criteria fields
// ---------------------------------------------------------------------------

describe("parseAdrFrontmatter — ADR criteria fields round-trip", () => {
  it("recovers reversibility / surprising / trade_off_alternatives via render → parse", () => {
    const entry: AdrEntry = {
      id: "ADR-0042",
      title: "Adopt Zod",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@a", "@b"],
      reversibility: "hard",
      surprising: true,
      trade_off_alternatives: ["Use Joi", "Use Yup", "Hand-rolled validation"],
      filePath: ".forge/decisions/ADR-0042-adopt-zod.md",
    };
    const rendered = renderAdrFileContent(entry, "## Decision\n\nUse Zod.\n");
    const parsed = parseAdrFrontmatter(rendered);

    expect(parsed).not.toBeNull();
    expect(parsed?.reversibility).toBe("hard");
    expect(parsed?.surprising).toBe(true);
    expect(parsed?.trade_off_alternatives).toEqual([
      "Use Joi",
      "Use Yup",
      "Hand-rolled validation",
    ]);
  });

  it("recovers surprising: false correctly", () => {
    const entry: AdrEntry = {
      id: "ADR-0008",
      title: "Not surprising",
      status: "proposed",
      date: "2026-05-10",
      deciders: ["@a"],
      surprising: false,
      filePath: "x.md",
    };
    const rendered = renderAdrFileContent(entry, "");
    const parsed = parseAdrFrontmatter(rendered);
    expect(parsed?.surprising).toBe(false);
  });

  it("leaves criteria fields undefined when absent from the frontmatter", () => {
    const content = [
      "---",
      'id: "ADR-0001"',
      'title: "Legacy ADR"',
      "status: accepted",
      'date: "2026-05-10"',
      "deciders:",
      "  - @maintainer-a",
      "---",
      "",
      "Body.",
    ].join("\n");

    const parsed = parseAdrFrontmatter(content);
    expect(parsed).not.toBeNull();
    expect(parsed?.reversibility).toBeUndefined();
    expect(parsed?.surprising).toBeUndefined();
    expect(parsed?.trade_off_alternatives).toBeUndefined();
  });

  it("ignores reversibility values outside the allowed set", () => {
    const content = [
      "---",
      'id: "ADR-0001"',
      'title: "Weird reversibility"',
      "status: accepted",
      'date: "2026-05-10"',
      "deciders:",
      "  - @a",
      "reversibility: maybe",
      "---",
      "",
    ].join("\n");

    const parsed = parseAdrFrontmatter(content);
    expect(parsed).not.toBeNull();
    expect(parsed?.reversibility).toBeUndefined();
  });

  it("ignores surprising values that are neither 'true' nor 'false'", () => {
    const content = [
      "---",
      'id: "ADR-0001"',
      'title: "Weird surprising"',
      "status: accepted",
      'date: "2026-05-10"',
      "deciders:",
      "  - @a",
      "surprising: yes",
      "---",
      "",
    ].join("\n");

    const parsed = parseAdrFrontmatter(content);
    expect(parsed).not.toBeNull();
    expect(parsed?.surprising).toBeUndefined();
  });

  it("parses inline-array trade_off_alternatives", () => {
    const content = [
      "---",
      'id: "ADR-0001"',
      'title: "Inline alternatives"',
      "status: accepted",
      'date: "2026-05-10"',
      "deciders:",
      "  - @a",
      'trade_off_alternatives: ["alt 1", "alt 2"]',
      "---",
      "",
    ].join("\n");

    const parsed = parseAdrFrontmatter(content);
    expect(parsed?.trade_off_alternatives).toEqual(["alt 1", "alt 2"]);
  });
});

// ---------------------------------------------------------------------------
// finalizeAdr — propagating criteria fields from input onto newEntry
// ---------------------------------------------------------------------------

describe("finalizeAdr — ADR criteria fields propagation", () => {
  function makeExisting(id: string): AdrEntry {
    return {
      id,
      title: `title ${id}`,
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@maintainer-a"],
      filePath: `.forge/decisions/${id}-legacy.md`,
    };
  }

  it("propagates reversibility / surprising / tradeOffAlternatives onto newEntry and ADR file", () => {
    const input: FinalizeAdrInput = {
      title: "Adopt approach X",
      topic: "adopt-x",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@a"],
      reversibility: "hard",
      surprising: true,
      tradeOffAlternatives: ["alt A", "alt B"],
      existingAdrs: [makeExisting("ADR-0001")],
      bodyMarkdown: "## Context\n\nBody.\n",
    };

    const out = finalizeAdr(input, () => undefined);

    expect(out.newEntry.reversibility).toBe("hard");
    expect(out.newEntry.surprising).toBe(true);
    expect(out.newEntry.trade_off_alternatives).toEqual(["alt A", "alt B"]);

    // Round-trip through the rendered file.
    const parsed = parseAdrFrontmatter(out.adrFileContent);
    expect(parsed?.reversibility).toBe("hard");
    expect(parsed?.surprising).toBe(true);
    expect(parsed?.trade_off_alternatives).toEqual(["alt A", "alt B"]);
  });

  it("omits criteria fields from the ADR file when not provided", () => {
    const input: FinalizeAdrInput = {
      title: "Plain decision",
      topic: "plain",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@a"],
      existingAdrs: [],
      bodyMarkdown: "",
    };

    const out = finalizeAdr(input, () => undefined);
    expect(out.newEntry.reversibility).toBeUndefined();
    expect(out.newEntry.surprising).toBeUndefined();
    expect(out.newEntry.trade_off_alternatives).toBeUndefined();
    expect(out.adrFileContent).not.toContain("reversibility:");
    expect(out.adrFileContent).not.toContain("surprising:");
    expect(out.adrFileContent).not.toContain("trade_off_alternatives:");
  });

  it("omits trade_off_alternatives when the input array is empty", () => {
    const input: FinalizeAdrInput = {
      title: "No alternatives",
      topic: "no-alts",
      status: "proposed",
      date: "2026-05-10",
      deciders: ["@a"],
      reversibility: "hard",
      surprising: true,
      tradeOffAlternatives: [],
      existingAdrs: [],
      bodyMarkdown: "",
    };

    const out = finalizeAdr(input, () => undefined);
    expect(out.newEntry.trade_off_alternatives).toBeUndefined();
    expect(out.adrFileContent).not.toContain("trade_off_alternatives:");
    // But reversibility / surprising should still be emitted.
    expect(out.adrFileContent).toContain("reversibility: hard");
    expect(out.adrFileContent).toContain("surprising: true");
  });

  it("does not mutate caller-provided tradeOffAlternatives", () => {
    const alternatives = ["alt A", "alt B"];
    const snapshot = [...alternatives];
    const input: FinalizeAdrInput = {
      title: "Immutability test",
      topic: "immut",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@a"],
      tradeOffAlternatives: alternatives,
      existingAdrs: [],
      bodyMarkdown: "",
    };

    const out = finalizeAdr(input, () => undefined);
    // Mutating the entry copy must not affect the caller's array.
    out.newEntry.trade_off_alternatives?.push("alt C");
    expect(alternatives).toEqual(snapshot);
  });
});
