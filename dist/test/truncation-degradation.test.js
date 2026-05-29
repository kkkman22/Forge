/**
 * Unit tests for truncation degradation strategy.
 *
 * Tests the pure function `assessTruncationSeverity` which determines
 * how to handle truncation across review layers.
 */
import { describe, expect, it } from "vitest";
import { assessTruncationSeverity } from "../src/truncation-detection.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeLayerResult(layer, truncated) {
    return {
        layer,
        raw: truncated
            ? "some output"
            : "<!-- REPORT_START -->\n### P0 Issues\nNone\n### Summary\nClean\n<!-- REPORT_END -->",
        report: truncated
            ? null
            : "<!-- REPORT_START -->\n### P0 Issues\nNone\n### Summary\nClean\n<!-- REPORT_END -->",
        truncated,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("assessTruncationSeverity", () => {
    // --- 0 layers truncated ---
    it("returns 'proceed' when no layers are truncated", () => {
        const results = [
            makeLayerResult("spec", false),
            makeLayerResult("quality", false),
            makeLayerResult("security", false),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("proceed");
        expect(assessment.truncatedCount).toBe(0);
        expect(assessment.totalCount).toBe(3);
    });
    // --- 1 layer truncated ---
    it("returns 'annotate' when exactly 1 layer is truncated", () => {
        const results = [
            makeLayerResult("spec", true),
            makeLayerResult("quality", false),
            makeLayerResult("security", false),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("annotate");
        expect(assessment.truncatedCount).toBe(1);
        expect(assessment.truncatedLayers).toContain("spec");
    });
    it("returns 'annotate' when only quality is truncated", () => {
        const results = [
            makeLayerResult("spec", false),
            makeLayerResult("quality", true),
            makeLayerResult("security", false),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("annotate");
        expect(assessment.truncatedLayers).toContain("quality");
    });
    it("returns 'annotate' when only security is truncated", () => {
        const results = [
            makeLayerResult("spec", false),
            makeLayerResult("quality", false),
            makeLayerResult("security", true),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("annotate");
        expect(assessment.truncatedLayers).toContain("security");
    });
    // --- 2 layers truncated ---
    it("returns 'warn' when exactly 2 layers are truncated", () => {
        const results = [
            makeLayerResult("spec", true),
            makeLayerResult("quality", true),
            makeLayerResult("security", false),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("warn");
        expect(assessment.truncatedCount).toBe(2);
    });
    it("returns 'warn' for spec+security truncated", () => {
        const results = [
            makeLayerResult("spec", true),
            makeLayerResult("quality", false),
            makeLayerResult("security", true),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("warn");
        expect(assessment.truncatedCount).toBe(2);
    });
    it("returns 'warn' for quality+security truncated", () => {
        const results = [
            makeLayerResult("spec", false),
            makeLayerResult("quality", true),
            makeLayerResult("security", true),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("warn");
        expect(assessment.truncatedCount).toBe(2);
    });
    // --- 3 layers truncated ---
    it("returns 'degrade' when all 3 layers are truncated", () => {
        const results = [
            makeLayerResult("spec", true),
            makeLayerResult("quality", true),
            makeLayerResult("security", true),
        ];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("degrade");
        expect(assessment.truncatedCount).toBe(3);
    });
    // --- Empty input ---
    it("returns 'proceed' for empty results array", () => {
        const assessment = assessTruncationSeverity([]);
        expect(assessment.action).toBe("proceed");
        expect(assessment.truncatedCount).toBe(0);
        expect(assessment.totalCount).toBe(0);
    });
    // --- Single layer (e.g. lightweight review without spec) ---
    it("returns 'proceed' for single non-truncated layer", () => {
        const results = [makeLayerResult("quality", false)];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("proceed");
    });
    it("returns 'annotate' for single truncated layer", () => {
        const results = [makeLayerResult("quality", true)];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("annotate");
    });
    it("returns 'warn' when both quality and security are truncated (no spec)", () => {
        const results = [makeLayerResult("quality", true), makeLayerResult("security", true)];
        const assessment = assessTruncationSeverity(results);
        expect(assessment.action).toBe("warn");
        expect(assessment.truncatedCount).toBe(2);
    });
    // --- Type validation ---
    it("returns a valid TruncationAssessment object", () => {
        const assessment = assessTruncationSeverity([
            makeLayerResult("spec", false),
            makeLayerResult("quality", false),
            makeLayerResult("security", false),
        ]);
        expect(assessment).toHaveProperty("action");
        expect(assessment).toHaveProperty("truncatedCount");
        expect(assessment).toHaveProperty("totalCount");
        expect(assessment).toHaveProperty("truncatedLayers");
        expect(typeof assessment.action).toBe("string");
        expect(typeof assessment.truncatedCount).toBe("number");
        expect(typeof assessment.totalCount).toBe("number");
        expect(Array.isArray(assessment.truncatedLayers)).toBe(true);
    });
    // --- Purity ---
    it("is a pure function", () => {
        const results = [
            makeLayerResult("spec", true),
            makeLayerResult("quality", false),
            makeLayerResult("security", false),
        ];
        const a1 = assessTruncationSeverity(results);
        const a2 = assessTruncationSeverity(results);
        expect(a1).toEqual(a2);
    });
});
//# sourceMappingURL=truncation-degradation.test.js.map