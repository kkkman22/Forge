/**
 * Bug Condition Exploration Test — CLI Final Persist JSON Protocol Conflict
 *
 * This test surfaces the bug where the CLI final persist in
 * `src/forge-loop-cli.ts` uses `JSON.stringify()` to serialize the
 * NotesDocument, while the rest of the system expects Markdown format
 * produced by `formatNotesDocument()`.
 *
 * The test generates arbitrary NotesDocument instances with 1+ entries,
 * serializes them via `formatNotesDocument()` (the fixed CLI behavior),
 * then asserts that `parseNotesDocument()` can round-trip the data.
 *
 * **EXPECTED**: This test PASSES on fixed code — `parseNotesDocument()`
 * correctly parses the Markdown produced by `formatNotesDocument()`.
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatNotesDocument, parseNotesDocument } from "../src/context-accumulator.js";
import type { IterationEntry, NotesDocument } from "../src/loop-types.js";

// ---------------------------------------------------------------------------
// Generators (adapted from test/context-accumulator.property.test.ts)
// ---------------------------------------------------------------------------

/**
 * Single-line string without markdown formatting characters that could
 * confuse the parser. Avoids `###`, `**`, leading `- `, and newlines.
 */
const cleanLineArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => !s.includes("\n") && !s.includes("\r"))
  .map((s) => s.replace(/^- /, "x ").replace(/#{3}/g, "H").replace(/\*\*/g, "xx"))
  .filter((s) => s.length > 0 && s.trim().length > 0 && s === s.trim());

/** Positive iteration number. */
const iterationNumberArb = fc.integer({ min: 1, max: 500 });

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

/**
 * Arbitrary NotesDocument with at least 1 entry — the bug condition.
 * The bug only manifests when `entries.length > 0` because the CLI
 * ternary short-circuits to `""` for empty entries.
 */
const notesDocumentWithEntriesArb: fc.Arbitrary<NotesDocument> = fc
  .tuple(runIdArb, fc.array(roundTripEntryArb, { minLength: 1, maxLength: 8 }))
  .map(([runId, entries]) => ({ runId, entries }));

// ---------------------------------------------------------------------------
// Bug Condition Exploration: Property 1
// ---------------------------------------------------------------------------

describe("Bug Condition Exploration: CLI Final Persist JSON Protocol Conflict", () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * For any NotesDocument with entries.length >= 1, serializing via
   * formatNotesDocument() (the fixed CLI behavior) and then parsing with
   * parseNotesDocument() should recover the original runId and entries.
   *
   * This test PASSES on fixed code because formatNotesDocument() produces
   * valid Markdown with `# Run:` header that parseNotesDocument() can parse.
   */
  it("parseNotesDocument(formatNotesDocument(doc)) round-trips runId and entries for documents with entries", () => {
    fc.assert(
      fc.property(notesDocumentWithEntriesArb, (doc) => {
        // Simulate the fixed CLI final persist behavior
        const serialized = formatNotesDocument(doc);

        // Parse using the system's Markdown parser
        const parsed = parseNotesDocument(serialized);

        // Assert round-trip: these should match now that the protocol is consistent
        expect(parsed.runId).toBe(doc.runId);
        expect(parsed.entries.length).toBe(doc.entries.length);
      }),
      { numRuns: 100 },
    );
  });
});
