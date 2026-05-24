/**
 * Property-based tests for the output trimmer module.
 *
 * Covers:
 *   - Property 1: Failure output completeness (non-zero exit → full output)
 *   - Property 2: Trim threshold behavior (≤30 lines → full, >30 lines → trimmed summary)
 *
 * **Validates: Requirements 2.3, 2.4, 2.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { trimCommandOutput } from "../../src/mcp/trimmers/output.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Generate a non-empty line without newlines. */
const lineArb = fc.string({ minLength: 1, maxLength: 120 }).filter((s) => !s.includes("\n"));
/** Generate stdout as an array of lines joined by newlines. */
const stdoutArb = (minLines, maxLines) => fc.array(lineArb, { minLength: minLines, maxLength: maxLines }).map((lines) => lines.join("\n"));
/** Generate a non-zero exit code. */
const nonZeroExitArb = fc.integer({ min: 1, max: 255 });
/** Generate stderr content (may be empty). */
const stderrArb = fc.oneof(fc.constant(""), stdoutArb(1, 20));
// ---------------------------------------------------------------------------
// Property 1: Failure output completeness
// ---------------------------------------------------------------------------
describe("Feature: context-optimization, Property 1: Failure output completeness", () => {
    /**
     * **Validates: Requirements 2.5**
     *
     * For any command with non-zero exit code, forge_exec returns complete
     * stdout+stderr without trimming.
     */
    it("non-zero exit code always returns complete stdout", () => {
        fc.assert(fc.property(stdoutArb(0, 200), stderrArb, nonZeroExitArb, (stdout, stderr, exitCode) => {
            const result = trimCommandOutput(stdout, stderr, exitCode);
            // stdout must always be present in the result
            expect(result).toContain(stdout);
            // Result must never contain the trimmed summary header
            expect(result).not.toContain("✅ exit:0");
            expect(result).not.toContain("--- key lines ---");
        }));
    });
    it("non-zero exit code preserves stderr when present", () => {
        fc.assert(fc.property(stdoutArb(0, 100), stdoutArb(1, 20), // non-empty stderr
        nonZeroExitArb, (stdout, stderr, exitCode) => {
            const result = trimCommandOutput(stdout, stderr, exitCode);
            // stderr must be present in the result
            expect(result).toContain("STDERR:");
            expect(result).toContain(stderr);
        }));
    });
    it("non-zero exit code with empty stderr returns stdout only", () => {
        fc.assert(fc.property(stdoutArb(1, 200), nonZeroExitArb, (stdout, exitCode) => {
            const result = trimCommandOutput(stdout, "", exitCode);
            // Result should be exactly stdout (no STDERR section)
            expect(result).toBe(stdout);
        }));
    });
});
// ---------------------------------------------------------------------------
// Property 2: Trim threshold behavior
// ---------------------------------------------------------------------------
describe("Feature: context-optimization, Property 2: Trim threshold behavior", () => {
    /**
     * **Validates: Requirements 2.3**
     *
     * For any command with exit code 0, output ≤30 lines → full output.
     */
    it("exit 0 with ≤30 lines returns full output unchanged", () => {
        fc.assert(fc.property(stdoutArb(1, 30), (stdout) => {
            const result = trimCommandOutput(stdout, "", 0);
            expect(result).toBe(stdout);
        }));
    });
    /**
     * **Validates: Requirements 2.4**
     *
     * For any command with exit code 0, output >30 lines → trimmed summary
     * containing exit code, line count, key lines section, and last 5 lines.
     */
    it("exit 0 with >30 lines returns trimmed summary with correct structure", () => {
        fc.assert(fc.property(stdoutArb(31, 500), (stdout) => {
            const result = trimCommandOutput(stdout, "", 0);
            const lines = stdout.split("\n");
            // Must contain the summary header with correct line count
            expect(result).toContain(`✅ exit:0 | ${lines.length} lines`);
            // Must contain structural markers
            expect(result).toContain("--- key lines ---");
            expect(result).toContain("--- last 5 lines ---");
            // Must contain the last 5 lines of original output
            const last5 = lines.slice(-5);
            for (const line of last5) {
                expect(result).toContain(line);
            }
        }));
    });
    it("trimmed output is shorter than original for large outputs", () => {
        fc.assert(fc.property(stdoutArb(50, 500), (stdout) => {
            const result = trimCommandOutput(stdout, "", 0);
            // Trimmed result should be shorter than original
            expect(result.length).toBeLessThan(stdout.length);
        }), { numRuns: 50 });
    });
    it("exit 0 boundary: exactly 30 lines passes through, 31 lines trims", () => {
        fc.assert(fc.property(lineArb, (sampleLine) => {
            const thirtyLines = Array.from({ length: 30 }, () => sampleLine).join("\n");
            const thirtyOneLine = `${thirtyLines}\n${sampleLine}`;
            // 30 lines: pass through
            const result30 = trimCommandOutput(thirtyLines, "", 0);
            expect(result30).toBe(thirtyLines);
            // 31 lines: trim
            const result31 = trimCommandOutput(thirtyOneLine, "", 0);
            expect(result31).toContain("✅ exit:0 | 31 lines");
        }));
    });
});
//# sourceMappingURL=output-trimmer.property.test.js.map