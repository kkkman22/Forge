/**
 * Property-based tests for the .diff-context.md contract scanner.
 *
 * Spec: forge-review-diff-context-fidelity
 * Properties validated:
 *   - P1 Bug Condition (hunk marker totality across arbitrary inputs)
 *   - P4 Frontmatter Schema Stability (missing field detection totality)
 *
 * The scanner functions tested here are pure replicas of the logic in
 * `test/contract.diff-context.test.ts`; we expose them as standalone
 * helpers to assert PBT invariants without depending on the file system.
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
const REQUIRED_FRONTMATTER_FIELDS = [
    "base",
    "head",
    "file_count",
    "total_added",
    "total_removed",
    "truncated",
    "source",
];
const HUNK_MARKERS = [
    /^@@ .+ @@/m,
    /^--- a\//m,
    /^--- \/dev\/null/m,
    /^\+\+\+ b\//m,
    /^\+\+\+ \/dev\/null/m,
];
function hasHunkMarker(text) {
    return HUNK_MARKERS.some((re) => re.test(text));
}
function frontmatterMissingFields(fields) {
    return REQUIRED_FRONTMATTER_FIELDS.filter((k) => !(k in fields));
}
describe("PBT: .diff-context.md contract scanner", () => {
    it("any text containing a unified hunk header is detected as having marker (P1)", () => {
        fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 200 }), fc.integer({ min: 1, max: 9999 }), fc.integer({ min: 1, max: 9999 }), fc.integer({ min: 1, max: 999 }), fc.integer({ min: 1, max: 999 }), (prefix, oldLine, newLine, oldCount, newCount) => {
            const hunkLine = `@@ -${oldLine},${oldCount} +${newLine},${newCount} @@`;
            const text = `${prefix}\n${hunkLine}\nsome diff body`;
            expect(hasHunkMarker(text)).toBe(true);
        }), { numRuns: 100 });
    });
    it("any text without @@/---/+++ markers is detected as missing marker (P1)", () => {
        fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 500 }).filter((s) => {
            // Pre-filter: exclude any string that already contains hunk markers
            return !HUNK_MARKERS.some((re) => re.test(s));
        }), (text) => {
            // Augment with narrative-summary anti-pattern body
            const narrative = `See forge_git output.\nKey changes:\n- ${text}\n- another bullet`;
            expect(hasHunkMarker(narrative)).toBe(false);
        }), { numRuns: 100 });
    });
    it("frontmatter missing any required field is detected (P4)", () => {
        fc.assert(fc.property(fc.constantFrom(...REQUIRED_FRONTMATTER_FIELDS), (omittedField) => {
            const fields = {};
            for (const k of REQUIRED_FRONTMATTER_FIELDS) {
                if (k !== omittedField)
                    fields[k] = "stub";
            }
            const missing = frontmatterMissingFields(fields);
            expect(missing).toContain(omittedField);
            expect(missing.length).toBe(1);
        }), { numRuns: REQUIRED_FRONTMATTER_FIELDS.length });
    });
    it("complete frontmatter with all 7 fields has no missing (P4)", () => {
        fc.assert(fc.property(fc.record(Object.fromEntries(REQUIRED_FRONTMATTER_FIELDS.map((k) => [k, fc.string({ minLength: 1 })]))), (fields) => {
            const missing = frontmatterMissingFields(fields);
            expect(missing).toEqual([]);
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=contract.diff-context.property.test.js.map