/**
 * Unit tests for ADR finalization helpers in `src/decide.ts`.
 *
 * Covers:
 *   - `finalizeAdr` with no supersedes → produces a valid ADR file and a
 *     regenerated index containing the new entry
 *   - `finalizeAdr` with supersedes → old entry's status becomes
 *     "superseded" and `superseded_by` is set; the old file's body is
 *     preserved and re-rendered with the updated frontmatter
 *   - `renderAdrFileContent` round-trips: parsing the rendered content
 *     via `parseAdrFrontmatter` recovers the same frontmatter
 *   - The index contains the new id exactly once with no duplicates after
 *     supersession
 *
 * **Validates: Requirements 1.1, 1.5, 1.6, 1.7**
 */

import { describe, expect, it } from "vitest";
import { type AdrEntry, parseAdrFrontmatter } from "../src/adr-registry.js";
import { type FinalizeAdrInput, finalizeAdr, renderAdrFileContent } from "../src/decide.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(id: string, overrides: Partial<AdrEntry> = {}): AdrEntry {
  return {
    id,
    title: `title ${id}`,
    status: "accepted",
    date: "2026-05-10",
    deciders: ["@maintainer-a"],
    filePath: `.tinkerman/decisions/${id}-legacy.md`,
    ...overrides,
  };
}

const BODY_SAMPLE = [
  "## Context",
  "",
  "Legacy context for the decision.",
  "",
  "## Decision",
  "",
  "Use approach X.",
  "",
  "## Consequences",
  "",
  "Fewer surprises later.",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// finalizeAdr — no supersedes
// ---------------------------------------------------------------------------

describe("finalizeAdr — without supersedes", () => {
  it("produces a valid ADR file and updated index entry", () => {
    const input: FinalizeAdrInput = {
      title: "Adopt Zod for state file validation",
      topic: "adopt-zod",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@maintainer-a", "@maintainer-b"],
      existingAdrs: [
        makeEntry("ADR-0001", { title: "First decision" }),
        makeEntry("ADR-0002", { title: "Second decision" }),
      ],
      bodyMarkdown: BODY_SAMPLE,
    };

    const out = finalizeAdr(input, () => undefined);

    // New entry inherits the next id.
    expect(out.newEntry.id).toBe("ADR-0003");
    expect(out.adrFilePath).toBe(".tinkerman/decisions/ADR-0003-adopt-zod.md");
    expect(out.supersessionUpdates).toEqual([]);
    expect(out.indexFilePath).toBe(".tinkerman/knowledge/adr-index.md");

    // The ADR file parses back to the new entry's frontmatter.
    const parsed = parseAdrFrontmatter(out.adrFileContent);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("ADR-0003");
    expect(parsed?.title).toBe("Adopt Zod for state file validation");
    expect(parsed?.status).toBe("accepted");
    expect(parsed?.date).toBe("2026-05-10");
    expect(parsed?.deciders).toEqual(["@maintainer-a", "@maintainer-b"]);
    expect(parsed?.related_adrs).toBeUndefined();
    expect(parsed?.supersedes).toBeUndefined();

    // Index contains the new id.
    expect(out.indexContent).toContain("| ADR-0003 |");
    expect(out.indexContent).toContain("| ADR-0001 |");
    expect(out.indexContent).toContain("| ADR-0002 |");
  });

  it("emits related_adrs when provided", () => {
    const input: FinalizeAdrInput = {
      title: "Related decision",
      topic: "related",
      status: "proposed",
      date: "2026-05-10",
      deciders: ["@a"],
      relatedAdrs: ["ADR-0001", "ADR-0002"],
      existingAdrs: [makeEntry("ADR-0001"), makeEntry("ADR-0002")],
      bodyMarkdown: "## Context\n\nx\n",
    };

    const out = finalizeAdr(input, () => undefined);
    const parsed = parseAdrFrontmatter(out.adrFileContent);
    expect(parsed?.related_adrs).toEqual(["ADR-0001", "ADR-0002"]);
  });

  it("omits related_adrs when the input is empty", () => {
    const input: FinalizeAdrInput = {
      title: "Minimal",
      topic: "minimal",
      status: "proposed",
      date: "2026-05-10",
      deciders: ["@a"],
      relatedAdrs: [],
      existingAdrs: [],
      bodyMarkdown: "",
    };
    const out = finalizeAdr(input, () => undefined);
    expect(out.adrFileContent).not.toContain("related_adrs:");
  });

  it("does not mutate input.existingAdrs", () => {
    const existing = [makeEntry("ADR-0001"), makeEntry("ADR-0002")];
    const snapshot = JSON.stringify(existing);
    const input: FinalizeAdrInput = {
      title: "t",
      topic: "t",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@a"],
      existingAdrs: existing,
      bodyMarkdown: "",
    };
    finalizeAdr(input, () => undefined);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// finalizeAdr — with supersedes
// ---------------------------------------------------------------------------

describe("finalizeAdr — with supersedes", () => {
  it("updates the superseded entry's status and records superseded_by", () => {
    const oldEntry = makeEntry("ADR-0015", {
      title: "Legacy approach",
      status: "accepted",
    });
    const input: FinalizeAdrInput = {
      title: "New approach",
      topic: "new-approach",
      status: "accepted",
      date: "2026-06-01",
      deciders: ["@a", "@b"],
      supersedes: "ADR-0015",
      existingAdrs: [makeEntry("ADR-0001"), oldEntry],
      bodyMarkdown: "## Decision\n\nSwap it.\n",
    };

    const existingFiles: Record<string, string> = {
      [oldEntry.filePath]: [
        "---",
        'id: "ADR-0015"',
        'title: "Legacy approach"',
        "status: accepted",
        'date: "2026-01-01"',
        "deciders:",
        "  - @maintainer-a",
        "---",
        "",
        BODY_SAMPLE,
      ].join("\n"),
    };

    const out = finalizeAdr(input, (p) => existingFiles[p]);

    // New ADR file records its supersedes link.
    const newParsed = parseAdrFrontmatter(out.adrFileContent);
    expect(newParsed?.supersedes).toBe("ADR-0015");

    // Exactly one supersession update pointing at the old file.
    expect(out.supersessionUpdates).toHaveLength(1);
    const update = out.supersessionUpdates[0];
    expect(update.filePath).toBe(oldEntry.filePath);

    // Old file re-rendered: status=superseded, superseded_by=new id, body preserved.
    const updatedParsed = parseAdrFrontmatter(update.updatedContent);
    expect(updatedParsed?.id).toBe("ADR-0015");
    expect(updatedParsed?.status).toBe("superseded");
    expect(updatedParsed?.superseded_by).toBe(out.newEntry.id);
    expect(update.updatedContent).toContain("Legacy context for the decision.");
    expect(update.updatedContent).toContain("Fewer surprises later.");
  });

  it("still emits a supersession update when the old file content is missing", () => {
    const oldEntry = makeEntry("ADR-0015");
    const input: FinalizeAdrInput = {
      title: "Replaces old",
      topic: "replaces-old",
      status: "accepted",
      date: "2026-06-01",
      deciders: ["@a"],
      supersedes: "ADR-0015",
      existingAdrs: [oldEntry],
      bodyMarkdown: "",
    };

    // Reader returns undefined → body falls back to empty string.
    const out = finalizeAdr(input, () => undefined);
    expect(out.supersessionUpdates).toHaveLength(1);
    const parsed = parseAdrFrontmatter(out.supersessionUpdates[0].updatedContent);
    expect(parsed?.status).toBe("superseded");
    expect(parsed?.superseded_by).toBe(out.newEntry.id);
  });

  it("produces an index with the new id exactly once and no duplicates for superseded entries", () => {
    const oldEntry = makeEntry("ADR-0015", { title: "Old one" });
    const input: FinalizeAdrInput = {
      title: "Replacement",
      topic: "replacement",
      status: "accepted",
      date: "2026-06-01",
      deciders: ["@a"],
      supersedes: "ADR-0015",
      existingAdrs: [makeEntry("ADR-0001"), oldEntry, makeEntry("ADR-0042")],
      bodyMarkdown: "",
    };

    const out = finalizeAdr(input, () => undefined);

    const idRowRegex = /^\|\s*(ADR-\d{4})\s*\|/gm;
    const ids: string[] = [];
    for (const match of out.indexContent.matchAll(idRowRegex)) {
      ids.push(match[1]);
    }
    // Expect each id to appear exactly once.
    expect(ids).toHaveLength(4);
    const counts = new Map<string, number>();
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBe(1);
    }
    expect(counts.get(out.newEntry.id)).toBe(1);
    expect(counts.get("ADR-0015")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// renderAdrFileContent — round-trip
// ---------------------------------------------------------------------------

describe("renderAdrFileContent — round-trip with parseAdrFrontmatter", () => {
  it("round-trips a minimal entry", () => {
    const entry: AdrEntry = {
      id: "ADR-0007",
      title: "Minimal entry",
      status: "proposed",
      date: "2026-05-10",
      deciders: ["@maintainer-a"],
      filePath: ".tinkerman/decisions/ADR-0007-minimal.md",
    };
    const rendered = renderAdrFileContent(entry, "## Context\n\nBody.\n");
    const parsed = parseAdrFrontmatter(rendered);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(entry.id);
    expect(parsed?.title).toBe(entry.title);
    expect(parsed?.status).toBe(entry.status);
    expect(parsed?.date).toBe(entry.date);
    expect(parsed?.deciders).toEqual(entry.deciders);
    expect(parsed?.related_adrs).toBeUndefined();
    expect(parsed?.supersedes).toBeUndefined();
    expect(parsed?.superseded_by).toBeUndefined();
  });

  it("round-trips an entry with all optional fields", () => {
    const entry: AdrEntry = {
      id: "ADR-0042",
      title: "Adopt Zod",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@a", "@b", "@c"],
      related_adrs: ["ADR-0001", "ADR-0008"],
      supersedes: "ADR-0015",
      superseded_by: "ADR-0099",
      filePath: ".tinkerman/decisions/ADR-0042-adopt-zod.md",
    };
    const rendered = renderAdrFileContent(entry, "body");
    const parsed = parseAdrFrontmatter(rendered);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(entry.id);
    expect(parsed?.title).toBe(entry.title);
    expect(parsed?.status).toBe(entry.status);
    expect(parsed?.date).toBe(entry.date);
    expect(parsed?.deciders).toEqual(entry.deciders);
    expect(parsed?.related_adrs).toEqual(entry.related_adrs);
    expect(parsed?.supersedes).toBe(entry.supersedes);
    expect(parsed?.superseded_by).toBe(entry.superseded_by);
  });

  it("emits frontmatter fields in stable order", () => {
    const entry: AdrEntry = {
      id: "ADR-0100",
      title: "Order test",
      status: "accepted",
      date: "2026-05-10",
      deciders: ["@a"],
      related_adrs: ["ADR-0001"],
      supersedes: "ADR-0015",
      superseded_by: "ADR-0999",
      filePath: "x.md",
    };
    const rendered = renderAdrFileContent(entry, "");
    const idIdx = rendered.indexOf("id:");
    const titleIdx = rendered.indexOf("title:");
    const statusIdx = rendered.indexOf("status:");
    const dateIdx = rendered.indexOf("date:");
    const decidersIdx = rendered.indexOf("deciders:");
    const relatedIdx = rendered.indexOf("related_adrs:");
    const supersedesIdx = rendered.indexOf("supersedes:");
    const supersededByIdx = rendered.indexOf("superseded_by:");

    expect(idIdx).toBeLessThan(titleIdx);
    expect(titleIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(dateIdx);
    expect(dateIdx).toBeLessThan(decidersIdx);
    expect(decidersIdx).toBeLessThan(relatedIdx);
    expect(relatedIdx).toBeLessThan(supersedesIdx);
    expect(supersedesIdx).toBeLessThan(supersededByIdx);
  });

  it("preserves the body verbatim after the closing delimiter", () => {
    const entry: AdrEntry = {
      id: "ADR-0007",
      title: "t",
      status: "proposed",
      date: "2026-05-10",
      deciders: ["@a"],
      filePath: "x.md",
    };
    const body = '## Context\n\nParagraph with | pipe and "quotes".\n\n## Decision\n\nX.\n';
    const rendered = renderAdrFileContent(entry, body);
    expect(rendered.endsWith(body)).toBe(true);
  });
});
