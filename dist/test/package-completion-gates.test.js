import { describe, expect, it } from "vitest";
import { checkPackageCompletionGate } from "../src/ship-gates.js";
describe("checkPackageCompletionGate", () => {
    it("blocks when any execution package is incomplete", () => {
        const result = checkPackageCompletionGate({
            executionPackages: [
                { id: "P1", tasks: ["T-01"] },
                { id: "P2", tasks: ["T-02"] },
            ],
            completedPackages: ["P1"],
            severity: "block",
        });
        expect(result.gate).toBe("progress");
        expect(result.passed).toBe(false);
        expect(result.reason).toContain("P2");
        expect(result.details?.incompleteTasks).toEqual(["package:P2"]);
    });
    it("passes when all packages are complete", () => {
        const result = checkPackageCompletionGate({
            executionPackages: [
                { id: "P1", tasks: ["T-01"] },
                { id: "P2", tasks: ["T-02"] },
            ],
            completedPackages: ["P1", "P2"],
            severity: "block",
        });
        expect(result.passed).toBe(true);
    });
    it("warns without blocking when severity is warn", () => {
        const result = checkPackageCompletionGate({
            executionPackages: [{ id: "P1", tasks: ["T-01"] }],
            completedPackages: [],
            severity: "warn",
        });
        expect(result.passed).toBe(true);
        expect(result.reason).toContain("warning");
    });
});
//# sourceMappingURL=package-completion-gates.test.js.map