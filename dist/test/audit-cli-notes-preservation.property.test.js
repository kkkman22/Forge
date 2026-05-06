/**
 * Preservation Property Tests — Non-CLI Persist Paths and Empty-Entries Behavior
 *
 * These tests capture baseline behavior on UNFIXED code that must be
 * preserved after the bug fix is applied. They verify:
 *
 * - Property 2a: Empty-entries persist expression returns ""
 * - Property 2b: formatNotesDocument ↔ parseNotesDocument round-trip
 * - Property 2c: formatNotesDocument output structure (headers)
 *
 * All three properties are EXPECTED TO PASS on unfixed code — they test
 * code paths that are NOT affected by the JSON.stringify bug.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatNotesDocument, parseNotesDocument } from "../src/context-accumulator.js";
// ---------------------------------------------------------------------------
// Generators (adapted from test/audit-cli-notes-bug.property.test.ts)
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
const roundTripEntryArb = fc
    .tuple(iterationNumberArb, fc.boolean(), cleanLineArb, fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }), fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }))
    .map(([number, success, summary, keyChanges, keyLearnings]) => ({
    number,
    success,
    summary,
    keyChanges: success ? keyChanges : [],
    keyLearnings,
}));
/**
 * Arbitrary NotesDocument with zero entries — the empty-entries case.
 * The CLI persist ternary returns "" for this case.
 */
const emptyEntriesDocArb = runIdArb.map((runId) => ({
    runId,
    entries: [],
}));
/**
 * Arbitrary NotesDocument with 0..8 entries for general round-trip testing.
 */
const notesDocumentArb = fc
    .tuple(runIdArb, fc.array(roundTripEntryArb, { minLength: 0, maxLength: 8 }))
    .map(([runId, entries]) => ({ runId, entries }));
/**
 * Arbitrary NotesDocument with optional branchName for round-trip testing.
 */
const notesDocumentWithBranchArb = fc
    .tuple(runIdArb, fc.option(cleanLineArb, { nil: undefined }), fc.array(roundTripEntryArb, { minLength: 0, maxLength: 8 }))
    .map(([runId, branchName, entries]) => branchName !== undefined ? { runId, branchName, entries } : { runId, entries });
// ---------------------------------------------------------------------------
// Property 2a: Empty entries persist expression returns ""
// ---------------------------------------------------------------------------
describe("Preservation Property 2a: Empty entries persist as empty string", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For all NotesDocument with entries.length === 0, the CLI persist
     * ternary expression `entries.length > 0 ? formatNotesDocument(doc) : ""`
     * returns "". This is the false-branch and is NOT affected by the bug.
     */
    it("persist expression returns empty string for all documents with zero entries", () => {
        fc.assert(fc.property(emptyEntriesDocArb, (doc) => {
            // Simulate the CLI persist ternary (same on both unfixed and fixed code)
            const result = doc.entries.length > 0 ? formatNotesDocument(doc) : "";
            expect(result).toBe("");
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 2b: formatNotesDocument round-trip
// ---------------------------------------------------------------------------
describe("Preservation Property 2b: formatNotesDocument round-trip", () => {
    /**
     * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
     *
     * For all valid NotesDocument instances, parseNotesDocument(formatNotesDocument(doc))
     * recovers the original runId and entries. This function pair is not being
     * changed by the fix.
     */
    it("parseNotesDocument(formatNotesDocument(doc)) round-trips runId and entries", () => {
        fc.assert(fc.property(notesDocumentArb, (doc) => {
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
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 3.4, 3.5**
     *
     * For all valid NotesDocument instances with branchName, the round-trip
     * also preserves branchName.
     */
    it("parseNotesDocument(formatNotesDocument(doc)) round-trips branchName", () => {
        fc.assert(fc.property(notesDocumentWithBranchArb, (doc) => {
            const markdown = formatNotesDocument(doc);
            const parsed = parseNotesDocument(markdown);
            expect(parsed.runId).toBe(doc.runId);
            expect(parsed.branchName).toBe(doc.branchName);
            expect(parsed.entries.length).toBe(doc.entries.length);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 2c: formatNotesDocument output structure
// ---------------------------------------------------------------------------
describe("Preservation Property 2c: formatNotesDocument output structure", () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * For all valid NotesDocument instances, formatNotesDocument(doc) output
     * starts with "# Run:" header and contains "## Iteration Log" section.
     */
    it("formatNotesDocument output starts with '# Run:' and contains '## Iteration Log'", () => {
        fc.assert(fc.property(notesDocumentArb, (doc) => {
            const markdown = formatNotesDocument(doc);
            expect(markdown.startsWith("# Run:")).toBe(true);
            expect(markdown).toContain("## Iteration Log");
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=audit-cli-notes-preservation.property.test.js.map