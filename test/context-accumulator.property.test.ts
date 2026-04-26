/**
 * Property-based tests for the context-accumulator module.
 *
 * Covers:
 *   - Property 1: Prompt 构建完整性
 *   - Property 7: Notes 条目格式化
 *   - Property 8: Notes 格式往返一致性
 *
 * **Validates: Requirements 1.2, 3.2, 3.3, 3.4, 3.5, 3.7**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    buildIterationPrompt,
    formatIterationEntry,
    formatListSection,
    formatNotesDocument,
    parseListSection,
    parseNotesDocument
} from "../src/context-accumulator.js";
import type { IterationEntry, NotesDocument } from "../src/loop-types.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Single-line string without markdown formatting characters that could
 * confuse the parser. Avoids `###`, `**`, leading `- `, and newlines.
 * Also ensures the string has non-whitespace content (parser trims values).
 */
const cleanLineArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => !s.includes("\n") && !s.includes("\r"))
  .map((s) => s.replace(/^- /, "x ").replace(/#{3}/g, "H").replace(/\*\*/g, "xx"))
  .filter((s) => s.length > 0 && s.trim().length > 0 && s === s.trim());

/** Positive iteration number. */
const iterationNumberArb = fc.integer({ min: 1, max: 500 });

/** Arbitrary IterationEntry with clean string content. */
const iterationEntryArb: fc.Arbitrary<IterationEntry> = fc
  .tuple(
    iterationNumberArb,
    fc.boolean(),
    cleanLineArb,
    fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }),
    fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }),
  )
  .map(([number, success, summary, keyChanges, keyLearnings]) => ({
    number,
    success,
    summary,
    keyChanges,
    keyLearnings,
  }));

/** RunId without newlines, markdown formatting, or whitespace-only values. */
const runIdArb = cleanLineArb.filter((s) => s.trim().length > 0);

/**
 * Round-trip-safe IterationEntry: failed entries have empty keyChanges
 * because formatIterationEntry omits key changes for failed iterations.
 */
const roundTripEntryArb: fc.Arbitrary<IterationEntry> = fc
  .tuple(
    iterationNumberArb,
    fc.boolean(),
    cleanLineArb,
    fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }),
    fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }),
  )
  .map(([number, success, summary, keyChanges, keyLearnings]) => ({
    number,
    success,
    summary,
    keyChanges: success ? keyChanges : [],
    keyLearnings,
  }));

/** Arbitrary NotesDocument with clean content for round-trip testing. */
const notesDocumentArb: fc.Arbitrary<NotesDocument> = fc
  .tuple(runIdArb, fc.array(roundTripEntryArb, { minLength: 0, maxLength: 8 }))
  .map(([runId, entries]) => ({ runId, entries }));

/** Arbitrary objective text (single-line). */
const objectiveArb = cleanLineArb;

/** Arbitrary notes content (multi-line, but no markdown headers). */
const notesContentArb = fc
  .array(cleanLineArb, { minLength: 1, maxLength: 5 })
  .map((lines) => lines.join("\n"));

/** Optional stopWhen condition. */
const _stopWhenArb = fc.option(cleanLineArb, { nil: undefined });

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 1: Prompt 构建完整性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 1: Prompt 构建完整性", () => {
  /**
   * **Validates: Requirements 1.2, 3.4**
   */
  it("prompt contains iteration number, runId, notes content, and objective text", () => {
    fc.assert(
      fc.property(
        iterationNumberArb,
        runIdArb,
        objectiveArb,
        notesContentArb,
        (iteration, runId, objective, notesContent) => {
          const prompt = buildIterationPrompt({
            iteration,
            runId,
            objective,
            notesContent,
          });

          expect(prompt).toContain(String(iteration));
          expect(prompt).toContain(runId);
          expect(prompt).toContain(notesContent);
          expect(prompt).toContain(objective);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 1.2, 3.4**
   */
  it("prompt includes stop condition section when stopWhen is provided", () => {
    fc.assert(
      fc.property(
        iterationNumberArb,
        runIdArb,
        objectiveArb,
        notesContentArb,
        cleanLineArb,
        (iteration, runId, objective, notesContent, stopWhen) => {
          const prompt = buildIterationPrompt({
            iteration,
            runId,
            objective,
            notesContent,
            stopWhen,
          });

          expect(prompt).toContain("Stop Condition");
          expect(prompt).toContain(stopWhen);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 1.2, 3.4**
   */
  it("prompt does NOT contain Stop Condition section when stopWhen is not provided", () => {
    fc.assert(
      fc.property(
        iterationNumberArb,
        runIdArb,
        objectiveArb,
        notesContentArb,
        (iteration, runId, objective, notesContent) => {
          const prompt = buildIterationPrompt({
            iteration,
            runId,
            objective,
            notesContent,
          });

          expect(prompt).not.toContain("Stop Condition");
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 7: Notes 条目格式化
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 7: Notes 条目格式化", () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.5**
   */
  it("formatted entry contains ### Iteration N header and summary text", () => {
    fc.assert(
      fc.property(iterationEntryArb, (entry) => {
        const md = formatIterationEntry(entry);

        expect(md).toContain(`### Iteration ${entry.number}`);
        expect(md).toContain(entry.summary);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   */
  it("successful entries contain all key_changes items", () => {
    fc.assert(
      fc.property(
        iterationEntryArb.filter((e) => e.success && e.keyChanges.length > 0),
        (entry) => {
          const md = formatIterationEntry(entry);

          for (const change of entry.keyChanges) {
            expect(md).toContain(change);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.5**
   */
  it("entries contain all key_learnings items when non-empty", () => {
    fc.assert(
      fc.property(
        iterationEntryArb.filter((e) => e.keyLearnings.length > 0),
        (entry) => {
          const md = formatIterationEntry(entry);

          for (const learning of entry.keyLearnings) {
            expect(md).toContain(learning);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   */
  it("failed entries contain (Failed) marker", () => {
    fc.assert(
      fc.property(
        iterationEntryArb.filter((e) => !e.success),
        (entry) => {
          const md = formatIterationEntry(entry);

          expect(md).toContain("(Failed)");
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 8: Notes 格式往返一致性
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 8: Notes 格式往返一致性", () => {
  /**
   * **Validates: Requirements 3.7**
   */
  it("parseNotesDocument(formatNotesDocument(doc)) produces semantically equivalent NotesDocument", () => {
    fc.assert(
      fc.property(notesDocumentArb, (doc) => {
        const markdown = formatNotesDocument(doc);
        const parsed = parseNotesDocument(markdown);

        expect(parsed.runId).toBe(doc.runId);
        expect(parsed.entries.length).toBe(doc.entries.length);

        for (let i = 0; i < doc.entries.length; i++) {
          const original = doc.entries[i];
          const roundTripped = parsed.entries[i];

          expect(roundTripped.number).toBe(original.number);
          expect(roundTripped.success).toBe(original.success);
          expect(roundTripped.summary).toBe(original.summary);
          expect(roundTripped.keyChanges).toEqual(original.keyChanges);
          expect(roundTripped.keyLearnings).toEqual(original.keyLearnings);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: v2-2-legacy-fixes, Property 1: parseListSection regex special character round-trip
// ---------------------------------------------------------------------------

/** All regex special characters that parseListSection must escape. */
const REGEX_SPECIAL_CHARS = [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"];

/**
 * Arbitrary that generates a section title containing at least one regex
 * special character. Inserts characters from the special set into a random
 * base string so that all special characters are covered across runs.
 */
const regexSpecialTitleArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(fc.constantFrom(...REGEX_SPECIAL_CHARS), { minLength: 1, maxLength: 4 }).map((a) => a.join("")),
    cleanLineArb,
    fc.integer({ min: 0, max: 80 }),
  )
  .map(([specials, base, pos]) => {
    const insertAt = Math.min(pos, base.length);
    return `${base.slice(0, insertAt)}${specials}${base.slice(insertAt)}`;
  })
  .filter((s) => s.trim().length > 0 && !s.includes("\n"))
  .map((s) => s.replace(/\*\*/g, "xx").replace(/#{3}/g, "H"))
  .filter((s) => s.trim().length > 0);

describe("Feature: v2-2-legacy-fixes, Property 1: parseListSection regex special character round-trip", () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2**
   *
   * For any section title containing regex special characters and any
   * non-empty list of valid bullet items, formatting with formatListSection
   * then parsing back with parseListSection produces the original items.
   */
  it("round-trips arbitrary titles with regex special characters through format → parse", () => {
    fc.assert(
      fc.property(
        regexSpecialTitleArb,
        fc.array(cleanLineArb, { minLength: 1, maxLength: 8 }),
        (title, items) => {
          const formatted = formatListSection(title, items);
          const parsed = parseListSection(formatted, title);
          expect(parsed).toEqual(items);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: v2-2-legacy-fixes, Property 2: parseListSection returns empty array for non-matching titles with special characters
// ---------------------------------------------------------------------------

describe("Feature: v2-2-legacy-fixes, Property 2: parseListSection returns empty array for non-matching titles with special characters", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any section title containing regex special characters and any
   * Markdown block that does NOT contain that title as a bold section header,
   * parseListSection SHALL return an empty array.
   */
  it("returns empty array when block does not contain the generated title as a bold section header", () => {
    fc.assert(
      fc.property(
        regexSpecialTitleArb,
        cleanLineArb,
        fc.array(cleanLineArb, { minLength: 1, maxLength: 5 }),
        (title, otherTitle, items) => {
          // Ensure the "other" title used in the block is different from the search title
          const differentTitle = otherTitle === title ? `${otherTitle}DIFFERENT` : otherTitle;
          // Build a Markdown block that uses a different bold section header
          const block = `**${differentTitle}:**\n${items.map((item) => `- ${item}`).join("\n")}\n`;
          const parsed = parseListSection(block, title);
          expect(parsed).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// REQ-1: parseListSection handles regex special characters in titles
// ---------------------------------------------------------------------------

describe("REQ-1: parseListSection handles regex special characters in titles", () => {
  /**
   * **Validates: Requirements REQ-1**
   */
  it("parses a section with parentheses in the title: Key (Changes).", () => {
    const block = [
      "**Key (Changes).:**",
      "- refactored auth module",
      "- updated API endpoint",
    ].join("\n");

    const items = parseListSection(block, "Key (Changes).");
    expect(items).toEqual(["refactored auth module", "updated API endpoint"]);
  });

  /**
   * **Validates: Requirements REQ-1**
   */
  it("parses a section with square brackets in the title: Items [v2]", () => {
    const block = ["**Items [v2]:**", "- first item", "- second item", "- third item"].join("\n");

    const items = parseListSection(block, "Items [v2]");
    expect(items).toEqual(["first item", "second item", "third item"]);
  });

  /**
   * **Validates: Requirements REQ-1**
   */
  it("parses a section with plus sign in the title: Test+Results", () => {
    const block = ["**Test+Results:**", "- all tests passed"].join("\n");

    const items = parseListSection(block, "Test+Results");
    expect(items).toEqual(["all tests passed"]);
  });

  /**
   * **Validates: Requirements REQ-1**
   */
  it("parses a section with multiple regex special characters: Status {$100} | (final)*", () => {
    const block = ["**Status {$100} | (final)*:**", "- completed review", "- merged changes"].join(
      "\n",
    );

    const items = parseListSection(block, "Status {$100} | (final)*");
    expect(items).toEqual(["completed review", "merged changes"]);
  });

  /**
   * **Validates: Requirements REQ-1**
   */
  it("returns empty array when title with special characters is not found in block", () => {
    const block = ["**Other Section:**", "- some item"].join("\n");

    const items = parseListSection(block, "Key (Changes).");
    expect(items).toEqual([]);
  });
});
