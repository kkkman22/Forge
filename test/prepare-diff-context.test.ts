/**
 * Unit tests for scripts/prepare-diff-context.mjs pure helpers.
 *
 * Spec: forge-review-diff-context-fidelity
 * Properties validated:
 *   - P1 Bug Condition (frontmatter + stat parsing produce structured output, not narrative)
 *   - P3 Fallback Path Schema Equivalence (source: shell_with_truncate_lib)
 *   - P4 Frontmatter Schema Stability (7 required fields)
 *
 * Helpers under test (must be exported from scripts/prepare-diff-context.mjs):
 *   - parseFileCount(stat: string): number
 *   - parseAddedRemoved(stat: string): { added: number; removed: number }
 *   - formatFrontmatter(input): string
 *
 * The script does not exist yet at task-1 RED time; tests fail on import error.
 */
import { describe, expect, it } from "vitest";
import {
  formatFrontmatter,
  parseAddedRemoved,
  parseFileCount,
} from "../scripts/prepare-diff-context.mjs";

describe("prepare-diff-context: parseFileCount", () => {
  it("returns 0 for empty stat", () => {
    expect(parseFileCount("")).toBe(0);
  });

  it("returns 1 for single-file stat", () => {
    const stat =
      "agents/spec-check.md | 51 +++++++++++++++++++++-----------------------\n 1 file changed, 28 insertions(+), 23 deletions(-)";
    expect(parseFileCount(stat)).toBe(1);
  });

  it("returns 5 for multi-file stat", () => {
    const stat = [
      "src/a.ts | 10 ++++++++++",
      "src/b.ts | 12 ++++++++++++",
      "src/c.ts | 8 ++++++++",
      "test/d.test.ts | 20 ++++++++++++++++++++",
      "README.md | 3 ++-",
      " 5 files changed, 51 insertions(+), 2 deletions(-)",
    ].join("\n");
    expect(parseFileCount(stat)).toBe(5);
  });
});

describe("prepare-diff-context: parseAddedRemoved", () => {
  it("returns {0, 0} for empty stat", () => {
    expect(parseAddedRemoved("")).toEqual({ added: 0, removed: 0 });
  });

  it("parses both insertions and deletions", () => {
    const stat = " 1 file changed, 28 insertions(+), 23 deletions(-)";
    expect(parseAddedRemoved(stat)).toEqual({ added: 28, removed: 23 });
  });

  it("parses insertions-only", () => {
    const stat = " 1 file changed, 5 insertions(+)";
    expect(parseAddedRemoved(stat)).toEqual({ added: 5, removed: 0 });
  });

  it("parses deletions-only", () => {
    const stat = " 1 file changed, 3 deletions(-)";
    expect(parseAddedRemoved(stat)).toEqual({ added: 0, removed: 3 });
  });

  it("singular insertion form (1 insertion(+))", () => {
    const stat = " 1 file changed, 1 insertion(+), 1 deletion(-)";
    expect(parseAddedRemoved(stat)).toEqual({ added: 1, removed: 1 });
  });
});

describe("prepare-diff-context: formatFrontmatter", () => {
  const sampleInput = {
    base: "abc123",
    head: "def456",
    fileCount: 3,
    totalAdded: 50,
    totalRemoved: 10,
    truncated: true,
    source: "shell_with_truncate_lib",
  };

  it("wraps content in --- delimiters", () => {
    const out = formatFrontmatter(sampleInput);
    expect(out.startsWith("---\n")).toBe(true);
    // Must contain a closing --- followed by newline
    expect(out).toMatch(/\n---\n$/);
  });

  it("contains all 7 required fields", () => {
    const out = formatFrontmatter(sampleInput);
    for (const key of [
      "base",
      "head",
      "file_count",
      "total_added",
      "total_removed",
      "truncated",
      "source",
    ]) {
      expect(out, `frontmatter missing field "${key}"`).toContain(`${key}:`);
    }
  });

  it("renders source as 'shell_with_truncate_lib'", () => {
    const out = formatFrontmatter(sampleInput);
    expect(out).toContain("source: shell_with_truncate_lib");
  });

  it("renders truncated as boolean literal (not string)", () => {
    const out = formatFrontmatter({ ...sampleInput, truncated: false });
    expect(out).toContain("truncated: false");
    expect(out).not.toContain('truncated: "false"');
  });

  it("renders numeric fields as numbers (not strings)", () => {
    const out = formatFrontmatter(sampleInput);
    expect(out).toContain("file_count: 3");
    expect(out).toContain("total_added: 50");
    expect(out).toContain("total_removed: 10");
    expect(out).not.toContain('file_count: "3"');
  });
});
