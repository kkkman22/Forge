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
});
//# sourceMappingURL=red-gate.test.js.map