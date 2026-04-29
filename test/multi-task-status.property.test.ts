/**
 * Property-based tests for multi-task status tracking.
 *
 * Covers:
 *   - Property 21: Multi-task status round-trip
 *   - Property 22: Multi-task upsert preserves other entries
 *   - Property 23: Multi-task remove preserves other entries
 *   - Property 24: Multi-task conflict detection
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { TaskStatusEntry } from "../src/state.js";
import {
  hasTaskName,
  parseStatusEntries,
  removeTaskEntry,
  serializeStatusEntries,
  upsertTaskEntry,
} from "../src/state.js";

const safeString = (min: number, max: number) =>
  fc
    .string({ minLength: min, maxLength: max })
    .filter(
      (s) => s.trim().length > 0 && !s.includes('"') && !s.includes("\n") && !s.includes("#"),
    );

const taskEntryArb: fc.Arbitrary<TaskStatusEntry> = fc.record({
  taskName: safeString(1, 30),
  tier: fc.constantFrom("light", "standard", "full"),
  phase: fc.constantFrom("plan", "build", "review", "test", "ship"),
  updated: safeString(1, 10),
  worktree: fc.option(safeString(1, 40)),
});

// ---------------------------------------------------------------------------
// Property 21: Multi-task status round-trip
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 21: Multi-task status round-trip", () => {
  it("serializeStatusEntries → parseStatusEntries produces equivalent entries", () => {
    fc.assert(
      fc.property(fc.array(taskEntryArb, { maxLength: 10 }), (entries) => {
        const serialized = serializeStatusEntries(entries);
        const parsed = parseStatusEntries(serialized);

        expect(parsed.length).toBe(entries.length);
        for (let i = 0; i < entries.length; i++) {
          expect(parsed[i].taskName).toBe(entries[i].taskName);
          expect(parsed[i].tier).toBe(entries[i].tier);
          expect(parsed[i].phase).toBe(entries[i].phase);
          expect(parsed[i].updated).toBe(entries[i].updated);
          if (entries[i].worktree) {
            expect(parsed[i].worktree).toBe(entries[i].worktree);
          }
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 22: Multi-task upsert preserves other entries
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 22: Multi-task upsert preserves other entries", () => {
  it("new entry is added and existing is updated while preserving others", () => {
    fc.assert(
      fc.property(
        fc.array(taskEntryArb, { maxLength: 5 }).map((arr) => {
          const seen = new Set<string>();
          return arr.filter((e) => {
            if (seen.has(e.taskName)) return false;
            seen.add(e.taskName);
            return true;
          });
        }),
        taskEntryArb,
        (entries, newEntry) => {
          const result = upsertTaskEntry(entries, newEntry);

          // New entry exists in result
          const found = result.find((e) => e.taskName === newEntry.taskName);
          expect(found).toBeDefined();
          expect(found?.tier).toBe(newEntry.tier);

          // All other entries preserved
          for (const original of entries) {
            if (original.taskName !== newEntry.taskName) {
              const match = result.find((e) => e.taskName === original.taskName);
              expect(match).toBeDefined();
              expect(match?.tier).toBe(original.tier);
            }
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23: Multi-task remove preserves other entries
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 23: Multi-task remove preserves other entries", () => {
  it("removing an entry preserves all others", () => {
    fc.assert(
      fc.property(
        fc.array(taskEntryArb, { minLength: 2, maxLength: 5 }).map((arr) => {
          const seen = new Set<string>();
          return arr.filter((e) => {
            if (seen.has(e.taskName)) return false;
            seen.add(e.taskName);
            return true;
          });
        }),
        (entries) => {
          const targetName = entries[0].taskName;
          const result = removeTaskEntry(entries, targetName);

          expect(result.find((e) => e.taskName === targetName)).toBeUndefined();
          expect(result.length).toBe(entries.length - 1);

          for (const entry of entries.slice(1)) {
            expect(result).toContainEqual(entry);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 24: Multi-task conflict detection
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 24: Multi-task conflict detection", () => {
  it("detectConflict returns true iff taskName exists in entries", () => {
    fc.assert(
      fc.property(
        fc.array(taskEntryArb, { maxLength: 5 }).map((arr) => {
          const seen = new Set<string>();
          return arr.filter((e) => {
            if (seen.has(e.taskName)) return false;
            seen.add(e.taskName);
            return true;
          });
        }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (entries, taskName) => {
          const result = hasTaskName(entries, taskName);
          const exists = entries.some((e) => e.taskName === taskName);
          expect(result).toBe(exists);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Legacy format migration
// ---------------------------------------------------------------------------

describe("Legacy single-task format migration", () => {
  it("parses legacy single-task format", () => {
    const content = [
      "---",
      'current_task: "order-batch-export"',
      'tier: "standard"',
      'phase: "review"',
      'updated: "2026-05-01"',
      "---",
    ].join("\n");

    const result = parseStatusEntries(content);
    expect(result).toHaveLength(1);
    expect(result[0].taskName).toBe("order-batch-export");
    expect(result[0].tier).toBe("standard");
    expect(result[0].phase).toBe("review");
  });

  it("returns empty array for content without frontmatter", () => {
    expect(parseStatusEntries("just some text")).toEqual([]);
  });
});
