/**
 * Tests for FailureClass parsing — conservative default + three-state parsing.
 *
 * Pins dynamic-replan-loop R1: parseFailureClass must never throw and must
 * default to "fixable_bug" when the field is missing or unrecognized
 * (conservative — avoids false-positive replan triggers, D4).
 *
 * **Pins: dynamic-replan-loop R1-AC4 (conservative default).**
 */
import { describe, expect, it } from "vitest";
import { parseFailureClass } from "../src/debug.js";
describe("parseFailureClass — conservative default [R1-AC4]", () => {
    it("returns fixable_bug when input is undefined", () => {
        expect(parseFailureClass(undefined)).toBe("fixable_bug");
    });
    it("returns fixable_bug when input is empty string", () => {
        expect(parseFailureClass("")).toBe("fixable_bug");
    });
    it("returns fixable_bug when input is unrecognized value", () => {
        expect(parseFailureClass("not-a-class")).toBe("fixable_bug");
        expect(parseFailureClass("BUG")).toBe("fixable_bug");
        expect(parseFailureClass("assumption")).toBe("fixable_bug");
    });
    it("returns fixable_bug when input is whitespace", () => {
        expect(parseFailureClass("   ")).toBe("fixable_bug");
    });
});
describe("parseFailureClass — three-state parsing [R1-AC1]", () => {
    it("parses fixable_bug exactly", () => {
        expect(parseFailureClass("fixable_bug")).toBe("fixable_bug");
    });
    it("parses assumption_invalidated exactly", () => {
        expect(parseFailureClass("assumption_invalidated")).toBe("assumption_invalidated");
    });
    it("parses environmental exactly", () => {
        expect(parseFailureClass("environmental")).toBe("environmental");
    });
    it("trims surrounding whitespace before matching", () => {
        expect(parseFailureClass("  assumption_invalidated  ")).toBe("assumption_invalidated");
    });
});
//# sourceMappingURL=failure-class.test.js.map