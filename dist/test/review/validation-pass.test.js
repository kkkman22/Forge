import { describe, expect, it } from "vitest";
import { applyValidationBatch, applyValidationResult, serializeValidationRecord, } from "../../src/review/validation-pass.js";
function merged(overrides = {}) {
    return {
        severity: "P0",
        confidence: 0.9,
        fixRoute: "manual",
        filePath: "src/a.ts",
        lineNumber: 10,
        description: "sql injection",
        suggestion: "parameterize",
        reviewer: "security-check",
        reviewers: ["security-check"],
        crossValidated: false,
        ...overrides,
    };
}
const confirmed = { confirmed: true, reason: "holds", adjusted_confidence: 100 };
const rejected = {
    confirmed: false,
    reason: "unreachable path",
    adjusted_confidence: 25,
};
describe("applyValidationResult (ce-inspired R5.5/R5.6)", () => {
    it("P0 not confirmed → downgrade to P1 + annotate (R5.5)", () => {
        const v = applyValidationResult(merged({ severity: "P0" }), rejected);
        expect(v.downgraded).toBe(true);
        expect(v.finding.severity).toBe("P1");
        expect(v.finding.description).toContain("↓ validation: unreachable path");
    });
    it("P1 not confirmed → downgrade to P2 + annotate (R5.6)", () => {
        const v = applyValidationResult(merged({ severity: "P1" }), rejected);
        expect(v.downgraded).toBe(true);
        expect(v.finding.severity).toBe("P2");
        expect(v.finding.description).toContain("↓ validation:");
    });
    it("P2 not confirmed → severity unchanged (no escalation from failed validation)", () => {
        const v = applyValidationResult(merged({ severity: "P2" }), rejected);
        expect(v.downgraded).toBe(false);
        expect(v.finding.severity).toBe("P2");
        // Still annotated with the validation reason.
        expect(v.finding.description).toContain("↓ validation:");
    });
    it("P3 not confirmed → severity unchanged", () => {
        const v = applyValidationResult(merged({ severity: "P3" }), rejected);
        expect(v.finding.severity).toBe("P3");
        expect(v.downgraded).toBe(false);
    });
    it("confirmed finding → severity + description unchanged", () => {
        const original = merged({ severity: "P0", description: "sql injection" });
        const v = applyValidationResult(original, confirmed);
        expect(v.downgraded).toBe(false);
        expect(v.finding.severity).toBe("P0");
        expect(v.finding.description).toBe("sql injection"); // no annotation added
    });
    it("does not mutate the input finding", () => {
        const input = merged({ severity: "P0", description: "orig" });
        applyValidationResult(input, rejected);
        expect(input.severity).toBe("P0");
        expect(input.description).toBe("orig");
    });
});
describe("applyValidationBatch (R5.1 — per-surviving-finding, unmatched pass through)", () => {
    it("applies results matched by filePath:lineNumber, passes unmatched through", () => {
        const findings = [
            merged({ filePath: "a.ts", lineNumber: 1, severity: "P0" }),
            merged({ filePath: "b.ts", lineNumber: 2, severity: "P1" }),
        ];
        const validations = new Map([
            ["a.ts:1", rejected], // P0 → P1
            // b.ts:2 has no validation → passes through unchanged
        ]);
        const results = applyValidationBatch(findings, validations);
        expect(results[0].finding.severity).toBe("P1"); // downgraded
        expect(results[0].downgraded).toBe(true);
        expect(results[1].finding.severity).toBe("P1"); // unchanged
        expect(results[1].downgraded).toBe(false);
    });
});
describe("serializeValidationRecord (R5.8 — jsonl)", () => {
    it("produces a single-line JSON record with before/after severity", () => {
        const v = applyValidationResult(merged({ severity: "P0", filePath: "x.ts", lineNumber: 5 }), rejected);
        const line = serializeValidationRecord("topic-a", v);
        expect(line.includes("\n")).toBe(false); // single line (jsonl)
        const parsed = JSON.parse(line);
        expect(parsed.slug).toBe("topic-a");
        expect(parsed.filePath).toBe("x.ts");
        expect(parsed.lineNumber).toBe(5);
        expect(parsed.severity_before).toBe("P0");
        expect(parsed.severity_after).toBe("P1");
        expect(parsed.confirmed).toBe(false);
        expect(parsed.downgraded).toBe(true);
        expect(parsed.reason).toBe("unreachable path");
    });
});
//# sourceMappingURL=validation-pass.test.js.map