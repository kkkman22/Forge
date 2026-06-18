/**
 * Unit tests for the output trimmer module.
 *
 * Covers:
 *   - Threshold boundary (30 lines exactly → pass through, 31 lines → trim)
 *   - Key line pattern matching
 *   - Failure passthrough (non-zero exit code)
 *   - Empty output
 *
 * **Validates: Requirements 2.3, 2.4, 2.5**
 */
import { describe, expect, it } from "vitest";
import { formatFailureOutput, trimCommandOutput } from "../../src/mcp/trimmers/output.js";
// Helper: generate N lines of plain output
function makeLines(n, prefix = "line") {
    return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n");
}
describe("trimCommandOutput", () => {
    // -----------------------------------------------------------------------
    // Threshold boundary
    // -----------------------------------------------------------------------
    describe("threshold boundary", () => {
        it("passes through 30 lines unchanged (exit 0)", () => {
            const stdout = makeLines(30);
            const result = trimCommandOutput(stdout, "", 0);
            expect(result).toBe(stdout);
        });
        it("trims output at 31 lines (exit 0)", () => {
            const stdout = makeLines(31);
            const result = trimCommandOutput(stdout, "", 0);
            expect(result).toContain("✅ exit:0 | 31 lines");
            expect(result).toContain("--- key lines ---");
            expect(result).toContain("--- last 5 lines ---");
            // Last 5 lines should be present
            expect(result).toContain("line 27");
            expect(result).toContain("line 28");
            expect(result).toContain("line 29");
            expect(result).toContain("line 30");
            expect(result).toContain("line 31");
        });
        it("passes through exactly 1 line unchanged (exit 0)", () => {
            const result = trimCommandOutput("hello", "", 0);
            expect(result).toBe("hello");
        });
    });
    // -----------------------------------------------------------------------
    // Key line pattern matching
    // -----------------------------------------------------------------------
    describe("key line pattern matching", () => {
        it("extracts lines matching pass/fail/error/warn patterns", () => {
            const lines = [
                ...Array.from({ length: 25 }, (_, i) => `building module ${i}`),
                "✓ 42 tests passed",
                "PASS src/foo.test.ts",
                "FAIL src/bar.test.ts",
                "error: something broke",
                "warning: deprecated API",
                "coverage: 85%",
                ...Array.from({ length: 5 }, (_, i) => `cleanup ${i}`),
            ];
            const stdout = lines.join("\n");
            const result = trimCommandOutput(stdout, "", 0);
            expect(result).toContain("✓ 42 tests passed");
            expect(result).toContain("PASS src/foo.test.ts");
            expect(result).toContain("FAIL src/bar.test.ts");
            expect(result).toContain("error: something broke");
            expect(result).toContain("warning: deprecated API");
            expect(result).toContain("coverage: 85%");
        });
        it("limits key lines to 15 maximum", () => {
            const keyLines = Array.from({ length: 20 }, (_, i) => `PASS test${i}.ts`);
            const filler = Array.from({ length: 20 }, (_, i) => `building ${i}`);
            const stdout = [...filler, ...keyLines].join("\n");
            const result = trimCommandOutput(stdout, "", 0);
            // Count PASS occurrences in key lines section
            const keySection = result.split("--- last 5 lines ---")[0];
            const passCount = (keySection.match(/PASS test/g) || []).length;
            expect(passCount).toBeLessThanOrEqual(15);
        });
        it("includes last 5 lines even when they are not key lines", () => {
            const lines = [...Array.from({ length: 30 }, (_, i) => `build step ${i}`), "done."];
            const stdout = lines.join("\n");
            const result = trimCommandOutput(stdout, "", 0);
            expect(result).toContain("done.");
        });
    });
    // -----------------------------------------------------------------------
    // Failure passthrough
    // -----------------------------------------------------------------------
    describe("failure passthrough", () => {
        it("returns full stdout for non-zero exit code", () => {
            const stdout = makeLines(100);
            const result = trimCommandOutput(stdout, "", 1);
            expect(result).toBe(stdout);
        });
        it("appends stderr when present for non-zero exit code", () => {
            const stdout = "some output";
            const stderr = "fatal error occurred";
            const result = trimCommandOutput(stdout, stderr, 1);
            expect(result).toBe("some output\n\nSTDERR:\nfatal error occurred");
        });
        it("returns full output for exit code 2 with large output", () => {
            const stdout = makeLines(200);
            const result = trimCommandOutput(stdout, "", 2);
            expect(result).toBe(stdout);
            expect(result).not.toContain("✅ exit:0");
        });
        it("does not trim stderr-only failure output", () => {
            const stderr = makeLines(50, "err");
            const result = trimCommandOutput("", stderr, 1);
            expect(result).toContain("STDERR:");
            expect(result).toContain(stderr);
        });
    });
    // -----------------------------------------------------------------------
    // formatFailureOutput (Iron Law helper — exported for direct testing)
    // -----------------------------------------------------------------------
    describe("formatFailureOutput", () => {
        it("returns stdout unchanged when no stderr", () => {
            const result = formatFailureOutput("command output", "");
            expect(result).toBe("command output");
        });
        it("appends stderr under STDERR header when present", () => {
            const result = formatFailureOutput("out", "boom");
            expect(result).toBe("out\n\nSTDERR:\nboom");
        });
        it("preserves empty stdout with stderr-only failure", () => {
            const result = formatFailureOutput("", "fatal");
            expect(result).toBe("\n\nSTDERR:\nfatal");
        });
    });
    // -----------------------------------------------------------------------
    // Empty output
    // -----------------------------------------------------------------------
    describe("empty output", () => {
        it("returns empty string for empty stdout (exit 0)", () => {
            const result = trimCommandOutput("", "", 0);
            expect(result).toBe("");
        });
        it("returns empty string for empty stdout (exit non-zero, no stderr)", () => {
            const result = trimCommandOutput("", "", 1);
            expect(result).toBe("");
        });
        it("returns stderr for empty stdout with non-zero exit and stderr", () => {
            const result = trimCommandOutput("", "error!", 1);
            expect(result).toBe("\n\nSTDERR:\nerror!");
        });
    });
});
//# sourceMappingURL=output-trimmer.test.js.map