/**
 * Unit tests for the diff-content truncation logic in forge_git.
 *
 * Validates:
 * - Empty diff returns placeholder
 * - Small diffs pass through unchanged
 * - Large diffs are truncated with priority ordering
 * - Per-file truncation works correctly
 * - Truncation notice includes omitted file list
 *
 * Thresholds (must match src/mcp/tools/forge-git.ts):
 *   DIFF_CONTENT_MAX_LINES = 1500
 *   DIFF_PER_FILE_MAX_LINES = 100
 */
import { describe, expect, it } from "vitest";
import { truncateDiffContent } from "../../src/mcp/tools/forge-git.js";
/** Helper to create a fake diff section for a file with N content lines. */
function createFileSection(path, lineCount) {
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
    it("truncates per-file content exceeding 100 lines", () => {
        // Need total > 1500 to enter the truncation path; each file > 100 lines to
        // trigger per-file truncation. 12 files × 150 lines ≈ 1812 raw lines.
        const sections = [];
        for (let i = 0; i < 12; i++) {
            sections.push(createFileSection(`src/file${i}.ts`, 150));
        }
        const bigDiff = sections.join("\n");
        const result = truncateDiffContent(bigDiff);
        // Per-file truncation should kick in (150 > 100)
        expect(result).toContain("[truncated:");
        expect(result).toContain("more lines in");
    });
    it("prioritizes source files over lock files when truncating", () => {
        // 18 source files + 1 lock + 1 dist file × 90 lines each ≈ 1820 raw lines.
        // Per-file 90 < 100 (no per-file truncation), but total exceeds 1500 so
        // lowest-priority files (lock, dist) get omitted first.
        const sections = [];
        for (let i = 0; i < 18; i++) {
            sections.push(createFileSection(`src/module${i}.ts`, 90));
        }
        sections.push(createFileSection("package-lock.json", 90));
        sections.push(createFileSection("dist/bundle.js", 90));
        const diff = sections.join("\n");
        const result = truncateDiffContent(diff);
        // First source file (highest priority) should be present
        expect(result).toContain("diff --git a/src/module0.ts");
        // Truncation notice present
        expect(result).toContain("files omitted for context budget");
        // Lowest-priority files appear in the omitted list
        expect(result).toContain("省略文件");
        expect(result).toMatch(/package-lock\.json|dist\/bundle\.js/);
    });
    it("includes omitted file list in truncation notice", () => {
        // 20 files × 90 lines each = 1820 raw lines (> 1500)
        const sections = [];
        for (let i = 0; i < 20; i++) {
            sections.push(createFileSection(`src/component${i}.ts`, 90));
        }
        const diff = sections.join("\n");
        const result = truncateDiffContent(diff);
        expect(result).toContain("省略文件");
        expect(result).toContain("对省略文件如有存疑，可用 Read 或 forge_read 深入验证");
    });
    it("does not truncate when total lines are within budget", () => {
        // 10 files × 90 lines each = 910 raw lines (under 1500)
        const sections = [];
        for (let i = 0; i < 10; i++) {
            sections.push(createFileSection(`src/file${i}.ts`, 90));
        }
        const diff = sections.join("\n");
        const result = truncateDiffContent(diff);
        expect(result).not.toContain("files omitted");
        expect(result).not.toContain("[truncated:");
    });
});
//# sourceMappingURL=diff-truncation.test.js.map