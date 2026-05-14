import { describe, expect, it } from "vitest";
import { runTaskPostVerification } from "../../src/build.js";
describe("runTaskPostVerification", () => {
    it("returns micro-review result for v1 plan with full coverage", () => {
        const result = runTaskPostVerification({
            task: {
                title: "Implement loader",
                files: ["src/loader.ts"],
                acceptance_criteria: ["export load function in loader"],
            },
            gitDiff: "diff --git a/src/loader.ts b/src/loader.ts\n+export function load() {}",
            verifyOutput: "Tests: 1 passed",
            planVersion: "v1",
        });
        expect(result.verdict).toBe("pass");
    });
    it("returns needs_iteration for missing acceptance criteria", () => {
        const result = runTaskPostVerification({
            task: {
                title: "Implement validator",
                files: ["src/validator.ts"],
                acceptance_criteria: ["validator checks ST001", "validator checks ST002"],
            },
            gitDiff: "diff --git a/src/validator.ts\n+export function validate() {}",
            verifyOutput: "Tests: 1 passed",
            planVersion: "v1",
        });
        expect(result.verdict).toBe("needs_iteration");
        expect(result.missing.length).toBeGreaterThan(0);
    });
    it("returns pass for legacy plan with valid output", () => {
        const result = runTaskPostVerification({
            task: { title: "legacy task" },
            gitDiff: "some diff content",
            verifyOutput: "Tests: 3 passed, 0 failed",
            planVersion: "legacy",
        });
        expect(result.verdict).toBe("pass");
    });
    it("exports the function from build module", () => {
        expect(typeof runTaskPostVerification).toBe("function");
    });
});
//# sourceMappingURL=micro-review-integration.test.js.map