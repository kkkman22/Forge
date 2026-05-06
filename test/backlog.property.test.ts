/**
 * Property-based tests for the backlog module.
 *
 * Covers:
 *   - Property 12: Backlog append with deduplication and tagging
 *   - Property 13: Backlog overlap detection
 *   - Property 14: Backlog resolve marks entry
 *   - Property 15: Backlog round-trip
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { BacklogEntry } from "../src/backlog.js";
import {
  appendToBacklog,
  findOverlappingEntries,
  parseBacklog,
  resolveEntry,
  serializeBacklog,
} from "../src/backlog.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const safeDateStr = () =>
  fc
    .integer({ min: 86400000, max: 4102444800000 })
    .map((n) => new Date(n).toISOString().slice(0, 10));

const backlogEntryArb: fc.Arbitrary<BacklogEntry> = fc
  .record({
    id: fc.integer({ min: 1, max: 999 }).map((n) => `BL-${String(n).padStart(3, "0")}`),
    severity: fc.constantFrom("P2" as const, "P3" as const),
    filePath: fc
      .lorem({ mode: "words", maxCount: 3 })
      .filter((s) => !s.includes("|") && s.length > 0),
    lineNumber: fc.integer({ min: 1, max: 9999 }),
    description: fc
      .lorem({ mode: "sentences", maxCount: 1 })
      .filter((s) => !s.includes("|") && s.length > 0),
    sourceReview: fc.lorem({ mode: "words", maxCount: 2 }),
    originTask: fc.lorem({ mode: "words", maxCount: 2 }),
    capturedDate: safeDateStr(),
    resolved: fc.boolean(),
    resolvedBy: fc.option(fc.lorem({ mode: "words", maxCount: 2 })),
    resolvedDate: fc.option(safeDateStr()),
  })
  .map((entry) => ({
    ...entry,
    resolvedBy: entry.resolved ? (entry.resolvedBy ?? entry.originTask) : undefined,
    resolvedDate: entry.resolved ? (entry.resolvedDate ?? entry.capturedDate) : undefined,
  }));

// ---------------------------------------------------------------------------
// Property 12: Backlog append with deduplication and tagging
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 12: Backlog append with deduplication and tagging", () => {
  it("new findings are added, duplicates skipped, originals preserved", () => {
    fc.assert(
      fc.property(
        fc.array(backlogEntryArb, { maxLength: 10 }),
        fc.array(backlogEntryArb, { maxLength: 10 }),
        (existing, newFindings) => {
          const result = appendToBacklog(existing, newFindings);

          // (a) Every new finding whose ID is not already present appears in the result
          const existingIds = new Set(existing.map((e) => e.id));
          for (const nf of newFindings) {
            if (!existingIds.has(nf.id)) {
              expect(result.entries.some((e) => e.id === nf.id)).toBe(true);
            }
          }

          // (b) Result contains all existing entries plus unique new findings
          const newFindingIds = new Set<string>();
          for (const nf of newFindings) {
            if (!existingIds.has(nf.id)) {
              newFindingIds.add(nf.id);
            }
          }
          expect(result.entries.length).toBe(existing.length + newFindingIds.size);

          // (c) Every entry has non-empty capturedDate and originTask
          for (const e of result.entries) {
            expect(e.capturedDate).toBeTruthy();
            expect(e.originTask).toBeTruthy();
          }

          // (d) All original entries are preserved
          for (const e of existing) {
            expect(result.entries.some((re) => re.id === e.id)).toBe(true);
          }

          // added count matches unique new finding IDs not in existing
          expect(result.added).toBe(newFindingIds.size);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Backlog overlap detection
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 13: Backlog overlap detection", () => {
  it("returns exactly entries whose filePath matches affected files", () => {
    fc.assert(
      fc.property(
        fc.array(backlogEntryArb, { maxLength: 20 }),
        fc.array(
          fc.lorem({ mode: "words", maxCount: 3 }).filter((s) => s.length > 0),
          { maxLength: 5 },
        ),
        (entries, affectedFiles) => {
          const result = findOverlappingEntries(entries, affectedFiles);

          for (const r of result) {
            const normalizedEntry = r.filePath.replace(/\\/g, "/").toLowerCase().trim();
            const matches = affectedFiles.some((af) => {
              const normalizedAf = af.replace(/\\/g, "/").toLowerCase().trim();
              return (
                normalizedEntry === normalizedAf || normalizedEntry.startsWith(`${normalizedAf}/`)
              );
            });
            expect(matches).toBe(true);
          }

          for (const e of entries) {
            const normalizedEntry = e.filePath.replace(/\\/g, "/").toLowerCase().trim();
            const matches = affectedFiles.some((af) => {
              const normalizedAf = af.replace(/\\/g, "/").toLowerCase().trim();
              return (
                normalizedEntry === normalizedAf || normalizedEntry.startsWith(`${normalizedAf}/`)
              );
            });
            const inResult = result.some((r) => r.id === e.id);
            expect(inResult).toBe(matches);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Backlog resolve marks entry
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 14: Backlog resolve marks entry", () => {
  it("resolveEntry sets resolved, resolvedBy, resolvedDate while preserving other fields", () => {
    fc.assert(
      fc.property(
        fc.array(backlogEntryArb, { minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        safeDateStr(),
        (entries, resolvedBy, resolvedDate) => {
          const targetId = entries[0].id;
          const before = structuredClone(entries);
          const result = resolveEntry(entries, targetId, resolvedBy, resolvedDate);

          expect(result).not.toBeNull();
          if (!result) throw new Error("Expected result to not be null");
          expect(result.resolved).toBe(true);
          expect(result.resolvedBy).toBe(resolvedBy);
          expect(result.resolvedDate).toBe(resolvedDate);

          // Other fields unchanged
          const original = before.find((e) => e.id === targetId);
          if (!original) throw new Error("Expected to find entry in before array");
          expect(result.id).toBe(original.id);
          expect(result.severity).toBe(original.severity);
          expect(result.filePath).toBe(original.filePath);
          expect(result.lineNumber).toBe(original.lineNumber);
          expect(result.description).toBe(original.description);
          expect(result.sourceReview).toBe(original.sourceReview);
          expect(result.originTask).toBe(original.originTask);
          expect(result.capturedDate).toBe(original.capturedDate);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns null for non-existent ID", () => {
    fc.assert(
      fc.property(
        fc.array(backlogEntryArb, { maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        safeDateStr(),
        (entries, resolvedBy, resolvedDate) => {
          const result = resolveEntry(entries, "non-existent-id", resolvedBy, resolvedDate);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Backlog round-trip
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 15: Backlog round-trip", () => {
  it("serializeBacklog -> parseBacklog produces equivalent entries", () => {
    fc.assert(
      fc.property(fc.array(backlogEntryArb, { maxLength: 15 }), (entries) => {
        // Deduplicate by ID for round-trip test (real backlogs never have duplicate IDs)
        const seen = new Set<string>();
        const uniqueEntries = entries.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });

        const serialized = serializeBacklog(uniqueEntries);
        const parsed = parseBacklog(serialized);

        expect(parsed.length).toBe(uniqueEntries.length);

        const parsedById = new Map(parsed.map((p) => [p.id, p]));

        for (const orig of uniqueEntries) {
          const reparsed = parsedById.get(orig.id);
          expect(reparsed).toBeDefined();
          if (!reparsed) return;
          expect(reparsed.severity).toBe(orig.severity);
          expect(reparsed.filePath).toBe(orig.filePath);
          expect(reparsed.lineNumber).toBe(orig.lineNumber);
          expect(reparsed.description).toBe(orig.description);
          expect(reparsed.sourceReview).toBe(orig.sourceReview);
          expect(reparsed.originTask).toBe(orig.originTask);
          expect(reparsed.capturedDate).toBe(orig.capturedDate);
          expect(reparsed.resolved).toBe(orig.resolved);
          if (orig.resolvedBy) expect(reparsed.resolvedBy).toBe(orig.resolvedBy);
          if (orig.resolvedDate) expect(reparsed.resolvedDate).toBe(orig.resolvedDate);
        }
      }),
      { numRuns: 100 },
    );
  });
});
