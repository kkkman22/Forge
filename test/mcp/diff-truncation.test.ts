/**
 * Unit tests for the diff-content truncation logic in forge_git.
 *
 * Validates:
 * - Empty diff returns placeholder
 * - Small diffs pass through unchanged
 * - Large diffs are truncated with priority ordering
 * - Per-file truncation works correctly
 * - Truncation notice includes omitted file list
 */

import { describe, expect, it } from "vitest";
import { truncateDiffContent } from "../../src/mcp/tools/forge-git.js";

/** Helper to create a fake diff section for a file with N content lines. */
function createFileSection(path: string, lineCount: number): string {
  const lines = [`diff --git a/${path} b/${path}`];
  for (let i = 0; i < lineCount; i++) {
    lines.push(`+line ${i} in ${path}`);
  }
  return lines.join("\n");
}

describe("truncateDiffContent", () => {
  it("returns placeholder for empty diff", () => {
    expect(truncateDiffContent("")).toBe("（无 diff 内容）");
    expect(truncateDiffContent("   \n  ")).toBe("（无 diff 内容）");
  });

  it("passes through small diffs unchanged", () => {
    const smallDiff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index abc123..def456 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,3 +1,4 @@",
      " import { bar } from './bar';",
      "+import { baz } from './baz';",
      " ",
      " export function foo() {",
    ].join("\n");

    expect(truncateDiffContent(smallDiff)).toBe(smallDiff);
  });

  it("truncates per-file content exceeding 200 lines", () => {
    // Create a diff with one file having 300 lines, but total > 3000 to trigger truncation
    // We need total > 3000 lines to enter the truncation path
    const sections: string[] = [];
    // 16 files × 200 lines = 3200+ lines total (exceeds 3000)
    for (let i = 0; i < 16; i++) {
      sections.push(createFileSection(`src/file${i}.ts`, 250));
    }
    const bigDiff = sections.join("\n");

    const result = truncateDiffContent(bigDiff);
    // Per-file truncation should kick in (250 > 200)
    expect(result).toContain("[truncated:");
    expect(result).toContain("more lines in");
  });

  it("prioritizes source files over lock files when truncating", () => {
    // Create enough content to force file-level omission
    // 20 source files × 180 lines each = 3600 lines (exceeds 3000)
    // Plus a lock file that should be omitted
    const sections: string[] = [];
    for (let i = 0; i < 18; i++) {
      sections.push(createFileSection(`src/module${i}.ts`, 180));
    }
    sections.push(createFileSection("package-lock.json", 180));
    sections.push(createFileSection("dist/bundle.js", 180));

    const diff = sections.join("\n");
    const result = truncateDiffContent(diff);

    // Source files (highest priority) should be present
    expect(result).toContain("diff --git a/src/module0.ts");
    // Should have truncation notice since total exceeds budget
    expect(result).toContain("files omitted for context budget");
    // Low-priority files should be in the omitted list
    expect(result).toContain("省略文件");
  });

  it("includes omitted file list in truncation notice", () => {
    // Create 20 files that together exceed 3000 lines
    const sections: string[] = [];
    for (let i = 0; i < 20; i++) {
      sections.push(createFileSection(`src/component${i}.ts`, 180));
    }
    // Total: 20 × 181 = 3620 lines → exceeds 3000

    const diff = sections.join("\n");
    const result = truncateDiffContent(diff);

    // Some files should be omitted
    expect(result).toContain("省略文件");
    expect(result).toContain("对省略文件如有存疑，可用 Read 或 forge_read 深入验证");
  });

  it("does not truncate when total lines are within budget", () => {
    // 10 files × 200 lines = 2000 lines (under 3000)
    const sections: string[] = [];
    for (let i = 0; i < 10; i++) {
      sections.push(createFileSection(`src/file${i}.ts`, 200));
    }
    const diff = sections.join("\n");
    const result = truncateDiffContent(diff);

    // Should pass through without truncation notice
    expect(result).not.toContain("files omitted");
    expect(result).not.toContain("[truncated:");
  });
});
