/**
 * Unit tests for context overflow detection and notes compaction.
 *
 * Covers:
 *   - isContextOverflowError: pattern matching against known error messages
 *   - compactNotesContent: compaction behavior under various sizes
 *
 * **Validates: Requirements 1.1–1.4**
 */
import { describe, expect, it } from "vitest";
import { compactNotesContent } from "../src/context-accumulator.js";
import { isContextOverflowError } from "../src/context-overflow.js";
// ---------------------------------------------------------------------------
// isContextOverflowError
// ---------------------------------------------------------------------------
describe("isContextOverflowError", () => {
    it("matches 'context window limit' error", () => {
        expect(isContextOverflowError(new Error("API Error: The model has reached its context window limit"))).toBe(true);
    });
    it("matches 'context_window_limit' error", () => {
        expect(isContextOverflowError(new Error("context_window_limit exceeded"))).toBe(true);
    });
    it("matches 'maxTokens ... exceed' error (case-insensitive)", () => {
        expect(isContextOverflowError(new Error("maxTokens would exceed the allowed limit"))).toBe(true);
        expect(isContextOverflowError(new Error("MaxTokens input exceed budget"))).toBe(true);
    });
    it("returns false for generic errors", () => {
        expect(isContextOverflowError(new Error("Network timeout"))).toBe(false);
        expect(isContextOverflowError(new Error("ECONNREFUSED"))).toBe(false);
    });
    it("handles non-Error throws", () => {
        expect(isContextOverflowError("context window limit reached")).toBe(true);
        expect(isContextOverflowError("something else")).toBe(false);
        expect(isContextOverflowError(42)).toBe(false);
        expect(isContextOverflowError(null)).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// compactNotesContent
// ---------------------------------------------------------------------------
describe("compactNotesContent", () => {
    function makeNotesMd(entries) {
        const header = "# Run: test-run\n\n## Iteration Log\n";
        const body = entries
            .map((e) => {
            const h = e.success === false ? `### Iteration ${e.n} (Failed)` : `### Iteration ${e.n}`;
            return `${h}\n\n**Summary:** ${e.summary}\n`;
        })
            .join("\n");
        return `${header}\n${body}\n`;
    }
    it("returns markdown unchanged when within budget", () => {
        const md = makeNotesMd([{ n: 1, summary: "Short note" }]);
        const result = compactNotesContent(md, 10000);
        expect(result).toBe(md);
    });
    it("compacts older entries when exceeding budget", () => {
        const entries = Array.from({ length: 6 }, (_, i) => ({
            n: i + 1,
            summary: `Iteration ${i + 1} did some work that was moderately long to exceed the budget when combined together with padding text`.repeat(3),
        }));
        const md = makeNotesMd(entries);
        // Budget is small enough to force compaction
        const result = compactNotesContent(md, 500);
        // The last 3 entries should be kept in full detail
        expect(result).toContain("### Iteration 4");
        expect(result).toContain("### Iteration 5");
        expect(result).toContain("### Iteration 6");
        expect(result).toContain("**Summary:**");
        // The first 3 entries should be compacted
        expect(result).toContain("### Iteration 1 (compacted):");
        expect(result).toContain("### Iteration 2 (compacted):");
        expect(result).toContain("### Iteration 3 (compacted):");
    });
    it("returns unchanged when entries count <= MIN_FULL_DETAIL_ENTRIES even if over budget", () => {
        const entries = [
            { n: 1, summary: "A".repeat(200) },
            { n: 2, summary: "B".repeat(200) },
        ];
        const md = makeNotesMd(entries);
        const result = compactNotesContent(md, 100);
        // With only 2 entries (<= 3), no compaction even if over budget
        expect(result).toBe(md);
    });
    it("preserves branch name in header", () => {
        const entries = Array.from({ length: 5 }, (_, i) => ({
            n: i + 1,
            summary: `Work ${i + 1} `.repeat(20),
        }));
        let md = `# Run: test-run\nBranch: feature/my-branch\n\n## Iteration Log\n`;
        md += entries.map((e) => `### Iteration ${e.n}\n\n**Summary:** ${e.summary}\n`).join("\n");
        const result = compactNotesContent(md, 300);
        expect(result).toContain("Branch: feature/my-branch");
    });
});
//# sourceMappingURL=context-overflow.test.js.map