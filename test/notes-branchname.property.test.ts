/**
 * Feature: audit-remediation-v221, Property 2: NotesDocument branchName round-trip preservation
 *
 * For any valid NotesDocument with branchName, formatNotesDocument output
 * contains the branchName value, and calling formatNotesDocument twice with
 * the same input produces identical output (idempotence).
 *
 * **Validates: Requirements 5.1, 5.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatNotesDocument } from "../src/context-accumulator.js";
import type { IterationEntry, NotesDocument } from "../src/loop-types.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Single-line string safe for markdown round-tripping. */
const cleanLineArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => !s.includes("\n") && !s.includes("\r"))
  .map((s) => s.replace(/^- /, "x ").replace(/#{3}/g, "H").replace(/\*\*/g, "xx"))
  .filter((s) => s.length > 0 && s.trim().length > 0 && s === s.trim());

/** Positive iteration number. */
const iterationNumberArb = fc.integer({ min: 1, max: 500 });

/** Arbitrary IterationEntry. */
const iterationEntryArb: fc.Arbitrary<IterationEntry> = fc
  .tuple(
    iterationNumberArb,
    fc.boolean(),
    cleanLineArb,
    fc.array(cleanLineArb, { minLength: 0, maxLength: 3 }),
    fc.array(cleanLineArb, { minLength: 0, maxLength: 3 }),
  )
  .map(([number, success, summary, keyChanges, keyLearnings]) => ({
    number,
    success,
    summary,
    keyChanges: success ? keyChanges : [],
    keyLearnings,
  }));

/** RunId without newlines. */
const runIdArb = cleanLineArb.filter((s) => s.trim().length > 0);

/** Arbitrary branchName string — uses fc.string() as specified in the task. */
const branchNameArb = fc.string({ minLength: 1, maxLength: 100 });

/** NotesDocument with a branchName present. */
const notesDocWithBranchArb: fc.Arbitrary<NotesDocument> = fc
  .tuple(runIdArb, branchNameArb, fc.array(iterationEntryArb, { minLength: 0, maxLength: 5 }))
  .map(([runId, branchName, entries]) => ({ runId, branchName, entries }));

// ---------------------------------------------------------------------------
// Property 2: NotesDocument branchName round-trip preservation
// ---------------------------------------------------------------------------

describe("Feature: audit-remediation-v221, Property 2: NotesDocument branchName round-trip preservation", () => {
  /**
   * For any valid NotesDocument with a branchName, the formatted output
   * contains the branchName value.
   *
   * **Validates: Requirements 5.1, 5.2**
   */
  it("formatNotesDocument output contains the branchName value", () => {
    fc.assert(
      fc.property(notesDocWithBranchArb, (doc) => {
        const output = formatNotesDocument(doc);
        expect(output).toContain(doc.branchName);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Calling formatNotesDocument twice with the same input produces
   * identical output (idempotence / determinism).
   *
   * **Validates: Requirements 5.1, 5.2**
   */
  it("formatNotesDocument called twice produces identical output", () => {
    fc.assert(
      fc.property(notesDocWithBranchArb, (doc) => {
        const first = formatNotesDocument(doc);
        const second = formatNotesDocument(doc);
        expect(first).toBe(second);
      }),
      { numRuns: 100 },
    );
  });
});
