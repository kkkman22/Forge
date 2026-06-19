import { describe, expect, it } from "vitest";
import { validateRedGate } from "../../src/build.js";
describe("validateRedGate", () => {
    it("rejects missing command field", () => {
        const evidence = {
            actual_output: "FAIL: function not defined",
            expected_failure_reason: "function not defined",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("command");
    });
    it("rejects missing actual_output field", () => {
        const evidence = {
            command: "npx vitest run test.ts",
            expected_failure_reason: "function not defined",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("actual_output");
    });
    it("rejects missing expected_failure_reason field", () => {
        const evidence = {
            command: "npx vitest run test.ts",
            actual_output: "FAIL: function not defined",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("expected_failure_reason");
    });
    it("rejects when actual_output shows test PASSED", () => {
        const evidence = {
            command: "npx vitest run test.ts",
            actual_output: "Tests: 1 passed",
            expected_failure_reason: "function not defined",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("PASSED");
    });
    it("accepts valid failure evidence with FAIL indicator", () => {
        const evidence = {
            command: "npx vitest run test.ts",
            actual_output: "FAIL: AssertionError: expected true to be false",
            expected_failure_reason: "assertion should fail",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(true);
    });
    it("accepts valid failure evidence with Error indicator", () => {
        const evidence = {
            command: "npx vitest run test.ts",
            actual_output: "Error: Cannot find module './loader'",
            expected_failure_reason: "module not found",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(true);
    });
    // REQ-02 (audit-remediate-0619): SUCCESS_INDICATORS must actually be matched.
    // Before the fix, the for-loop variable `_indicator` was unused and only the
    // hardcoded `/passed/i` ran; patterns like "PASS" / "Tests:.*passed" never
    // triggered the success branch. This test pins the corrected behavior: a
    // success indicator (PASS) co-occurring with a failure indicator (Error)
    // must be treated as a PASSED test (invalid RED evidence), because the
    // success signal is what a green test would emit.
    it("rejects when actual_output shows PASS via SUCCESS_INDICATORS (even with Error present)", () => {
        const evidence = {
            command: "npx vitest run test.ts",
            actual_output: "PASS  Error fetching telemetry (non-fatal)",
            expected_failure_reason: "function not defined",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("PASSED");
    });
    it("rejects when actual_output matches 'Tests:.*passed' SUCCESS_INDICATOR pattern", () => {
        const evidence = {
            command: "npx vitest run test.ts",
            actual_output: "Tests  3 passed",
            expected_failure_reason: "function not defined",
        };
        const result = validateRedGate(evidence);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("PASSED");
    });
});
//# sourceMappingURL=red-gate.test.js.map