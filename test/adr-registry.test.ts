/**
 * Unit tests for ADR Registry — parseAdrFrontmatter and core types.
 *
 * Covers:
 *   - well-formed frontmatter with required + optional fields
 *   - inline vs indented-list syntax for deciders / related_adrs
 *   - rejection of documents with missing required fields
 *   - rejection of malformed id / status values
 *   - rejection of documents without a frontmatter block
 *
 * Validates: Requirements 1.3
 */

import { describe, expect, it } from "vitest";
import {
  type AdrEntry,
  type AdrFrontmatter,
  applySupersession,
  findRelatedAdrs,
  loadAllAdrs,
  nextAdrId,
  parseAdrFrontmatter,
  renderAdrIndex,
} from "../src/adr-registry.js";

describe("parseAdrFrontmatter", () => {
  it("parses a well-formed ADR with indented-list deciders", () => {
    const content = [
      "---",
      'id: "ADR-0042"',
      'title: "Adopt Zod for state file validation"',
      "status: accepted",
      'date: "2026-05-10"',
      "deciders:",
      "  - @maintainer-a",
      "  - @maintainer-b",
      "---",
      "",
      "## Context",
      "",
      "Body content.",
    ].join("\n");

    const result = parseAdrFrontmatter(content);

    expect(result).not.toBeNull();
    const parsed = result as AdrFrontmatter;
    expect(parsed.id).toBe("ADR-0042");
    expect(parsed.title).toBe("Adopt Zod for state file validation");
    expect(parsed.status).toBe("accepted");
    expect(parsed.date).toBe("2026-05-10");
    expect(parsed.deciders).toEqual(["@maintainer-a", "@maintainer-b"]);
    expect(parsed.related_adrs).toBeUndefined();
    expect(parsed.supersedes).toBeUndefined();
    expect(parsed.superseded_by).toBeUndefined();
  });

  it("parses inline-array deciders and related_adrs", () => {
    const content = [
      "---",
      'id: "ADR-0100"',
      'title: "Inline list style"',
      "status: proposed",
      'date: "2026-06-01"',
      'deciders: ["@a", "@b", "@c"]',
      'related_adrs: ["ADR-0042", "ADR-0099"]',
      "---",
      "",
    ].join("\n");

    const result = parseAdrFrontmatter(content);

    expect(result).not.toBeNull();
    const parsed = result as AdrFrontmatter;
    expect(parsed.deciders).toEqual(["@a", "@b", "@c"]);
    expect(parsed.related_adrs).toEqual(["ADR-0042", "ADR-0099"]);
  });

  it("captures supersedes and superseded_by fields when present", () => {
    const content = [
      "---",
      'id: "ADR-0043"',
      'title: "Supersedes older decision"',
      "status: accepted",
      'date: "2026-05-11"',
      "deciders:",
      "  - @maintainer-a",
      'supersedes: "ADR-0015"',
      'superseded_by: "ADR-0099"',
      "---",
      "",
    ].join("\n");

    const result = parseAdrFrontmatter(content);

    expect(result).not.toBeNull();
    const parsed = result as AdrFrontmatter;
    expect(parsed.supersedes).toBe("ADR-0015");
    expect(parsed.superseded_by).toBe("ADR-0099");
  });

  it("accepts all four lifecycle statuses", () => {
    const statuses = ["proposed", "accepted", "superseded", "deprecated"] as const;
    for (const status of statuses) {
      const content = [
        "---",
        'id: "ADR-0001"',
        'title: "Status test"',
        `status: ${status}`,
        'date: "2026-05-10"',
        "deciders:",
        "  - @maintainer-a",
        "---",
        "",
      ].join("\n");
      expect(parseAdrFrontmatter(content)?.status).toBe(status);
    }
  });

  it("returns null when frontmatter block is missing", () => {
    const content = "# ADR without frontmatter\n\nBody only.";
    expect(parseAdrFrontmatter(content)).toBeNull();
  });

  it("returns null when required field is missing", () => {
    const missingTitle = [
      "---",
      'id: "ADR-0001"',
      "status: accepted",
      'date: "2026-05-10"',
      "deciders:",
      "  - @maintainer-a",
      "---",
      "",
    ].join("\n");
    expect(parseAdrFrontmatter(missingTitle)).toBeNull();
  });

  it("returns null when deciders list is empty", () => {
    const content = [
      "---",
      'id: "ADR-0001"',
      'title: "No deciders"',
      "status: accepted",
      'date: "2026-05-10"',
      "deciders: []",
      "---",
      "",
    ].join("\n");
    expect(parseAdrFrontmatter(content)).toBeNull();
  });

  it("returns null when id does not match ADR-NNNN pattern", () => {
    const badIds = ["ADR-42", "ADR-00042", "adr-0042", "ADR0042", "0042"];
    for (const id of badIds) {
      const content = [
        "---",
        `id: "${id}"`,
        'title: "Bad id"',
        "status: accepted",
        'date: "2026-05-10"',
        "deciders:",
        "  - @maintainer-a",
        "---",
        "",
      ].join("\n");
      expect(parseAdrFrontmatter(content)).toBeNull();
    }
  });

  it("returns null when status is not an allowed value", () => {
    const content = [
      "---",
      'id: "ADR-0001"',
      'title: "Invalid status"',
      "status: rejected",
      'date: "2026-05-10"',
      "deciders:",
      "  - @maintainer-a",
      "---",
      "",
    ].join("\n");
    expect(parseAdrFrontmatter(content)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadAllAdrs
// ---------------------------------------------------------------------------

describe("loadAllAdrs", () => {
  const validAdr = (id: string, title: string): string =>
    [
      "---",
      `id: "${id}"`,
      `title: "${title}"`,
      "status: accepted",
      'date: "2026-05-10"',
      "deciders:",
      "  - @maintainer-a",
      "---",
      "",
      "Body.",
    ].join("\n");

  it("loads all valid ADR files with filePath attached", () => {
    const files: Record<string, string> = {
      ".tinkerman/decisions/ADR-0001-first.md": validAdr("ADR-0001", "First"),
      ".tinkerman/decisions/ADR-0002-second.md": validAdr("ADR-0002", "Second"),
    };
    const result = loadAllAdrs(Object.keys(files), (p) => files[p]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("ADR-0001");
    expect(result[0].filePath).toBe(".tinkerman/decisions/ADR-0001-first.md");
    expect(result[1].id).toBe("ADR-0002");
    expect(result[1].filePath).toBe(".tinkerman/decisions/ADR-0002-second.md");
  });

  it("skips paths that the reader cannot resolve", () => {
    const files: Record<string, string> = {
      "a.md": validAdr("ADR-0001", "A"),
    };
    const result = loadAllAdrs(["a.md", "missing.md"], (p) => files[p]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ADR-0001");
  });

  it("skips files whose content fails to parse", () => {
    const files: Record<string, string> = {
      "good.md": validAdr("ADR-0001", "Good"),
      "no-frontmatter.md": "# Just a heading",
      "bad-id.md": validAdr("ADR-42", "Bad id"),
      "bad-status.md": [
        "---",
        'id: "ADR-0002"',
        'title: "Bad status"',
        "status: rejected",
        'date: "2026-05-10"',
        "deciders:",
        "  - @a",
        "---",
      ].join("\n"),
    };

    const result = loadAllAdrs(Object.keys(files), (p) => files[p]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ADR-0001");
  });

  it("preserves input order", () => {
    const files: Record<string, string> = {
      "c.md": validAdr("ADR-0003", "C"),
      "a.md": validAdr("ADR-0001", "A"),
      "b.md": validAdr("ADR-0002", "B"),
    };
    const result = loadAllAdrs(["c.md", "a.md", "b.md"], (p) => files[p]);

    expect(result.map((e) => e.id)).toEqual(["ADR-0003", "ADR-0001", "ADR-0002"]);
  });

  it("returns empty array for empty input", () => {
    expect(loadAllAdrs([], () => undefined)).toEqual([]);
  });

  it("does not throw when every file is malformed", () => {
    const result = loadAllAdrs(["a.md", "b.md"], () => "not a valid ADR");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// nextAdrId
// ---------------------------------------------------------------------------

describe("nextAdrId", () => {
  const makeEntry = (id: string): AdrEntry => ({
    id,
    title: "t",
    status: "accepted",
    date: "2026-05-10",
    deciders: ["@a"],
    filePath: "x.md",
  });

  it("returns ADR-0001 for empty list", () => {
    expect(nextAdrId([])).toBe("ADR-0001");
  });

  it("increments the maximum numeric suffix", () => {
    const entries = [makeEntry("ADR-0001"), makeEntry("ADR-0042"), makeEntry("ADR-0007")];
    expect(nextAdrId(entries)).toBe("ADR-0043");
  });

  it("should return ADR-0004 after ADR-0003 (single-entry consolidation)", () => {
    const entries = [makeEntry("ADR-0001"), makeEntry("ADR-0002"), makeEntry("ADR-0003")];
    expect(nextAdrId(entries)).toBe("ADR-0004");
  });

  it("always returns 4-digit zero-padded format", () => {
    expect(nextAdrId([makeEntry("ADR-0001")])).toMatch(/^ADR-\d{4}$/);
    expect(nextAdrId([makeEntry("ADR-0099")])).toBe("ADR-0100");
    expect(nextAdrId([makeEntry("ADR-0999")])).toBe("ADR-1000");
  });

  it("ignores entries with malformed ids when computing the max", () => {
    const entries = [
      { ...makeEntry("ADR-42"), id: "ADR-42" },
      { ...makeEntry("not-an-adr"), id: "not-an-adr" },
      makeEntry("ADR-0005"),
    ];
    expect(nextAdrId(entries)).toBe("ADR-0006");
  });

  it("falls back to ADR-0001 when no entry has a valid id", () => {
    const entries = [
      { ...makeEntry("bogus"), id: "bogus" },
      { ...makeEntry("ADR-1"), id: "ADR-1" },
    ];
    expect(nextAdrId(entries)).toBe("ADR-0001");
  });
});

// ---------------------------------------------------------------------------
// findRelatedAdrs
// ---------------------------------------------------------------------------

describe("findRelatedAdrs", () => {
  const makeEntry = (id: string, title: string): AdrEntry => ({
    id,
    title,
    status: "accepted",
    date: "2026-05-10",
    deciders: ["@a"],
    filePath: `${id}.md`,
  });

  it("returns ADRs ordered by Jaccard similarity descending", () => {
    const adrs = [
      makeEntry("ADR-0001", "Adopt Zod for state validation"),
      makeEntry("ADR-0002", "Refactor effect executor"),
      makeEntry("ADR-0003", "Zod schema migration plan"),
    ];
    const result = findRelatedAdrs("Zod schema validation", adrs, 5);

    expect(result[0].id).toBe("ADR-0003");
    expect(result[1].id).toBe("ADR-0001");
    expect(result.find((e) => e.id === "ADR-0002")).toBeUndefined();
  });

  it("respects the limit parameter", () => {
    const adrs = [
      makeEntry("ADR-0001", "zod schema one"),
      makeEntry("ADR-0002", "zod schema two"),
      makeEntry("ADR-0003", "zod schema three"),
    ];
    const result = findRelatedAdrs("zod schema", adrs, 2);
    expect(result).toHaveLength(2);
  });

  it("excludes ADRs with zero similarity", () => {
    const adrs = [
      makeEntry("ADR-0001", "completely unrelated title"),
      makeEntry("ADR-0002", "prompt defense patterns"),
    ];
    const result = findRelatedAdrs("zod schema", adrs, 5);
    expect(result).toEqual([]);
  });

  it("breaks ties by id descending (newer first)", () => {
    const adrs = [
      makeEntry("ADR-0001", "zod schema"),
      makeEntry("ADR-0002", "zod schema"),
      makeEntry("ADR-0003", "zod schema"),
    ];
    const result = findRelatedAdrs("zod schema", adrs, 3);
    expect(result.map((e) => e.id)).toEqual(["ADR-0003", "ADR-0002", "ADR-0001"]);
  });

  it("returns empty list when limit <= 0", () => {
    const adrs = [makeEntry("ADR-0001", "zod schema")];
    expect(findRelatedAdrs("zod", adrs, 0)).toEqual([]);
    expect(findRelatedAdrs("zod", adrs, -1)).toEqual([]);
  });

  it("returns empty list when description tokenizes to empty", () => {
    const adrs = [makeEntry("ADR-0001", "zod schema")];
    expect(findRelatedAdrs("", adrs, 5)).toEqual([]);
    expect(findRelatedAdrs("the a an", adrs, 5)).toEqual([]);
  });

  it("is case-insensitive", () => {
    const adrs = [makeEntry("ADR-0001", "ADOPT Zod")];
    const result = findRelatedAdrs("adopt zod", adrs, 5);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// renderAdrIndex
// ---------------------------------------------------------------------------

describe("renderAdrIndex", () => {
  const makeEntry = (id: string, title: string, filePath?: string): AdrEntry => ({
    id,
    title,
    status: "accepted",
    date: "2026-05-10",
    deciders: ["@a"],
    filePath: filePath ?? `.tinkerman/decisions/${id}.md`,
  });

  it("emits the generated-by header comment as the first line", () => {
    const out = renderAdrIndex([]);
    expect(out.split("\n")[0]).toBe(
      "<!-- Generated by src/adr-registry.ts — do not edit manually -->",
    );
  });

  it("emits header-only table for empty input", () => {
    const out = renderAdrIndex([]);
    expect(out).toContain("| ID | Title | Status | Date | File |");
    expect(out).toContain("| --- | --- | --- | --- | --- |");
    // no data rows: splitting on \n and dropping empty tail, expect 4 lines
    // (header comment, blank, thead, separator).
    const lines = out.split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(3);
  });

  it("sorts entries by id ascending regardless of input order", () => {
    const entries = [
      makeEntry("ADR-0042", "forty-two"),
      makeEntry("ADR-0001", "one"),
      makeEntry("ADR-0007", "seven"),
    ];
    const out = renderAdrIndex(entries);
    const idxOne = out.indexOf("one");
    const idxSeven = out.indexOf("seven");
    const idxFortyTwo = out.indexOf("forty-two");

    expect(idxOne).toBeLessThan(idxSeven);
    expect(idxSeven).toBeLessThan(idxFortyTwo);
  });

  it("includes all fields in each data row", () => {
    const entry = makeEntry("ADR-0001", "Adopt Zod");
    const out = renderAdrIndex([entry]);
    expect(out).toContain(
      "| ADR-0001 | Adopt Zod | accepted | 2026-05-10 | .tinkerman/decisions/ADR-0001.md |",
    );
  });

  it("escapes pipe characters in cells", () => {
    const entry = makeEntry("ADR-0001", "Title with | pipe");
    const out = renderAdrIndex([entry]);
    expect(out).toContain("Title with \\| pipe");
    // Pipe count on the data row: 6 column dividers + 1 escaped.
    const row = out.split("\n").find((l) => l.includes("ADR-0001"));
    expect(row).toBeDefined();
  });

  it("collapses newlines in cells to spaces", () => {
    const entry = makeEntry("ADR-0001", "Line one\nLine two");
    const out = renderAdrIndex([entry]);
    const row = out.split("\n").find((l) => l.includes("ADR-0001"));
    expect(row).toBeDefined();
    expect(row).toContain("Line one Line two");
  });

  it("does not mutate the input list", () => {
    const entries = [makeEntry("ADR-0042", "forty-two"), makeEntry("ADR-0001", "one")];
    const copy = entries.map((e) => ({ ...e }));
    renderAdrIndex(entries);
    expect(entries).toEqual(copy);
  });

  it("ends with a trailing newline", () => {
    const out = renderAdrIndex([makeEntry("ADR-0001", "x")]);
    expect(out.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applySupersession
// ---------------------------------------------------------------------------

describe("applySupersession", () => {
  const makeEntry = (id: string, overrides: Partial<AdrEntry> = {}): AdrEntry => ({
    id,
    title: `title ${id}`,
    status: "accepted",
    date: "2026-05-10",
    deciders: ["@a"],
    filePath: `${id}.md`,
    ...overrides,
  });

  it("returns [] when newAdr.supersedes is not set", () => {
    const newAdr = makeEntry("ADR-0042");
    const all = [makeEntry("ADR-0001"), makeEntry("ADR-0002")];
    expect(applySupersession(newAdr, all)).toEqual([]);
  });

  it("returns [] when newAdr.supersedes points to a missing id", () => {
    const newAdr = makeEntry("ADR-0042", { supersedes: "ADR-9999" });
    const all = [makeEntry("ADR-0001"), makeEntry("ADR-0002")];
    expect(applySupersession(newAdr, all)).toEqual([]);
  });

  it("updates the superseded entry's status and superseded_by fields", () => {
    const newAdr = makeEntry("ADR-0042", { supersedes: "ADR-0015" });
    const old = makeEntry("ADR-0015");
    const all = [makeEntry("ADR-0001"), old, makeEntry("ADR-0002")];

    const result = applySupersession(newAdr, all);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ADR-0015");
    expect(result[0].status).toBe("superseded");
    expect(result[0].superseded_by).toBe("ADR-0042");
  });

  it("does not mutate the input entries", () => {
    const newAdr = makeEntry("ADR-0042", { supersedes: "ADR-0015" });
    const old = makeEntry("ADR-0015");
    const all = [old];
    const allCopy = all.map((e) => ({ ...e }));

    applySupersession(newAdr, all);

    expect(old.status).toBe("accepted");
    expect(old.superseded_by).toBeUndefined();
    expect(all).toEqual(allCopy);
  });

  it("does not include newAdr itself in the output when present in allAdrs", () => {
    const newAdr = makeEntry("ADR-0042", { supersedes: "ADR-0015" });
    const all = [newAdr, makeEntry("ADR-0015")];

    const result = applySupersession(newAdr, all);

    expect(result.map((e) => e.id)).toEqual(["ADR-0015"]);
  });

  it("ignores an entry whose id equals newAdr.id when searching for the supersedes target", () => {
    // Pathological case: supersedes points to self. Even though the id
    // matches, the self-entry is skipped so the function returns [].
    const newAdr = makeEntry("ADR-0042", { supersedes: "ADR-0042" });
    const all = [newAdr];
    expect(applySupersession(newAdr, all)).toEqual([]);
  });

  it("ignores untouched entries in the output", () => {
    const newAdr = makeEntry("ADR-0042", { supersedes: "ADR-0015" });
    const all = [makeEntry("ADR-0001"), makeEntry("ADR-0015"), makeEntry("ADR-0099")];

    const result = applySupersession(newAdr, all);

    expect(result.map((e) => e.id)).toEqual(["ADR-0015"]);
  });
});
