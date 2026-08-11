/**
 * Unit tests for the backlog module.
 *
 * Covers edge cases:
 *   - Header generation (R6.6)
 *   - Empty backlog parsing
 *   - Legacy format handling
 *   - Partial entry parsing
 */
import { describe, expect, it } from "vitest";

import {
  appendToBacklog,
  findOverlappingEntries,
  generateBacklogHeader,
  parseBacklog,
  resolveEntry,
  serializeBacklog,
} from "../src/backlog.js";

// ---------------------------------------------------------------------------
// Header generation
// ---------------------------------------------------------------------------

describe("generateBacklogHeader", () => {
  it("contains standard title and zero counts", () => {
    const header = generateBacklogHeader();
    expect(header).toContain('title: "Forge Backlog"');
    expect(header).toContain("total_entries: 0");
    expect(header).toContain("unresolved: 0");
    expect(header).toContain("## Backlog Entries");
  });

  it("includes today's date", () => {
    const header = generateBacklogHeader();
    const today = new Date().toISOString().slice(0, 10);
    expect(header).toContain(`updated: "${today}"`);
  });
});

// ---------------------------------------------------------------------------
// Empty backlog
// ---------------------------------------------------------------------------

describe("empty backlog", () => {
  it("serializeBacklog with empty array produces no-entries marker", () => {
    const result = serializeBacklog([]);
    expect(result).toContain("*No entries.*");
  });

  it("parseBacklog with empty content returns empty array", () => {
    const result = parseBacklog("");
    expect(result).toEqual([]);
  });

  it("parseBacklog with header only returns empty array", () => {
    const result = parseBacklog(generateBacklogHeader());
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Partial / malformed entries
// ---------------------------------------------------------------------------

describe("partial entry handling", () => {
  it("skips entries missing required fields", () => {
    const content = `
### BL-001
- **Severity:** P2
- **File:** src/a.ts:10
- **Description:** Something
- **Source Review:** .tinkerman/reviews/a.md
- **Origin Task:** task-a
- **Captured:** 2026-05-01
- **Status:** unresolved

### BL-002
- **Severity:** P2
- **File:** src/b.ts:20
- incomplete entry
`;
    const result = parseBacklog(content);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("BL-001");
  });

  it("parses resolved entries correctly", () => {
    const content = `
### BL-003
- **Severity:** P3
- **File:** src/c.ts:30
- **Description:** Missing docs
- **Source Review:** .tinkerman/reviews/b.md
- **Origin Task:** task-b
- **Captured:** 2026-04-28
- **Status:** resolved
- **Resolved By:** cleanup-task
- **Resolved Date:** 2026-05-01
`;
    const result = parseBacklog(content);
    expect(result).toHaveLength(1);
    expect(result[0].resolved).toBe(true);
    expect(result[0].resolvedBy).toBe("cleanup-task");
    expect(result[0].resolvedDate).toBe("2026-05-01");
  });
});

// ---------------------------------------------------------------------------
// appendToBacklog deduplication
// ---------------------------------------------------------------------------

describe("appendToBacklog", () => {
  it("adds only new entries", () => {
    const existing = [makeEntry("BL-001", "src/a.ts"), makeEntry("BL-002", "src/b.ts")];
    const newFindings = [
      makeEntry("BL-002", "src/b.ts"), // duplicate
      makeEntry("BL-003", "src/c.ts"), // new
    ];
    const result = appendToBacklog(existing, newFindings);
    expect(result.entries).toHaveLength(3);
    expect(result.added).toBe(1);
  });

  it("handles empty existing array", () => {
    const newFindings = [makeEntry("BL-001", "src/a.ts")];
    const result = appendToBacklog([], newFindings);
    expect(result.entries).toHaveLength(1);
    expect(result.added).toBe(1);
  });

  it("handles empty new findings", () => {
    const existing = [makeEntry("BL-001", "src/a.ts")];
    const result = appendToBacklog(existing, []);
    expect(result.entries).toHaveLength(1);
    expect(result.added).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findOverlappingEntries
// ---------------------------------------------------------------------------

describe("findOverlappingEntries", () => {
  it("matches exact file paths", () => {
    const entries = [
      makeEntry("BL-001", "src/services/auth.ts"),
      makeEntry("BL-002", "src/utils/helpers.ts"),
    ];
    const result = findOverlappingEntries(entries, ["src/services/auth.ts"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("BL-001");
  });

  it("matches directory prefix", () => {
    const entries = [
      makeEntry("BL-001", "src/services/auth.ts"),
      makeEntry("BL-002", "src/utils/helpers.ts"),
    ];
    const result = findOverlappingEntries(entries, ["src/services"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("BL-001");
  });

  it("includes resolved entries (caller filters if needed)", () => {
    const entry = makeEntry("BL-001", "src/services/auth.ts");
    entry.resolved = true;
    const result = findOverlappingEntries([entry], ["src/services/auth.ts"]);
    expect(result).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    const entries = [makeEntry("BL-001", "src/Services/Auth.ts")];
    const result = findOverlappingEntries(entries, ["src/services/auth.ts"]);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resolveEntry
// ---------------------------------------------------------------------------

describe("resolveEntry", () => {
  it("marks an existing entry as resolved", () => {
    const entries = [makeEntry("BL-001", "src/a.ts")];
    const result = resolveEntry(entries, "BL-001", "fix-task", "2026-05-06");
    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected result to not be null");
    expect(result.resolved).toBe(true);
    expect(result.resolvedBy).toBe("fix-task");
    expect(result.resolvedDate).toBe("2026-05-06");
  });

  it("returns null for non-existent ID", () => {
    const entries = [makeEntry("BL-001", "src/a.ts")];
    const result = resolveEntry(entries, "BL-999", "fix-task", "2026-05-06");
    expect(result).toBeNull();
  });

  it("mutates the entry in the original array", () => {
    const entries = [makeEntry("BL-001", "src/a.ts")];
    resolveEntry(entries, "BL-001", "fix-task", "2026-05-06");
    expect(entries[0].resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(id: string, filePath: string) {
  return {
    id,
    severity: "P2" as const,
    filePath,
    lineNumber: 10,
    description: "Test description",
    sourceReview: ".tinkerman/reviews/test.md",
    originTask: "test-task",
    capturedDate: "2026-05-01",
    resolved: false,
  };
}
