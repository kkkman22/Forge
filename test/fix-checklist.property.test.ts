/**
 * Property-based tests for the fix-checklist module.
 *
 * Covers:
 *   - Property 16: Checklist creation filters to P0/P1
 *   - Property 17: Checklist status transition validity
 *   - Property 18: Checklist round-trip
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ChecklistEntry, ChecklistStatus } from "../src/fix-checklist.js";
import {
  allEntriesVerified,
  createChecklist,
  isValidTransition,
  parseChecklist,
  serializeChecklist,
  VALID_TRANSITIONS,
} from "../src/fix-checklist.js";

// Safe string: use fc.lorem for words, avoiding pipe chars
const safeStr = (min: number, max: number) =>
  fc
    .lorem({ mode: "words", sentenceKind: "basic", maxCount: Math.ceil(max / 5) })
    .filter((s) => s.length >= min && s.length <= max && !s.includes("|"));

const findingArb = fc.record({
  severity: fc.constantFrom("P0", "P1", "P2", "P3"),
  filePath: fc.lorem({ mode: "words", maxCount: 2 }).filter((s) => !s.includes("|")),
  lineNumber: fc.integer({ min: 1, max: 9999 }),
  description: fc.lorem({ mode: "sentences", maxCount: 1 }).filter((s) => !s.includes("|")),
});

const checklistStatusArb = fc.constantFrom<ChecklistStatus>(
  "unfixed",
  "in-progress",
  "fixed",
  "verified",
);

const checklistEntryArb: fc.Arbitrary<ChecklistEntry> = fc.record({
  findingId: fc.integer({ min: 1, max: 999 }).map((n) => `F-${String(n).padStart(3, "0")}`),
  severity: fc.constantFrom("P0" as const, "P1" as const),
  filePath: fc.lorem({ mode: "words", maxCount: 2 }).filter((s) => !s.includes("|")),
  lineNumber: fc.integer({ min: 1, max: 9999 }),
  description: fc.lorem({ mode: "sentences", maxCount: 1 }).filter((s) => !s.includes("|")),
  status: checklistStatusArb,
  fixCommit: fc.option(fc.string({ minLength: 7, maxLength: 7 })),
});

// ---------------------------------------------------------------------------
// Property 16: Checklist creation filters to P0/P1
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 16: Checklist creation filters to P0/P1", () => {
  it("mixed-severity findings produce only P0/P1 entries with status unfixed", () => {
    fc.assert(
      fc.property(fc.array(findingArb, { maxLength: 20 }), (findings) => {
        const result = createChecklist(findings);

        for (const entry of result) {
          expect(entry.severity === "P0" || entry.severity === "P1").toBe(true);
          expect(entry.status).toBe("unfixed");
          expect(entry.fixCommit).toBeUndefined();
        }

        const expectedCount = findings.filter(
          (f) => f.severity === "P0" || f.severity === "P1",
        ).length;
        expect(result.length).toBe(expectedCount);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Checklist status transition validity
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 17: Checklist status transition validity", () => {
  it("isValidTransition matches VALID_TRANSITIONS exactly", () => {
    fc.assert(
      fc.property(checklistStatusArb, checklistStatusArb, (current, next) => {
        const result = isValidTransition(current, next);
        const expected = VALID_TRANSITIONS[current].includes(next);
        expect(result).toBe(expected);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Checklist round-trip
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 18: Checklist round-trip", () => {
  it("serializeChecklist → parseChecklist produces equivalent entries", () => {
    fc.assert(
      fc.property(
        fc.array(checklistEntryArb, { minLength: 1, maxLength: 10 }),
        fc.lorem({ mode: "words", maxCount: 2 }),
        (entries, topic) => {
          const serialized = serializeChecklist(entries, topic);
          const parsed = parseChecklist(serialized);

          expect(parsed.length).toBe(entries.length);
          for (let i = 0; i < entries.length; i++) {
            expect(parsed[i].findingId).toBe(entries[i].findingId);
            expect(parsed[i].severity).toBe(entries[i].severity);
            expect(parsed[i].filePath).toBe(entries[i].filePath);
            expect(parsed[i].lineNumber).toBe(entries[i].lineNumber);
            expect(parsed[i].description).toBe(entries[i].description);
            expect(parsed[i].status).toBe(entries[i].status);
            if (entries[i].fixCommit) {
              expect(parsed[i].fixCommit).toBe(entries[i].fixCommit);
            }
          }
        },
      ),
    );
  });
});
