import { describe, expect, it } from "vitest";
// We test the logic directly since _runtime.ts calls process.exit
// which is hard to test in-process. We extract the core logic.
import { computeExitResult } from "../../src/docs-governance/cli/_runtime.js";
describe("computeExitResult", () => {
    it("returns severity exit code on success", () => {
        const records = [
            {
                script: "test",
                severity: "error",
                file: "docs/a.md",
                message: "fail",
            },
        ];
        const result = computeExitResult(() => records);
        expect(result.exitCode).toBe(1);
        expect(result.error).toBeUndefined();
    });
    it("returns exit code 3 on exception, even with critical records", () => {
        const records = [
            {
                script: "test",
                severity: "critical",
                file: "docs/a.md",
                message: "fail",
            },
        ];
        let thrown = false;
        const result = computeExitResult(() => {
            thrown = true;
            records.push({
                script: "test",
                severity: "critical",
                file: "docs/b.md",
                message: "already pushed",
            });
            throw new Error("boom");
        });
        expect(thrown).toBe(true);
        expect(result.exitCode).toBe(3); // INTERNAL, overrides critical
        expect(result.error).toBeDefined();
    });
    it("returns OK for no diagnostics and no error", () => {
        const result = computeExitResult(() => []);
        expect(result.exitCode).toBe(0);
        expect(result.error).toBeUndefined();
    });
});
//# sourceMappingURL=runtime.test.js.map