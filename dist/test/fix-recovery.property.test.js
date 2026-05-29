/**
 * Property-based tests for the fix-recovery module.
 *
 * Covers:
 *   - Property 25: Fix candidate matching
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isFixCandidate, parseGitLog } from "../src/fix-recovery.js";
describe("Feature: forge-review-fix-optimization, Property 25: Fix candidate matching", () => {
    it("returns true when commit touches finding file within ±10 lines, false otherwise", () => {
        fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0), fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 1, max: 20 }), (filePath, findingLine, offset, rangeSize, tolerance) => {
            const commitStart = findingLine + offset;
            const commitEnd = commitStart + rangeSize;
            // Within tolerance
            const commitFiles = [filePath];
            const lineRanges = new Map([
                [filePath, [[commitStart, commitEnd]]],
            ]);
            const withinTolerance = Math.abs(commitStart - findingLine) <= tolerance ||
                (commitStart <= findingLine + tolerance && commitEnd >= findingLine - tolerance);
            const result = isFixCandidate(commitFiles, lineRanges, filePath, findingLine, tolerance);
            if (withinTolerance) {
                expect(result).toBe(true);
            }
            else {
                // If the commit range doesn't overlap with findingLine ± tolerance, should be false
                // But since we're using offset and rangeSize, let's check precisely
                const overlapStart = Math.max(commitStart, findingLine - tolerance);
                const overlapEnd = Math.min(commitEnd, findingLine + tolerance);
                expect(result).toBe(overlapStart <= overlapEnd);
            }
        }));
    });
    it("returns false when commit does not modify finding file", () => {
        const lineRanges = new Map([["other.ts", [[1, 100]]]]);
        expect(isFixCandidate(["other.ts"], lineRanges, "target.ts", 50)).toBe(false);
    });
});
describe("parseGitLog", () => {
    it("parses valid git log format", () => {
        const hash1 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
        const hash2 = "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5";
        const input = [
            `${hash1}|fix: resolve auth issue|2026-04-29T10:00:00+08:00`,
            "src/auth.ts",
            "src/config.ts",
            "",
            `${hash2}|feat: add logging|2026-04-28T15:30:00+08:00`,
            "src/logger.ts",
        ].join("\n");
        const result = parseGitLog(input);
        expect(result).toHaveLength(2);
        expect(result[0].hash).toBe(hash1);
        expect(result[0].files).toEqual(["src/auth.ts", "src/config.ts"]);
        expect(result[1].files).toEqual(["src/logger.ts"]);
    });
    it("returns empty array for empty input", () => {
        expect(parseGitLog("")).toEqual([]);
        expect(parseGitLog("  ")).toEqual([]);
    });
});
//# sourceMappingURL=fix-recovery.property.test.js.map